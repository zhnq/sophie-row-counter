const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pattern=require('../src/pattern');
const settings=require('../src/settings');
const source=fs.readFileSync(require.resolve('../src/storage.js'),'utf8');
const counterSource=fs.readFileSync(require.resolve('../src/counter.js'),'utf8');
const KEY='sophie-scarves-v2';
const plain=value=>JSON.parse(JSON.stringify(value));
const code=expected=>error=>error.code===expected;
const params=options=>pattern.generate(Object.assign({max:26,tail:7,finish:'none'},options)).params;
const record=(id,completed=[])=>({id,params:params({name:id}),completed,revision:0,createdAt:1,updatedAt:1,lastOpenedAt:1});
const library=items=>({version:2,revision:0,items,lastOpenedId:items[0]?.id||null,deletedIds:[],migration:{completed:true,source:null}});
function environment(options={}){
  const browser=Object.assign({},options.browser);
  const state=options.state||{raw:options.raw??null,gets:0,infos:0,sets:0,launches:0,failRead:false,failWrite:false};
  const calls=[],browserCalls={reads:0,writes:0};
  const sdk={
    async getLaunchOptions(){state.launches++;if(state.beforeLaunch)await state.beforeLaunch();if(options.launchError)throw Error('launch failed');return options.launchResult;},
    async getStorage(input){
      assert.deepEqual(plain(input),{key:KEY});calls.push(['get',plain(input)]);state.gets++;
      if(state.beforeGet)await state.beforeGet(state.gets);
      if(state.failRead)throw Error('read failed');
      return state.responseOverride!==undefined?state.responseOverride:{data:state.raw===null&&options.emptyMissing?'':state.raw};
    },
    async getStorageInfo(){
      assert.equal(arguments.length,0);calls.push(['info']);state.infos=(state.infos||0)+1;
      if(state.beforeInfo)await state.beforeInfo(state.infos);
      if(state.failInfo)throw Error('storage info failed');
      return Object.hasOwn(state,'infoResponseOverride')?state.infoResponseOverride:{keys:state.raw===null?[]:[KEY]};
    },
    async setStorage(input){
      assert.deepEqual(Object.keys(input).sort(),['data','key']);assert.equal(input.key,KEY);
      assert.equal(typeof input.data,'string');assert.equal(JSON.parse(input.data).version,2);
      calls.push(['set',plain(input)]);state.sets++;
      if(state.beforeSet)await state.beforeSet();
      if(Object.hasOwn(state,'writeReject'))throw state.writeReject;
      if(state.failWrite)throw Error('write failed');state.raw=input.data;
    }
  };
  for(const key of options.missingMethods||[])delete sdk[key];
  const xhs=options.noXhs?undefined:{miniTool:sdk};
  if(xhs&&options.sync!==false)xhs.launchOptions={miniToolEnv:{buildVersion:options.version??9460000}};
  const localStorage=options.noBrowser?undefined:{
    getItem(key){browserCalls.reads++;if(options.browserUnavailable)throw Error('browser disabled');return Object.hasOwn(browser,key)?browser[key]:null;},
    setItem(key,value){browserCalls.writes++;throw Error('native must not write browser');}
  };
  const context={SophiePattern:pattern,xhs,localStorage};
  if(options.timers){context.setTimeout=options.timers.setTimeout;context.clearTimeout=options.timers.clearTimeout;}
  if(options.noPromiseFinally){
    class LegacyPromise extends Promise{}
    LegacyPromise.prototype.finally=undefined;context.Promise=LegacyPromise;
  }
  vm.runInNewContext(source,context);
  return {api:context.SophieStorage,state,sdk,browser,browserCalls,calls};
}
function timers(){
  let next=0;const pending=new Map();
  return {setTimeout(callback,delay){assert.equal(delay,15000);const id=++next;pending.set(id,callback);return id;},
    clearTimeout(id){pending.delete(id);},
    fire(){assert.equal(pending.size,1);const [id,callback]=pending.entries().next().value;pending.delete(id);callback();},
    size(){return pending.size;}};
}
async function counter(api){
  const context={window:{setTimeout,clearTimeout,SophiePattern:pattern,SophieStorage:api,SophieSettings:settings,SophieUI:{scrollToTop(){},centerRow(){}}}};
  vm.runInNewContext(counterSource,context);
  const page=context.window.SophieCounter;
  page.setData=function(patch,callback){
    for(const [key,value]of Object.entries(patch)){
      const parts=key.split('.');let target=this.data;
      for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value;
    }
    if(callback)callback();
  };
  const ready=page.onLoad();return {page,ready};
}

