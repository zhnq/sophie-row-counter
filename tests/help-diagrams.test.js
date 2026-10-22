const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pattern = require('../src/pattern');
const settings = require('../src/settings');
const shape = require('../src/shape');

// Exercise the real help renderer without initializing a page or its event handlers.
const appSource = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
const helpEnd = appSource.indexOf('  function previewHTML(');
const previewEnd = appSource.indexOf('  function drawPreview(', helpEnd);
const blocksStart = appSource.indexOf('  function operationBlocksHTML(');
const blocksEnd = appSource.indexOf('  function rowHTML(', blocksStart);
assert.ok(helpEnd > 0 && previewEnd > helpEnd && blocksStart > 0 && blocksEnd > blocksStart);
const rendererSource = appSource.slice(0, previewEnd) +
  appSource.slice(blocksStart, blocksEnd) +
  '\nwindow.HelpTest = {diagramHTML:diagramHTML, helpCopy:helpCopy, setupHTML:setupHTML, previewHTML:previewHTML};\n})();';

function renderer(current) {
  const data = {
    draft:current.draft, guidance:current.state,
    modeOptions:['整条围巾','仅加针段','仅减针段'], modeIndex:['full','increase','decrease'].indexOf(current.draft.mode),
    methodOptions:['KFB 同一针加针','M1 挑横线加针'], methodIndex:current.draft.incMethod === 'between' ? 1 : 0,
    layoutOptions:['单侧加针','左右交替加针'], layoutIndex:current.draft.incLayout === 'alternating' ? 1 : 0,
    positionOptions:['行首','行尾'], positionIndex:current.draft.incFirst === 'end' ? 1 : 0,
    slantOptions:['按原织图','左倾（M1L）','右倾（M1R）'], slantIndex:['pattern','left','right'].indexOf(current.draft.incSlant),
    finishOptions:['最后一行收针','暂不记收针'], finishIndex:current.draft.finish === 'bindoff' ? 0 : 1,
    colorOptions:pattern.COLORS
  };
  const counter = {data, fixedInput:() => false};
  const context = {
    document: {getElementById: () => ({})},
    window: {
      SophieCounter: counter,
      SophiePattern: pattern,
      SophieSettings: settings,
      SophieShape: shape
    }
  };
  vm.runInNewContext(rendererSource, context);
  const api = context.window.HelpTest;
  return {
    keys: Object.keys(api.helpCopy),
    setup() { return api.setupHTML(data); },
    preview() {
      counter.previewPlan = settings.feedback(current.draft, current.state).plan;
      assert.ok(counter.previewPlan, 'preview requires a valid plan');
      return api.previewHTML(data);
    },
    diagram(key) {
      const fb = settings.feedback(current.draft, current.state);
      return api.diagramHTML(key, api.helpCopy[key][2], fb);
    }
  };
}
function firstSVG(html) {
  const match = html.match(/<svg\b[\s\S]*?<\/svg>/);
  assert.ok(match, 'help must contain an SVG');
  return match[0];
}
function svgAttributes(html) {
  const tag = firstSVG(html).match(/^<svg\b[^>]*>/)[0];
  return Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), pair => [pair[1],pair[2]]));
}
function polygonPoints(html) {
  const match = firstSVG(html).match(/<polygon\b[^>]*points="([^"]*)"/);
  assert.ok(match, 'outline should have a polygon');
  return match[1];
}
function pointCoordinates(html) {
  return polygonPoints(html).trim().split(/\s+/).map(point => point.split(',').map(Number));
}
function plainAttributes(html) {
  const match = firstSVG(html).match(/<[^>]*\bdata-plain-start-x="[^"]*"[^>]*>/);
  assert.ok(match, 'first-decrease outline should identify the flat stretch');
  return Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/g), pair => [pair[1],pair[2]]));
}
function assertFlatPeak(html, alternating) {
  const attrs = plainAttributes(html), points = pointCoordinates(html);
  const start = Number(attrs['data-plain-start-x']), end = Number(attrs['data-plain-end-x']);
  const top = Math.min(...points.map(point => point[1])), bottom = Math.max(...points.map(point => point[1]));
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end >= start);
  for (const x of [start,end]) {
    assert.ok(points.some(point => Math.abs(point[0] - x) < 0.11 && point[1] === top), 'top edge must remain horizontal until the first decrease');
    if (alternating) assert.ok(points.some(point => Math.abs(point[0] - x) < 0.11 && point[1] === bottom), 'alternating decreases begin after both flat widest edges');
  }
  if (!alternating) {
    const left = Math.min(...points.map(point => point[0])), right = Math.max(...points.map(point => point[0]));
    for (const x of [left,right]) assert.ok(points.some(point => point[0] === x && point[1] === bottom), 'single-sided outline keeps its unchanged edge straight');
    for (const point of points.filter(point => point[0] >= start && point[0] <= end)) assert.ok(point[1] === top || point[1] === bottom, 'flat widest stretch must not add intermediate corners');
  }
  return attrs;
}
function assertTimelinePositions(html,plan) {
  const points = pointCoordinates(html), attrs = plainAttributes(html);
  const left = Math.min(...points.map(point => point[0])), right = Math.max(...points.map(point => point[0]));
  const knitting = plan.rows.filter(row => row.phase !== '收针');
  const lastIncreaseIndex = knitting.reduce((last,row,index) => row.delta > 0 ? index : last,-1);
  const firstDecreaseIndex = knitting.findIndex(row => row.delta < 0);
  assert.ok(firstDecreaseIndex >= 0);
  const expectedStart = left + (right - left) * (lastIncreaseIndex + 1) / knitting.length;
  const expectedEnd = left + (right - left) * firstDecreaseIndex / knitting.length;
  assert.ok(Math.abs(Number(attrs['data-plain-start-x']) - expectedStart) <= 0.051, 'peak begins after completing the final increase row');
  assert.ok(Math.abs(Number(attrs['data-plain-end-x']) - expectedEnd) <= 0.051, 'red line marks the beginning of the first decrease row, after all plain rows');
}
function outlineAttributes(html) {
  const svg = firstSVG(html);
  const match = svg.match(/<(?:svg|polygon)\b[^>]*data-outline-purpose="[^"]*"[^>]*>/);
  assert.ok(match, 'concept outline should expose its purpose and kind');
  return Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/g), pair => [pair[1],pair[2]]));
}
function eventRows(html) {
  return Array.from(firstSVG(html).matchAll(/<circle\b[^>]*data-event-row="(\d+)"[^>]*>/g), match => Number(match[1]));
}
function eventMarkers(html) {
  return Array.from(firstSVG(html).matchAll(/<circle\b[^>]*data-event-row="\d+"[^>]*>/g), match => {
    const attrs = Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/g), pair => [pair[1],pair[2]]));
    return {id:Number(attrs['data-event-row']), fabricEdge:Number(attrs['data-fabric-edge'])};
  });
}
function lineAttributes(html, attribute, value) {
  const match = html.match(new RegExp('<line\\b[^>]*' + attribute + '="' + value + '"[^>]*>'));
  assert.ok(match, attribute + ' should identify the line');
  return Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/g), pair => [pair[1],pair[2]]));
}
function needleAttributes(html) {
  const match = firstSVG(html).match(/<g\s+data-lead-count="(\d+)"\s+data-change-ordinal="([\d,]+)"\s+data-slip-count="(\d+)"/);
  assert.ok(match, 'needle diagram should expose the actual counts and changing ordinal');
  return {lead:Number(match[1]), ordinal:match[2], slip:Number(match[3])};
}

