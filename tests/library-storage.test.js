const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pattern=require('../src/pattern');
const source=fs.readFileSync(require.resolve('../src/storage.js'),'utf8');
const KEY='sophie-scarves-v2';
const plain=value=>JSON.parse(JSON.stringify(value));
function params(options){return pattern.generate(Object.assign({max:26,tail:7,finish:'none'},options)).params;}

// Models the relevant IndexedDB contract: readwrite transactions sharing one object-store
// scope run exclusively across independent database connections, including request callbacks.
// Open and transaction completion are separate asynchronous tasks, never a synchronous mutex stub.
function indexedDBQueue(options={}){
  let storeCreated=false, active=0;
  const queue=[],stats={connections:0,transactions:0,maxActive:0,closed:0};
  function start(){
    if(active||!queue.length)return;
    const tx=queue[0];active++;stats.maxActive=Math.max(stats.maxActive,active);
    setImmediate(()=>{
      if(tx.request&&!tx.aborted&&tx.request.onsuccess)tx.request.onsuccess();
      setImmediate(()=>{
        if(tx.aborted){if(tx.onabort)tx.onabort();}else if(tx.oncomplete)tx.oncomplete();
        queue.shift();active--;start();
      });
    });
  }
  return {stats,open(name,version){
    assert.equal(name,'sophie-scarves-storage-lock');assert.equal(version,1);
    const req={};
    setImmediate(()=>{
      if(options.failOpen){if(req.onerror)req.onerror();return;}
      stats.connections++;
      let closed=Boolean(options.closeFirstConnection&&stats.connections===1);
      req.result={objectStoreNames:{contains:n=>storeCreated&&n==='mutex'},
        createObjectStore(n){assert.equal(n,'mutex');storeCreated=true;},
        close(){closed=true;stats.closed++;},transaction(name,mode){
          assert.equal(name,'mutex');assert.equal(mode,'readwrite');
          if(closed){const error=Error('Connection closed');error.name='InvalidStateError';throw error;}
          if(options.failTransaction)throw Error('denied');
          stats.transactions++;
          const tx={aborted:false,abort(){this.aborted=true;},objectStore(name){
            assert.equal(name,'mutex');return {get(key){assert.equal(key,KEY);tx.request={result:undefined};return tx.request;}};
          }};
          queue.push(tx);setImmediate(start);return tx;
        }};
      if(!storeCreated&&req.onupgradeneeded)req.onupgradeneeded();
      if(req.onsuccess)req.onsuccess();
    });
    return req;
  }};
}
function environment(entries={},options={}){
  const data=Object.assign({},entries),idb=options.noIDB?undefined:indexedDBQueue(options);
  const state={failWrites:false,writes:0};
  function tab(){
    const context={SophiePattern:pattern,indexedDB:idb,localStorage:{
      getItem:key=>Object.hasOwn(data,key)?data[key]:null,
      setItem(key,value){if(state.failWrites)throw Error('full');state.writes++;data[key]=value;}}};
    vm.runInNewContext(source,context);
    return context.SophieStorage;
  }
  return {tab,data,state,idb};
}
function code(expected){return error=>error.code===expected;}
function record(id,options={}){return {id,params:params(options),completed:[],revision:0,createdAt:1,updatedAt:1,lastOpenedAt:1};}

test('仅在ensureLibrary提交时迁移旧参数、转折和完整行号，旧键原文保留且只迁移一次',async()=>{
  const original=pattern.generate({max:26,tail:7,yarnColor:'blue'}),done=Array.from({length:139},(_,i)=>i+1);
  const turn=pattern.makeTurn(original,done),saved={version:1,params:turn.plan.params,completed:turn.completed,updatedAt:100};
  const raw=JSON.stringify(saved),older=JSON.stringify({version:1,params:params(),completed:[3]});
  const env=environment({'sophie-minitool-v1':raw,'sophie-preview-v1':older}),api=env.tab();
  const pending=api.loadLibrary();assert.equal(pending.migrationPending,true);assert.equal(pending.readOnly,true);
  assert.equal(env.data[KEY],undefined);assert.equal(pending.items.length,1);
  const migrated=await api.ensureLibrary(),item=migrated.items[0];
  assert.equal(migrated.readOnly,false);assert.equal(item.id,'legacy-scarf-v1');
  assert.deepEqual(plain(item.params),saved.params);assert.deepEqual(plain(item.completed),saved.completed);
  assert.deepEqual(pattern.restore({version:1,params:item.params,completed:item.completed}).plan.rows,turn.plan.rows);
  assert.equal(env.data['sophie-minitool-v1'],raw);assert.equal(env.data['sophie-preview-v1'],older);
  await api.deleteScarf(item.id,item.revision);
  const writes=env.state.writes;
  const reopened=await env.tab().ensureLibrary();assert.equal(reopened.items.length,0);assert.equal(env.state.writes,writes);
  assert.equal(JSON.parse(env.data[KEY]).migration.source,'sophie-minitool-v1');
});