test('官方版本门槛忽略末三位，同步 launchOptions 优先于异步 SDK',async()=>{
  for(const [version,native]of [[9459999,false],[9460000,true],[9460999,true],[9462004,true],['9462004',true]]){
    const e=environment({version});await e.api.initialize();
    assert.equal(e.state.launches,0);assert.equal(e.state.gets>0,native);
    assert.equal(e.state.sets,native?1:0);
    if(native)assert.equal(e.api.loadLibrary().readOnly,false);
  }
});

test('同步版本缺失时只获取一次异步版本，重试不重复探测',async()=>{
  const e=environment({sync:false,launchResult:{miniToolEnv:{buildVersion:9462004}}});
  await Promise.all([e.api.initialize(),e.api.initialize()]);await e.api.initialize();
  assert.equal(e.state.launches,1);assert.equal(e.state.sets,1);assert.equal(e.api.loadLibrary().readOnly,false);
});

test('未知或旧版本、缺少公开 SDK 函数时保持原浏览器读路径',async()=>{
  const raw=JSON.stringify(library([record('browser',[1,3])]));
  const cases=[{noXhs:true},{version:9459000},{sync:false},{sync:false,launchError:true},
    {sync:false,launchResult:{miniToolEnv:{buildVersion:0}}},{sync:false,launchResult:{}},
    {version:9462004,missingMethods:['getStorage']},{version:9462004,missingMethods:['setStorage']},
    {sync:false,missingMethods:['getLaunchOptions']}];
  for(const options of cases){
    const e=environment({...options,browser:{[KEY]:raw}});await e.api.initialize();
    assert.equal(e.api.loadLibrary().items[0].id,'browser');assert.equal(e.state.gets,0);assert.equal(e.state.sets,0);
    assert.equal(e.browser[KEY],raw);
  }
});

test('原生库最多三条、独立保存稀疏进度并可重开，缓存快照不允许外部修改',async()=>{
  const e=environment({noBrowser:true});await e.api.initialize();
  for(const id of ['a','b','c'])await e.api.createScarf({id,params:params({name:id}),completed:[1,3]});
  await e.api.updateScarf('b',0,{completed:[1,3,136]});
  await assert.rejects(e.api.createScarf({id:'d',params:params(),completed:[]}),code('CAPACITY'));
  const before=plain(e.api.loadLibrary());assert.deepEqual(before.items.map(item=>item.completed),[[1,3],[1,3,136],[1,3]]);
  const altered=e.api.loadLibrary();altered.items[0].completed.push(2);assert.deepEqual(plain(e.api.loadLibrary()),before);
  const reopened=environment({state:e.state,noBrowser:true});await reopened.api.initialize();
  assert.deepEqual(plain(reopened.api.loadLibrary()),before);assert.equal(e.browserCalls.writes,0);
});

test('空 native 库迁移 browser v2 的全部作品和稀疏行号，保留浏览器原文',async()=>{
  const original=library([record('a',[1,3,136]),record('b',[2,4]),record('c',[1,327])]);
  original.revision=8;original.items[1].revision=3;original.deletedIds=['deleted-a'];
  const raw=JSON.stringify(original),old=JSON.stringify({version:1,params:params(),completed:[8]});
  const e=environment({browser:{[KEY]:raw,'sophie-minitool-v1':old}});await e.api.initialize();
  assert.deepEqual(JSON.parse(e.state.raw),original);assert.equal(e.browser[KEY],raw);
  assert.equal(e.browser['sophie-minitool-v1'],old);assert.equal(e.browserCalls.writes,0);
});

test('首次迁移写前发现其他容器已建立 native 库时采用新库，不覆盖并发记录',async()=>{
  const browserRaw=JSON.stringify(library([record('browser',[1,3])])),nativeRaw=JSON.stringify(library([record('native',[2,4])]));
  const e=environment({browser:{[KEY]:browserRaw}});
  e.state.beforeGet=count=>{if(count===2)e.state.raw=nativeRaw;};
  await e.api.initialize();assert.equal(e.api.loadLibrary().items[0].id,'native');
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[2,4]);assert.equal(e.state.sets,0);
  assert.equal(e.state.raw,nativeRaw);assert.equal(e.browser[KEY],browserRaw);assert.equal(e.browserCalls.writes,0);
});

