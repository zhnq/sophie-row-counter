const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../src/pattern');
const filled={max:26,tail:7,finish:'none'};
const legacy={start:6,max:26,end:6,interval:8,firstInc:8,firstDec:8,tail:7};
function plan(options){return p.generate(Object.assign({},filled,options));}
function texts(row){return row.segments.map(s=>s.text);}
function fabricEdge(row){const position=row.delta>0?row.increasePosition:row.decreasePosition;return (position==='end'?1:0)^(row.id%2);}
function knitCount(row){return row.segments.filter(s=>s.kind==='knit').reduce((n,s)=>n+parseInt(s.text,10),0);}

test('新建须填写最宽针数和末尾平织，不猜测尺寸',()=>{
  assert.equal(p.DEFAULTS.max,'');assert.equal(p.DEFAULTS.tail,'');assert.equal(p.DEFAULTS.rules,3);
  assert.throws(()=>p.generate({}),/最宽针数/);assert.throws(()=>p.generate({max:26}),/末尾平织/);
  assert.equal(p.generate({max:26,tail:7}).total,328);
});
test('加针与截图的针数和颜色一致，独立加针段不追加收针',()=>{
  const table=plan({mode:'increase',tail:0,finish:'bindoff'});
  for(const [id,total,color] of [[129,22,'yellow'],[135,22,'yellow'],[136,23,'blue'],[137,23,'green'],[143,23,'green'],[144,24,'blue'],[145,24,'yellow'],[152,25,'blue'],[153,25,'green'],[160,26,'blue']]){
    assert.equal(table.rows[id-1].stitches,total);assert.equal(table.rows[id-1].color,color);
  }
  assert.equal(table.rows[128].instruction,'19 下针');assert.equal(table.total,160);assert.equal(table.params.finish,'none');
});
test('减针截图按段内行号和25针起点推算',()=>{
  const table=plan({mode:'decrease',max:25,tail:0});
  for(const [id,total,color] of [[105,12,'yellow'],[111,12,'yellow'],[112,11,'blue'],[113,11,'green'],[120,10,'blue'],[121,10,'yellow'],[128,9,'blue'],[129,9,'green'],[136,8,'blue']]){
    assert.equal(table.rows[id-1].stitches,total);assert.equal(table.rows[id-1].color,color);
  }
});
test('转折、自定义首次变针和收针记录的行号及针数正确',()=>{
  const options={max:10,firstInc:4,firstDec:6,center:3,tail:2};const table=plan(Object.assign({},options,{finish:'bindoff'}));
  assert.equal(table.total,28+3+30+2+1);assert.equal(table.rows[27].stitches,10);assert.equal(table.rows[28].phase,'中间平织');
  assert.equal(table.rows[31].phase,'减针段');assert.equal(table.rows[36].delta,-1);assert.equal(table.rows.at(-2).stitches,6);
  assert.equal(table.rows.at(-1).phase,'收针');assert.equal(table.rows.at(-1).before,6);assert.equal(table.rows.at(-1).stitches,0);
  assert.deepEqual(texts(table.rows.at(-1)),['收 6 针']);assert.equal(table.estimatedLength,plan(options).estimatedLength);
});
test('针内和针间加针分别守恒，行号与针数计划相同',()=>{
  const stitch=plan({incLead:3,firstIncLead:2,incMethod:'stitch'}),between=plan({incLead:3,firstIncLead:3,incMethod:'between'});
  assert.deepEqual(texts(stitch.rows[135]),['3 下针','第 4 针 +1','15 下针','3 滑针']);
  assert.deepEqual(texts(between.rows[135]),['3 下针','3、4 针间 +1','16 下针','3 滑针']);
  assert.deepEqual(stitch.rows.map(r=>[r.id,r.before,r.stitches,r.delta]),between.rows.map(r=>[r.id,r.before,r.stitches,r.delta]));
  for(const table of [stitch,between]) for(const row of table.rows){
    const change=row.segments.find(s=>s.kind==='increase'||s.kind==='decrease');const consumed=row.delta>0?(table.params.incMethod==='stitch'?1:0):row.delta<0?2:0;
    assert.equal(knitCount(row)+table.params.slip+consumed,row.before,'原针守恒，第 '+row.id+' 行');if(change)assert.equal(change.consumed,consumed);
    assert.ok(row.segments.every(s=>s.text!=='0 下针'&&!s.text.includes('余下')&&!s.text.includes('KFB')&&!s.text.includes('M1')));
  }
});
test('首加与末减覆盖常规前导针数，低针数不生成无法执行的区块',()=>{
  const table=plan({incLead:3,firstIncLead:2,decLead:3,lastDecLead:2});
  assert.deepEqual(texts(table.rows[7]),['2 下针','第 3 针 +1','3 滑针']);assert.deepEqual(texts(table.rows[319]),['2 下针','行首减针','3 滑针']);
  assert.deepEqual(texts(plan({incMethod:'between',incLead:3,firstIncLead:3}).rows[7]),['3 下针','3、4 针间 +1','3 滑针']);
  assert.throws(()=>plan({incMethod:'stitch',firstIncLead:3}),/加针行/);assert.throws(()=>plan({lastDecLead:3}),/末次减针行/);
  assert.throws(()=>plan({incLead:199}),/加针行/);assert.throws(()=>plan({decLead:199}),/减针行/);
});
test('不同工作方向下单侧保持同一布边，左右加针交替布边',()=>{
  for(const interval of [2,3])for(const firstInc of [3,4])for(const incFirst of ['start','end'])for(const incLayout of ['single','alternating']){
    const events=plan({max:10,interval,firstInc,incFirst,incLayout,tail:0}).rows.filter(r=>r.delta>0),anchor=fabricEdge(events[0]);
    assert.equal(events[0].increasePosition,incFirst);assert.deepEqual(events.map(fabricEdge),events.map((_,i)=>anchor^(incLayout==='alternating'?i%2:0)));assert.ok(events.every(r=>r.delta===1));
  }
});
test('跟随减针从最后加针布边开始，奇数中间行不换边',()=>{
  for(const center of [0,1])for(const interval of [2,3,8])for(const firstDec of [3,4])for(const incLayout of ['single','alternating']){
    const table=plan({max:10,center,interval,firstDec,incLayout,decLayout:'follow',tail:0}),inc=table.rows.filter(r=>r.delta>0),dec=table.rows.filter(r=>r.delta<0),anchor=fabricEdge(inc.at(-1));
    assert.deepEqual(dec.map(fabricEdge),dec.map((_,i)=>anchor^(incLayout==='alternating'?i%2:0)));assert.ok(dec.every(r=>r.delta===-1));
  }
  assert.deepEqual(plan({max:8,center:1,tail:0}).rows.filter(r=>r.delta).map(r=>[r.id,r.delta>0?r.increasePosition:r.decreasePosition]),[[8,'start'],[16,'start'],[25,'end'],[33,'end']]);
});
test('独立减针方式和首次位置生效，单独减针不依赖加针段',()=>{
  for(const mode of ['full','decrease'])for(const interval of [2,3])for(const decFirst of ['start','end'])for(const decLayout of ['single','alternating']){
    const events=plan({mode,max:10,interval,center:1,decLayout,decFirst,incLayout:'alternating',tail:0}).rows.filter(r=>r.delta<0),anchor=fabricEdge(events[0]);
    assert.equal(events[0].decreasePosition,decFirst);assert.deepEqual(events.map(fabricEdge),events.map((_,i)=>anchor^(decLayout==='alternating'?i%2:0)));
  }
  assert.equal(plan({mode:'decrease',decLayout:'follow'}).params.decLayout,'single');
});
test('旧存档迁移保留全部327行对应关系和稀疏勾选',()=>{
  const completed=[1,3,8,136,160,168,320,327],restored=p.restore({version:1,params:legacy,completed}),table=restored.plan;
  assert.equal(table.total,327);assert.deepEqual(restored.progress.completed,completed);assert.equal(table.params.rules,3);assert.equal(table.params.incMethod,'stitch');assert.equal(table.params.finish,'none');
  assert.deepEqual(table.rows.filter(r=>r.delta>0).map(r=>r.id),Array.from({length:20},(_,i)=>(i+1)*8));
  assert.deepEqual(table.rows.filter(r=>r.delta<0).map(r=>r.id),Array.from({length:20},(_,i)=>168+i*8));
  for(const row of table.rows){const before=row.id<=160?6+Math.floor((row.id-1)/8):row.id<=320?26-Math.floor((row.id-161)/8):6;assert.equal(row.before,before,'旧第 '+row.id+' 行');assert.equal(row.stitches,before+row.delta);}
  assert.deepEqual(texts(table.rows[7]),['2 下针','第 3 针 +1','3 滑针']);assert.deepEqual(texts(table.rows[135]),['3 下针','第 4 针 +1','15 下针','3 滑针']);
  assert.deepEqual(texts(table.rows[319]),['2 下针','行首减针','3 滑针']);assert.equal(table.rows.at(-1).phase,'末尾平织');
});
test('旧空位置与奇数间隔存档兼容，未知规则版本拒绝恢复',()=>{
  const old=Object.assign({},legacy,{incLead:null,decLead:'',interval:3,firstInc:4,firstDec:5,center:1,tail:0,max:10});
  const restored=p.restore({version:1,params:old,completed:[1,3,13,28]});assert.equal(restored.plan.total,28);assert.deepEqual(restored.progress.completed,[1,3,13,28]);
  assert.equal(restored.plan.params.firstIncLead,2);assert.equal(restored.plan.params.lastDecLead,2);
  assert.throws(()=>p.restore({version:1,params:Object.assign({},legacy,{rules:99}),completed:[]}),/版本/);
  assert.throws(()=>p.restore({version:2}),/无法读取/);assert.throws(()=>p.restore({version:1,params:null,completed:[]}),/参数/);
});
test('4000行包含收针的上限严格生效',()=>{
  const options={max:56,start:6,end:6,interval:40,firstInc:40,firstDec:40,center:0,tail:0,finish:'none'};
  assert.equal(plan(options).total,4000);assert.throws(()=>plan(Object.assign({},options,{finish:'bindoff'})),/4000 行/);
  assert.throws(()=>plan(Object.assign({},options,{tail:1})),/4000 行/);assert.equal(plan(Object.assign({},options,{firstInc:39,finish:'bindoff'})).total,4000);
});
test('单行勾选、撤回、漏行、去重和收针前后的完成状态',()=>{
  const table=plan({max:7,tail:0,finish:'bindoff'});let state=p.toggle(table,[],3);assert.equal(state.current,1);assert.equal(state.gaps,true);
  state=p.toggle(table,state.completed,1);state=p.toggle(table,state.completed,2);assert.equal(state.current,4);assert.equal(state.gaps,false);
  state=p.toggle(table,state.completed,2);assert.deepEqual(state.completed,[1,3]);assert.equal(state.current,2);
  state=p.progress(table,table.rows.slice(0,-1).map(r=>r.id).concat([1,999,-1,'2']));assert.equal(state.current,table.total);
  state=p.toggle(table,state.completed,table.total);assert.equal(state.current,null);assert.equal(state.percent,100);state=p.toggle(table,state.completed,table.total);assert.equal(state.current,table.total);
});
test('无效参数在生成前拦截',()=>{
  for(const options of [{start:''},{interval:0},{max:6},{max:6.5},{resume:500},{gaugeRows:0},{incMethod:'unknown'},{incSlant:'unknown'},{incSlant:null},{incSlant:undefined},{decLayout:'both'},{decFirst:'bad'},{finish:'bad'},{firstIncLead:''},{lastDecLead:null},{incLayout:'both'},{incFirst:'bad'}])assert.throws(()=>plan(options));
  for(const key of ['center','slip','firstIncLead'])for(const value of [false,true,' '])assert.throws(()=>plan({[key]:value}));
});

