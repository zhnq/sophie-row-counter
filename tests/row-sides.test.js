const {test} = require('node:test');
const assert = require('node:assert/strict');
const pattern = require('../src/pattern');

function plan(options) {
  return pattern.generate(Object.assign({max:10,tail:0,finish:'none',firstIncLead:2,incLead:3},options));
}
function events(table,delta) { return table.rows.filter(row => row.delta === delta); }
function change(row) { return row.segments.find(segment => segment.kind === (row.delta > 0 ? 'increase' : 'decrease')); }
function complete(count,extra) { return Array.from({length:count},(_,i) => i + 1).concat(extra || []); }

// Read the work from a fixed first-row orientation: odd rows work right to left,
// even rows left to right. This oracle does not call fabricSide or infer a side
// from fabricEdge, so swapping the labels or confusing start/end is detectable.
function sideFromWorkingPosition(id,position) {
  const sides = id % 2 ? {start:'右侧',end:'左侧'} : {start:'左侧',end:'右侧'};
  return sides[position];
}
function opposite(side) { return side === '左侧' ? '右侧' : '左侧'; }
function assertSide(row,expected) {
  const position = row.delta > 0 ? row.increasePosition : row.decreasePosition;
  const location = position === 'start' ? '行首' : '行尾';
  const action = row.delta > 0 ? '加针' : '减针';
  const operation = change(row);
  assert.equal(sideFromWorkingPosition(row.id,position),expected,'工作方向，第 ' + row.id + ' 行');
  assert.equal(row.fabricEdge,expected === '左侧' ? 0 : 1,'固定布边，第 ' + row.id + ' 行');
  assert.equal(row.instruction,location + action,'行提示，第 ' + row.id + ' 行');
  if (row.delta > 0) assert.equal(operation.note,location);
  else {
    assert.equal(operation.text,location + action);
    assert.equal(operation.note,'−1');
  }
  assert.doesNotMatch(operation.text + ' ' + operation.note,/左右加针|单侧加针|左右减针|单侧减针/);
}

test('截图所示第 8／14／20／26 行明确左、右交替，第 14 行为右侧行尾',() => {
  const table = plan({mode:'increase',interval:6,firstInc:8,incLayout:'alternating',incFirst:'start'});
  const increases = events(table,1);
  assert.deepEqual(increases.map(row => row.id),[8,14,20,26]);
  const expected = ['左侧','右侧','左侧','右侧'];
  increases.forEach((row,i) => assertSide(row,expected[i]));
  assert.equal(change(table.rows[13]).text,'第 4 针 +1');
  assert.equal(change(table.rows[13]).note,'行尾');
  assert.equal(table.rows[13].before,7);
  assert.equal(table.rows[13].stitches,8);
});

test('单侧不随翻面换左右，交替按变针事件换侧；减针从最后加针侧开始',() => {
  for (const interval of [2,3,6,7]) for (const firstInc of [3,4])
    for (const incFirst of ['start','end']) for (const incLayout of ['single','alternating'])
      for (const firstDec of [3,4]) for (const center of [0,1]) {
        const table = plan({interval,firstInc,incFirst,incLayout,firstDec,center,decLayout:'follow'});
        const increases = events(table,1), decreases = events(table,-1);
        let expected = sideFromWorkingPosition(firstInc,incFirst);
        increases.forEach((row,i) => {
          if (i && incLayout === 'alternating') expected = opposite(expected);
          assertSide(row,expected);
        });
        decreases.forEach((row,i) => {
          if (i && incLayout === 'alternating') expected = opposite(expected);
          assertSide(row,expected);
        });
        if (interval % 2) {
          if (incLayout === 'single') assert.notEqual(increases[0].increasePosition,increases[1].increasePosition);
          else assert.equal(increases[0].increasePosition,increases[1].increasePosition);
        }
      }
});

test('仅减针段用段内工作方向与首次位置判定左右，不假设有加针历史',() => {
  for (const interval of [3,6]) for (const firstDec of [3,4])
    for (const decFirst of ['start','end']) for (const decLayout of ['single','alternating']) {
      const table = plan({mode:'decrease',interval,firstDec,decFirst,decLayout});
      let expected = sideFromWorkingPosition(firstDec,decFirst);
      events(table,-1).forEach((row,i) => {
        if (i && decLayout === 'alternating') expected = opposite(expected);
        assertSide(row,expected);
      });
    }
});