function fresh(overrides) { return settings.init(overrides || {}, true); }
function changed(current, key, value) {
  return settings.change(current.draft, current.state, key, value);
}
function serialized(current) { return JSON.stringify(current); }
function actual(overrides) {
  return settings.init(pattern.generate(Object.assign({
    max:10, interval:6, firstInc:6, firstDec:6, tail:5,
    firstIncLead:2, incLead:3, lastDecLead:2
  }, overrides)).params, false);
}
function assertVisual(html, key) {
  assert.match(html, /<svg\b|class="help-timeline"|class="gauge-diagram"/, key + ' must show a diagram');
  assert.doesNotMatch(html, /class="help-empty"|填好[^<]*后|这一段没有对应的操作/, key + ' must not replace its diagram with a text placeholder');
}

const incompleteCases = [
  ['新建最宽针数为空', () => fresh()],
  ['起针数未填写', () => changed(fresh({max:10}), 'start', '')],
  ['间隔未填写', () => changed(fresh({max:10}), 'interval', '')],
  ['首次减针早于最宽处', () => changed(fresh({max:10,interval:6}), 'firstDecrease', 20)],
  ['仅减针段针数未填写', () => changed(fresh(), 'mode', 'decrease')]
];

for (const [name, build] of incompleteCases) {
  test(name + '时各问号都有图示且不更改输入', () => {
    const current = build(), before = serialized(current), help = renderer(current);
    assert.equal(settings.feedback(current.draft, current.state).plan, undefined);
    assert.equal(help.keys.length, 23);
    for (const key of help.keys) assertVisual(help.diagram(key), key);
    assert.equal(serialized(current), before);
  });
}

