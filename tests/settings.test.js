const {test} = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/settings');
const pattern = require('../src/pattern');
function fresh(overrides) { return settings.init(Object.assign({max:10,interval:6}, overrides), true); }
function update(current, key, value) { return settings.change(current.draft, current.state, key, value); }
function feedback(current) { return settings.feedback(current.draft, current.state); }
function adopt(current, key) { return settings.adopt(current.draft, current.state, key); }

test('新建建议对应真实行表：6行间隔、6首加、30首减、5尾段，共54行', () => {
  const current = fresh();
  assert.equal(current.draft.firstInc,6); assert.equal(current.draft.end,6); assert.equal(current.draft.firstDec,6);
  assert.equal(current.draft.tail,5); assert.equal(current.draft.center,0);
  assert.deepEqual(current.state.auto,{firstInc:true,end:true,firstDec:true,tail:true});
  const result=feedback(current);
  assert.equal(result.firstDecrease,30); assert.equal(result.plan.total,54);
  assert.deepEqual(result.plan.rows.filter(r=>r.delta>0).map(r=>r.id),[6,12,18,24]);
  assert.deepEqual(result.plan.rows.filter(r=>r.delta<0).map(r=>r.id),[30,36,42,48]);
  assert.match(result.hints.firstInc,/前 5 行.*6、12、18、24/);
  assert.match(result.hints.firstDecrease,/第 24 行到 10 针.*平织 5 行.*第 30 行/);
});

test('没有最宽针数时首加仍可解释，初始化不猜最宽也不报空白字段错误', () => {
  const current=settings.init({},true),result=feedback(current);
  assert.equal(current.draft.max,''); assert.equal(current.draft.tail,7);
  assert.equal(result.firstDecrease,''); assert.equal(result.plan,undefined);
  assert.match(result.hints.firstInc,/前 7 行.*第 8 行/);
  assert.deepEqual(result.errors,{});
});

test('自动值按顺序联动，上游手填不会标记下游为手动', () => {
  let current=fresh(); current=update(current,'interval','10');
  assert.equal(current.draft.firstInc,10); assert.equal(current.draft.tail,9); assert.equal(feedback(current).firstDecrease,50);
  current=update(current,'start','7');
  assert.equal(current.draft.end,7); assert.equal(feedback(current).firstDecrease,40);
  assert.deepEqual(current.state.auto,{firstInc:true,end:true,firstDec:true,tail:true});
});

test('手改首加为8后改间隔10，首加保留8，自动尾段7与首减48跟随新行程', () => {
  let current=update(fresh(),'firstInc','8');
  assert.equal(feedback(current).firstDecrease,32); assert.equal(current.draft.tail,7);
  current=update(current,'interval',10);
  assert.equal(current.draft.firstInc,'8'); assert.equal(current.draft.tail,7); assert.equal(feedback(current).firstDecrease,48);
  assert.equal(current.state.auto.firstInc,false);
  assert.equal(feedback(current).suggestions.firstInc,10);
});

test('手改恰好等于建议也固定，明确采用建议才恢复自动', () => {
  let current=update(fresh(),'firstInc',6);
  assert.equal(current.state.auto.firstInc,false); assert.equal(feedback(current).suggestions.firstInc,6);
  current=update(current,'interval',8); assert.equal(current.draft.firstInc,6);
  current=adopt(current,'firstInc'); assert.equal(current.draft.firstInc,8); assert.equal(current.state.auto.firstInc,true);
  current=update(current,'interval',10); assert.equal(current.draft.firstInc,10);
});

test('结束针数和尾段手改分别保护，采纳一个建议不会解除另一个手动状态', () => {
  let current=update(update(fresh(),'end',7),'tail',12);
  current=update(current,'start',8); current=update(current,'firstInc',9);
  assert.equal(current.draft.end,7); assert.equal(current.draft.tail,12);
  assert.equal(feedback(current).suggestions.end,8); assert.equal(feedback(current).suggestions.tail,8);
  current=adopt(current,'end'); assert.equal(current.draft.end,8); assert.equal(current.state.auto.tail,false);
  assert.equal(current.draft.tail,12);
});