test('旧字符串参数与rules2缺省显示字段可迁移，保留原始逐行对应',async()=>{
  const legacy={start:'6',max:'26',end:'6',interval:'8',firstInc:'8',firstDec:'8',tail:'7',slip:'3'};
  const v2=params({yarnColor:'moss'});v2.rules=2;delete v2.turnAfterRow;delete v2.gaugeStitches;
  for(const oldParams of [legacy,v2]){
    const completed=[1,3,136,320,327],saved={version:1,params:oldParams,completed};
    const env=environment({'sophie-preview-v1':JSON.stringify(saved)}),api=env.tab();
    const library=await api.ensureLibrary(),item=library.items[0];
    assert.deepEqual(plain(item.params),oldParams);assert.deepEqual(plain(item.completed),completed);
    assert.deepEqual(pattern.restore({version:1,params:item.params,completed:item.completed}).plan.rows,pattern.restore(saved).plan.rows);
  }
});

test('三条围巾按稳定ID独立保存，更新与转折只修改目标作品',async()=>{
  const env=environment(),api=env.tab();
  await api.ensureLibrary();
  for(const [id,color,max] of [['a','berry',26],['b','blue',18],['c','moss',10]])await api.createScarf({id,params:params({name:id,yarnColor:color,max}),completed:[1,3]});
  const initial=plain(api.loadLibrary()),b=initial.items.find(i=>i.id==='b');
  const plan=pattern.restore({version:1,params:b.params,completed:b.completed}).plan;
  const done=Array.from({length:75},(_,i)=>i+1),turn=pattern.makeTurn(plan,done);
  const result=await api.updateScarf('b',b.revision,{params:turn.plan.params,completed:turn.completed});
  assert.equal(result.items.find(i=>i.id==='b').revision,1);
  assert.deepEqual(plain(result.items.filter(i=>i.id!=='b')),initial.items.filter(i=>i.id!=='b'));
  const reopened=plain(env.tab().loadLibrary());assert.deepEqual(reopened,plain(result));
  assert.deepEqual(reopened.items.map(i=>i.name),['a','b','c']);
});

test('两个标签页并发新建：事务串行最终容量检查，重复草稿ID幂等',async()=>{
  const env=environment(),a=env.tab(),b=env.tab();
  const results=await Promise.allSettled([
    a.createScarf({id:'a',params:params({name:'A'}),completed:[]}),
    b.createScarf({id:'b',params:params({name:'B'}),completed:[]}),
    a.createScarf({id:'c',params:params({name:'C'}),completed:[]}),
    b.createScarf({id:'d',params:params({name:'D'}),completed:[]})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='CAPACITY').length,1);
  const lib=a.loadLibrary();assert.equal(lib.items.length,3);assert.equal(new Set(lib.items.map(i=>i.id)).size,3);
  const writes=env.state.writes;
  const repeated=await Promise.all([a.createScarf({id:'a',params:params({name:'A'}),completed:[]}),b.createScarf({id:'a',params:params({name:'A'}),completed:[]})]);
  assert.equal(repeated[0].items.length,3);assert.equal(env.state.writes,writes);
  assert.equal(env.idb.stats.connections,2);assert.equal(env.idb.stats.maxActive,1);
});

test('两个陈旧标签页更新不同作品仍保留彼此；同一作品并发只允许一个revision成功',async()=>{
  const env=environment(),a=env.tab(),b=env.tab();
  await a.createScarf({id:'a',params:params(),completed:[]});
  await b.createScarf({id:'b',params:params({yarnColor:'blue'}),completed:[]});
  const staleA=a.loadLibrary(),staleB=b.loadLibrary();
  await Promise.all([
    a.updateScarf('a',staleA.items.find(i=>i.id==='a').revision,{completed:[1,3]}),
    b.updateScarf('b',staleB.items.find(i=>i.id==='b').revision,{completed:[2,4]})]);
  assert.deepEqual(plain(a.loadLibrary().items.map(i=>i.completed)),[[1,3],[2,4]]);
  const revision=a.loadLibrary().items[0].revision;
  const results=await Promise.allSettled([a.updateScarf('a',revision,{completed:[1,3,5]}),b.updateScarf('a',revision,{completed:[1,3,6]})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='CONFLICT').length,1);
  assert.deepEqual(plain(a.loadLibrary().items[0].completed),[1,3,5]);
  assert.deepEqual(plain(a.loadLibrary().items[1].completed),[2,4]);
});