test('旧规则2无marker恢复为0且不改变327行，生成草稿统一输出规则3',()=>{
  const old=Object.assign({},plan().params,{rules:2});delete old.turnAfterRow;
  const completed=[1,3,136,160,168,320,327];const restored=p.restore({version:1,params:old,completed});
  assert.equal(restored.plan.total,327);assert.equal(restored.plan.params.rules,3);assert.equal(restored.plan.params.turnAfterRow,0);
  assert.deepEqual(restored.progress.completed,completed);
  assert.deepEqual(restored.plan.rows,plan().rows);
  assert.equal(plan({rules:2}).params.rules,3);assert.equal(plan({rules:3}).params.turnAfterRow,0);
});

test('首加前2下针、后续前3下针，KFB与M1的真实原针位置与数量不同',()=>{
  const options={max:9,firstInc:6,interval:6,firstIncLead:2,incLead:3,mode:'increase',tail:0};
  const stitch=plan(Object.assign({},options,{incMethod:'stitch'})),between=plan(Object.assign({},options,{incMethod:'between'}));
  assert.deepEqual(stitch.rows.filter(r=>r.delta).map(r=>r.id),[6,12,18]);
  assert.deepEqual(stitch.rows.map(r=>[r.id,r.before,r.stitches]),between.rows.map(r=>[r.id,r.before,r.stitches]));
  assert.deepEqual(texts(stitch.rows[5]),['2 下针','第 3 针 +1','3 滑针']);
  assert.deepEqual(texts(between.rows[5]),['2 下针','2、3 针间 +1','1 下针','3 滑针']);
  assert.deepEqual(texts(stitch.rows[11]),['3 下针','第 4 针 +1','3 滑针']);
  assert.deepEqual(texts(between.rows[11]),['3 下针','3、4 针间 +1','1 下针','3 滑针']);
  assert.equal(stitch.rows[11].segments.find(s=>s.kind==='increase').note,'行首');
  assert.equal(p.DEFAULTS.firstIncLead,2);assert.equal(p.DEFAULTS.incLead,2);
});