test('有效设置的部位与布边图保留真实针数、行号，查看帮助不改变计划', () => {
  const current = actual({incLayout:'alternating'}), help = renderer(current), before = serialized(current);
  const plan = settings.feedback(current.draft, current.state).plan;
  assert.equal(plan.total, 54);
  assert.match(help.diagram('start'), /6 针/);
  assert.match(help.diagram('max'), /10 针/);
  assert.match(help.diagram('end'), /6 针/);
  assert.match(help.diagram('firstDecrease'), /第 30 行开始减针/);
  const increase = help.diagram('incLayout'), decrease = help.diagram('decLayout');
  for (const row of [6,12,18]) assert.match(increase, new RegExp('第 ' + row + ' 行'));
  for (const row of [24,30,36]) assert.match(decrease, new RegExp('第 ' + row + ' 行'));
  for (const key of help.keys) assertVisual(help.diagram(key), key);
  assert.equal(serialized(current), before);
  assert.deepEqual(settings.feedback(current.draft, current.state).plan.rows, plan.rows);
});

test('未填最宽时仍能比较 KFB 与 M1，位置示意随手法改变', () => {
  const kfb = fresh(), m1 = changed(fresh(), 'incMethod', 'between');
  const kfbHTML = renderer(kfb).diagram('incMethod'), m1HTML = renderer(m1).diagram('incMethod');
  assert.match(kfbHTML, /<svg\b/); assert.match(m1HTML, /<svg\b/);
  for (const html of [kfbHTML,m1HTML]) {
    assert.match(html, /KFB/); assert.match(html, /M1/);
    assert.match(html, /同一针.*2 针/); assert.match(html, /两针之间.*1 针/);
  }
  const kfbPosition = renderer(kfb).diagram('firstIncLead'), m1Position = renderer(m1).diagram('firstIncLead');
  assert.equal(needleAttributes(kfbPosition).ordinal,'3');
  assert.equal(needleAttributes(m1Position).ordinal,'2,3');
  assert.notEqual(kfbPosition, m1Position);
  assert.match(kfbHTML, /示意/); assert.match(m1HTML, /示意/);
});

test('单侧、左右交替、沿用加针侧在未完成设置时仍有不同布边示意', () => {
  const single = fresh(), alternating = changed(fresh(), 'incLayout', 'alternating');
  const singleHTML = renderer(single).diagram('incLayout');
  const alternatingHTML = renderer(alternating).diagram('incLayout');
  assert.match(singleHTML, /<svg\b/); assert.match(alternatingHTML, /<svg\b/);
  assert.match(singleHTML, /同一条|固定|单侧/);
  assert.match(alternatingHTML, /轮流|两条|交替/);
  assert.notEqual(singleHTML, alternatingHTML);
  const followingHTML = renderer(alternating).diagram('decLayout');
  assert.match(followingHTML, /<svg\b/);
  assert.match(followingHTML, /最后.*加针|末次.*加针|沿用加针侧/);
  assert.match(followingHTML, /首次.*减针|第一次.*减针/);
  const independent = changed(alternating, 'decLayout', 'single');
  const independentHTML = renderer(independent).diagram('decLayout');
  assert.match(independentHTML, /<svg\b/);
  assert.match(independentHTML, /同一条|固定|单侧/);
  assert.notEqual(followingHTML, independentHTML);
});

test('行尾示意使用真实起针数：KFB 最后下针、M1 针间、减针滑针前两针', () => {
  const kfb = actual({incFirst:'end'}), m1 = actual({incFirst:'end',incMethod:'between'});
  const decrease = actual({decLayout:'single',decFirst:'end'});
  const cases = [
    [kfb,'incFirst',{lead:2,ordinal:'3',slip:3},1],
    [m1,'incFirst',{lead:3,ordinal:'3,4',slip:3},0],
    [decrease,'decFirst',{lead:5,ordinal:'6,7',slip:3},2]
  ];
  for (const [current,key,expected,consumed] of cases) {
    const svg = firstSVG(renderer(current).diagram(key));
    assert.deepEqual(needleAttributes(svg), expected);
    assert.equal((svg.match(/data-needle-kind="change"/g) || []).length, consumed);
    assert.equal((svg.match(/data-needle-kind="slip"/g) || []).length, expected.slip);
    assert.match(svg, new RegExp('data-change-marker="' + expected.ordinal + '"'));
  }
});

test('起针、最宽与结束针数用 Y 方向标线表示一行的针数', () => {
  for (const current of [fresh({max:10}),fresh(),actual()]) {
    const before = serialized(current), help = renderer(current);
    for (const key of ['start','max','end']) {
      const html = help.diagram(key), line = lineAttributes(html,'data-width-marker',key);
      assert.equal(Number(line.x1), Number(line.x2), key + ' width must be vertical');
      assert.ok(Number(line.y2) > Number(line.y1), key + ' should span the row width');
      assert.doesNotMatch(html, /<rect\b[^>]*clip-path=/, 'width should identify a row rather than a run of rows');
    }
    assert.equal(serialized(current),before);
  }
  const help = renderer(actual());
  const start = lineAttributes(help.diagram('start'),'data-width-marker','start');
  const max = lineAttributes(help.diagram('max'),'data-width-marker','max');
  assert.ok(Number(max.y2)-Number(max.y1) > Number(start.y2)-Number(start.y1));
  assert.match(help.diagram('start'), /第 1 行开始时 · 6 针/);
  assert.match(help.diagram('max'), /最宽一行 · 10 针/);
});