test('旧存档打开保留原始段内首减、中部等待、尾段和全部实际行', () => {
  const raw=pattern.generate({max:10,tail:6,firstInc:8,firstDec:8,center:20}).params;
  const original=JSON.parse(JSON.stringify(raw)),current=settings.init(raw,false);
  assert.equal(current.draft.center,20); assert.equal(current.draft.firstDec,8); assert.equal(current.draft.tail,6);
  assert.equal(feedback(current).firstDecrease,60);
  assert.deepEqual(current.state.auto,{firstInc:false,end:false,firstDec:false,tail:false});
  assert.deepEqual(pattern.generate(current.draft).rows,pattern.generate(raw).rows);
  assert.deepEqual(raw,original); assert.equal(raw.guidance,undefined);
});

test('元数据保存版本、自动标志和明确手动的模式行号，打开不重算已存数值', () => {
  let current=update(fresh(),'tail',5); current=update(current,'firstDecrease',34);
  const reopened=settings.init(current.draft,false);
  assert.equal(reopened.draft.firstDec,10); assert.equal(feedback(reopened).firstDecrease,34);
  assert.equal(reopened.state.auto.tail,false); assert.equal(reopened.state.auto.firstDec,false);
  assert.deepEqual(Object.keys(reopened.draft.guidance).sort(),['auto','targets','version','weave']);
  assert.deepEqual(reopened.draft.guidance.targets,{full:34});
  const stored=Object.assign({},reopened.draft,{firstInc:5,tail:11,guidance:{version:1,auto:{firstInc:true,tail:true,end:true,firstDec:true}}});
  assert.equal(settings.init(stored,false).draft.firstInc,5);
  assert.equal(settings.init(stored,true).draft.tail,11);
});

test('上游输入暂时清空或超界，保留自动下游，数值恢复后再联动', () => {
  let current=fresh(); current=update(current,'interval','');
  assert.equal(current.draft.firstInc,6); assert.equal(current.draft.tail,5); assert.equal(current.draft.firstDec,6);
  assert.equal(feedback(current).firstDecrease,''); assert.equal(feedback(current).plan,undefined);
  current=update(current,'interval',41); assert.equal(current.draft.firstInc,6); assert.equal(current.draft.tail,5);
  assert.match(feedback(current).errors.interval,/2–40/);
  current=update(current,'interval',8); assert.equal(current.draft.firstInc,8); assert.equal(current.draft.tail,7);
  assert.equal(feedback(current).firstDecrease,40);
});

test('手填全局首减行固定，锚点变化时重新换算，非法早于最宽时原始行表不被伪装为可保存', () => {
  let current=update(fresh(),'firstDecrease',34);
  assert.equal(current.draft.firstDec,10); assert.equal(current.draft.center,0);
  current=update(current,'interval',7);
  assert.equal(feedback(current).firstDecrease,34); assert.equal(current.draft.firstDec,6);
  current=update(current,'interval',10);
  assert.equal(feedback(current).firstDecrease,34); assert.equal(feedback(current).plan,undefined);
  assert.match(feedback(current).errors.firstDecrease,/最早第 41 行/);
  current=update(current,'interval',6); assert.equal(feedback(current).firstDecrease,34); assert.ok(feedback(current).plan);
  current=adopt(current,'firstDecrease'); assert.equal(feedback(current).firstDecrease,30); assert.equal(current.state.auto.firstDec,true);
});

test('清空上游不会丢失手填全局首减，恢复锚点仍保留该行', () => {
  let current=update(fresh(),'firstDecrease',34); current=update(current,'max','');
  assert.equal(feedback(current).firstDecrease,34); assert.equal(current.draft.firstDec,10);
  current=update(current,'max',11);
  assert.equal(feedback(current).firstDecrease,34); assert.equal(current.draft.firstDec,4);
});

test('全局首减允许1…600行等待正确分解，601及非整数不保存', () => {
  let current=update(fresh(),'firstDecrease',624);
  assert.equal(current.draft.firstDec,100); assert.equal(current.draft.center,500); assert.equal(feedback(current).firstDecrease,624);
  assert.equal(feedback(current).plan.rows.find(r=>r.delta<0).id,624);
  current=update(current,'firstDecrease',625); assert.match(feedback(current).errors.firstDecrease,/最晚第 624 行/); assert.equal(feedback(current).plan,undefined);
  current=update(current,'firstDecrease',''); assert.equal(feedback(current).firstDecrease,''); assert.match(feedback(current).errors.firstDecrease,/请填写/);
  current=update(current,'firstDecrease','25.5'); assert.match(feedback(current).errors.firstDecrease,/整数/);
  current=update(current,'firstDecrease',25); assert.equal(current.draft.firstDec,1); assert.equal(current.draft.center,0); assert.ok(feedback(current).plan);
});