test('空 native 库迁移旧单条转折记录，行图、颜色和勾选完整保留',async()=>{
  const original=pattern.generate({max:26,tail:7,yarnColor:'blue'}),done=Array.from({length:139},(_,i)=>i+1);
  const turned=pattern.makeTurn(original,done),completed=turned.completed.filter(id=>id!==3);
  const saved={version:1,params:turned.plan.params,completed,updatedAt:100},raw=JSON.stringify(saved);
  const older=JSON.stringify({version:1,params:params(),completed:[1]});
  const e=environment({browser:{'sophie-minitool-v1':raw,'sophie-preview-v1':older}});await e.api.initialize();
  const item=e.api.loadLibrary().items[0];
  assert.equal(item.id,'legacy-scarf-v1');assert.deepEqual(plain(item.completed),completed);
  assert.deepEqual(plain(item.params),saved.params);
  assert.deepEqual(pattern.restore({version:1,params:plain(item.params),completed:plain(item.completed)}).plan.rows,turned.plan.rows);
  assert.equal(e.browser['sophie-minitool-v1'],raw);assert.equal(e.browser['sophie-preview-v1'],older);
  assert.equal(e.browserCalls.writes,0);assert.equal(e.state.sets,1);
  await e.api.initialize();assert.equal(e.state.sets,1);
});

test('浏览器旧原文损坏时不创建空 native 库覆盖记录',async()=>{
  for(const browser of [{[KEY]:'broken'},{'sophie-minitool-v1':'broken'},{'sophie-preview-v1':'broken'}]){
    const e=environment({browser});await assert.rejects(e.api.initialize(),code('READ_ONLY'));
    assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(e.state.raw,null);assert.equal(e.state.sets,0);
    assert.deepEqual(e.browser,browser);assert.equal(e.browserCalls.writes,0);
  }
});

test('已有 native 库优先，完全不接触浏览器记录',async()=>{
  const raw=JSON.stringify(library([record('native',[1,3,136])]));
  const e=environment({raw,browser:{[KEY]:'broken'},browserUnavailable:true});await e.api.initialize();
  assert.equal(e.api.loadLibrary().items[0].id,'native');assert.equal(e.state.raw,raw);
  assert.equal(e.state.sets,0);assert.equal(e.browserCalls.reads,0);assert.equal(e.browserCalls.writes,0);
});

test('原生读失败保持只读，不静默切 browser；恢复后允许重新初始化',async()=>{
  const native=JSON.stringify(library([record('native',[1,3])])),browser=JSON.stringify(library([record('browser',[1])]));
  const e=environment({raw:native,browser:{[KEY]:browser}});e.state.failRead=true;
  await assert.rejects(e.api.initialize(),code('READ_ONLY'));assert.equal(e.api.loadLibrary().readOnly,true);
  assert.equal(e.api.loadLibrary().items.length,0);assert.equal(e.browserCalls.reads,0);assert.equal(e.state.sets,0);
  e.state.failRead=false;await e.api.initialize();assert.equal(e.api.loadLibrary().items[0].id,'native');
  e.state.failRead=true;await assert.rejects(e.api.updateScarf('native',0,{completed:[1,2,3]}),code('READ_ONLY'));
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,3]);assert.equal(e.browserCalls.reads,0);
  assert.equal(e.state.raw,native);assert.equal(e.browser[KEY],browser);
});

test('原生返回格式、JSON 或版本损坏时不当成未存档或触发迁移',async()=>{
  for(const response of [null,{}, {data:undefined},{data:0},{data:''},{data:' '},{data:'broken'},{data:JSON.stringify({version:99,items:[]})}]){
    const e=environment({browser:{[KEY]:JSON.stringify(library([record('browser')]))}});e.state.responseOverride=response;
    e.state.infoResponseOverride={keys:[KEY]};
    await assert.rejects(e.api.initialize(),code('READ_ONLY'));assert.equal(e.api.loadLibrary().readOnly,true);
    assert.equal(e.state.sets,0);assert.equal(e.browserCalls.reads,0);
  }
});

test('原生缺失键返回空字符串时先核对键清单，成功新建后保存和重开进度',async()=>{
  const e=environment({emptyMissing:true,noBrowser:true});await e.api.initialize();
  assert.equal(e.api.loadLibrary().readOnly,false);assert.equal(e.state.sets,1);
  assert.deepEqual(e.calls.slice(0,4),[['get',{key:KEY}],['info'],['get',{key:KEY}],['info']]);
  const checked=e.state.infos;await e.api.createScarf({id:'a',params:params(),completed:[1,3]});
  await e.api.updateScarf('a',0,{completed:[1,3,136]});
  assert.equal(e.state.infos,checked);assert.equal(e.browserCalls.reads,0);assert.equal(e.browserCalls.writes,0);
  const reopen=environment({state:e.state,emptyMissing:true,noBrowser:true});await reopen.api.initialize();
  assert.equal(reopen.api.loadLibrary().readOnly,false);
  assert.deepEqual(plain(reopen.api.loadLibrary().items[0].completed),[1,3,136]);
  assert.equal(e.state.infos,checked);
});