test('第 40 行首次减针用平织段结束处的一条线表示，不高亮整段', () => {
  const current = fresh({max:10}), before = serialized(current), help = renderer(current);
  const fb = settings.feedback(current.draft,current.state);
  assert.equal(fb.firstDecrease,40);
  const html = help.diagram('firstDecrease'), marker = lineAttributes(html,'data-row-marker','40');
  assert.equal(Number(marker.x1),Number(marker.x2));
  assert.ok(Number(marker.y2) > Number(marker.y1));
  assert.equal((html.match(/data-row-marker=/g) || []).length,1);
  assert.doesNotMatch(html, /<rect\b/);
  assert.match(html,/第 40 行开始减针/);
  assert.match(html,/示意/);
  assert.equal(fb.plan.rows.find(row => row.delta < 0).id,40);
  assert.equal(serialized(current),before);
  const unfinished = renderer(fresh()).diagram('firstDecrease');
  const unfinishedMarker = lineAttributes(unfinished,'data-row-marker','firstDecrease');
  const attrs = assertFlatPeak(html,false);
  assertTimelinePositions(html,fb.plan);
  assert.equal(Number(marker.x1),Number(attrs['data-plain-end-x']));
  assert.equal(attrs['data-plain-start-row'],'32');
  assert.equal(attrs['data-plain-end-row'],'39');
  assert.equal(attrs['data-plain-rows'],'7');
  assert.equal(Number(unfinishedMarker.x1),Number(plainAttributes(unfinished)['data-plain-end-x']));
  assert.doesNotMatch(unfinished,/data-plain-(?:start-row|end-row|rows)="\d+"|data-row-marker="\d+"/);
  assert.doesNotMatch(unfinished,/<rect\b/);
});

test('首个前 2 下针和后续前 3 下针分别标在第 3 与第 4 针', () => {
  const current = fresh(), before = serialized(current), help = renderer(current);
  assert.equal(current.draft.firstIncLead,2);
  assert.equal(current.draft.incLead,3);
  const first = help.diagram('firstIncLead'), later = help.diagram('incLead');
  assert.deepEqual(needleAttributes(first),{lead:2,ordinal:'3',slip:3});
  assert.deepEqual(needleAttributes(later),{lead:3,ordinal:'4',slip:3});
  assert.match(first,/2 下针 → 第 3 针 \+1/);
  assert.match(later,/3 下针 → 第 4 针 \+1/);
  assert.equal(serialized(current),before);
});

test('加针前数字改为 4 时，同一针与针间示意都跟随输入且不影响另一个字段', () => {
  for (const key of ['firstIncLead','incLead']) for (const method of ['stitch','between']) {
    let current = fresh({start:10,max:15,end:6,incMethod:method});
    current = changed(current,key,4);
    const before = serialized(current), help = renderer(current), html = help.diagram(key);
    assert.deepEqual(needleAttributes(html),{lead:4,ordinal:method === 'stitch' ? '5' : '4,5',slip:3});
    assert.match(html, method === 'stitch' ? /4 下针 → 第 5 针 \+1/ : /4 下针 → 4、5 针间 \+1/);
    const other = key === 'firstIncLead' ? 'incLead' : 'firstIncLead';
    assert.equal(needleAttributes(help.diagram(other)).lead,other === 'incLead' ? 3 : 2);
    assert.equal(serialized(current),before);
  }
});

test('前导下针 199 的压缩图保留真实数量和针序，所有元素在 320 画布内', () => {
  for (const key of ['firstIncLead','incLead']) for (const method of ['stitch','between']) {
    const current = changed(fresh({incMethod:method}),key,199), before = serialized(current);
    const svg = firstSVG(renderer(current).diagram(key));
    assert.match(svg,/viewBox="0 0 320 154"/);
    assert.deepEqual(needleAttributes(svg),{lead:199,ordinal:method === 'stitch' ? '200' : '199,200',slip:3});
    assert.match(svg,/199 下针/);
    assert.match(svg,/…/);
    assert.ok((svg.match(/data-needle-kind=/g) || []).length <= 12, 'large counts must not draw hundreds of needles');
    for (const match of svg.matchAll(/\b(?:x|x1|x2)="(-?[\d.]+)"/g)) {
      const x = Number(match[1]);
      assert.ok(x >= 0 && x <= 320,'label outside the horizontal viewBox: ' + x);
    }
    for (const match of svg.matchAll(/\bd="([^"]*)"/g)) {
      const tokens = match[1].match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
      for (let i = 0; i < tokens.length;) {
        const command = tokens[i++], args = [];
        while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) args.push(Number(tokens[i++]));
        const xs = command === 'V' ? [] : command === 'H' ? args : args.filter((_,j) => j % 2 === 0);
        for (const x of xs) assert.ok(x >= 0 && x <= 320,'path outside horizontal viewBox: ' + x);
      }
    }
    assert.equal(serialized(current),before);
  }
});