test('行尾加针编号从真实原针位置计算，不复用行首前导针数',()=>{
  const options={start:12,max:14,end:6,firstIncLead:2,incLead:3,incFirst:'end',mode:'increase',tail:0};
  const stitch=plan(Object.assign({},options,{incMethod:'stitch'})),between=plan(Object.assign({},options,{incMethod:'between'}));
  assert.deepEqual(texts(stitch.rows[7]),['2 下针','6 下针','第 9 针 +1','3 滑针']);
  assert.deepEqual(texts(between.rows[7]),['2 下针','7 下针','9、10 针间 +1','3 滑针']);
  assert.equal(stitch.rows[15].segments.find(s=>s.kind==='increase').text,'第 10 针 +1');
  assert.equal(between.rows[15].segments.find(s=>s.kind==='increase').text,'10、11 针间 +1');
  assert.equal(between.rows[15].segments.find(s=>s.kind==='increase').note,'行尾');
});

test('M1倾斜方向独立于布边交替，不改变行号、针数或原针守恒',()=>{
  for(const interval of [3,6])for(const incLayout of ['single','alternating'])for(const incFirst of ['start','end']){
    const options={max:10,firstInc:4,interval,firstIncLead:2,incLead:3,incMethod:'between',incLayout,incFirst};
    const left=plan(Object.assign({},options,{incSlant:'left'})),right=plan(Object.assign({},options,{incSlant:'right'}));
    assert.deepEqual(left.rows.map(r=>[r.id,r.before,r.stitches,r.delta,r.fabricEdge,r.increasePosition]),right.rows.map(r=>[r.id,r.before,r.stitches,r.delta,r.fabricEdge,r.increasePosition]));
    for(const table of [left,right])for(const row of table.rows){
      const change=row.segments.find(s=>s.kind==='increase'||s.kind==='decrease');
      const consumed=change?change.consumed:0;
      assert.equal(knitCount(row)+table.params.slip+consumed,row.before);
      assert.equal(knitCount(row)+table.params.slip+consumed+row.delta,row.stitches);
      if(row.delta>0){assert.equal(change.method,'between');assert.equal(change.slant,table.params.incSlant);assert.equal(p.sameRowOperations(row,right.rows[row.id-1]),table.params.incSlant==='right');}
      else assert.ok(p.sameRowOperations(row,right.rows[row.id-1]));
    }
  }
  const stitchLeft=plan({incSlant:'left'}),stitchRight=plan({incSlant:'right'});
  assert.ok(stitchLeft.rows.every((row,i)=>p.sameRowOperations(row,stitchRight.rows[i])));
  assert.equal(p.DEFAULTS.incSlant,'right');
});