test('空字符串核对时允许其他业务键，已有空字符串键保持只读而不覆盖',async()=>{
  const fresh=environment({emptyMissing:true,noBrowser:true});fresh.state.infoResponseOverride={keys:['other-tool-key']};
  await fresh.api.initialize();assert.equal(fresh.api.loadLibrary().readOnly,false);assert.equal(fresh.state.sets,1);
  const e=environment({raw:'',browser:{[KEY]:JSON.stringify(library([record('browser',[1,3])]))}});
  await assert.rejects(e.api.initialize(),code('READ_ONLY'));
  assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(e.state.raw,'');assert.equal(e.state.infos,1);
  assert.equal(e.state.sets,0);assert.equal(e.browserCalls.reads,0);assert.equal(e.browserCalls.writes,0);
});

test('空字符串确认缺键后完整迁移旧 browser 库，原浏览器存档保持原文',async()=>{
  const original=library([record('a',[1,3,136]),record('b',[2,4])]);original.revision=7;
  const raw=JSON.stringify(original),e=environment({emptyMissing:true,browser:{[KEY]:raw}});
  await e.api.initialize();assert.deepEqual(JSON.parse(e.state.raw),original);
  assert.equal(e.api.loadLibrary().readOnly,false);assert.equal(e.state.infos,2);assert.equal(e.state.sets,1);
  assert.equal(e.browser[KEY],raw);assert.equal(e.browserCalls.writes,0);
});

test('空字符串键清单查询失败、缺失或格式异常均保持只读，不触发迁移',async()=>{
  const browserRaw=JSON.stringify(library([record('browser',[1,3])]));
  for(const info of [null,undefined,{}, {keys:null},{keys:undefined},{keys:'not-an-array'},{keys:[1]},{keys:['other',null]}]){
    const e=environment({emptyMissing:true,browser:{[KEY]:browserRaw}});e.state.infoResponseOverride=info;
    await assert.rejects(e.api.initialize(),code('READ_ONLY'));
    assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(e.state.sets,0);assert.equal(e.state.raw,null);
    assert.equal(e.browserCalls.reads,0);assert.equal(e.browserCalls.writes,0);assert.equal(e.browser[KEY],browserRaw);
  }
  for(const options of [{missingMethods:['getStorageInfo']},{}]){
    const e=environment({...options,emptyMissing:true,browser:{[KEY]:browserRaw}});
    if(!options.missingMethods)e.state.failInfo=true;
    await assert.rejects(e.api.initialize(),code('READ_ONLY'));
    assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(e.state.sets,0);assert.equal(e.state.raw,null);
    assert.equal(e.browserCalls.reads,0);assert.equal(e.browserCalls.writes,0);
  }
});

test('官方 null 空值及有效存档无需 getStorageInfo，旧接口仍可正常使用',async()=>{
  const fresh=environment({noBrowser:true,missingMethods:['getStorageInfo']});await fresh.api.initialize();
  assert.equal(fresh.state.sets,1);assert.equal(fresh.api.loadLibrary().readOnly,false);
  const raw=JSON.stringify(library([record('a',[1,3])]));
  const existing=environment({raw,missingMethods:['getStorageInfo']});await existing.api.initialize();
  assert.equal(existing.state.sets,0);assert.deepEqual(plain(existing.api.loadLibrary().items[0].completed),[1,3]);
  assert.equal(existing.api.loadLibrary().readOnly,false);
});

test('空字符串核对缺键后，迁移写前出现其他容器存档时采用新库',async()=>{
  const browserRaw=JSON.stringify(library([record('browser',[1,3])])),nativeRaw=JSON.stringify(library([record('native',[2,4])]));
  const e=environment({emptyMissing:true,browser:{[KEY]:browserRaw}});
  e.state.beforeGet=count=>{if(count===2)e.state.raw=nativeRaw;};
  await e.api.initialize();assert.equal(e.api.loadLibrary().items[0].id,'native');
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[2,4]);assert.equal(e.state.sets,0);
  assert.equal(e.state.infos,1);assert.equal(e.state.raw,nativeRaw);assert.equal(e.browser[KEY],browserRaw);
  assert.equal(e.browserCalls.writes,0);
});