test('收尾和侧别帮助在未填与有效设置间保持简洁概念轮廓', () => {
  for (const layout of ['single','alternating']) {
    const fixtures = [
      fresh({incLayout:layout}), fresh({incLayout:layout,max:10}),
      fresh({incLayout:layout,max:26}), actual({incLayout:layout}),
      actual({incLayout:layout,max:26,interval:10,firstInc:4,firstDec:9,tail:13,end:8})
    ];
    for (const key of ['tail','incLayout','decLayout']) {
      const baseline = polygonPoints(renderer(fixtures[0]).diagram(key));
      for (const current of fixtures) {
        const before = serialized(current), feedbackBefore = JSON.stringify(settings.feedback(current.draft,current.state).plan);
        const html = renderer(current).diagram(key), attrs = outlineAttributes(html);
        assert.equal(attrs['data-outline-purpose'],key.endsWith('Layout') ? 'edges' : 'flow');
        assert.equal(attrs['data-outline-kind'],layout === 'single' ? 'triangle' : 'diamond');
        assert.equal(polygonPoints(html),baseline,key + ' must not switch to a row-by-row polygon');
        assert.match(html,/示意/);
        assert.equal(serialized(current),before);
        assert.equal(JSON.stringify(settings.feedback(current.draft,current.state).plan),feedbackBefore);
      }
    }
  }
});

test('概念侧别图标注真实变针行；减针从末次加针侧开始，空白设置不杜撰行号', () => {
  for (const layout of ['single','alternating']) {
    const current = actual({incLayout:layout}), before = serialized(current), help = renderer(current);
    const plan = settings.feedback(current.draft,current.state).plan;
    const increases = plan.rows.filter(row => row.delta > 0), decreases = plan.rows.filter(row => row.delta < 0);
    const incHTML = help.diagram('incLayout'), decHTML = help.diagram('decLayout');
    const incRows = increases.slice(0,3), decRows = increases.slice(-1).concat(decreases.slice(0,2));
    assert.deepEqual(eventRows(incHTML),incRows.map(row => row.id));
    assert.deepEqual(eventRows(decHTML),decRows.map(row => row.id));
    for (const [html,rows] of [[incHTML,incRows],[decHTML,decRows]]) {
      assert.deepEqual(eventMarkers(html),rows.map(row => ({id:row.id,fabricEdge:row.fabricEdge})), 'concept markers must preserve the actual cloth side');
    }
    for (const id of eventRows(incHTML)) assert.match(incHTML,new RegExp('第 ' + id + ' 行'));
    for (const id of eventRows(decHTML)) assert.match(decHTML,new RegExp('第 ' + id + ' 行'));
    assert.equal(increases.at(-1).fabricEdge,decreases[0].fabricEdge);
    assert.equal(serialized(current),before);
  }
  for (const key of ['incLayout','decLayout']) assert.deepEqual(eventRows(renderer(fresh()).diagram(key)),[]);
  const current = actual({tail:13}), before = serialized(current), html = renderer(current).diagram('tail');
  assert.match(html,/13 行/);
  assert.equal(serialized(current),before);
});

test('首次减针从第 40 行延到 60 行时，平顶变长且红线右移，计划和输入保持不变', () => {
  const initial = fresh({max:10}), later = changed(initial,'firstDecrease',60);
  const before = serialized(later), initialHTML = renderer(initial).diagram('firstDecrease');
  const html = renderer(later).diagram('firstDecrease'), plan = settings.feedback(later.draft,later.state).plan;
  assert.ok(plan);
  assert.equal(plan.rows.find(row => row.delta < 0).id,60);
  const initialPlain = assertFlatPeak(initialHTML,false), laterPlain = assertFlatPeak(html,false);
  assertTimelinePositions(initialHTML,settings.feedback(initial.draft,initial.state).plan);
  assertTimelinePositions(html,plan);
  assert.ok(Number(laterPlain['data-plain-end-x']) - Number(laterPlain['data-plain-start-x']) > Number(initialPlain['data-plain-end-x']) - Number(initialPlain['data-plain-start-x']));
  assert.equal(laterPlain['data-plain-start-row'],'32');
  assert.equal(laterPlain['data-plain-end-row'],'59');
  assert.equal(laterPlain['data-plain-rows'],'27');
  assert.match(html,/第 60 行开始减针/);
  const marker = lineAttributes(html,'data-row-marker','60');
  assert.ok(Number(marker.x1) > Number(lineAttributes(initialHTML,'data-row-marker','40').x1));
  assert.equal(Number(marker.x1),Number(laterPlain['data-plain-end-x']));
  assert.equal(marker.x1,marker.x2);
  assert.equal(serialized(later),before);
});