test('旧中部等待只有明确编辑首减才折叠；修改名称手法颜色不会重排建议或原分解', () => {
  let current=settings.init({max:10,firstInc:8,firstDec:8,center:20,tail:7},false);
  for(const [key,value] of [['name','新名字'],['incMethod','between'],['yarnColor','moss']]) current=update(current,key,value);
  assert.equal(current.draft.center,20); assert.equal(current.draft.firstDec,8);
  current=update(current,'firstDecrease',60); assert.equal(current.draft.center,0); assert.equal(current.draft.firstDec,28);
  let automatic=fresh(); automatic.draft.tail=12; automatic=update(automatic,'incMethod','between');
  assert.equal(automatic.draft.tail,12);
});

test('仅加针尾段自动为0，手填值跨模式保留；仅减针首减使用局部行号且不依赖首加', () => {
  let current=fresh({mode:'increase'});
  assert.equal(current.draft.tail,0); current=update(current,'firstInc',9); assert.equal(current.draft.tail,0);
  current=update(current,'tail',4); current=update(current,'mode','full'); assert.equal(current.draft.tail,4);
  current=update(current,'mode','decrease'); assert.equal(current.draft.tail,4); assert.equal(current.draft.decLayout,'single');
  assert.equal(feedback(current).firstDecrease,6); current=update(current,'interval',8); assert.equal(feedback(current).firstDecrease,8);
  current=update(current,'firstDecrease',3); current=update(current,'interval',10); assert.equal(feedback(current).firstDecrease,3);
  assert.equal(feedback(current).suggestions.firstDecrease,10);
  current=update(current,'firstInc',99); assert.equal(feedback(current).firstDecrease,3); assert.equal(current.draft.tail,4);
});

test('手填整条和仅减针首减分别保存，跨模式改间隔再保存重开不会移动手动行', () => {
  let current=update(fresh(),'firstDecrease',34);
  current=update(current,'mode','decrease'); current=update(current,'firstDecrease',3);
  current=update(current,'interval',8);
  assert.equal(feedback(current).firstDecrease,3);
  assert.deepEqual(current.draft.guidance.targets,{full:34,decrease:3});
  current=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
  current=update(current,'mode','full');
  assert.equal(feedback(current).firstDecrease,34); assert.equal(current.draft.firstDec,2);
  assert.equal(current.draft.center,0); assert.ok(feedback(current).plan);
  current=update(current,'mode','decrease'); assert.equal(feedback(current).firstDecrease,3);
  current=adopt(current,'firstDecrease'); assert.equal(feedback(current).firstDecrease,8);
  assert.equal(current.state.targets,undefined); assert.equal(current.draft.guidance.targets,undefined);
});

test('跨模式后旧手动整条首减早于新最宽处，保留并显示错误，保存后重开隐藏目标仍在', () => {
  let current=update(fresh(),'firstDecrease',30);
  current=update(current,'mode','decrease'); current=update(current,'interval',10);
  current=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
  current=update(current,'mode','full');
  assert.equal(feedback(current).firstDecrease,30); assert.match(feedback(current).errors.firstDecrease,/最早第 41 行/);
  assert.equal(feedback(current).plan,undefined);
  current=update(current,'interval',6); assert.equal(feedback(current).firstDecrease,30); assert.ok(feedback(current).plan);
});

test('旧整条follow跨仅减针转换single后恢复，不改变原交替减针布边', () => {
  let current=settings.init({max:10,interval:6,firstInc:6,tail:5,incLayout:'alternating',decLayout:'follow',decFirst:'end'},false);
  const original=feedback(current).plan.rows.filter(r=>r.delta<0).map(r=>r.fabricEdge);
  current=update(current,'mode','decrease'); assert.equal(current.draft.decLayout,'single');
  current=update(current,'mode','full'); assert.equal(current.draft.decLayout,'follow'); assert.equal(current.draft.decFirst,'end');
  assert.deepEqual(feedback(current).plan.rows.filter(r=>r.delta<0).map(r=>r.fabricEdge),original);
});