test('已有缓存后键清单确认存档消失也不能重建或迁移旧 browser 进度',async()=>{
  const nativeRaw=JSON.stringify(library([record('native',[1,3])]));
  const e=environment({raw:nativeRaw,emptyMissing:true,browser:{[KEY]:JSON.stringify(library([record('browser')]))}});
  await e.api.initialize();e.state.raw=null;
  await assert.rejects(e.api.updateScarf('native',0,{completed:[1,2,3]}),code('READ_ONLY'));
  await assert.rejects(e.api.initialize(),code('READ_ONLY'));
  assert.equal(e.state.infos,2);assert.equal(e.state.sets,0);assert.equal(e.browserCalls.reads,0);
  assert.equal(e.api.loadLibrary().readOnly,true);assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,3]);
});

test('迁移写失败不会暴露可保存空库，原文保留；重试只在 SDK 写成功后完成',async()=>{
  const raw=JSON.stringify({version:1,params:params(),completed:[1,3,136]});
  const e=environment({browser:{'sophie-preview-v1':raw}});e.state.failWrite=true;
  await assert.rejects(e.api.initialize(),code('STORAGE_WRITE'));
  assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(e.state.raw,null);assert.equal(e.browser['sophie-preview-v1'],raw);
  assert.equal(e.browserCalls.writes,0);e.state.failWrite=false;await e.api.initialize();
  assert.equal(e.api.loadLibrary().readOnly,false);assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,3,136]);
});

test('原生进度写失败不伪成功、不修改缓存勾选、不回退浏览器',async()=>{
  const raw=JSON.stringify(library([record('a',[1,3])]));const e=environment({raw});await e.api.initialize();
  e.state.failWrite=true;await assert.rejects(e.api.updateScarf('a',0,{completed:[1,2,3]}),code('STORAGE_WRITE'));
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,3]);assert.equal(e.api.loadLibrary().items[0].revision,0);
  assert.equal(e.state.raw,raw);assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(e.browserCalls.writes,0);assert.equal(e.browserCalls.reads,0);
  e.state.failWrite=false;await e.api.updateScarf('a',0,{completed:[1,2,3]});
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,2,3]);assert.equal(e.api.loadLibrary().readOnly,false);
});

test('同实例 SDK 操作排队，容量在最新库中检查，陈旧修订拒绝且失败不阻塞后续',async()=>{
  const e=environment({noBrowser:true});await e.api.initialize();
  e.state.beforeSet=()=>new Promise(resolve=>setImmediate(resolve));
  const results=await Promise.allSettled(['a','b','c','d'].map(id=>e.api.createScarf({id,params:params({name:id}),completed:[]})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,3);
  assert.equal(results.filter(result=>result.reason?.code==='CAPACITY').length,1);
  assert.deepEqual(e.api.loadLibrary().items.map(item=>item.id).join(','),'a,b,c');
  const writes=e.state.sets;await e.api.createScarf({id:'a',params:params({name:'a'}),completed:[]});assert.equal(e.state.sets,writes);
  const updates=await Promise.allSettled([e.api.updateScarf('a',0,{completed:[1,3]}),e.api.updateScarf('a',0,{completed:[1,4]})]);
  assert.equal(updates[0].status,'fulfilled');assert.equal(updates[1].reason.code,'CONFLICT');
  await e.api.updateScarf('b',0,{completed:[2,4]});assert.deepEqual(plain(e.api.loadLibrary().items.map(item=>item.completed)),[[1,3],[2,4],[]]);
});

test('外部修订读取后拒绝陈旧覆盖，写前观察到库变化时拒绝提交',async()=>{
  const e=environment({raw:JSON.stringify(library([record('a')]))});await e.api.initialize();
  const external=JSON.parse(e.state.raw);external.items[0].completed=[2];external.items[0].revision=1;external.revision++;
  e.state.raw=JSON.stringify(external);
  await assert.rejects(e.api.updateScarf('a',0,{completed:[1]}),code('CONFLICT'));
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[2]);assert.equal(e.state.sets,0);
  const nextGet=e.state.gets+2;
  e.state.beforeGet=count=>{if(count===nextGet){external.items.push(record('external',[3]));external.revision++;e.state.raw=JSON.stringify(external);}};
  await assert.rejects(e.api.updateScarf('a',1,{completed:[1,2]}),code('CONFLICT'));
  assert.equal(e.state.sets,0);assert.deepEqual(JSON.parse(e.state.raw),external);
  assert.equal(e.api.loadLibrary().items.length,2);
});

