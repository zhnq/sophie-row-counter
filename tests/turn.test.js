const {test}=require('node:test');
const assert=require('node:assert/strict');
const pattern=require('../src/pattern');
const shape=require('../src/shape');
function plan(options){return pattern.generate(Object.assign({max:26,tail:7,incLead:3,finish:'bindoff'},options));}
function done(count,extra){return Array.from({length:count},(_,i)=>i+1).concat(extra||[]);}
function firstDecrement(table){return table.rows.find(r=>r.delta<0);}
function preservedPrefix(original,turned,anchor){assert.deepEqual(turned.rows.slice(0,anchor),original.rows.slice(0,anchor));}

test('第135行平织后以22针转折，默认第136行减针，前缀完整保留',()=>{
  const original=plan(),completed=done(135,[138,144,200]);const before=JSON.stringify(original),oldCompleted=completed.slice();
  const info=pattern.turnInfo(original,completed);
  assert.deepEqual(info,{row:135,stitches:22,nextDecrease:136,minFirstDecrease:136,maxFirstDecrease:235,removed:[138,144,200]});
  const result=pattern.makeTurn(original,completed);
  assert.equal(result.anchor,135);assert.equal(result.firstDecrease,136);assert.equal(result.plan.params.max,22);assert.equal(result.plan.params.turnAfterRow,135);
  assert.equal(result.plan.params.mode,'full');assert.equal(result.plan.params.center,0);assert.equal(result.plan.params.firstDec,1);
  assert.deepEqual(result.completed,done(135));assert.deepEqual(result.removed,[138,144,200]);preservedPrefix(original,result.plan,135);
  const first=firstDecrement(result.plan);assert.equal(first.id,136);assert.equal(first.before,22);assert.equal(first.stitches,21);
  assert.equal(result.plan.rows[134].phase,'加针段');assert.equal(result.plan.rows[134].local,135);
  assert.equal(JSON.stringify(original),before);assert.deepEqual(completed,oldCompleted);
});

test('第139行平织后保留原下一变针节奏，第144行首次减针',()=>{
  const original=plan(),result=pattern.makeTurn(original,done(139));
  assert.equal(result.plan.params.max,23);assert.equal(result.plan.params.turnAfterRow,139);assert.equal(result.plan.params.firstDec,5);
  assert.equal(result.firstDecrease,144);preservedPrefix(original,result.plan,139);
  assert.deepEqual(result.plan.rows.slice(139,143).map(r=>[r.id,r.before,r.stitches,r.delta]),[[140,23,23,0],[141,23,23,0],[142,23,23,0],[143,23,23,0]]);
  assert.equal(firstDecrement(result.plan).id,144);assert.equal(result.plan.rows[143].stitches,22);
  assert.equal(result.plan.rows.filter(r=>r.delta>0).at(-1).id,136);
});

test('加针行完成后用织后实际针数，当前未完成加针行不被自动织完',()=>{
  const original=plan();
  assert.equal(pattern.turnInfo(original,done(135)).stitches,22);
  const afterChange=pattern.makeTurn(original,done(136));
  assert.equal(afterChange.plan.params.max,23);assert.equal(afterChange.anchor,136);assert.equal(afterChange.firstDecrease,144);
  preservedPrefix(original,afterChange.plan,136);assert.equal(afterChange.plan.rows[135].delta,1);
  const beforeChange=pattern.makeTurn(original,done(135));
  assert.equal(beforeChange.plan.rows[135].delta,-1);assert.equal(beforeChange.completed.includes(136),false);
});

test('可调整首减行，锚点前及指定首减前不会提前变针',()=>{
  const original=plan();
  for(const first of [140,144,150,239]){
    const result=pattern.makeTurn(original,done(139),first);preservedPrefix(original,result.plan,139);
    assert.equal(result.firstDecrease,first);assert.equal(firstDecrement(result.plan).id,first);
    assert.ok(result.plan.rows.slice(139,first-1).every(r=>r.delta===0&&r.stitches===23));
  }
  for(const invalid of [139,240,143.5,'',null,false,' '])assert.throws(()=>pattern.makeTurn(original,done(139),invalid),/首次减针行/);
});