test('仅减针的独立侧别和首次位置不污染整条选择，保存重开后两种模式分别恢复', () => {
  let current=settings.init({max:10,firstInc:6,interval:6,firstDec:6,center:0,tail:5,decLayout:'follow',decFirst:'start'},false);
  current=update(current,'mode','decrease'); current=update(current,'decLayout','alternating'); current=update(current,'decFirst','end');
  current=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
  current=update(current,'mode','full'); assert.equal(current.draft.decLayout,'follow'); assert.equal(current.draft.decFirst,'start');
  current=update(current,'decLayout','single'); current=update(current,'decFirst','end');
  current=update(current,'mode','decrease'); assert.equal(current.draft.decLayout,'alternating'); assert.equal(current.draft.decFirst,'end');
  current=update(current,'mode','increase'); current=update(current,'mode','full');
  assert.equal(current.draft.decLayout,'single'); assert.equal(current.draft.decFirst,'end');
});

test('旧只计加针时隐藏的full默认侧别不因经过仅减针而丢失，模式状态深复制', () => {
  let current=settings.init({max:10,interval:6,firstInc:6,tail:0,mode:'increase',decLayout:'follow'},false);
  current=update(current,'mode','decrease'); assert.equal(current.draft.decLayout,'single');
  const before=JSON.stringify(current);
  const next=update(current,'decLayout','alternating');
  assert.equal(JSON.stringify(current),before);
  assert.notEqual(next.state.decreaseModes.full,current.state.decreaseModes.full);
  current=update(next,'mode','full'); assert.equal(current.draft.decLayout,'follow');
});

test('空白或无效加针字段切至仅减针不阻挡保存，重开返回整条恢复原输入', () => {
  for(const [key,value] of [['firstInc',''],['firstInc',101],['firstIncLead',''],['firstIncLead',200],['incLead',''],['incLead',-1],['start','']]) {
    let current=update(fresh(),key,value);
    current=update(current,'mode','decrease');
    assert.equal(current.draft.guidance.inactive[key],value,key);
    assert.equal(current.draft[key],pattern.DEFAULTS[key],key);
    assert.ok(feedback(current).plan,key);
    current=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
    assert.ok(feedback(current).plan,key);
    current=update(current,'mode','full');
    assert.equal(current.draft[key],value,key); assert.equal(feedback(current).plan,undefined,key);
    assert.equal(current.draft.guidance.inactive,undefined,key);
  }
});

test('空白或无效结束及减针字段切至仅加针可保存，跨模式重开恢复手动错误值', () => {
  for(const [key,value] of [['end',''],['end',201],['decLead',''],['decLead',-1],['lastDecLead',''],['lastDecLead',200],['center','']]) {
    let current=update(fresh(),key,value);
    current=update(current,'mode','increase');
    assert.equal(current.draft.guidance.inactive[key],value,key); assert.ok(feedback(current).plan,key);
    current=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
    current=update(current,'mode','decrease');
    if(key === 'center') { assert.ok(feedback(current).plan,key); current=update(current,'mode','full'); }
    assert.equal(current.draft[key],value,key); assert.equal(feedback(current).plan,undefined,key);
  }
});

test('正常隐藏参数不改写，停车状态不可变且不同作品独立', () => {
  const base=update(fresh({firstIncLead:1,incLead:4,decLead:2,lastDecLead:1}),'center',2);
  let current=update(base,'mode','decrease');
  assert.equal(current.draft.incLead,4); assert.equal(current.draft.firstIncLead,1); assert.equal(current.draft.center,2);
  assert.equal(current.draft.guidance.inactive,undefined);
  const invalid=update(fresh(),'firstInc',''),old=JSON.stringify(invalid);
  current=update(invalid,'mode','decrease'); assert.equal(JSON.stringify(invalid),old);
  const stored=JSON.stringify(current),next=update(current,'mode','full');
  assert.equal(JSON.stringify(current),stored); assert.equal(next.draft.firstInc,'');
  assert.equal(fresh().draft.guidance.inactive,undefined);
});

test('转折首减仍限制在锚点后1…100行，不扩大等待上限', () => {
  let current=settings.init({max:10,interval:6,firstInc:6,turnAfterRow:25,firstDec:6,center:0,tail:5},false);
  assert.equal(feedback(current).firstDecrease,31);
  current=update(current,'firstDecrease',125); assert.equal(current.draft.firstDec,100); assert.equal(current.draft.center,0);
  assert.equal(feedback(current).firstDecrease,125); assert.ok(feedback(current).plan);
  current=update(current,'firstDecrease',126); assert.match(feedback(current).errors.firstDecrease,/最晚第 125 行/); assert.equal(feedback(current).plan,undefined);
});