test('第 160 行达到 26 针、第 180 行减针：中间 19 行在图中保持最宽，红线位于平段右端', () => {
  for (const layout of ['single','alternating']) {
    const current = changed(fresh({max:26,incLayout:layout}),'firstDecrease',180);
    const before = serialized(current), feedback = settings.feedback(current.draft,current.state), planBefore = JSON.stringify(feedback.plan);
    assert.ok(feedback.plan);
    const lastIncrease = feedback.plan.rows.filter(row => row.delta > 0).at(-1);
    const firstDecrease = feedback.plan.rows.find(row => row.delta < 0);
    assert.equal(lastIncrease.id,160); assert.equal(firstDecrease.id,180);
    assert.equal(feedback.plan.rows.filter(row => row.id > lastIncrease.id && row.id < firstDecrease.id && row.delta === 0).length,19);
    const html = renderer(current).diagram('firstDecrease'), attrs = assertFlatPeak(html,layout === 'alternating');
    assertTimelinePositions(html,feedback.plan);
    assert.equal(attrs['data-plain-start-row'],'160');
    assert.equal(attrs['data-plain-end-row'],'179');
    assert.equal(attrs['data-plain-rows'],'19');
    const marker = lineAttributes(html,'data-row-marker','180');
    assert.equal(Number(marker.x1),Number(attrs['data-plain-end-x']));
    assert.equal(marker.x1,marker.x2);
    assert.match(html,/第 180 行开始减针/);
    assert.equal(serialized(current),before);
    assert.equal(JSON.stringify(settings.feedback(current.draft,current.state).plan),planBefore);
  }
});

test('空白或无效设置仍显示通用平顶，不编造首次减针行和平织行数', () => {
  for (const layout of ['single','alternating']) for (const current of [fresh({incLayout:layout}),changed(fresh({max:10,incLayout:layout}),'firstDecrease',20)]) {
    const before = serialized(current);
    assert.equal(settings.feedback(current.draft,current.state).plan,undefined);
    const html = renderer(current).diagram('firstDecrease'), attrs = assertFlatPeak(html,layout === 'alternating');
    const marker = lineAttributes(html,'data-row-marker','firstDecrease');
    assert.equal(Number(marker.x1),Number(attrs['data-plain-end-x']));
    assert.ok(Number(attrs['data-plain-end-x']) > Number(attrs['data-plain-start-x']));
    assert.doesNotMatch(firstSVG(html),/data-plain-(?:start-row|end-row|rows)="\d+"|data-row-marker="\d+"/);
    assert.match(html,/首次减针所在的行/);
    assert.equal(serialized(current),before);
  }
});

test('仅减针段从最宽处平织到首次减针前一行，红线仍在平段右端', () => {
  for (const layout of ['single','alternating']) {
    const current = changed(changed(fresh({max:26,incLayout:layout}),'mode','decrease'),'firstDecrease',20);
    const before = serialized(current), feedback = settings.feedback(current.draft,current.state), planBefore = JSON.stringify(feedback.plan);
    assert.ok(feedback.plan);
    assert.equal(feedback.plan.rows.find(row => row.delta < 0).id,20);
    const html = renderer(current).diagram('firstDecrease'), attrs = assertFlatPeak(html,layout === 'alternating');
    assertTimelinePositions(html,feedback.plan);
    assert.equal(attrs['data-plain-start-row'],'0');
    assert.equal(attrs['data-plain-end-row'],'19');
    assert.equal(attrs['data-plain-rows'],'19');
    const marker = lineAttributes(html,'data-row-marker','20');
    assert.equal(Number(marker.x1),Number(attrs['data-plain-end-x']));
    assert.equal(Number(attrs['data-plain-start-x']),Math.min(...pointCoordinates(html).map(point => point[0])));
    assert.equal(serialized(current),before);
    assert.equal(JSON.stringify(settings.feedback(current.draft,current.state).plan),planBefore);
  }
});

test('没有平织等待时不凭空增加平台，首次减针线与到最宽的边界重合', () => {
  for (const layout of ['single','alternating']) {
    const full = changed(fresh({max:10,incLayout:layout}),'firstDecrease',33);
    const decreasing = changed(changed(fresh({max:10,incLayout:layout}),'mode','decrease'),'firstDecrease',1);
    for (const current of [full,decreasing]) {
      const before = serialized(current), feedback = settings.feedback(current.draft,current.state);
      assert.ok(feedback.plan);
      const html = renderer(current).diagram('firstDecrease'), attrs = assertFlatPeak(html,layout === 'alternating');
      assertTimelinePositions(html,feedback.plan);
      assert.equal(attrs['data-plain-rows'],'0');
      assert.equal(attrs['data-plain-start-x'],attrs['data-plain-end-x']);
      const first = feedback.plan.rows.find(row => row.delta < 0);
      assert.equal(Number(lineAttributes(html,'data-row-marker',String(first.id)).x1),Number(attrs['data-plain-end-x']));
      assert.equal(serialized(current),before);
    }
  }
});