test('最近打开更新不会覆盖其他标签页刚保存的进度或产生虚假的织行冲突',async()=>{
  const env=environment(),a=env.tab(),b=env.tab();
  const initial=await a.createScarf({id:'a',params:params(),completed:[]});
  await b.updateScarf('a',0,{completed:[1,3]});
  const touched=await a.updateScarf('a',initial.items[0].revision,{lastOpenedAt:123});
  assert.deepEqual(plain(touched.items[0].completed),[1,3]);assert.equal(touched.items[0].revision,1);
  assert.equal(touched.items[0].lastOpenedAt,123);assert.equal(touched.lastOpenedId,'a');
});

test('库及未知版本损坏禁止覆写；旧损坏保留只读占位并不被新建掩盖',async()=>{
  for(const raw of ['bad',JSON.stringify({version:99,items:[]}),JSON.stringify({version:2,revision:0,items:{}})]){
    const env=environment({[KEY]:raw}),api=env.tab();
    assert.equal(api.loadLibrary().readOnly,true);
    await assert.rejects(api.ensureLibrary(),code('READ_ONLY'));
    await assert.rejects(api.createScarf({id:'new',params:params(),completed:[]}),code('READ_ONLY'));
    assert.equal(env.data[KEY],raw);assert.equal(env.state.writes,0);
  }
  for(const raw of ['broken',JSON.stringify({version:99,params:params(),completed:[]})]){
    const env=environment({'sophie-minitool-v1':raw}),api=env.tab(),pending=api.loadLibrary();
    assert.equal(pending.readOnly,true);assert.equal(pending.items.length,1);assert.equal(pending.items[0].broken,true);
    await assert.rejects(api.createScarf({id:'new',params:params(),completed:[]}),code('READ_ONLY'));
    assert.equal(env.data['sophie-minitool-v1'],raw);assert.equal(env.data[KEY],undefined);
  }
});

test('单条损坏保留占位和名额，健康作品仍可写，删除损坏项后释放容量',async()=>{
  const damaged={id:'b',params:{name:'损坏条'},completed:[],revision:7,createdAt:1,updatedAt:1,lastOpenedAt:1};
  const raw={version:2,revision:4,items:[record('a'),damaged,null]};
  const env=environment({[KEY]:JSON.stringify(raw)}),api=env.tab(),initial=api.loadLibrary();
  assert.equal(initial.readOnly,false);assert.equal(initial.items.length,3);assert.equal(initial.items[1].name,'损坏条');
  assert.equal(initial.items[1].broken,true);assert.equal(initial.items[2].broken,true);
  const saved=await api.updateScarf('a',0,{completed:[1,3]});assert.equal(saved.items[0].broken,undefined);
  assert.deepEqual(JSON.parse(env.data[KEY]).items[1],damaged);assert.equal(JSON.parse(env.data[KEY]).items[2],null);
  await assert.rejects(api.createScarf({id:'d',params:params(),completed:[]}),code('CAPACITY'));
  await api.deleteScarf(saved.items[1].id,saved.items[1].revision);
  await api.createScarf({id:'d',params:params(),completed:[]});
  const reopened=api.loadLibrary();assert.equal(reopened.items.length,3);assert.deepEqual(plain(reopened.items[0].completed),[1,3]);
});

test('失败新建、修改、删除和迁移不覆写存档、不改变已取得的内存快照',async()=>{
  const env=environment(),api=env.tab();
  await api.createScarf({id:'a',params:params(),completed:[1,3]});
  const before=api.loadLibrary(),bytes=env.data[KEY],memory=plain(before);env.state.failWrites=true;
  await assert.rejects(api.updateScarf('a',0,{completed:[1,3,5]}),code('STORAGE_WRITE'));
  await assert.rejects(api.deleteScarf('a',0),code('STORAGE_WRITE'));
  await assert.rejects(api.createScarf({id:'b',params:params(),completed:[]}),code('STORAGE_WRITE'));
  assert.equal(env.data[KEY],bytes);assert.deepEqual(plain(before),memory);assert.deepEqual(plain(api.loadLibrary()),memory);
  const old=JSON.stringify({version:1,params:params(),completed:[2,4]}),migration=environment({'sophie-preview-v1':old});
  migration.state.failWrites=true;await assert.rejects(migration.tab().ensureLibrary(),code('STORAGE_WRITE'));
  assert.equal(migration.data[KEY],undefined);assert.equal(migration.data['sophie-preview-v1'],old);
});