test('native key 消失不能重新导入旧 browser 分叉进度',async()=>{
  const e=environment({raw:JSON.stringify(library([record('native',[1,3])])),browser:{[KEY]:JSON.stringify(library([record('browser')]))}});
  await e.api.initialize();e.state.raw=null;
  await assert.rejects(e.api.updateScarf('native',0,{completed:[1,2,3]}),code('READ_ONLY'));
  await assert.rejects(e.api.initialize(),code('READ_ONLY'));
  assert.equal(e.state.sets,0);assert.equal(e.browserCalls.reads,0);assert.equal(e.api.loadLibrary().readOnly,true);
});

test('原生新容器无需 localStorage 或 IndexedDB，也容忍浏览器存储被禁用',async()=>{
  for(const options of [{noBrowser:true},{browserUnavailable:true}]){
    const e=environment(options);await e.api.createScarf({id:'a',params:params(),completed:[1,3]});
    assert.equal(e.api.loadLibrary().items.length,1);assert.equal(e.api.loadLibrary().readOnly,false);
    assert.deepEqual(JSON.parse(e.state.raw).items[0].completed,[1,3]);assert.equal(e.browserCalls.writes,0);
  }
});

test('启动界面等待 SDK 初始化；取消设置不写业务记录；确认后才保存并重开进度',async()=>{
  const e=environment({noBrowser:true});let release;
  const gate=new Promise(resolve=>{release=resolve;});e.state.beforeGet=()=>gate;
  const {page,ready}=await counter(e.api);
  assert.equal(page.data.loading,true);page.startNew();assert.equal(page.data.home,true);assert.equal(page.data.setup,false);
  release();await ready;assert.equal(page.data.loading,false);assert.equal(page.data.readOnly,false);
  const initializedWrites=e.state.sets;page.startNew();page.changeSetting('max',26);page.generate();
  assert.equal(page.data.preview,true);page.cancelSettings();
  assert.equal(e.state.sets,initializedWrites);assert.equal(page.data.scarfCount,0);
  page.startNew();page.changeSetting('max',26);page.generate();await page.confirmPreview();assert.equal(page.data.scarfCount,1);
  await page.completeCurrent();const savedId=page.data.activeId;
  const reopen=environment({state:e.state,noBrowser:true}),opened=await counter(reopen.api);await opened.ready;
  await opened.page.activateScarf(savedId,false);assert.equal(opened.page.data.current,2);
  assert.deepEqual(plain(opened.page.completed),[1]);
});

test('计数页面仅在 SDK 写入成功后更新勾选，失败保留当前行和原进度',async()=>{
  const e=environment({raw:JSON.stringify(library([record('a',[1,3])]))});
  const {page,ready}=await counter(e.api);await ready;await page.activateScarf('a',false);
  assert.equal(page.data.current,2);const old=e.state.raw;e.state.failWrite=true;
  await page.completeCurrent();assert.equal(page.data.current,2);assert.deepEqual(plain(page.completed),[1,3]);
  assert.equal(e.state.raw,old);assert.equal(page.data.savedText,'保存失败');assert.match(page.data.error,/保存失败/);
  assert.equal(page.data.busy,false);assert.equal(e.browserCalls.writes,0);assert.equal(e.browserCalls.reads,0);
  e.state.failWrite=false;await page.completeCurrent();assert.equal(page.data.current,4);
  assert.deepEqual(plain(page.completed),[1,2,3]);assert.equal(page.data.savedText,'已保存到本机');
});

test('Chrome 61 无 Promise.finally 时 browser 和 native 初始化、重试仍可用',async()=>{
  for(const options of [{noXhs:true},{noBrowser:true}]){
    const e=environment({...options,noPromiseFinally:true});await e.api.initialize();await e.api.initialize();
    if(!options.noXhs){await e.api.createScarf({id:'a',params:params(),completed:[1,3]});assert.equal(e.api.loadLibrary().items.length,1);}
    assert.equal(e.state.launches,0);
  }
});

test('异步版本获取超时后按未知版本回到 browser，不永久卡住启动也不二次探测',async()=>{
  const clock=timers(),raw=JSON.stringify(library([record('browser',[1,3])]));let release;
  const e=environment({sync:false,launchResult:{miniToolEnv:{buildVersion:9462004}},timers:clock,browser:{[KEY]:raw}});
  e.state.beforeLaunch=()=>new Promise(resolve=>{release=resolve;});
  const loading=e.api.initialize();await new Promise(resolve=>setImmediate(resolve));clock.fire();await loading;
  assert.equal(e.api.loadLibrary().items[0].id,'browser');assert.equal(e.state.gets,0);assert.equal(e.state.launches,1);
  release();await new Promise(resolve=>setImmediate(resolve));await e.api.initialize();
  assert.equal(e.state.gets,0);assert.equal(e.state.launches,1);assert.equal(e.browser[KEY],raw);
});