test('旧转折记录额外中部等待未编辑时仍可读取，明确编辑总首减才使用转折入口的100行边界', () => {
  const raw=pattern.generate({max:10,interval:6,firstInc:6,turnAfterRow:25,firstDec:100,center:20,tail:5}).params;
  let current=settings.init(raw,false);
  assert.equal(feedback(current).firstDecrease,145); assert.ok(feedback(current).plan);
  current=update(current,'name','旧围巾'); assert.equal(current.draft.center,20); assert.ok(feedback(current).plan);
  current=update(current,'firstDecrease',145); assert.match(feedback(current).errors.firstDecrease,/最晚第 125 行/);
  assert.equal(feedback(current).plan,undefined); assert.equal(current.draft.firstDec,100); assert.equal(current.draft.center,20);
});

test('手法不自动挪动首2后3，KFB错误组合就地指出', () => {
  let current=fresh({firstIncLead:2,incLead:3}); current=update(current,'incMethod','between');
  assert.equal(current.draft.firstIncLead,2); assert.equal(current.draft.incLead,3);
  current=update(current,'firstIncLead',3); assert.ok(feedback(current).plan);
  current=update(current,'incMethod','stitch'); assert.equal(current.draft.firstIncLead,3);
  assert.match(feedback(current).errors.firstIncLead,/6 针.*最多 2 下针/); assert.equal(feedback(current).plan,undefined);
});

test('挑横线0前导错误指向实际行首字段，不误报行尾的首个位置', () => {
  const current=fresh({max:9,incMethod:'between',incFirst:'end',incLayout:'single',interval:3,firstIncLead:0,incLead:0});
  const result=feedback(current);
  assert.equal(result.errors.firstIncLead,undefined); assert.match(result.errors.incLead,/至少织 1 下针/); assert.equal(result.plan,undefined);
  const allEnds=fresh({max:9,incMethod:'between',incFirst:'end',incLayout:'single',interval:6,firstIncLead:0,incLead:0});
  assert.ok(feedback(allEnds).plan);
  const noTrailing=fresh({max:9,incMethod:'between',incFirst:'end',slip:0});
  assert.match(feedback(noTrailing).errors.slip,/保留原针/);
});

test('模型输入不可变，三条记录自动状态彼此独立，不把临时错误写入元数据', () => {
  const a=fresh(),b=fresh(),c=fresh(); const original=JSON.stringify(a);
  const changed=update(a,'firstDecrease','');
  assert.equal(JSON.stringify(a),original); assert.equal(changed.state.firstDecrease,'');
  assert.equal(changed.draft.guidance.firstDecrease,undefined); assert.equal(b.state.auto.firstDec,true); assert.equal(c.draft.tail,5);
  assert.notEqual(changed.draft.guidance.auto,a.draft.guidance.auto); assert.notEqual(changed.state.auto,a.state.auto);
});

test('超4000行和超过进度行的冲突可见，密度与针法无效不产生误导计划', () => {
  let current=fresh({max:56,interval:40});
  assert.match(feedback(current).errors.total,/4000/); assert.equal(feedback(current).plan,undefined);
  current=update(fresh(),'resume',55); assert.match(feedback(current).errors.resume,/不能超过总行数 54/);
  current=update(fresh(),'gaugeRows',0); assert.equal(feedback(current).plan,undefined);
  current=update(fresh(),'incSlant','invalid'); assert.equal(feedback(current).plan,undefined);
});

test('新简化织法默认首次2后续3，减针3末减2滑3且保存重开不重设', () => {
  let current=settings.init({},true);
  for (const [key,n] of Object.entries({firstIncLead:2,incLead:3,decLead:3,lastDecLead:2,slip:3})) assert.equal(current.draft[key],n,key);
  assert.equal(current.state.weave,'linked'); assert.equal(current.draft.guidance.weave,'linked');
  assert.equal(pattern.DEFAULTS.incLead,2);
  current=update(current,'max',10);
  const before=pattern.generate(current.draft);
  const reopened=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
  assert.equal(reopened.state.weave,'linked');
  assert.deepEqual(pattern.generate(reopened.draft).rows,before.rows);
});