test('转折保留奇数间隔物理布边，减针可跟随或选择独立位置',()=>{
  for(const incLayout of ['single','alternating'])for(const decLayout of ['follow','single','alternating'])for(const decFirst of ['start','end']){
    const original=plan({max:14,interval:3,firstInc:4,center:3,incLayout,incFirst:'end',decLayout,decFirst});
    const result=pattern.makeTurn(original,done(15),17);preservedPrefix(original,result.plan,15);
    const inc=original.rows.slice(0,15).filter(r=>r.delta>0),dec=result.plan.rows.filter(r=>r.delta<0);
    assert.equal(dec[0].id,17);assert.equal(result.plan.params.center,0);
    if(decLayout==='follow')assert.equal(dec[0].fabricEdge,inc.at(-1).fabricEdge);
    else assert.equal(dec[0].decreasePosition,decFirst);
    const alternating=decLayout==='alternating'||(decLayout==='follow'&&incLayout==='alternating');
    assert.deepEqual(dec.map(r=>r.fabricEdge),dec.map((_,i)=>dec[0].fabricEdge^(alternating?i%2:0)));
    const outline=shape.build(result.plan);assert.equal(outline.end.width,6);
  }
});

test('针间加针、尾段和收针规则沿用，只有加针计划可转成完整计划',()=>{
  const original=plan({mode:'increase',incMethod:'between',firstIncLead:3,tail:4,end:8,gaugeRows:35,gaugeStitches:19,yarnColor:'blue'});
  const result=pattern.makeTurn(original,done(139));preservedPrefix(original,result.plan,139);
  assert.equal(result.plan.params.mode,'full');assert.equal(result.plan.params.incMethod,'between');assert.equal(result.plan.params.end,8);
  assert.equal(result.plan.params.tail,4);assert.equal(result.plan.params.finish,'none');assert.equal(result.plan.params.gaugeRows,35);assert.equal(result.plan.params.gaugeStitches,19);
  assert.equal(result.plan.params.yarnColor,'blue');assert.equal(result.plan.rows.at(-1).stitches,8);
  assert.equal(result.plan.rows.filter(r=>r.phase==='末尾平织').length,4);
});

test('首加前、未完成首行、已到减针中间尾段收针及已转折不开放入口',()=>{
  const original=plan();
  for(const completed of [[],done(7),done(160),done(320),done(327),done(328)])assert.equal(pattern.turnInfo(original,completed),null);
  assert.equal(pattern.turnInfo(plan({start:8,end:6}),done(7)),null);
  assert.equal(pattern.turnInfo(plan({center:2}),done(160)),null);
  assert.equal(pattern.turnInfo(plan({mode:'decrease'}),done(8)),null);
  assert.equal(pattern.turnInfo(plan({mode:'increase',tail:7}),done(160)),null);
  assert.equal(pattern.turnInfo(plan({end:22}),done(128)),null);
  assert.equal(pattern.turnInfo(original,done(7,[136])),null);
  const turned=pattern.makeTurn(original,done(139));assert.equal(pattern.turnInfo(turned.plan,turned.completed),null);
  assert.equal(pattern.turnInfo(null,[]),null);assert.equal(pattern.turnInfo(original,'invalid'),null);
  assert.throws(()=>pattern.makeTurn(original,done(160)),/不能转入减针/);
});

test('显式转折marker重启后所有行、阶段、织法和稀疏清除结果原样重建',()=>{
  const original=plan(),result=pattern.makeTurn(original,done(139,[142,160,321]));
  const saved=JSON.parse(JSON.stringify({version:1,params:result.plan.params,completed:result.completed}));
  const restored=pattern.restore(saved);assert.equal(saved.params.rules,3);assert.deepEqual(restored.plan,result.plan);assert.deepEqual(restored.progress.completed,result.completed);
  preservedPrefix(original,restored.plan,139);assert.equal(restored.plan.rows[138].phase,'加针段');assert.equal(firstDecrement(restored.plan).id,144);
  const withCenter=pattern.generate(Object.assign({},result.plan.params,{center:2}));preservedPrefix(original,withCenter,139);
  assert.equal(withCenter.rows[139].phase,'中间平织');assert.equal(firstDecrement(withCenter).id,146);
});