test('单独加针和减针的流程、收尾与侧别帮助也使用稳定的对应概念轮廓', () => {
  for (const mode of ['increase','decrease']) for (const layout of ['single','alternating']) {
    const unfinished = changed(fresh({incLayout:layout}),'mode',mode);
    const filled = changed(fresh({incLayout:layout,max:10}),'mode',mode);
    const before = serialized(filled), help = renderer(filled);
    assert.ok(settings.feedback(filled.draft,filled.state).plan);
    for (const key of ['mode','tail','incLayout','decLayout']) {
      const html = help.diagram(key), attrs = outlineAttributes(html);
      assert.equal(attrs['data-outline-kind'],mode);
      assert.equal(attrs['data-outline-purpose'],key.endsWith('Layout') ? 'edges' : 'flow');
      assert.equal(polygonPoints(html),polygonPoints(renderer(unfinished).diagram(key)));
      assert.match(html,/示意/);
    }
    assert.equal(serialized(filled),before);
  }
});

test('针数帮助在未填、有效和不同行数设置间保留相同概念轮廓，只更新针数', () => {
  for (const layout of ['single','alternating']) {
    const fixtures = [
      fresh({incLayout:layout}),
      fresh({incLayout:layout,max:10}),
      fresh({incLayout:layout,max:26}),
      actual({incLayout:layout,max:10}),
      actual({incLayout:layout,max:26,interval:10,firstInc:4,firstDec:9,tail:13,end:8})
    ];
    const baseline = polygonPoints(renderer(fixtures[0]).diagram('max'));
    for (const current of fixtures) {
      const before = serialized(current), help = renderer(current);
      const feedbackBefore = JSON.stringify(settings.feedback(current.draft,current.state).plan);
      for (const key of ['start','max','end']) {
        const html = help.diagram(key), attrs = svgAttributes(html);
        assert.equal(attrs['data-outline-purpose'],'width');
        assert.equal(attrs['data-outline-kind'],layout === 'single' ? 'triangle' : 'diamond');
        assert.equal(polygonPoints(html),baseline,'validating a plan must not replace the concept outline');
        const value = current.draft[key];
        if (value !== '') assert.match(html,new RegExp(value + ' 针'));
        const marker = lineAttributes(html,'data-width-marker',key);
        assert.equal(marker.x1,marker.x2);
      }
      assert.equal(serialized(current),before);
      assert.equal(JSON.stringify(settings.feedback(current.draft,current.state).plan),feedbackBefore);
    }
  }
  const help = renderer(fresh({max:10}));
  assert.match(help.diagram('start'),/第 1 行开始时 · 6 针/);
  assert.match(help.diagram('max'),/最宽一行 · 10 针/);
  assert.match(help.diagram('end'),/减针结束时 · 6 针/);
});

test('针数概念图区分单侧与左右交替，并保留有限宽端部', () => {
  const single = renderer(fresh({max:10})).diagram('max');
  const alternate = renderer(fresh({max:10,incLayout:'alternating'})).diagram('max');
  assert.notEqual(polygonPoints(single),polygonPoints(alternate));
  for (const html of [single,alternate]) {
    const points = polygonPoints(html).trim().split(/\s+/).map(point => point.split(',').map(Number));
    const leftX = Math.min(...points.map(point => point[0]));
    const rightX = Math.max(...points.map(point => point[0]));
    for (const endX of [leftX,rightX]) {
      const ys = points.filter(point => point[0] === endX).map(point => point[1]);
      assert.ok(Math.max(...ys) > Math.min(...ys),'an endpoint must not imply a zero-stitch tip');
    }
    assert.match(html,/示意/);
  }
});

test('单独加针和减针的针数帮助保留各自概念轮廓', () => {
  for (const mode of ['increase','decrease']) {
    const unfinished = changed(fresh(),'mode',mode);
    const filled = changed(fresh({max:10}),'mode',mode);
    for (const key of ['start','max','end']) {
      const before = serialized(filled), html = renderer(filled).diagram(key);
      assert.equal(svgAttributes(html)['data-outline-purpose'],'width');
      assert.equal(svgAttributes(html)['data-outline-kind'],mode);
      assert.equal(polygonPoints(html),polygonPoints(renderer(unfinished).diagram(key)));
      assert.equal(serialized(filled),before);
    }
  }
});