test('SDK 读取超时释放 loading，原请求结束前拒绝重试且固定 native 不回退',async()=>{
  const clock=timers(),raw=JSON.stringify(library([record('a',[1,3])]));let release;
  const e=environment({raw,timers:clock,browser:{[KEY]:JSON.stringify(library([record('browser')]))}});
  e.state.beforeGet=()=>new Promise(resolve=>{release=resolve;});
  const {page,ready}=await counter(e.api);await new Promise(resolve=>setImmediate(resolve));clock.fire();await ready;
  assert.equal(page.data.loading,false);assert.equal(page.data.readOnly,true);assert.match(page.data.libraryError,/读取较慢/);
  const gets=e.state.gets;await assert.rejects(e.api.initialize(),code('SDK_PENDING'));
  assert.equal(e.state.gets,gets);assert.equal(e.browserCalls.reads,0);assert.equal(e.state.sets,0);
  e.state.beforeGet=null;release();await new Promise(resolve=>setImmediate(resolve));await page.retryLibrary();
  assert.equal(page.data.readOnly,false);assert.equal(page.data.scarves[0].id,'a');assert.equal(page.data.loading,false);
});

test('SDK 键清单查询超时释放 loading，迟到结束前不并行读取，结束后可重试建库',async()=>{
  const clock=timers(),e=environment({emptyMissing:true,noBrowser:true,timers:clock});let release;
  e.state.beforeInfo=()=>new Promise(resolve=>{release=resolve;});
  const {page,ready}=await counter(e.api);await new Promise(resolve=>setImmediate(resolve));clock.fire();await ready;
  assert.equal(page.data.loading,false);assert.equal(page.data.readOnly,true);assert.match(page.data.libraryError,/读取较慢/);
  assert.equal(e.state.sets,0);assert.equal(e.state.raw,null);
  const calls=e.calls.length;await assert.rejects(e.api.initialize(),code('SDK_PENDING'));
  assert.equal(e.calls.length,calls);assert.equal(e.state.infos,1);assert.equal(e.browserCalls.reads,0);
  e.state.beforeInfo=null;release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(e.state.sets,0);await page.retryLibrary();
  assert.equal(page.data.loading,false);assert.equal(page.data.readOnly,false);assert.equal(e.state.sets,1);
  assert.equal(e.api.loadLibrary().items.length,0);assert.equal(clock.size(),0);
  await e.api.createScarf({id:'a',params:params(),completed:[1,3]});
  assert.deepEqual(JSON.parse(e.state.raw).items[0].completed,[1,3]);assert.equal(e.browserCalls.writes,0);
});

test('SDK 写超时释放 busy 但不并行写，晚到写入结束后重读确认实际进度',async()=>{
  const clock=timers(),e=environment({raw:JSON.stringify(library([record('a',[1,3])])),timers:clock,noBrowser:true});
  const {page,ready}=await counter(e.api);await ready;await page.activateScarf('a',false);
  const before=e.state.raw;let release;e.state.beforeSet=()=>new Promise(resolve=>{release=resolve;});
  const saving=page.completeCurrent();await new Promise(resolve=>setImmediate(resolve));clock.fire();await saving;
  assert.equal(page.data.busy,false);assert.equal(page.data.current,2);assert.deepEqual(plain(page.completed),[1,3]);
  assert.equal(page.data.savedText,'保存待确认');assert.match(page.data.error,/待确认/);assert.equal(e.state.raw,before);
  assert.equal(e.api.loadLibrary().readOnly,true);const calls=e.calls.length;
  await page.completeCurrent();assert.equal(e.calls.length,calls);assert.equal(e.state.raw,before);
  e.state.beforeSet=null;release();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(e.state.raw).items[0].completed,[1,2,3]);
  assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,3]);
  page.goHome();await page.retryLibrary();assert.equal(page.data.readOnly,false);
  assert.equal(page.data.scarves[0].current,4);assert.deepEqual(plain(page.data.scarves[0].completed),[1,2,3]);
  assert.equal(e.browserCalls.writes,0);
});

test('SDK Promise 无错误对象地拒绝写入也不能伪称成功',async()=>{
  const clock=timers(),raw=JSON.stringify(library([record('a',[1,3])])),e=environment({raw,timers:clock});
  await e.api.initialize();e.state.writeReject=undefined;
  await assert.rejects(e.api.updateScarf('a',0,{completed:[1,2,3]}),code('STORAGE_WRITE'));
  assert.equal(e.state.raw,raw);assert.deepEqual(plain(e.api.loadLibrary().items[0].completed),[1,3]);
  assert.equal(e.api.loadLibrary().readOnly,true);assert.equal(clock.size(),0);
});