test('规则3缺失或损坏marker拒绝恢复，规则2已有转折仍能升级保留前缀',()=>{
  const original=plan(),result=pattern.makeTurn(original,done(139));
  const missing=Object.assign({},result.plan.params);delete missing.turnAfterRow;
  assert.throws(()=>pattern.restore({version:1,params:missing,completed:result.completed}),/转折记录/);
  const inherited=Object.assign(Object.create({turnAfterRow:139}),missing);
  assert.throws(()=>pattern.restore({version:1,params:inherited,completed:result.completed}),/转折记录/);
  for(const marker of [undefined,null,false,' ',135,144,4001]){
    assert.throws(()=>pattern.restore({version:1,params:Object.assign({},result.plan.params,{turnAfterRow:marker}),completed:result.completed}));
  }
  const old=Object.assign({},result.plan.params,{rules:2});
  const upgraded=pattern.restore({version:1,params:old,completed:result.completed});
  assert.equal(upgraded.plan.params.rules,3);assert.equal(upgraded.plan.params.turnAfterRow,139);
  assert.deepEqual(upgraded.plan.rows,result.plan.rows);assert.deepEqual(upgraded.progress.completed,result.completed);preservedPrefix(original,upgraded.plan,139);
});

test('marker范围与最宽针数必须符合原加针事件，旧存档默认无marker',()=>{
  for(const options of [{max:23,turnAfterRow:135},{max:23,turnAfterRow:144},{max:22,turnAfterRow:139},{mode:'increase',max:23,turnAfterRow:139},{mode:'decrease',max:23,turnAfterRow:139},{turnAfterRow:' '},{turnAfterRow:false},{turnAfterRow:4001}])assert.throws(()=>plan(options));
  for(const anchor of [136,139,143])assert.equal(plan({max:23,turnAfterRow:anchor}).params.turnAfterRow,anchor);
  const legacy=pattern.restore({version:1,params:{start:6,max:26,end:6,interval:8,firstInc:8,firstDec:8,tail:7},completed:done(139)});
  assert.equal(legacy.plan.params.turnAfterRow,0);assert.equal(legacy.plan.total,327);
  const turn=pattern.makeTurn(legacy.plan,legacy.progress.completed);assert.equal(turn.plan.params.turnAfterRow,139);preservedPrefix(legacy.plan,turn.plan,139);
});

test('旧resume在撤回后不阻挡缩短，损坏前缀和4000行超限不生成',()=>{
  const original=plan({resume:128}),result=pattern.makeTurn(original,done(40));
  assert.equal(result.plan.params.resume,40);assert.deepEqual(result.completed,done(40));assert.ok(result.plan.total<128);
  const bad=JSON.parse(JSON.stringify(plan()));bad.rows[31].segments[0].count=999;assert.throws(()=>pattern.makeTurn(bad,done(139)),/改变已织行/);
  const edge=JSON.parse(JSON.stringify(plan()));edge.rows[7].fabricEdge=1;assert.throws(()=>pattern.makeTurn(edge,done(139)),/改变已织行/);
  const large=plan({max:56,interval:40,firstInc:40,firstDec:40,tail:0,finish:'none'});
  assert.equal(large.total,4000);assert.throws(()=>pattern.makeTurn(large,done(1999),2099),/4000 行/);
});

test('M1左右倾转折与重开保留方向、真实织法及已织前缀',()=>{
  for(const incSlant of ['left','right','pattern']){
    const original=plan({incMethod:'between',incSlant,firstIncLead:2,incLead:3,interval:3,firstInc:4,incLayout:'alternating',incFirst:'end'});
    const turned=pattern.makeTurn(original,done(15),17);preservedPrefix(original,turned.plan,15);
    assert.equal(turned.plan.params.incSlant,incSlant);
    const restored=pattern.restore({version:1,params:turned.plan.params,completed:turned.completed});
    assert.deepEqual(restored.plan,turned.plan);assert.deepEqual(restored.progress.completed,done(15));
    assert.ok(turned.plan.rows.slice(0,15).filter(r=>r.delta>0).every(r=>r.segments.find(s=>s.kind==='increase').slant===incSlant));
  }
});

test('转折保护忽略行内展示措辞，但不忽略M1方向变化',()=>{
  const original=plan({incMethod:'between',incSlant:'left',firstIncLead:2});
  const display=JSON.parse(JSON.stringify(original));display.rows[7].segments.find(s=>s.kind==='increase').text='原第 2、3 针之间';
  assert.ok(pattern.makeTurn(display,done(139)));
  const slant=JSON.parse(JSON.stringify(original));slant.rows[7].segments.find(s=>s.kind==='increase').slant='right';
  assert.throws(()=>pattern.makeTurn(slant,done(139)),/改变已织行/);
});