test('整条设置按加针、减针、收尾排列，织法固定展开，移除独立减针和边针控件', () => {
  for (const layout of ['single','alternating']) {
    const current = fresh({max:10,incLayout:layout}), before = serialized(current), html = renderer(current).setup();
    assert.ok(html.indexOf('加针怎么织') < html.indexOf('减针怎么织'));
    assert.ok(html.indexOf('减针怎么织') < html.indexOf('<h2>收尾</h2>'));
    for (const title of ['加针怎么织','减针怎么织']) {
      assert.match(html,new RegExp('<section class="setup-group"><h2>' + title + '<\\/h2>'));
      assert.doesNotMatch(html,new RegExp('<summary>[\\s\\S]*?' + title + '[\\s\\S]*?<\\/summary>'));
    }
    assert.doesNotMatch(html,/<details\b[^>]*data-section="increase"|data-weave-summary/);
    for (const key of ['decLayout','decFirst','decLead','lastDecLead','slip']) {
      assert.doesNotMatch(html,new RegExp('(?:data-setting|data-key|id)="(?:setting-)?' + key + '"'));
    }
    assert.doesNotMatch(html,/data-change="onDecLayout"|data-change="onDecPosition"|单侧减针<\/option>/);
    assert.match(html,/data-help="decLayout"/,'the fixed decrease rule remains explainable');
    assert.match(html,layout === 'alternating' ? /左右交替，每次减 1 针/ : /固定同一条布边，每次减 1 针/);
    assert.equal(serialized(current),before);
  }
});

test('仅减针段使用原加针方式确定侧别；仅加针段没有减针配置', () => {
  const decrease = changed(fresh({max:10}),'mode','decrease'), before = serialized(decrease);
  const html = renderer(decrease).setup();
  assert.match(html,/<label[^>]*for="setting-incLayout"[^>]*>原加针方式<\/label>/);
  assert.doesNotMatch(html,/data-setting="decLayout"|data-setting="decFirst"|data-setting="decLead"|data-setting="lastDecLead"|data-setting="slip"/);
  assert.equal(serialized(decrease),before);
  const increase = changed(fresh({max:10}),'mode','increase'), incHTML = renderer(increase).setup();
  assert.doesNotMatch(incHTML,/减针怎么织|data-setting="end"|data-setting="firstDecrease"/);
  assert.ok(incHTML.indexOf('加针怎么织') < incHTML.indexOf('<h2>收尾</h2>'));
});

test('三个计数范围均移除尺寸估算和密度输入，保留针数、行数与颜色设置', () => {
  for (const mode of ['full','increase','decrease']) {
    const current = mode === 'full' ? fresh({max:10}) : changed(fresh({max:10}),'mode',mode);
    const before = serialized(current), html = renderer(current).setup();
    assert.doesNotMatch(html,/尺寸估算|填写小样密度|每 10 cm|data-section="size"/);
    assert.doesNotMatch(html,/data-setting="gauge(?:Rows|Stitches)"|id="setting-gauge(?:Rows|Stitches)"/);
    assert.match(html,/data-setting="max"/);
    assert.match(html,/data-setting="interval"/);
    assert.match(html,/aria-label="围巾颜色"/);
    assert.equal(serialized(current),before);
  }
});

test('预览保留实际行数和针数，标明形状示意，移除无法可靠估算的厘米尺寸和密度说明', () => {
  for (const mode of ['full','increase','decrease']) for (const layout of ['single','alternating']) {
    const current = mode === 'full' ? fresh({max:10,incLayout:layout}) : changed(fresh({max:10,incLayout:layout}),'mode',mode);
    const plan = settings.feedback(current.draft,current.state).plan, before = serialized(current);
    assert.ok(plan);
    const html = renderer(current).preview();
    assert.match(html,/形状示意/);
    assert.doesNotMatch(html,/\bcm\b|密度|尺寸估算|最宽约|preview-dimensions/);
    assert.match(html,new RegExp(plan.total + ' 行'));
    assert.ok(html.indexOf('class="plan-summary"') < html.indexOf('class="preview-color"'), 'actual row and stitch counts should precede the color controls');
    const knitting = plan.rows.filter(row => row.phase !== '收针');
    const first = knitting[0].before, widest = Math.max(first,...knitting.map(row => row.stitches)), last = knitting.at(-1).stitches;
    const ends = (mode === 'increase' ? [first,widest] : mode === 'decrease' ? [widest,last] : [first,widest,last]).join(' → ') + ' 针';
    assert.ok(html.includes('<div class="plan-summary"><span>' + plan.total + ' 行</span><span>' + ends + '</span></div>'), 'summary should retain the exact row total and start, widest, and end stitch counts');
    assert.match(html,/canvas id="scarf-preview"/);
    assert.match(html,/aria-label="围巾颜色"/);
    assert.equal(serialized(current),before);
  }
});
