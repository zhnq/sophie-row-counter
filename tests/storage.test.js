const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pattern=require('../src/pattern');
function params(options){return pattern.generate(Object.assign({max:26,tail:7,finish:'none'},options)).params;}
function storage(entries,fail=false) {
  const data=Object.assign({},entries);
  const context={SophiePattern:pattern,localStorage:{getItem:k=>Object.hasOwn(data,k)?data[k]:null,setItem:(k,v)=>{if(fail)throw Error('full');data[k]=v;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/storage.js'),'utf8'),context);
  return {api:context.SophieStorage,data};
}
test('小工具读取旧浏览器进度，下次保存迁移且保留旧存档',()=>{
  const saved={version:1,params:params(),completed:[1,3,8]};
  const old=JSON.stringify(saved),s=storage({'sophie-preview-v1':old});
  assert.deepEqual(Array.from(s.api.load().completed),[1,3,8]);
  s.api.save(saved.params,[1,3,8,9]);
  assert.deepEqual(JSON.parse(s.data['sophie-minitool-v1']).completed,[1,3,8,9]);
  assert.equal(s.data['sophie-preview-v1'],old);
});
test('新存档优先，损坏或写入失败不会覆盖旧存档',()=>{
  const valid=params();
  const old=JSON.stringify({version:1,params:valid,completed:[1]});
  const newest=JSON.stringify({version:1,params:valid,completed:[1,2]});
  assert.deepEqual(Array.from(storage({'sophie-preview-v1':old,'sophie-minitool-v1':newest}).api.load().completed),[1,2]);
  const broken=storage({'sophie-preview-v1':old,'sophie-minitool-v1':'broken'});
  assert.throws(()=>broken.api.load());assert.equal(broken.data['sophie-preview-v1'],old);
  const full=storage({'sophie-preview-v1':old},true);
  assert.throws(()=>full.api.save(valid,[1,2]));assert.equal(full.data['sophie-preview-v1'],old);
});

test('拒绝缺失或损坏的计数参数，不静默用默认表覆盖进度',()=>{
  const valid=params({max:10});
  const variants=[undefined,null,[],{max:8}];
  for(const key of ['start','max','end','interval','firstInc','firstDec','tail']) {
    const missing=Object.assign({},valid);delete missing[key];variants.push(missing);
    variants.push(Object.assign({},valid,{[key]:null}));
    variants.push(Object.assign({},valid,{[key]:false}));
    variants.push(Object.assign({},valid,{[key]:' '}));
  }
  for(const params of variants) {
    const raw=JSON.stringify({version:1,params,completed:[1,3]});
    const s=storage({'sophie-minitool-v1':raw});
    assert.throws(()=>s.api.load());
    assert.equal(s.data['sophie-minitool-v1'],raw);
    assert.throws(()=>s.api.save(params,[1,3]));
    assert.equal(s.data['sophie-minitool-v1'],raw);
  }
});

test('原始计数参数完整的旧存档仍可恢复，不要求新加的显示选项',()=>{
  const oldParams={start:6,max:26,end:6,interval:8,firstInc:8,firstDec:8,tail:7};
  const saved={version:1,params:oldParams,completed:[1,3,136]};
  const s=storage({'sophie-preview-v1':JSON.stringify(saved)});
  const restored=pattern.restore(s.api.load());
  assert.equal(restored.plan.total,327);
  assert.equal(restored.plan.params.incLayout,'single');
  assert.equal(restored.plan.params.incFirst,'start');
  assert.deepEqual(restored.progress.completed,[1,3,136]);
});

test('新规则存档必须保留所有位置和针法字段，损坏时不套用默认值',()=>{
  const valid=params({incMethod:'between',incLead:3,firstIncLead:3,decLayout:'alternating',decFirst:'end',finish:'bindoff'});
  for(const key of ['mode','center','slip','incLead','decLead','firstIncLead','lastDecLead','incMethod','incLayout','incFirst','decLayout','decFirst','finish']){
    const missing=Object.assign({},valid);delete missing[key];
    const raw=JSON.stringify({version:1,params:missing,completed:[1,3,136]});const s=storage({'sophie-minitool-v1':raw});
    assert.throws(()=>s.api.load());assert.throws(()=>s.api.save(missing,[1,3,136]));assert.equal(s.data['sophie-minitool-v1'],raw);
  }
  const invalidFields=[{incMethod:'unknown'},{decLayout:'both'},{decFirst:'bad'},{finish:'bad'},{firstIncLead:null},{lastDecLead:''},{rules:99}];
  for(const key of ['center','slip','firstIncLead'])for(const value of [false,true,' '])invalidFields.push({[key]:value});
  for(const invalid of invalidFields){
    const bad=Object.assign({},valid,invalid),raw=JSON.stringify({version:1,params:bad,completed:[1,3]});const s=storage({'sophie-minitool-v1':raw});
    assert.throws(()=>s.api.load());assert.throws(()=>s.api.save(bad,[1,3]));assert.equal(s.data['sophie-minitool-v1'],raw);
  }
});

test('迁移旧字符串参数后再次保存，327行与各勾选仍对应原行',()=>{
  const legacy={start:'6',max:'26',end:'6',interval:'8',firstInc:'8',firstDec:'8',tail:'7',slip:'3'};
  const completed=[1,3,136,160,168,320,327],old=JSON.stringify({version:1,params:legacy,completed});
  const s=storage({'sophie-preview-v1':old}),restored=pattern.restore(s.api.load());
  assert.equal(restored.plan.total,327);assert.equal(restored.plan.params.firstIncLead,2);assert.equal(restored.plan.params.lastDecLead,2);
  s.api.save(restored.plan.params,restored.progress.completed);const reopened=pattern.restore(s.api.load());
  assert.equal(reopened.plan.total,327);assert.deepEqual(reopened.progress.completed,completed);assert.equal(s.data['sophie-preview-v1'],old);
  assert.deepEqual(reopened.plan.rows.map(r=>[r.id,r.delta,r.before,r.stitches]),restored.plan.rows.map(r=>[r.id,r.delta,r.before,r.stitches]));
});

test('v0.3规则存档缺少颜色或针密度仍可恢复，补默认值且保留原逐行进度',()=>{
  const valid=params({yarnColor:'blue',gaugeStitches:28.5}),completed=[1,3,136,320,327];
  const reference=pattern.generate(valid);
  for(const missing of [['yarnColor','gaugeStitches'],['yarnColor'],['gaugeStitches']]){
    const oldParams=Object.assign({},valid,{rules:2});delete oldParams.turnAfterRow;for(const key of missing)delete oldParams[key];
    const raw=JSON.stringify({version:1,params:oldParams,completed}),s=storage({'sophie-minitool-v1':raw});
    const restored=pattern.restore(s.api.load());
    assert.equal(restored.plan.total,327);assert.deepEqual(restored.progress.completed,completed);
    assert.equal(restored.plan.params.yarnColor,missing.includes('yarnColor')?'berry':'blue');
    assert.equal(restored.plan.params.gaugeStitches,missing.includes('gaugeStitches')?22:28.5);
    assert.deepEqual(restored.plan.rows,reference.rows);
    assert.equal(s.data['sophie-minitool-v1'],raw);
    s.api.save(restored.plan.params,restored.progress.completed);const reopened=pattern.restore(s.api.load());
    assert.equal(reopened.plan.params.yarnColor,restored.plan.params.yarnColor);assert.equal(reopened.plan.params.gaugeStitches,restored.plan.params.gaugeStitches);
    assert.deepEqual(reopened.progress.completed,completed);assert.equal(reopened.plan.total,327);
  }
});

test('转折结构字段缺失或非法时拒绝读写，旧规则2无转折仍兼容',()=>{
  const original=pattern.generate({max:26,tail:7}),done=Array.from({length:139},(_,i)=>i+1);
  const turned=pattern.makeTurn(original,done),valid=turned.plan.params;
  assert.equal(valid.rules,3);
  const s=storage();s.api.save(valid,turned.completed);const saved=pattern.restore(s.api.load());
  assert.deepEqual(saved.plan.rows,turned.plan.rows);assert.equal(saved.plan.rows.find(r=>r.delta<0).id,144);
  const bads=[];const missing=Object.assign({},valid);delete missing.turnAfterRow;bads.push(missing);
  for(const value of [null,false,true,'',-1,136.5,144])bads.push(Object.assign({},valid,{turnAfterRow:value}));
  for(const bad of bads){
    const raw=JSON.stringify({version:1,params:bad,completed:done}),store=storage({'sophie-minitool-v1':raw});
    assert.throws(()=>store.api.load());assert.throws(()=>store.api.save(bad,done));assert.equal(store.data['sophie-minitool-v1'],raw);
  }
  const old=Object.assign({},original.params,{rules:2});delete old.turnAfterRow;
  const oldStore=storage({'sophie-minitool-v1':JSON.stringify({version:1,params:old,completed:done})});
  const restored=pattern.restore(oldStore.api.load());assert.deepEqual(restored.plan.rows,original.rows);assert.equal(restored.plan.params.turnAfterRow,0);
});

test('颜色白名单可保存及重开，选色和针密度不改变计数表或长度计数',()=>{
  const reference=pattern.generate({max:26,tail:7,finish:'none'});
  for(const color of pattern.COLORS){
    const valid=params({yarnColor:color.key,gaugeStitches:24.5}),s=storage();s.api.save(valid,[1,3,136]);
    const saved=JSON.parse(s.data['sophie-minitool-v1']),restored=pattern.restore(s.api.load());
    assert.equal(saved.params.yarnColor,color.key);assert.equal(saved.params.gaugeStitches,24.5);
    assert.equal(restored.plan.params.yarnColor,color.key);assert.equal(restored.plan.params.gaugeStitches,24.5);
    assert.deepEqual(restored.plan.rows,reference.rows);assert.equal(restored.plan.estimatedLength,reference.estimatedLength);
    assert.deepEqual(restored.progress.completed,[1,3,136]);
  }
});

test('非法颜色与针密度的读取或保存均被拒绝，原存档不会被覆盖',()=>{
  const valid=params(),invalid=[];
  for(const yarnColor of ['red','#ffffff','berry ',null,false,{},[]])invalid.push({yarnColor});
  for(const gaugeStitches of [0,-1,100.1,Infinity,NaN,'Infinity','bad','',' ',null,false,true,{},[]])invalid.push({gaugeStitches});
  for(const change of invalid){
    const bad=Object.assign({},valid,change),raw=JSON.stringify({version:1,params:bad,completed:[1,3]}),s=storage({'sophie-minitool-v1':raw});
    assert.throws(()=>pattern.generate(bad));assert.throws(()=>s.api.load());assert.throws(()=>s.api.save(bad,[1,3]));
    assert.equal(s.data['sophie-minitool-v1'],raw);
  }
  for(const gaugeStitches of [0.1,22.5,100,'24.5']){
    const table=pattern.generate(Object.assign({},valid,{gaugeStitches}));
    assert.equal(table.params.gaugeStitches,Number(gaugeStitches));
  }
});