test('新单侧或交替减针首个布边跟随末加布边，奇偶行不改变规则', () => {
  for (const incLayout of ['single','alternating']) for (const incFirst of ['start','end']) for (const interval of [5,6]) {
    let current=fresh({incLayout,incFirst,interval});
    current=update(current,'firstDecrease',feedback(current).firstDecrease+1);
    const plan=feedback(current).plan,inc=plan.rows.filter(r=>r.delta>0),dec=plan.rows.filter(r=>r.delta<0);
    assert.equal(plan.params.decLayout,'follow');
    assert.equal(dec[0].fabricEdge,inc.at(-1).fabricEdge);
    dec.forEach((row,i)=>assert.equal(row.fabricEdge,dec[0].fabricEdge^(incLayout==='alternating'?i%2:0)));
  }
});

test('新仅减针沿用共用侧别和原首次位置，切换及重开不会恢复独立减针选择', () => {
  let current=fresh({incLayout:'alternating',incFirst:'end'});
  // An obsolete mode cache must never override the new linked choice.
  current.state.decreaseModes={full:{layout:'single',first:'start'},decrease:{layout:'single',first:'start'}};
  current=update(current,'mode','decrease');
  assert.equal(current.draft.decLayout,'alternating'); assert.equal(current.draft.decFirst,'end');
  assert.equal(current.state.decreaseModes,undefined); assert.equal(current.draft.guidance.decreaseModes,undefined);
  assert.equal(feedback(current).plan.rows.find(r=>r.delta<0).decreasePosition,'end');
  current=settings.init(JSON.parse(JSON.stringify(current.draft)),false);
  current=update(current,'incLayout','single');
  assert.equal(current.draft.decLayout,'single'); assert.equal(current.draft.decFirst,'end');
  current=update(current,'incFirst','start');
  assert.equal(current.draft.decFirst,'start');
  current=update(current,'mode','full'); assert.equal(current.draft.decLayout,'follow');
  current=update(current,'mode','increase'); assert.equal(current.draft.decLayout,'follow');
  current=update(current,'mode','decrease'); assert.equal(current.draft.decLayout,'single'); assert.equal(current.draft.decFirst,'start');
  const justDecrease=settings.init({mode:'decrease',max:10},true);
  assert.equal(justDecrease.draft.decLayout,'single'); assert.equal(justDecrease.draft.decFirst,'start');
});

test('旧隐藏织法打开、名称颜色和普通数值修改均保留，明确修改加针侧才启用联动', () => {
  const hidden={firstIncLead:1,incLead:2,decLead:1,lastDecLead:1,slip:2,decLayout:'alternating',decFirst:'end'};
  const raw=pattern.generate(Object.assign({max:10,interval:6,firstInc:6,tail:5},hidden)).params;
  const original=JSON.stringify(raw);
  let current=settings.init(raw,false);
  assert.equal(current.state.weave,undefined);
  for (const [key,value] of [['name','旧围巾'],['yarnColor','blue'],['max',11],['interval',8]]) current=update(current,key,value);
  for (const [key,value] of Object.entries(hidden)) assert.equal(current.draft[key],value,key);
  assert.equal(current.state.weave,undefined); assert.equal(JSON.stringify(raw),original);
  current=update(current,'incLayout','alternating');
  assert.equal(current.draft.decLayout,'follow'); assert.equal(current.state.weave,'linked');
  for (const key of ['firstIncLead','incLead','decLead','lastDecLead','slip']) assert.equal(current.draft[key],hidden[key],key);
  current=update(current,'mode','decrease'); assert.equal(current.draft.decLayout,'alternating');
  assert.equal(current.draft.decFirst,current.draft.incFirst);
  current=update(current,'mode','full'); assert.equal(current.draft.decLayout,'follow');
});

test('旧末减下针数过大不会被简化静默修正，侧别联动也不掩盖错误', () => {
  let current=settings.init({max:10,tail:5,end:8,lastDecLead:4,decLead:5,slip:3},false);
  assert.ok(feedback(current).plan);
  current=update(current,'end',6);
  assert.equal(current.draft.lastDecLead,4); assert.equal(current.draft.decLead,5);
  assert.ok(feedback(current).errors.lastDecLead); assert.ok(feedback(current).errors.decLead); assert.equal(feedback(current).plan,undefined);
  current=update(current,'incLayout','alternating');
  assert.equal(current.draft.lastDecLead,4); assert.ok(feedback(current).errors.lastDecLead);
});