test('保存草稿在等待锁前复制，异步提交不会读取调用方随后改变的表单',async()=>{
  const env=environment(),api=env.tab(),draft={id:'a',params:params({name:'原作品'}),completed:[1,3]};
  const pending=api.createScarf(draft);draft.params.name='其他作品';draft.completed.push(5);
  const saved=await pending;assert.equal(saved.items[0].name,'原作品');assert.deepEqual(plain(saved.items[0].completed),[1,3]);
});

test('被删除作品的陈旧保存拒绝重建，重复新建请求也不会复活已删除ID',async()=>{
  const env=environment(),api=env.tab(),draft={id:'a',params:params(),completed:[]};
  await api.createScarf(draft);await api.deleteScarf('a',0);
  await assert.rejects(api.updateScarf('a',0,{completed:[1]}),code('CONFLICT'));
  await assert.rejects(api.createScarf(draft),code('CONFLICT'));
  assert.equal(api.loadLibrary().items.length,0);
});

test('没有共享锁能力或IndexedDB失败时明确拒绝写入，不用localStorage假CAS',async()=>{
  for(const options of [{noIDB:true},{failOpen:true},{failTransaction:true}]){
    const env=environment({},options),api=env.tab();
    await assert.rejects(api.createScarf({id:'a',params:params(),completed:[]}),code('LOCK_UNAVAILABLE'));
    assert.equal(env.data[KEY],undefined);assert.equal(env.state.writes,0);
  }
});

test('IndexedDB缓存连接失效后，下次重试重新连接并保存',async()=>{
  const env=environment({}, {closeFirstConnection:true}),api=env.tab();
  await assert.rejects(api.ensureLibrary(),error=>error.code==='LOCK_UNAVAILABLE'&&error.message==='当前环境无法保存围巾，请重新打开。');
  assert.equal(env.state.writes,0);assert.equal(env.data[KEY],undefined);
  const recovered=await api.createScarf({id:'a',params:params(),completed:[1,3]});
  assert.equal(env.idb.stats.connections,2);assert.equal(recovered.items.length,1);
  assert.deepEqual(plain(recovered.items[0].completed),[1,3]);
});

test('缺失或非法织行数据拒绝提交，完整库结构重复ID禁止覆写',async()=>{
  const env=environment(),api=env.tab();
  for(const completed of [null,{},[0],[1.5],[99999],[false],new Array(2)]){
    await assert.rejects(api.createScarf({id:'a',params:params(),completed}),code('INVALID'));
    assert.equal(env.data[KEY],undefined);
  }
  const duplicate=JSON.stringify({version:2,revision:0,items:[record('a'),record('a')]});env.data[KEY]=duplicate;
  assert.equal(api.loadLibrary().readOnly,true);await assert.rejects(api.ensureLibrary(),code('READ_ONLY'));
  assert.equal(env.data[KEY],duplicate);
});


test('逐行完成时间与进度原子保存，刷新保留，撤销移除时间且旧记录不补造',async()=>{
  const env=environment(),s=env.tab();await s.ensureLibrary();
  let lib=await s.createScarf({id:'timed',params:params(),completed:[1,2]});
  assert.deepEqual(plain(lib.items[0].completedAt),{});
  lib=await s.updateScarf('timed',0,{completed:[1,2,3],completedAt:{3:12345}});
  assert.deepEqual(plain(env.tab().loadLibrary().items[0].completedAt),{3:12345});
  env.state.failWrites=true;
  await assert.rejects(s.updateScarf('timed',lib.items[0].revision,{completed:[1,2,3,4],completedAt:{3:12345,4:12346}}));
  assert.deepEqual(plain(env.tab().loadLibrary().items[0].completedAt),{3:12345});
  env.state.failWrites=false;
  lib=await s.updateScarf('timed',lib.items[0].revision,{completed:[1,2]});
  assert.deepEqual(plain(lib.items[0].completedAt),{});
});

test('损坏或超范围的可选时间不会破坏原有行进度，单独修改时间也要求版本一致',async()=>{
  const item=record('a');item.completed=[1,2,3];item.completedAt={1:'bad',2:-1,3:8640000000000001,4:123};
  const env=environment({'sophie-scarves-v2':JSON.stringify({version:2,revision:1,items:[item]})}),s=env.tab();
  const loaded=s.loadLibrary().items[0];assert.equal(loaded.broken,undefined);
  assert.deepEqual(plain(loaded.completed),[1,2,3]);assert.deepEqual(plain(loaded.completedAt),{});
  await assert.rejects(s.updateScarf('a',99,{completedAt:{1:100}}),code('CONFLICT'));
  const lib=await s.updateScarf('a',0,{completedAt:{1:100}});
  assert.deepEqual(plain(lib.items[0].completedAt),{1:100});
});