test('同 ID 仅完全相同参数和勾选可幂等，不同宽度、名称、颜色、resume 或进度均拒绝',async()=>{
  const e=environment({noBrowser:true}),original=params({name:'a',max:10});
  await e.api.createScarf({id:'a',params:original,completed:[1,3]});const raw=e.state.raw,writes=e.state.sets;
  const reordered=Object.fromEntries(Object.entries(original).reverse());
  await e.api.createScarf({id:'a',params:reordered,completed:[1,3]});assert.equal(e.state.sets,writes);
  for(const changes of [{max:26},{name:'changed'},{yarnColor:'blue'},{resume:1}]){
    await assert.rejects(e.api.createScarf({id:'a',params:params({...original,...changes}),completed:[1,3]}),code('CONFLICT'));
    assert.equal(e.state.raw,raw);assert.equal(e.state.sets,writes);
  }
  await assert.rejects(e.api.createScarf({id:'a',params:original,completed:[1,2,3]}),code('CONFLICT'));
  assert.equal(e.state.raw,raw);assert.equal(e.state.sets,writes);
});

test('新建写超时晚成功后更改草稿再确认必须拒绝，不能展示与存档不同的宽度',async()=>{
  const clock=timers(),e=environment({noBrowser:true,timers:clock}),{page,ready}=await counter(e.api);await ready;
  page.startNew();page.changeSetting('max',10);page.generate();const id=page.draftId;
  let release;e.state.beforeSet=()=>new Promise(resolve=>{release=resolve;});
  const saving=page.confirmPreview();await new Promise(resolve=>setImmediate(resolve));clock.fire();await saving;
  assert.equal(page.data.preview,true);assert.equal(page.data.activeId,'');assert.equal(page.data.savedText,'保存待确认');
  page.backToSettings();page.changeSetting('max',26);page.generate();assert.equal(page.previewPlan.params.max,26);
  e.state.beforeSet=null;release();await new Promise(resolve=>setImmediate(resolve));const writes=e.state.sets;
  await page.confirmPreview();assert.equal(e.state.sets,writes);assert.equal(page.data.preview,true);
  assert.equal(page.plan,null);assert.equal(page.data.activeId,'');assert.notEqual(page.data.savedText,'已保存到本机');
  assert.match(page.data.error,/返回首页重新打开/);assert.equal(JSON.parse(e.state.raw).items[0].params.max,10);
  assert.equal(JSON.parse(e.state.raw).items[0].id,id);page.goHome();assert.equal(page.data.scarfCount,1);
  await page.activateScarf(id,false);assert.equal(page.plan.params.max,10);assert.equal(page.data.total,72);
});

test('新建写超时晚成功后相同草稿重试可安全幂等，界面与保存计划一致',async()=>{
  const clock=timers(),e=environment({noBrowser:true,timers:clock}),{page,ready}=await counter(e.api);await ready;
  page.startNew();page.changeSetting('max',10);page.generate();const id=page.draftId;
  let release;e.state.beforeSet=()=>new Promise(resolve=>{release=resolve;});
  const saving=page.confirmPreview();await new Promise(resolve=>setImmediate(resolve));clock.fire();await saving;
  e.state.beforeSet=null;release();await new Promise(resolve=>setImmediate(resolve));const writes=e.state.sets;
  await page.confirmPreview();assert.equal(e.state.sets,writes);assert.equal(page.data.scarfCount,1);
  assert.equal(page.data.activeId,id);assert.equal(page.data.preview,false);assert.equal(page.data.savedText,'已保存到本机');
  const stored=JSON.parse(e.state.raw).items[0];assert.deepEqual(plain(page.plan.params),stored.params);
  assert.equal(page.plan.params.max,10);assert.equal(page.data.total,pattern.generate(stored.params).total);
});

test('页面也复核持久层回传参数和勾选，不接受不一致的已保存结果',async()=>{
  const e=environment({noBrowser:true}),{page,ready}=await counter(e.api);await ready;
  const create=e.api.createScarf;
  e.api.createScarf=async input=>{
    const result=await create(input);result.items[0].params.yarnColor='blue';return result;
  };
  page.startNew();page.changeSetting('max',10);page.generate();await page.confirmPreview();
  assert.equal(page.data.preview,true);assert.equal(page.plan,null);assert.equal(page.data.activeId,'');
  assert.equal(page.data.savedText,'保存失败');assert.match(page.data.error,/保存记录已变化/);
  assert.equal(JSON.parse(e.state.raw).items[0].params.yarnColor,'berry');
});