test('M1只在两原针间生成，行首0前导和无滑针行尾的外侧横线被拦截',()=>{
  assert.throws(()=>plan({incMethod:'between',firstIncLead:0}),/两针之间/);
  assert.throws(()=>plan({incMethod:'between',incLead:0}),/两针之间/);
  assert.throws(()=>plan({incMethod:'between',incFirst:'end',slip:0}),/两针之间/);
  const start=plan({incMethod:'between',slip:0,mode:'increase',max:8,firstIncLead:2,incLead:3});
  assert.equal(start.rows[7].segments.find(s=>s.kind==='increase').text,'2、3 针间 +1');
  const end=plan({incMethod:'between',incFirst:'end',firstIncLead:0,incLead:0,mode:'increase',max:8});
  assert.equal(end.rows[7].segments.find(s=>s.kind==='increase').text,'3、4 针间 +1');
});

test('旧M1缺少方向时恢复为按原织图，不以新建右倾默认覆盖，非法值拒绝',()=>{
  const old=Object.assign({},plan({incMethod:'between',incLead:3,firstIncLead:2}).params);delete old.incSlant;
  const before=JSON.stringify(old),completed=[1,3,8,16,327],restored=p.restore({version:1,params:old,completed});
  assert.equal(restored.plan.params.incSlant,'pattern');assert.equal(JSON.stringify(old),before);
  assert.deepEqual(restored.progress.completed,completed);
  assert.ok(restored.plan.rows.filter(r=>r.delta>0).every(r=>r.segments.find(s=>s.kind==='increase').slant==='pattern'));
  const right=plan(Object.assign({},old,{incSlant:'right'}));
  assert.deepEqual(restored.plan.rows.map(r=>[r.id,r.before,r.stitches,r.delta,r.fabricEdge]),right.rows.map(r=>[r.id,r.before,r.stitches,r.delta,r.fabricEdge]));
  assert.equal(p.sameRowOperations(restored.plan.rows[7],right.rows[7]),false);
  for(const value of ['unknown',undefined,null,false])assert.throws(()=>p.restore({version:1,params:Object.assign({},old,{incSlant:value}),completed}),/挑横线方向/);
  assert.equal(p.restore({version:1,params:legacy,completed:[]}).plan.params.incSlant,'pattern');
});

test('已织行比较只看真实织法，文字与连续下针分块可变化，手法位置数量不可变',()=>{
  const original=plan({start:12,max:14,incFirst:'end',firstIncLead:2,incLead:3}).rows[7];
  const display=JSON.parse(JSON.stringify(original));display.label='加针';display.phase='显示标题';display.segments[2].text='另一种位置写法';display.segments[2].note='展示注释';
  assert.ok(p.sameRowOperations(original,display));
  const merged=JSON.parse(JSON.stringify(original));merged.segments.splice(0,2,{kind:'knit',count:8,text:'8 下针'});
  assert.ok(p.sameRowOperations(original,merged));
  const count=JSON.parse(JSON.stringify(original));count.segments[0].count++;
  assert.equal(p.sameRowOperations(original,count),false);
  const method=JSON.parse(JSON.stringify(original));method.segments[2].method='between';method.segments[2].slant='right';
  assert.equal(p.sameRowOperations(original,method),false);
  const position=JSON.parse(JSON.stringify(original));position.increasePosition='start';
  assert.equal(p.sameRowOperations(original,position),false);
  assert.equal(p.sameRowOperations(null,original),false);
});