test('M1 左倾／右倾／按原织图与左右布边独立，KFB 也沿用相同侧别',() => {
  const options = {interval:3,firstInc:4,incLayout:'alternating',incFirst:'end',firstDec:3,center:1};
  const stitch = plan(Object.assign({},options,{incMethod:'stitch'}));
  const expected = stitch.rows.filter(row => row.delta).map(row => ({id:row.id,delta:row.delta,
    side:sideFromWorkingPosition(row.id,row.delta > 0 ? row.increasePosition : row.decreasePosition),
    instruction:row.instruction,note:change(row).note}));
  for (const incSlant of ['left','right','pattern']) {
    const table = plan(Object.assign({},options,{incMethod:'between',incSlant}));
    const shaped = table.rows.filter(row => row.delta);
    assert.equal(table.total,stitch.total);
    shaped.forEach((row,i) => {
      assert.equal(row.id,expected[i].id);
      assert.equal(row.delta,expected[i].delta);
      assertSide(row,expected[i].side);
      assert.equal(row.instruction,expected[i].instruction);
      assert.equal(change(row).note,expected[i].note);
      if (row.delta > 0) assert.equal(change(row).slant,incSlant);
    });
    assert.ok(shaped.some(row => row.delta > 0 && row.fabricEdge === 0));
    assert.ok(shaped.some(row => row.delta > 0 && row.fabricEdge === 1));
  }
});

test('旧规则与缺少 M1 倾斜的存档恢复具体侧别，稀疏勾选和参数不被重写',() => {
  const legacy = {start:6,max:26,end:6,interval:8,firstInc:8,firstDec:8,tail:7,incLayout:'alternating',incFirst:'start'};
  const sparse = [1,3,8,136,160,168,320,327];
  const serialized = JSON.stringify(legacy);
  const restored = pattern.restore({version:1,params:legacy,completed:sparse});
  assert.equal(JSON.stringify(legacy),serialized);
  assert.equal(restored.plan.total,327);
  assert.deepEqual(restored.progress.completed,sparse);
  assert.equal(restored.progress.current,2);
  assertSide(restored.plan.rows[7],'左侧');
  assertSide(restored.plan.rows[15],'右侧');
  assertSide(restored.plan.rows[159],'右侧');
  assertSide(restored.plan.rows[167],'右侧');
  assertSide(restored.plan.rows[175],'左侧');
  const current = plan({incMethod:'between',incSlant:'left',incLayout:'alternating'});
  const oldParams = Object.assign({},current.params,{rules:2});
  delete oldParams.incSlant;
  const old = {version:1,params:oldParams,completed:[1,3,8,16,40,64]};
  const before = JSON.stringify(old), reopened = pattern.restore(old);
  assert.equal(JSON.stringify(old),before);
  assert.equal(reopened.plan.params.incSlant,'pattern');
  assert.deepEqual(reopened.progress.completed,old.completed);
  reopened.plan.rows.filter(row => row.delta).forEach(row => {
    assertSide(row,sideFromWorkingPosition(row.id,row.delta > 0 ? row.increasePosition : row.decreasePosition));
  });
});

test('提前转折保留已织侧别、文字与操作，首减跟随末次加针并在重开后保持',() => {
  for (const incLayout of ['single','alternating']) for (const interval of [3,6])
    for (const incFirst of ['start','end']) {
      const original = plan({max:14,firstInc:4,interval,incLayout,incFirst,center:3});
      const anchor = 4 + 2 * interval + 1;
      const completed = complete(anchor,[anchor + 2,original.total]);
      for (const firstDecrease of [anchor + 1,anchor + 2]) {
        const result = pattern.makeTurn(original,completed,firstDecrease);
        assert.deepEqual(result.plan.rows.slice(0,anchor),original.rows.slice(0,anchor));
        assert.deepEqual(result.completed,complete(anchor));
        assert.deepEqual(result.removed,[anchor + 2,original.total]);
        const lastIncrease = original.rows.slice(0,anchor).filter(row => row.delta > 0).at(-1);
        let expected = sideFromWorkingPosition(lastIncrease.id,lastIncrease.increasePosition);
        events(result.plan,-1).forEach((row,i) => {
          if (i && incLayout === 'alternating') expected = opposite(expected);
          assertSide(row,expected);
        });
        const restored = pattern.restore({version:1,params:result.plan.params,completed:result.completed});
        assert.deepEqual(restored.plan.rows,result.plan.rows);
        assert.deepEqual(restored.progress.completed,result.completed);
      }
    }
});

test('侧别显示文字升级不阻止转折，真实布边或工作位置篡改仍受保护',() => {
  const original = plan({max:14,firstInc:4,interval:3,incLayout:'alternating'});
  const displayOnly = JSON.parse(JSON.stringify(original));
  displayOnly.rows.filter(row => row.delta > 0).forEach(row => {
    change(row).note = (row.increasePosition === 'start' ? '行首 ' : '行尾 ') + '左右加针';
    row.instruction = '左右加针';
  });
  const updated = pattern.makeTurn(displayOnly,complete(11),13);
  assertSide(updated.plan.rows[3],'左侧');
  assertSide(updated.plan.rows[6],'右侧');
  for (const key of ['fabricEdge','increasePosition']) {
    const changed = JSON.parse(JSON.stringify(original));
    changed.rows[3][key] = key === 'fabricEdge' ? 1 : 'end';
    assert.throws(() => pattern.makeTurn(changed,complete(11),13),/改变已织行/);
  }
});
