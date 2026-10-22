const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pattern=require('../src/pattern');
const settings=require('../src/settings');

const clone=value=>JSON.parse(JSON.stringify(value));
const event=id=>({currentTarget:{dataset:{id}}});
function record(id,options={},completed=[]){
  const plan=pattern.generate(Object.assign({name:id,max:10,tail:7,finish:'none'},options));
  return {id,name:plan.params.name,params:plan.params,completed,revision:1,createdAt:1,updatedAt:1,lastOpenedAt:0};
}
function failure(code,message){return Object.assign(Error(message),{code});}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function page(items=[],options={}){
  let library={version:2,revision:1,items:clone(items)},nextId=0,fail=null,touchError=null,modalError=null,readError=null,writeGate=null,confirm=true;
  const writes=[],touches=[],modals=[],centers=[],celebrations=[];
  const storage={
    loadLibrary(){if(readError)throw readError;return clone(library);},
    async ensureLibrary(){if(options.loadGate)await options.loadGate.promise;return this.loadLibrary();},
    newId(){return 'new-'+(++nextId);},
    async createScarf(input){
      writes.push({kind:'create',id:input.id});if(writeGate)await writeGate.promise;if(fail)throw fail;
      if(library.items.some(item=>item.id===input.id))return clone(library);
      if(library.items.length>=3)throw failure('CAPACITY','最多保存 3 条围巾，请先删除一条。');
      library.items.push({id:input.id,name:input.params.name,params:clone(input.params),completed:Array.from(input.completed),revision:1,createdAt:Date.now(),updatedAt:Date.now(),lastOpenedAt:Date.now()});
      library.revision++;return clone(library);
    },
    async updateScarf(id,expectedRevision,patch){
      const touching=!patch.params&&!patch.completed;
      (touching ? touches : writes).push({kind:'update',id,expectedRevision});
      if(touching&&touchError)throw touchError;
      if(!touching&&writeGate)await writeGate.promise;if(fail&&!touching)throw fail;
      const index=library.items.findIndex(item=>item.id===id),item=library.items[index];
      if(!item||(!touching&&item.revision!==expectedRevision))throw failure('CONFLICT','这条围巾已在另一个页面更改，请重新打开。');
      Object.assign(item,clone(patch));if(!touching){item.revision++;item.name=item.params.name;}
      library.revision++;return clone(library);
    },
    async deleteScarf(id,expectedRevision){
      writes.push({kind:'delete',id});if(writeGate)await writeGate.promise;if(fail)throw fail;
      const index=library.items.findIndex(item=>item.id===id),item=library.items[index];
      if(!item||item.revision!==expectedRevision)throw failure('CONFLICT','这条围巾已在另一个页面更改，请重新打开。');
      library.items.splice(index,1);library.revision++;return clone(library);
    }
  };
  const context={window:{setTimeout:options.timers ? options.timers.setTimeout : setTimeout,clearTimeout:options.timers ? options.timers.clearTimeout : clearTimeout,SophiePattern:pattern,SophieSettings:settings,SophieStorage:storage,SophieUI:{
    showModal(options){if(modalError)throw modalError;modals.push(options);options.success({confirm});},
    celebrate(){celebrations.push(true);},cancelCelebration(){},centerRow(id){centers.push(id);},scrollToTop(){}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/counter.js'),'utf8'),context);
  const instance=context.window.SophieCounter;
  instance.setData=function(patch,callback){
    for(const [key,value] of Object.entries(patch)){
      const parts=key.split('.');let target=this.data;
      for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value;
    }
    if(callback)callback();
  };
  const loading=instance.onLoad();
  if(!options.loadGate)await loading;
  return {instance,loading,writes,touches,modals,centers,celebrations,library:()=>clone(library),
    fail(value){fail=value;},readError(value){readError=value;},gate(value){writeGate=value;},confirm(value){confirm=value;},
    touchError(value){touchError=value;},modalError(value){modalError=value;},
    external(change){change(library);library.revision++;}};
}
async function create(instance,options={}){
  instance.startNew();Object.assign(instance.data.draft,{max:10,tail:7},options);instance.generate();
  await instance.confirmPreview();return instance.data.activeId;
}

function input(instance,key,value){instance.onInput({currentTarget:{dataset:{key}},detail:{value:String(value)}});}

test('三条作品各自保存联动状态，取消草稿不写入，重开不会覆盖手填值',async()=>{
  const p=await page(),{instance}=p;instance.startNew();input(instance,'max',10);input(instance,'interval',6);input(instance,'firstInc',8);input(instance,'tail',6);
  instance.generate();await instance.confirmPreview();const first=instance.data.activeId;instance.goHome();
  instance.startNew();input(instance,'max',12);input(instance,'interval',10);instance.generate();await instance.confirmPreview();const second=instance.data.activeId;instance.goHome();
  const original=p.library();
  await instance.openScarfSettings(event(first));assert.equal(Number(instance.data.draft.firstInc),8);assert.equal(Number(instance.data.draft.tail),6);
  assert.equal(instance.data.guidance.auto.firstInc,false);assert.equal(instance.data.guidance.auto.tail,false);
  input(instance,'interval',8);assert.equal(Number(instance.data.draft.firstInc),8);assert.equal(Number(instance.data.draft.tail),6);
  instance.cancelSettings();assert.equal(instance.data.home,true);
  assert.deepEqual(p.library().items.find(item=>item.id===first).params,original.items.find(item=>item.id===first).params);
  await instance.openScarfSettings(event(second));assert.equal(instance.data.guidance.auto.firstInc,true);assert.equal(instance.data.guidance.auto.tail,true);
  input(instance,'interval',6);assert.equal(Number(instance.data.draft.firstInc),6);assert.equal(Number(instance.data.draft.tail),5);
  instance.generate();await instance.confirmPreview();instance.goHome();
  await instance.openScarfSettings(event(first));assert.equal(Number(instance.data.draft.firstInc),8);assert.equal(Number(instance.data.draft.tail),6);
  assert.equal(p.library().items.find(item=>item.id===second).params.firstInc,6);
});

test('启动首页按原始计划展示稀疏记录，后台回来保持当前作品与行',async()=>{
  const first=record('蓝围巾',{yarnColor:'blue'},[1,3]),second=record('燕麦围巾',{max:14,yarnColor:'oat'},[1]);
  const {instance,centers}=await page([first,second]);
  assert.equal(instance.data.home,true);assert.equal(instance.data.setup,false);assert.equal(instance.plan,undefined);
  assert.equal(instance.data.scarfCount,2);assert.equal(instance.data.scarves[0].current,2);
  assert.match(instance.data.scarves[0].progressText,/2 \/ .*接下来第 2 行/);
  assert.notEqual(instance.data.scarves[0].plan.total,instance.data.scarves[1].plan.total);
  assert.equal(instance.data.scarves[1].plan.params.yarnColor,'oat');
  await instance.openScarf(event('蓝围巾'));assert.equal(instance.data.current,2);
  instance.onShow();assert.equal(instance.data.home,false);assert.equal(instance.data.activeId,'蓝围巾');assert.equal(centers.at(-1),2);
  await instance.completeCurrent();instance.goHome();assert.equal(instance.data.scarves[0].current,4);
});

test('读取期间与保存期间不接受动作，新建确认重复点击只创建一次',async()=>{
  const loadGate=deferred(),p=await page([],{loadGate}),{instance}=p;
  assert.equal(instance.data.loading,true);instance.startNew();assert.equal(instance.data.home,true);
  loadGate.resolve();await p.loading;instance.startNew();Object.assign(instance.data.draft,{max:10,tail:7});instance.generate();
  const id=instance.draftId,candidate=instance.previewPlan,writeGate=deferred();p.gate(writeGate);
  const saving=instance.confirmPreview();assert.equal(instance.data.busy,true);await instance.confirmPreview();
  instance.cancelSettings();instance.goHome();instance.onColor({currentTarget:{dataset:{color:'blue'}}});
  instance.onMethod({detail:{value:'1'}});instance.onSlant({detail:{value:'1'}});
  assert.equal(instance.data.draft.incMethod,'stitch');assert.equal(instance.data.draft.incSlant,'right');
  assert.equal(instance.previewPlan,candidate);assert.equal(candidate.params.yarnColor,'berry');assert.equal(p.writes.length,1);
  writeGate.resolve();await saving;assert.equal(instance.data.busy,false);assert.equal(instance.data.scarfCount,1);assert.equal(instance.data.activeId,id);
});

test('三条围巾各自独立保存，取消新建不占名额，满额打开管理',async()=>{
  const p=await page(),{instance}=p;instance.startNew();const abandoned=instance.draftId;
  Object.assign(instance.data.draft,{name:'未保存',max:18,tail:0});instance.generate();instance.cancelSettings();
  assert.equal(instance.data.home,true);assert.equal(instance.data.scarfCount,0);assert.equal(p.writes.length,0);
  const one=await create(instance,{name:'第一条',yarnColor:'blue',resume:1});assert.notEqual(one,abandoned);
  await instance.completeCurrent();instance.goHome();
  const two=await create(instance,{name:'第二条',max:14,yarnColor:'oat',resume:3});instance.goHome();
  const three=await create(instance,{name:'第三条',max:8,yarnColor:'cream'});instance.goHome();
  assert.equal(instance.data.scarfCount,3);instance.startNew();assert.equal(instance.data.manageOpen,true);assert.equal(instance.data.home,true);
  await instance.openScarf(event(one));assert.equal(instance.data.current,3);assert.equal(instance.plan.params.yarnColor,'blue');
  instance.toggleSwitch();await instance.openScarf(event(two));assert.equal(instance.data.current,4);assert.equal(instance.plan.params.max,14);
  await instance.completeCurrent();instance.toggleSwitch();await instance.openScarf(event(three));assert.equal(instance.data.current,1);
  assert.equal(instance.plan.params.yarnColor,'cream');assert.deepEqual(p.library().items.find(item=>item.id===one).completed,[1,2]);
  assert.deepEqual(p.library().items.find(item=>item.id===two).completed,[1,2,3,4]);assert.deepEqual(p.library().items.find(item=>item.id===three).completed,[]);
  const restart=await page(p.library().items);assert.equal(restart.instance.data.home,true);assert.equal(restart.instance.data.scarfCount,3);
});

test('确认时容量变化会保留新建预览和草稿ID，不覆盖其他作品',async()=>{
  const p=await page([record('a'),record('b')]),{instance}=p;
  instance.startNew();Object.assign(instance.data.draft,{name:'第四条',max:10,tail:7});instance.generate();const id=instance.draftId,candidate=instance.previewPlan;
  p.external(library=>library.items.push(record('external')));await instance.confirmPreview();
  assert.equal(instance.data.preview,true);assert.equal(instance.previewPlan,candidate);assert.equal(instance.draftId,id);assert.equal(instance.data.activeId,'');
  assert.match(instance.data.error,/最多保存/);assert.equal(p.library().items.length,3);assert.equal(p.library().items.some(item=>item.id===id),false);
});

test('设置按ID保存，首页设置取消回首页，计数设置取消回原行且禁止切换',async()=>{
  const p=await page([record('a',{},[1,3]),record('b',{yarnColor:'oat'},[1])]),{instance}=p;
  await instance.openScarfSettings(event('a'));assert.equal(instance.data.setup,true);assert.equal(instance.data.home,false);
  instance.toggleSwitch();await instance.openScarf(event('b'));assert.equal(instance.data.switchOpen,false);assert.equal(instance.data.activeId,'a');
  Object.assign(instance.data.draft,{name:'改名',gaugeRows:44});instance.generate();await instance.openScarf(event('b'));
  assert.equal(instance.data.activeId,'a');await instance.confirmPreview();
  assert.equal(p.library().items[0].params.name,'改名');assert.deepEqual(p.library().items[0].completed,[1,3]);assert.equal(p.library().items[1].params.name,'b');
  instance.goHome();await instance.openScarfSettings(event('a'));instance.cancelSettings();assert.equal(instance.data.home,true);
  await instance.openScarf(event('a'));instance.openSettings();instance.cancelSettings();assert.equal(instance.data.home,false);assert.equal(instance.data.current,2);
});

test('删除显示目标名，取消和失败均保留名额，成功仅删除目标',async()=>{
  const p=await page([record('a',{name:'蓝色长围巾'},[1,3]),record('b',{name:'奶油围巾'},[1])]),{instance}=p;
  p.confirm(false);await instance.deleteScarf(event('b'));assert.match(p.modals.at(-1).title,/奶油围巾/);
  assert.equal(p.writes.length,0);assert.equal(instance.data.scarfCount,2);assert.equal(instance.data.busy,false);
  p.confirm(true);p.fail(Error('磁盘已满'));await instance.deleteScarf(event('a'));assert.match(p.modals.at(-1).title,/蓝色长围巾/);
  assert.equal(instance.data.scarfCount,2);assert.match(instance.data.error,/磁盘已满/);
  p.fail(null);await instance.deleteScarf(event('a'));assert.equal(instance.data.scarfCount,1);assert.equal(p.library().items[0].id,'b');
  assert.deepEqual(p.library().items[0].completed,[1]);assert.equal(instance.data.home,true);
});

test('确认弹窗失败不会锁住首页，最近打开顺序保存失败仍可读取原进度',async()=>{
  const p=await page([record('a',{},[1,3])]),{instance}=p;
  p.modalError(Error('dialog unavailable'));assert.equal(await instance.deleteScarf(event('a')),false);
  assert.equal(instance.data.busy,false);assert.equal(instance.data.home,true);assert.equal(instance.data.scarfCount,1);
  assert.match(instance.data.error,/确认无法打开/);assert.equal(p.writes.length,0);
  p.modalError(null);p.touchError(failure('STORAGE_WRITE','最近打开记录保存失败'));
  await instance.openScarf(event('a'));assert.equal(instance.data.home,false);assert.equal(instance.data.activeId,'a');assert.equal(instance.data.current,2);
  assert.equal(instance.data.busy,false);assert.deepEqual(Array.from(instance.completed),[1,3]);assert.match(instance.data.error,/保存失败/);
  p.fail(Error('full'));await instance.completeCurrent();assert.equal(instance.data.current,2);assert.deepEqual(p.library().items[0].completed,[1,3]);
});

test('单条损坏仍占名额，其他记录可打开，整库损坏不能创建并支持重试',async()=>{
  const broken={id:'bad',name:'损坏围巾',broken:true,error:'参数无法读取',revision:1,createdAt:2};
  const p=await page([record('a'),broken,record('b')]),{instance}=p;
  assert.equal(instance.data.scarfCount,3);assert.equal(instance.data.scarves.find(item=>item.id==='bad').plan,null);
  assert.equal(instance.data.scarves.find(item=>item.id==='bad').progressText,'记录无法读取');
  await instance.openScarf(event('bad'));assert.equal(instance.data.home,true);assert.match(instance.data.error,/参数无法读取/);
  await instance.openScarf(event('a'));assert.equal(instance.data.activeId,'a');instance.goHome();
  p.readError(Error('围巾库损坏'));await instance.retryLibrary();assert.equal(instance.data.home,true);assert.equal(instance.data.readOnly,true);
  assert.equal(instance.data.loading,false);instance.startNew();assert.equal(instance.data.home,true);assert.equal(p.writes.length,0);
  p.readError(null);await instance.retryLibrary();assert.equal(instance.data.libraryError,'');assert.equal(instance.data.readOnly,false);
});

test('外部变更的摘要刷新不偷换当前revision，同作品保存冲突保持旧计数',async()=>{
  const p=await page([record('a',{},[1]),record('b',{},[1])]),{instance}=p;await instance.openScarf(event('a'));
  const original=instance.plan;
  p.external(library=>{library.items[0].completed=[1,2,3];library.items[0].revision++;library.items[1].completed=[1,2];library.items[1].revision++;});
  instance.onLibraryChange();assert.equal(instance.data.current,2);assert.equal(instance.data.scarves.find(item=>item.id==='a').current,4);
  await instance.completeCurrent();assert.equal(instance.data.current,2);assert.equal(instance.plan,original);assert.deepEqual(Array.from(instance.completed),[1]);
  assert.match(instance.data.error,/另一个页面/);assert.deepEqual(p.library().items[0].completed,[1,2,3]);
  instance.goHome();await instance.openScarf(event('a'));assert.equal(instance.data.current,4);await instance.completeCurrent();
  assert.deepEqual(p.library().items[1].completed,[1,2]);
});

test('转折只保存目标作品，新建不会复用上条转折、颜色或勾选草稿',async()=>{
  const done=Array.from({length:16},(_,i)=>i+1).concat([25]);
  const p=await page([record('a',{max:26,yarnColor:'blue'},done),record('b',{max:14,yarnColor:'cream'},[1,3])]),{instance}=p;
  await instance.openScarf(event('a'));instance.openTurn();instance.previewTurn();const candidate=instance.previewPlan;
  await instance.openScarf(event('b'));assert.equal(instance.data.activeId,'a');assert.equal(instance.previewPlan,candidate);
  await instance.confirmPreview();assert.equal(p.library().items[0].params.turnAfterRow,16);assert.deepEqual(p.library().items[0].completed,done.slice(0,16));
  assert.equal(p.library().items[1].params.turnAfterRow,0);assert.deepEqual(p.library().items[1].completed,[1,3]);
  instance.goHome();instance.startNew();assert.equal(instance.plan,null);assert.equal(instance.turnCandidate,null);assert.equal(instance.previewPlan,null);
  assert.equal(instance.data.draft.yarnColor,'berry');assert.equal(instance.data.draft.turnAfterRow,0);assert.deepEqual(Array.from(instance.completed),[]);
});

test('完成仅加针和仅减针时，首页与计数页明确阶段完成',async()=>{
  for(const [mode,label] of [['increase','加针段已完成'],['decrease','减针段已完成'],['full','围巾织好了']]){
    const item=record('a',{mode,max:8});item.completed=Array.from({length:pattern.restore({version:1,params:item.params,completed:[]}).plan.total},(_,i)=>i+1);
    const {instance}=await page([item]);assert.match(instance.data.scarves[0].progressText,new RegExp(label));
    await instance.openScarf(event('a'));assert.equal(instance.data.current,null);assert.equal(instance.data.completionText,label);
  }
});

test('多作品独立恢复加针手法、方向及首个后续位置，修改一条不影响另一条',async()=>{
  const kfb=record('KFB',{incMethod:'stitch',firstIncLead:2,incLead:3},[1,3]),m1=record('M1',{incMethod:'between',incSlant:'left',firstIncLead:1,incLead:3},[1,8]);
  const p=await page([kfb,m1]),{instance}=p;await instance.openScarfSettings(event('KFB'));
  assert.equal(instance.data.methodIndex,0);assert.equal(instance.data.draft.firstIncLead,2);assert.equal(instance.data.draft.incLead,3);
  instance.onMethod({detail:{value:'1'}});instance.onSlant({detail:{value:'2'}});instance.generate();await instance.confirmPreview();
  assert.equal(p.library().items[0].params.incMethod,'between');assert.equal(p.library().items[0].params.incSlant,'right');assert.deepEqual(p.library().items[0].completed,[1,3]);
  assert.equal(p.library().items[1].params.incSlant,'left');assert.deepEqual(p.library().items[1].completed,[1,8]);
  instance.goHome();await instance.openScarfSettings(event('M1'));assert.equal(instance.data.methodIndex,1);assert.equal(instance.data.slantIndex,1);
  assert.equal(instance.data.draft.firstIncLead,1);assert.equal(instance.data.draft.incLead,3);instance.onSlant({detail:{value:'2'}});instance.generate();
  assert.equal(instance.data.preview,false);assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');assert.equal(p.library().items[1].params.incSlant,'left');
});

test('完成提示只在保存成功后出现，提示期间按钮和行点击不重复计数',async()=>{
  const p=await page([record('a')]);await p.instance.openScarf(event('a'));
  const gate=deferred();p.gate(gate);
  const saving=p.instance.completeCurrent();
  assert.equal(p.instance.data.busy,true);
  assert.equal(p.instance.data.recordedRow,0);
  await p.instance.completeCurrent();assert.equal(p.writes.length,1);
  gate.resolve();await saving;
  assert.equal(p.instance.data.recordedRow,1);
  assert.equal(p.instance.data.current,2);
  await p.instance.completeCurrent();await p.instance.toggleRow(2);
  assert.equal(p.writes.length,1);assert.equal(p.instance.data.current,2);
  p.instance.clearRecorded();
});

test('确认提示期间可立即撤回，计数完成后也可撤回',async()=>{
  const item=record('a');const table=pattern.generate(item.params);
  item.completed=Array.from({length:table.total-1},(_,i)=>i+1);
  const p=await page([item]);await p.instance.openScarf(event('a'));
  await p.instance.completeCurrent();
  assert.equal(p.instance.data.current,null);assert.equal(p.instance.data.recordedRow,table.total);
  await p.instance.undo();
  assert.equal(p.instance.data.current,table.total);assert.equal(p.instance.data.recordedRow,0);
});

test('600毫秒确认结束后恢复计数，切换围巾清除旧提示',async()=>{
  const p=await page([record('a'),record('b')]);await p.instance.openScarf(event('a'));
  await p.instance.completeCurrent();
  assert.equal(p.instance.data.recordedRow,1);
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.equal(p.instance.data.recordedRow,0);
  await p.instance.completeCurrent();assert.equal(p.instance.data.current,3);
  await p.instance.openScarf(event('b'));assert.equal(p.instance.data.recordedRow,0);
  assert.equal(p.instance.data.current,1);
  await p.instance.completeCurrent();assert.equal(p.instance.data.recordedRow,1);
  p.instance.goHome();assert.equal(p.instance.data.recordedRow,0);
});

test('保存失败不出现已记录提示，重试仍记录同一行',async()=>{
  const p=await page([record('a')]);await p.instance.openScarf(event('a'));
  p.fail(Error('存储失败'));await p.instance.completeCurrent();
  assert.equal(p.instance.data.recordedRow,0);assert.equal(p.instance.data.current,1);
  p.fail(null);await p.instance.completeCurrent();
  assert.equal(p.instance.data.recordedRow,1);assert.equal(p.instance.data.current,2);
  p.instance.clearRecorded();
});

function feedbackClock(){
  let serial=0;const pending=new Map();
  return {setTimeout(callback,ms){const id=++serial;pending.set(id,{callback,ms});return id;},
    clearTimeout(id){pending.delete(id);},
    step(ms){const entry=Array.from(pending.entries()).find(([,timer])=>timer.ms===ms);assert.ok(entry,'missing '+ms+' ms timer');pending.delete(entry[0]);entry[1].callback();},
    size(){return pending.size;}};
}

test('行内确认先停留350毫秒，再移到下一行250毫秒，全程防重复记录',async()=>{
  const timers=feedbackClock(),p=await page([record('a')],{timers});
  await p.instance.openScarf(event('a'));await p.instance.completeCurrent();
  assert.equal(p.instance.data.recordedStage,'hold');assert.equal(p.centers.at(-1),1);
  assert.equal(p.instance.data.current,2);assert.deepEqual(p.library().items[0].completed,[1]);
  timers.step(350);assert.equal(p.instance.data.recordedStage,'moving');assert.equal(p.centers.at(-1),2);
  await p.instance.completeCurrent();assert.equal(p.writes.length,1);
  timers.step(250);assert.equal(p.instance.data.recordedStage,'');assert.equal(p.instance.data.recordedRow,0);
  assert.equal(timers.size(),0);await p.instance.completeCurrent();assert.equal(p.instance.data.current,3);
  p.instance.clearRecorded();
});

test('移动期间撤回或离开会清理后续定时器，不再跳到旧的下一行',async()=>{
  const timers=feedbackClock(),p=await page([record('a')],{timers});
  await p.instance.openScarf(event('a'));await p.instance.completeCurrent();timers.step(350);
  await p.instance.undo();assert.equal(timers.size(),0);
  assert.equal(p.instance.data.current,1);assert.equal(p.centers.at(-1),1);
  await p.instance.completeCurrent();p.instance.goHome();
  assert.equal(timers.size(),0);assert.equal(p.instance.data.recordedStage,'');
});


test('全部保存完成后庆祝一次，首页徽章跟随撤销，重开和短时间重勾不重复播放',async()=>{
  const item=record('完工'),total=pattern.generate(item.params).total;
  item.completed=Array.from({length:total-1},(_,i)=>i+1);
  const timers=feedbackClock(),p=await page([item],{timers}),a=p.instance;
  await a.openScarf(event(item.id));await a.completeCurrent();
  assert.equal(p.celebrations.length,0);assert.equal(a.data.scarves[0].status,'complete');
  assert.equal(a.data.scarves[0].completionBadge,'已织完');
  timers.step(350);timers.step(250);assert.equal(p.celebrations.length,1);
  a.goHome();await a.openScarf(event(item.id));assert.equal(p.celebrations.length,1);
  await a.undo();assert.equal(a.data.scarves[0].status,'active');
  await a.completeCurrent();timers.step(350);timers.step(250);assert.equal(p.celebrations.length,1);
});

test('点最后一行但有漏行不庆祝，补齐才庆祝；保存失败不会完成',async()=>{
  const item=record('漏行'),total=pattern.generate(item.params).total;
  item.completed=Array.from({length:total-2},(_,i)=>i+2);
  const timers=feedbackClock(),p=await page([item],{timers}),a=p.instance;
  await a.openScarf(event(item.id));await a.toggleRow(total);
  assert.equal(a.data.current,1);assert.equal(p.celebrations.length,0);
  assert.equal(a.data.scarves[0].status,'active');
  p.fail(Error('保存失败'));await a.completeCurrent();
  assert.equal(a.data.current,1);assert.equal(timers.size(),0);
  p.fail(null);await a.completeCurrent();timers.step(350);timers.step(250);
  assert.equal(p.celebrations.length,1);assert.equal(a.data.current,null);
});

test('完成反馈期间离开或撤销会取消礼花，分段徽章不写整条已织完',async()=>{
  for(const mode of ['increase','decrease']){
    const item=record(mode,{mode}),total=pattern.generate(item.params).total;
    item.completed=Array.from({length:total-1},(_,i)=>i+1);
    const timers=feedbackClock(),p=await page([item],{timers}),a=p.instance;
    await a.openScarf(event(item.id));await a.completeCurrent();
    assert.equal(a.data.scarves[0].completionBadge,mode==='increase'?'加针段完成':'减针段完成');
    if(mode==='increase')a.goHome();else await a.undo();
    assert.equal(timers.size(),0);assert.equal(p.celebrations.length,0);
  }
});


test('记录时间只在保存成功后更新，撤销回到上一条，重开和切换作品分别恢复',async()=>{
  const a=record('a',{},[1]),b=record('b',{},[1,2]);
  a.completedAt={1:1000};b.completedAt={2:2000};
  const p=await page([a,b]),i=p.instance;
  await i.openScarf(event('a'));
  assert.deepEqual(clone(i.data.lastRecord),{row:1,at:1000});
  p.fail(Error('full'));await i.completeCurrent();
  assert.deepEqual(clone(i.data.lastRecord),{row:1,at:1000});
  assert.deepEqual(p.library().items[0].completedAt,{1:1000});
  p.fail(null);const started=Date.now();await i.completeCurrent();
  assert.equal(i.data.lastRecord.row,2);assert.ok(i.data.lastRecord.at>=started);
  const saved=clone(i.data.lastRecord);
  await i.activateScarf('b');assert.deepEqual(clone(i.data.lastRecord),{row:2,at:2000});
  await i.activateScarf('a');assert.deepEqual(clone(i.data.lastRecord),saved);
  const reopened=(await page(p.library().items)).instance;await reopened.openScarf(event('a'));
  assert.deepEqual(clone(reopened.data.lastRecord),saved);
  await reopened.undo();assert.deepEqual(clone(reopened.data.lastRecord),{row:1,at:1000});
  i.clearRecorded();reopened.clearRecorded();
});

test('旧存档和续织行不补造时间，跳行勾选取最新操作且取消后恢复上一条',async()=>{
  const p=await page([record('old',{},[1,2,3])]),i=p.instance;
  await i.openScarf(event('old'));assert.equal(i.data.lastRecord,null);
  await i.toggleRow(10);assert.equal(i.data.lastRecord.row,10);
  const saved=clone(i.data.lastRecord);
  i.openSettings();input(i,'name','改名');i.generate();await i.confirmPreview();
  assert.deepEqual(clone(i.data.lastRecord),saved);
  await i.toggleRow(10);assert.equal(i.data.lastRecord,null);
  i.goHome();await create(i,{resume:5});assert.equal(i.data.lastRecord,null);
  assert.deepEqual(clone(i.completedAt),{});i.clearRecorded();
});

test('保存待确认时保持旧时间，确认落盘后才更新提示',async()=>{
  const item=record('a',{},[1]);item.completedAt={1:1000};
  const p=await page([item]),i=p.instance;await i.openScarf(event('a'));
  const gate=deferred();p.gate(gate);const pending=i.completeCurrent();
  assert.equal(i.data.busy,true);assert.deepEqual(clone(i.data.lastRecord),{row:1,at:1000});
  gate.resolve();await pending;assert.equal(i.data.lastRecord.row,2);i.clearRecorded();
});
