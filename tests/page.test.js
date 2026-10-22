const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pattern=require('../src/pattern');
const settings=require('../src/settings');
function plan(options){return pattern.generate(Object.assign({max:26,tail:7,finish:'none'},options));}
async function page(saved,failSave=false){
  let instance, stored=saved, modals=[], saves=[];
  let library={version:2,revision:1,items:saved ? [{id:'test-scarf',name:saved.params.name,params:saved.params,completed:saved.completed,completedAt:saved.completedAt || {},revision:1,createdAt:1,updatedAt:1,lastOpenedAt:0}] : []};
  const storage={loadLibrary:()=>library,ensureLibrary:async()=>library,newId:()=> 'test-scarf',
    createScarf:async({id,params,completed,completedAt})=>write(id,params,completed,completedAt),
    updateScarf:async(id,revision,patch)=>{
      if(!patch.params&&!patch.completed)return library;
      return write(id,patch.params,patch.completed,patch.completedAt);
    }};
  function write(id,params,completed,completedAt){
    saves.push({params:JSON.parse(JSON.stringify(params)),completed:Array.from(completed)});
    if(failSave)throw Error('full');
    stored={version:1,params:JSON.parse(JSON.stringify(params)),completed:Array.from(completed),completedAt:JSON.parse(JSON.stringify(completedAt || {}))};
    const previous=library.items.find(item=>item.id===id);
    const item={id,name:params.name,params:stored.params,completed:stored.completed,completedAt:stored.completedAt,revision:previous ? previous.revision+1 : 1,createdAt:1,updatedAt:2,lastOpenedAt:1};
    library={version:2,revision:library.revision+1,items:previous ? library.items.map(old=>old.id===id ? item : old) : library.items.concat(item)};
    return library;
  }
  const context={window:{setTimeout,clearTimeout,SophiePattern:pattern,SophieSettings:settings,SophieStorage:storage,SophieUI:{
    showModal:opts=>{modals.push(opts);if(opts.success)opts.success({confirm:true});},centerRow(){},scrollToTop(){}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/counter.js'),'utf8'),context);
  instance=context.window.SophieCounter;
  instance.setData=function(patch,cb){Object.entries(patch).forEach(([k,v])=>{const keys=k.split('.');let ref=this.data;keys.slice(0,-1).forEach(key=>{ref=ref[key];});ref[keys.at(-1)]=v;});if(cb)cb();};
  await instance.onLoad();
  assert.equal(instance.data.home,true);
  // Existing knitting-flow coverage enters through the new home page.
  if(saved)await instance.openScarf({currentTarget:{dataset:{id:'test-scarf'}}});else instance.startNew();
  return {instance,stored:()=>stored,modals,saves,setSaveFailure:value=>{failSave=value;}};
}
function chooseColor(instance,color){instance.onColor({currentTarget:{dataset:{color}}});}
function rowCounts(table){return table.rows.map(r=>[r.id,r.phase,r.delta,r.before,r.stitches]);}

test('页面从第129行继续，预览确认后单行保存及重启能恢复',async()=>{
  const {instance,stored,saves}=await page();Object.assign(instance.data.draft,{max:26,tail:7,resume:128});instance.generate();
  assert.equal(instance.data.preview,true);assert.equal(stored(),undefined);assert.equal(saves.length,0);assert.equal(instance.plan,null);
  await instance.confirmPreview();assert.equal(instance.data.preview,false);assert.equal(instance.data.current,129);assert.equal(instance.data.currentRow.stitches,22);
  await instance.completeCurrent();assert.equal(instance.data.current,130);
  const restart=(await page(stored())).instance;assert.equal(restart.data.current,130);
  await restart.onRow({currentTarget:{dataset:{id:'129'}}});assert.equal(restart.data.current,129);
});

test('存储失败时保留原勾选和当前行，不显示虚假的成功',async()=>{
  const table=plan({max:8});const saved={version:1,params:table.params,completed:[1]};
  const {instance,stored}=await page(saved,true);await instance.completeCurrent();
  assert.equal(instance.data.current,2);assert.equal(instance.data.count,1);
  assert.match(instance.data.error,/未记录/);assert.equal(stored(),saved);
});

test('查看技法不更改勾选和存档',async()=>{
  const table=plan({max:8});const saved={version:1,params:table.params,completed:[1]};
  const {instance,stored,modals,saves}=await page(saved);
  instance.onTechnique({currentTarget:{dataset:{kind:'slip'}}});
  assert.equal(instance.data.current,2);assert.equal(stored(),saved);assert.equal(saves.length,0);
  assert.equal(modals[0].title,'滑针');
});

test('只调整加针位置在预览确认后保留跳行勾选，不重置进度',async()=>{
  const table=plan({max:8});const saved={version:1,params:table.params,completed:[1,3]};
  const {instance,stored,modals,saves}=await page(saved);const original=instance.plan;instance.openSettings();
  instance.onLayout({detail:{value:'1'}});instance.onPosition({detail:{value:'1'}});instance.generate();
  assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,2);assert.equal(instance.plan,original);
  assert.equal(stored(),saved);assert.equal(saves.length,0);await instance.confirmPreview();
  assert.deepEqual(stored().completed,[1,3]);
  assert.equal(stored().params.incLayout,'alternating');assert.equal(stored().params.incFirst,'end');
  assert.equal(instance.data.current,2);assert.equal(modals.length,0);
});

test('新建未填写最宽针数不预览，尾段按首次加针建议且确认前不写存档',async()=>{
  const {instance,stored,saves}=await page();instance.generate();
  assert.equal(instance.data.setup,true);assert.equal(instance.data.preview,false);assert.match(instance.data.error,/最宽针数/);assert.equal(instance.previewPlan,null);
  instance.data.draft.max=26;instance.generate();
  assert.equal(instance.data.setup,true);assert.equal(instance.data.preview,true);assert.equal(instance.previewPlan.params.tail,7);assert.equal(stored(),undefined);assert.equal(saves.length,0);
  instance.cancelSettings();assert.equal(stored(),undefined);
});

test('恢复手法选项后编辑名称与颜色保留两种旧行表及稀疏勾选',async()=>{
  for(const incMethod of ['stitch','between']){
    const lead=incMethod==='between' ? 3 : 2;
    const table=plan({incMethod,incLead:lead,firstIncLead:lead});
    const saved={version:1,params:table.params,completed:[1,3,136]};
    const {instance,stored,modals}=await page(saved);instance.openSettings();
    instance.onInput({currentTarget:{dataset:{key:'name'}},detail:{value:'改名后的围巾'}});
    chooseColor(instance,'blue');instance.generate();
    assert.equal(stored(),saved);assert.equal(instance.data.previewResets,false);await instance.confirmPreview();
    assert.deepEqual(stored().completed,[1,3,136]);assert.equal(modals.length,0);
    assert.equal(stored().params.incMethod,incMethod);assert.equal(stored().params.incLead,lead);assert.equal(stored().params.firstIncLead,lead);
    assert.equal(stored().params.name,'改名后的围巾');assert.equal(stored().params.yarnColor,'blue');
    assert.deepEqual(instance.plan.rows,table.rows);
    const restart=(await page(stored())).instance;
    assert.deepEqual(restart.plan.rows,table.rows);assert.deepEqual(Array.from(restart.completed),[1,3,136]);
  }
});

test('设置独立减针方式、首次位置并确认保存后能恢复选项',async()=>{
  const table=plan({max:10,center:1}),saved={version:1,params:table.params,completed:[1,3]};
  const {instance,stored,modals}=await page(saved);instance.openSettings();instance.onDecLayout({detail:{value:'2'}});instance.onDecPosition({detail:{value:'1'}});instance.generate();
  assert.equal(stored(),saved);await instance.confirmPreview();
  assert.equal(stored().params.decLayout,'alternating');assert.equal(stored().params.decFirst,'end');assert.deepEqual(stored().completed,[1,3]);assert.equal(modals.length,0);
  const restart=(await page(stored())).instance;restart.openSettings();assert.equal(restart.data.decLayoutIndex,2);assert.equal(restart.data.decPositionIndex,1);
  const dec=restart.plan.rows.filter(r=>r.delta<0);assert.equal(dec[0].decreasePosition,'end');
});

test('旧存档预览追加收针，确认后保留327行对应与稀疏勾选',async()=>{
  const saved={version:1,params:{start:6,max:26,end:6,interval:8,firstInc:8,firstDec:8,tail:7},completed:[1,3,136,327]};
  const {instance,stored,modals}=await page(saved);const original=rowCounts(instance.plan);
  assert.equal(instance.plan.total,327);instance.openSettings();instance.onFinish({detail:{value:'0'}});instance.generate();
  assert.equal(instance.previewPlan.total,328);assert.equal(instance.previewPlan.rows[327].phase,'收针');assert.equal(instance.plan.total,327);assert.equal(stored(),saved);
  assert.equal(instance.data.previewResets,false);await instance.confirmPreview();assert.equal(instance.plan.total,328);assert.equal(modals.length,0);
  assert.deepEqual(stored().completed,[1,3,136,327]);assert.deepEqual(rowCounts(instance.plan).slice(0,327),original);
  const allPlain={version:1,params:stored().params,completed:Array.from({length:327},(_,i)=>i+1)};const complete=(await page(allPlain)).instance;
  assert.equal(complete.data.current,328);await complete.completeCurrent();assert.equal(complete.data.current,null);assert.equal(complete.data.count,328);
  await complete.undo();assert.equal(complete.data.current,328);assert.equal(complete.data.count,327);
});

test('改变未织行计划保留稀疏勾选，返回修改或取消均保留旧表与进度',async()=>{
  const table=plan({max:8}),saved={version:1,params:table.params,completed:[1,3]};
  const {instance,stored,modals,saves}=await page(saved),original=instance.plan;instance.openSettings();instance.data.draft.max=9;chooseColor(instance,'blue');instance.generate();
  assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,2);assert.equal(instance.previewPlan.params.max,9);
  assert.equal(instance.plan,original);assert.equal(stored(),saved);assert.deepEqual(Array.from(instance.completed),[1,3]);assert.equal(saves.length,0);assert.equal(modals.length,0);
  instance.backToSettings();assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);assert.equal(instance.data.setup,true);
  assert.equal(instance.data.draft.max,9);assert.equal(instance.data.draft.yarnColor,'blue');assert.equal(stored(),saved);
  instance.cancelSettings();assert.equal(instance.data.setup,false);assert.equal(instance.plan,original);assert.equal(instance.data.current,2);assert.equal(instance.data.count,2);
  assert.equal(instance.plan.params.yarnColor,'berry');assert.deepEqual(Array.from(instance.completed),[1,3]);assert.equal(stored(),saved);assert.equal(saves.length,0);
});

test('明确修改续织行数才重建连续记录，已织操作仍保持原样',async()=>{
  const table=plan({max:8}),saved={version:1,params:table.params,completed:[1,3]};
  const {instance,stored,modals,saves}=await page(saved);instance.openSettings();Object.assign(instance.data.draft,{max:9,resume:2});instance.generate();
  assert.equal(instance.data.previewResets,true);assert.equal(stored(),saved);await instance.confirmPreview();
  assert.equal(instance.data.preview,false);assert.equal(instance.data.setup,false);assert.equal(instance.plan.params.max,9);
  assert.deepEqual(stored().completed,[1,2]);assert.equal(stored().params.max,9);assert.equal(saves.length,1);assert.equal(modals.length,0);
});

test('预览确认保存失败停在预览，保留旧表；恢复存储后可重试',async()=>{
  const table=plan({max:8}),saved={version:1,params:table.params,completed:[1,3]};
  const {instance,stored,saves,setSaveFailure}=await page(saved,true),original=instance.plan;instance.openSettings();instance.data.draft.max=9;instance.generate();const candidate=instance.previewPlan;
  chooseColor(instance,'moss');await instance.confirmPreview();
  assert.equal(instance.data.preview,true);assert.equal(instance.data.setup,true);assert.equal(instance.previewPlan,candidate);assert.equal(candidate.params.yarnColor,'moss');
  assert.equal(instance.plan,original);assert.equal(instance.plan.params.yarnColor,'berry');assert.equal(stored(),saved);assert.deepEqual(Array.from(instance.completed),[1,3]);assert.equal(instance.data.current,2);assert.match(instance.data.error,/未记录/);
  setSaveFailure(false);await instance.confirmPreview();assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);
  assert.equal(instance.plan,candidate);assert.equal(stored().params.yarnColor,'moss');assert.deepEqual(stored().completed,[1,3]);assert.equal(saves.length,2);
});

test('仅减针段从跟随转换为独立位置，确认后计数跳转不改变进度',async()=>{
  const {instance,stored}=await page();Object.assign(instance.data.draft,{max:8,tail:0});instance.onMode({detail:{value:'2'}});
  assert.equal(instance.data.draft.decLayout,'single');assert.equal(instance.data.decLayoutIndex,1);instance.generate();await instance.confirmPreview();
  const original=stored();instance.onJumpInput({detail:{value:'999'}});instance.jumpTo();assert.match(instance.data.error,/行号/);assert.equal(stored(),original);assert.equal(instance.data.count,0);
  instance.onJumpInput({detail:{value:String(instance.plan.total)}});instance.jumpTo();assert.equal(instance.data.error,'');assert.equal(stored(),original);
});

test('新建选色只改变草稿及预览；确认保存与重开均恢复颜色和针密度',async()=>{
  const {instance,stored,saves}=await page();Object.assign(instance.data.draft,{max:10,tail:0,gaugeStitches:'24.5'});chooseColor(instance,'cream');
  assert.equal(instance.data.draft.yarnColor,'cream');assert.equal(stored(),undefined);instance.generate();const counts=rowCounts(instance.previewPlan);
  assert.equal(instance.previewPlan.params.yarnColor,'cream');chooseColor(instance,'oat');
  assert.equal(instance.previewPlan.params.yarnColor,'oat');assert.equal(instance.data.draft.yarnColor,'oat');assert.deepEqual(rowCounts(instance.previewPlan),counts);
  assert.equal(stored(),undefined);assert.equal(saves.length,0);await instance.confirmPreview();
  assert.equal(stored().params.yarnColor,'oat');assert.equal(stored().params.gaugeStitches,24.5);assert.equal(saves.length,1);
  const restart=(await page(stored())).instance;assert.equal(restart.plan.params.yarnColor,'oat');assert.equal(restart.plan.params.gaugeStitches,24.5);restart.openSettings();assert.equal(restart.data.draft.yarnColor,'oat');
});

test('从预览返回修改后重新生成，只确认最新参数且未保存旧候选',async()=>{
  const {instance,stored,saves}=await page();Object.assign(instance.data.draft,{max:10,tail:7});chooseColor(instance,'blue');instance.generate();const first=instance.previewPlan;
  instance.backToSettings();assert.equal(instance.data.draft.yarnColor,'blue');assert.equal(instance.data.draft.max,10);assert.equal(instance.previewPlan,null);
  Object.assign(instance.data.draft,{max:11,tail:0,gaugeStitches:30});chooseColor(instance,'cream');instance.generate();
  assert.notEqual(instance.previewPlan,first);assert.equal(instance.previewPlan.params.max,11);assert.equal(instance.previewPlan.params.tail,0);
  assert.equal(instance.previewPlan.params.yarnColor,'cream');assert.equal(first.params.yarnColor,'blue');assert.equal(first.params.max,10);assert.equal(stored(),undefined);assert.equal(saves.length,0);
  await instance.confirmPreview();assert.equal(stored().params.max,11);assert.equal(stored().params.tail,0);assert.equal(stored().params.gaugeStitches,30);assert.equal(stored().params.yarnColor,'cream');assert.equal(saves.length,1);
});

test('兼容表预览选色和修改针密度不提前写盘，确认后保留全部稀疏记录',async()=>{
  const table=plan({max:10}),saved={version:1,params:table.params,completed:[1,3,8,25]};
  const {instance,stored,saves}=await page(saved),original=instance.plan,snapshot=JSON.stringify(saved);instance.openSettings();instance.data.draft.gaugeStitches=30;instance.generate();
  assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,4);chooseColor(instance,'charcoal');
  assert.equal(instance.plan,original);assert.equal(instance.plan.params.yarnColor,'berry');assert.equal(instance.plan.params.gaugeStitches,22);assert.equal(stored(),saved);assert.equal(JSON.stringify(saved),snapshot);assert.equal(saves.length,0);
  await instance.confirmPreview();assert.deepEqual(stored().completed,[1,3,8,25]);assert.equal(instance.data.current,2);assert.equal(instance.plan.params.yarnColor,'charcoal');assert.equal(instance.plan.params.gaugeStitches,30);assert.deepEqual(rowCounts(instance.plan),rowCounts(table));
});

test('无效颜色事件无变化；设置生成错误不进入预览或覆盖原进度',async()=>{
  const table=plan({max:10}),saved={version:1,params:table.params,completed:[1,3]};
  const {instance,stored,saves}=await page(saved),original=instance.plan;instance.openSettings();
  for(const bad of ['bad','#ffffff','__proto__',undefined])chooseColor(instance,bad);
  assert.equal(instance.data.draft.yarnColor,'berry');assert.equal(stored(),saved);instance.data.draft.gaugeStitches=0;instance.generate();
  assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);assert.match(instance.data.error,/针密度/);assert.equal(instance.plan,original);assert.equal(stored(),saved);assert.equal(saves.length,0);
  await instance.confirmPreview();assert.equal(stored(),saved);assert.deepEqual(Array.from(instance.completed),[1,3]);
});

function turnSaved(extra={}){
  const table=plan(extra), completed=Array.from({length:16},(_,i)=>i+1).concat([25,136]);
  return {version:1,params:table.params,completed};
}

test('更多菜单只打开转折草稿，按连续织完行显示最宽处和首减行',async()=>{
  const saved=turnSaved(),{instance,stored,saves}=await page(saved);
  assert.equal(instance.data.canTurn,true);assert.equal(instance.data.current,17);
  instance.toggleMenu();assert.equal(instance.data.menuOpen,true);instance.closeMenu();assert.equal(instance.data.menuOpen,false);
  instance.toggleMenu();instance.openTurn();
  assert.equal(instance.data.menuOpen,false);assert.equal(instance.data.turnSetup,true);assert.equal(instance.data.setup,false);
  assert.equal(instance.data.turnRow,16);assert.equal(instance.data.turnStitches,8);assert.equal(instance.data.turnFirstDecrease,24);
  assert.equal(instance.data.turnMinFirst,17);assert.equal(instance.data.turnMaxFirst,116);assert.equal(instance.data.turnRemoved,2);
  assert.equal(instance.data.current,17);assert.equal(stored(),saved);assert.equal(saves.length,0);
  instance.cancelTurn();assert.equal(instance.data.turnSetup,false);assert.equal(instance.data.preview,false);
  assert.equal(stored(),saved);assert.deepEqual(Array.from(instance.completed),saved.completed);assert.equal(saves.length,0);
});

test('转折预览保留已织行，清除后方勾选仅在确认后生效并可重启恢复',async()=>{
  const saved=turnSaved(),{instance,stored,saves}=await page(saved),original=instance.plan;
  instance.openTurn();instance.previewTurn();
  assert.equal(instance.data.preview,true);assert.equal(instance.data.turnPreview,true);assert.equal(instance.data.turnSetup,false);
  assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,16);assert.equal(instance.data.turnRemoved,2);
  assert.equal(instance.previewPlan.params.max,8);assert.equal(instance.previewPlan.params.turnAfterRow,16);assert.equal(instance.previewPlan.params.firstDec,8);
  assert.deepEqual(instance.previewPlan.rows.slice(0,16),original.rows.slice(0,16));
  assert.equal(instance.plan,original);assert.equal(stored(),saved);assert.deepEqual(Array.from(instance.completed),saved.completed);assert.equal(saves.length,0);
  await instance.confirmPreview();
  assert.equal(instance.data.preview,false);assert.equal(instance.data.turnPreview,false);assert.equal(instance.data.setup,false);assert.equal(instance.data.canTurn,false);
  assert.equal(instance.data.current,17);assert.equal(instance.data.count,16);assert.equal(instance.turnCandidate,null);assert.equal(saves.length,1);
  assert.deepEqual(stored().completed,Array.from({length:16},(_,i)=>i+1));assert.equal(stored().params.turnAfterRow,16);assert.equal(stored().params.max,8);
  const restart=(await page(stored())).instance;
  assert.equal(restart.data.current,17);assert.equal(restart.data.count,16);assert.equal(restart.plan.params.turnAfterRow,16);assert.equal(restart.data.canTurn,false);
  assert.deepEqual(restart.plan.rows,instance.plan.rows);
});

test('转折预览返回后保留颜色与首减行草稿，取消不改变旧存档',async()=>{
  const saved=turnSaved(),{instance,stored,saves}=await page(saved),original=instance.plan;
  instance.openTurn();instance.onTurnInput({detail:{value:'27'}});instance.previewTurn();chooseColor(instance,'blue');
  assert.equal(instance.previewPlan.params.firstDec,11);assert.equal(instance.previewPlan.params.yarnColor,'blue');
  instance.backToSettings();
  assert.equal(instance.data.turnSetup,true);assert.equal(instance.data.turnPreview,false);assert.equal(instance.data.setup,false);assert.equal(instance.data.preview,false);
  assert.equal(instance.data.turnFirstDecrease,27);assert.equal(instance.data.draft.yarnColor,'blue');assert.equal(instance.previewPlan,null);assert.equal(instance.turnCandidate,null);
  instance.onTurnInput({detail:{value:'17'}});instance.previewTurn();
  assert.equal(instance.previewPlan.params.firstDec,1);assert.equal(instance.previewPlan.params.yarnColor,'blue');assert.equal(instance.data.turnFirstDecrease,17);
  instance.backToSettings();instance.cancelTurn();
  assert.equal(instance.plan,original);assert.equal(instance.plan.params.yarnColor,'berry');assert.equal(stored(),saved);
  assert.deepEqual(Array.from(instance.completed),saved.completed);assert.equal(saves.length,0);
});

test('转折保存失败停在预览，旧表及后方勾选不丢；重试保存新计划',async()=>{
  const saved=turnSaved(),{instance,stored,saves,setSaveFailure}=await page(saved,true),original=instance.plan;
  instance.openTurn();instance.onTurnInput({detail:{value:'18'}});instance.previewTurn();const candidate=instance.previewPlan;chooseColor(instance,'moss');await instance.confirmPreview();
  assert.equal(instance.data.turnPreview,true);assert.equal(instance.data.preview,true);assert.equal(instance.previewPlan,candidate);
  assert.equal(instance.plan,original);assert.equal(instance.data.current,17);assert.deepEqual(Array.from(instance.completed),saved.completed);assert.equal(stored(),saved);assert.match(instance.data.error,/未记录/);
  setSaveFailure(false);await instance.confirmPreview();
  assert.equal(instance.data.preview,false);assert.equal(instance.data.turnPreview,false);assert.equal(instance.plan,candidate);assert.equal(instance.turnCandidate,null);
  assert.equal(stored().params.yarnColor,'moss');assert.equal(stored().params.firstDec,2);assert.equal(stored().params.turnAfterRow,16);
  assert.deepEqual(stored().completed,Array.from({length:16},(_,i)=>i+1));assert.equal(saves.length,2);
});

test('首减行非法时保留转折草稿，不预览也不保存',async()=>{
  const saved=turnSaved(),{instance,stored,saves}=await page(saved),original=instance.plan;instance.openTurn();
  for(const value of ['16','117','18.5','']){
    instance.onTurnInput({detail:{value}});instance.previewTurn();
    assert.equal(instance.data.turnSetup,true);assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);assert.equal(instance.turnCandidate,null);
    assert.ok(instance.data.error);assert.equal(instance.plan,original);assert.equal(stored(),saved);assert.equal(saves.length,0);
  }
  instance.onTurnInput({detail:{value:'24'}});instance.previewTurn();assert.equal(instance.data.error,'');assert.equal(instance.data.preview,true);assert.equal(stored(),saved);
});

test('转折入口不适用时无操作；普通设置会清除转折草稿并沿用原流程',async()=>{
  const table=plan(),early={version:1,params:table.params,completed:[1]},none=await page(early);
  assert.equal(none.instance.data.canTurn,false);none.instance.openTurn();none.instance.previewTurn();await none.instance.confirmPreview();
  assert.equal(none.instance.data.turnSetup,false);assert.equal(none.stored(),early);assert.equal(none.saves.length,0);
  const saved=turnSaved(),{instance,stored,saves}=await page(saved);instance.openTurn();instance.previewTurn();chooseColor(instance,'blue');instance.openSettings();
  assert.equal(instance.data.turnSetup,false);assert.equal(instance.data.turnPreview,false);assert.equal(instance.turnCandidate,null);assert.equal(instance.previewPlan,null);
  assert.equal(instance.data.draft.max,26);assert.equal(instance.data.draft.yarnColor,'berry');instance.generate();
  assert.equal(instance.data.turnPreview,false);assert.equal(instance.data.previewResets,false);await instance.confirmPreview();
  assert.equal(instance.plan.params.max,26);assert.deepEqual(stored().completed,saved.completed);assert.equal(saves.length,1);
});

function adjustedSaved(completed){
  const old=plan(),before=Array.from({length:16},(_,i)=>i+1),adjusted=pattern.makeTurn(old,before,24);
  return {version:1,params:adjusted.plan.params,completed:completed || before};
}

test('转折后的已织加针位置与下针块固定，直接篡改草稿也不能进入预览',async()=>{
  for(const changes of [{incLayout:'alternating'},{incFirst:'end'},{incLead:1},{firstIncLead:1}]){
    const saved=adjustedSaved(),{instance,stored,saves}=await page(saved),original=instance.plan;
    instance.openSettings();Object.assign(instance.data.draft,changes);instance.generate();
    assert.equal(instance.data.setup,true);assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);
    assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');
    await instance.confirmPreview();assert.equal(instance.plan,original);assert.equal(stored(),saved);
    assert.deepEqual(Array.from(instance.completed),saved.completed);assert.equal(saves.length,0);
  }
});

test('转折后合法调整未织平织和首减行，确认后保留全部稀疏记录',async()=>{
  for(const changes of [{center:3},{firstDec:10},{firstDec:4}]){
    const completed=Array.from({length:16},(_,i)=>i+1).concat([18,19]);
    const saved=adjustedSaved(completed),{instance,stored,saves}=await page(saved);
    instance.openSettings();Object.assign(instance.data.draft,changes);instance.generate();
    assert.equal(instance.data.preview,true);assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,18);
    assert.equal(instance.data.error,'');assert.equal(stored(),saved);assert.equal(saves.length,0);
    await instance.confirmPreview();assert.deepEqual(stored().completed,completed);assert.equal(instance.data.current,17);assert.equal(instance.data.count,18);
    Object.entries(changes).forEach(([key,value])=>assert.equal(stored().params[key],value));assert.equal(saves.length,1);
  }
});

test('转折后颜色、密度和名称可修改，已织行与勾选保持原样',async()=>{
  const saved=adjustedSaved(),{instance,stored,saves}=await page(saved),oldRows=JSON.stringify(instance.plan.rows);
  instance.openSettings();Object.assign(instance.data.draft,{name:'新的围巾名',gaugeRows:45,gaugeStitches:24});chooseColor(instance,'blue');instance.generate();
  assert.equal(instance.data.preview,true);assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,16);
  assert.equal(stored(),saved);assert.equal(saves.length,0);await instance.confirmPreview();
  assert.equal(stored().params.name,'新的围巾名');assert.equal(stored().params.yarnColor,'blue');assert.equal(stored().params.gaugeRows,45);assert.equal(stored().params.gaugeStitches,24);
  assert.deepEqual(stored().completed,saved.completed);assert.equal(JSON.stringify(instance.plan.rows),oldRows);assert.equal(saves.length,1);
});

test('已有减针勾选后不能提前或延后首减而更改已织部分',async()=>{
  for(const firstDec of [6,10]){
    const completed=Array.from({length:25},(_,i)=>i+1),saved=adjustedSaved(completed);
    const {instance,stored,saves}=await page(saved),original=instance.plan;
    instance.openSettings();instance.data.draft.firstDec=firstDec;instance.generate();
    assert.equal(instance.data.preview,false);assert.equal(instance.data.setup,true);assert.equal(instance.previewPlan,null);
    assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');assert.equal(instance.plan,original);assert.equal(instance.data.current,26);
    await instance.confirmPreview();assert.equal(stored(),saved);assert.deepEqual(Array.from(instance.completed),completed);assert.equal(saves.length,0);
  }
});

test('首个2针后续3针的KFB与M1分别生成正确下针数，保存重开保留选择',async()=>{
  for(const methodIndex of [0,1]){
    const {instance,stored}=await page();Object.assign(instance.data.draft,{max:10,tail:0,firstIncLead:2,incLead:3});
    instance.onMethod({detail:{value:String(methodIndex)}});instance.onSlant({detail:{value:'1'}});instance.generate();
    const first=instance.previewPlan.rows[7],next=instance.previewPlan.rows[15];
    assert.equal(first.stitches,7);assert.equal(next.stitches,8);
    assert.deepEqual(first.segments.filter(segment=>segment.kind==='knit').map(segment=>segment.count),methodIndex===0 ? [2] : [2,1]);
    assert.deepEqual(next.segments.filter(segment=>segment.kind==='knit').map(segment=>segment.count),methodIndex===0 ? [3] : [3,1]);
    assert.match(first.segments.find(segment=>segment.kind==='increase').text,methodIndex===0 ? /第 3 针/ : /2、3 针间/);
    assert.match(next.segments.find(segment=>segment.kind==='increase').text,methodIndex===0 ? /第 4 针/ : /3、4 针间/);
    await instance.confirmPreview();assert.equal(stored().params.firstIncLead,2);assert.equal(stored().params.incLead,3);
    assert.equal(stored().params.incMethod,methodIndex===0 ? 'stitch' : 'between');assert.equal(stored().params.incSlant,'left');
    const restart=(await page(stored())).instance;restart.openSettings();assert.equal(restart.data.methodIndex,methodIndex);assert.equal(restart.data.slantIndex,1);
    assert.deepEqual(restart.plan.rows,instance.plan.rows);
  }
});

test('旧M1的未标明方向与自定义加针位置不会因切换手法而被自动改写',async()=>{
  const table=plan({incMethod:'between',firstIncLead:1,incLead:3}),params=Object.assign({},table.params);delete params.incSlant;
  const saved={version:1,params,completed:[1,3]}, {instance,stored,saves}=await page(saved);instance.openSettings();
  assert.equal(instance.data.methodIndex,1);assert.equal(instance.data.slantIndex,0);assert.equal(instance.data.draft.incSlant,'pattern');
  for(const value of ['0','1'])instance.onMethod({detail:{value}});
  assert.equal(instance.data.draft.firstIncLead,1);assert.equal(instance.data.draft.incLead,3);assert.equal(instance.data.draft.incSlant,'pattern');
  assert.equal(stored(),saved);assert.equal(saves.length,0);instance.generate();await instance.confirmPreview();
  assert.equal(stored().params.firstIncLead,1);assert.equal(stored().params.incLead,3);assert.equal(stored().params.incSlant,'pattern');
  assert.deepEqual(stored().completed,[1,3]);
});

test('已织加针行的手法、位置和前置下针数不能更改，稀疏勾选也受保护',async()=>{
  for(const changes of [{incMethod:'between'},{firstIncLead:1},{incLead:1},{incFirst:'end'},{incLayout:'alternating'},{firstInc:6},{interval:6}]){
    const table=plan({max:10}),saved={version:1,params:table.params,completed:[1,3,8,16]};
    const {instance,stored,saves}=await page(saved),original=instance.plan;instance.openSettings();Object.assign(instance.data.draft,changes);instance.generate();
    assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');
    await instance.confirmPreview();assert.equal(instance.plan,original);assert.equal(stored(),saved);assert.equal(saves.length,0);
    assert.deepEqual(Array.from(instance.completed),saved.completed);
  }
});

test('已织M1行不能改为KFB或改变左倾右倾，也不能通过续织行数重置绕过',async()=>{
  for(const changes of [{incMethod:'stitch'},{incSlant:'left'},{incSlant:'pattern'},{firstIncLead:1,resume:0}]){
    const table=plan({max:10,incMethod:'between',incSlant:'right'}),saved={version:1,params:table.params,completed:[8]};
    const {instance,stored,saves}=await page(saved);instance.openSettings();Object.assign(instance.data.draft,changes);instance.generate();
    assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');
    assert.equal(stored(),saved);assert.equal(saves.length,0);
  }
});

test('仅完成平织行时可更改未来加针手法和行程而保留全部勾选',async()=>{
  const table=plan({max:10}),saved={version:1,params:table.params,completed:[1,3,9,17]}, {instance,stored}=await page(saved);
  instance.openSettings();instance.onMethod({detail:{value:'1'}});instance.onSlant({detail:{value:'1'}});Object.assign(instance.data.draft,{max:12,firstIncLead:2,incLead:3});instance.generate();
  assert.equal(instance.data.preview,true);assert.equal(instance.data.previewResets,false);assert.equal(instance.data.previewCompleted,4);
  await instance.confirmPreview();assert.deepEqual(stored().completed,[1,3,9,17]);assert.equal(instance.data.current,2);
  assert.equal(stored().params.incMethod,'between');assert.equal(stored().params.incSlant,'left');assert.equal(stored().params.max,12);
  const restart=(await page(stored())).instance;assert.deepEqual(Array.from(restart.completed),[1,3,9,17]);assert.equal(restart.data.current,2);
});

test('已有最晚勾选行不会因缩短未织计划而丢失',async()=>{
  const table=plan({max:10}),saved={version:1,params:table.params,completed:[1,3,table.total]}, {instance,stored,saves}=await page(saved);
  instance.openSettings();instance.data.draft.max=8;instance.generate();
  assert.equal(instance.data.preview,false);assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');assert.equal(stored(),saved);assert.equal(saves.length,0);
});

test('转折后直接手法、倾斜和固定参数事件均不改变已织草稿，普通参数仍可修改',async()=>{
  const saved=adjustedSaved(),{instance,stored,saves}=await page(saved);instance.openSettings();const original=JSON.stringify(instance.data.draft);
  instance.onMethod({detail:{value:'1'}});instance.onSlant({detail:{value:'1'}});instance.onLayout({detail:{value:'1'}});instance.onPosition({detail:{value:'1'}});instance.onMode({detail:{value:'2'}});
  for(const key of ['start','max','interval','firstIncLead','incLead','firstInc','slip','incMethod','incSlant'])instance.onInput({currentTarget:{dataset:{key}},detail:{value:'1'}});
  assert.equal(JSON.stringify(instance.data.draft),original);assert.equal(instance.data.methodIndex,0);assert.equal(instance.data.slantIndex,2);
  instance.onInput({currentTarget:{dataset:{key:'name'}},detail:{value:'仍可改名'}});instance.generate();await instance.confirmPreview();
  assert.equal(stored().params.name,'仍可改名');assert.deepEqual(stored().completed,saved.completed);assert.equal(saves.length,1);
});

test('确认预览再次校验已织操作，篡改候选参数或操作块都不能保存',async()=>{
  for(const mutate of [candidate=>{candidate.params.incMethod='between';},candidate=>{candidate.rows[7].segments[1].method='between';}]){
    const table=plan({max:10}),saved={version:1,params:table.params,completed:[8]}, {instance,stored,saves}=await page(saved);
    instance.openSettings();instance.generate();mutate(instance.previewPlan);await instance.confirmPreview();
    assert.equal(instance.data.preview,false);assert.equal(instance.data.setup,true);assert.equal(instance.previewPlan,null);
    assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');assert.equal(stored(),saved);assert.equal(saves.length,0);
  }
});

test('未来行参数在预览后变化必须重新预览，不能保存与显示不同的行表',async()=>{
  const {instance,stored,saves}=await page();Object.assign(instance.data.draft,{max:10,tail:0});instance.generate();instance.previewPlan.params.max=12;
  await instance.confirmPreview();assert.equal(instance.data.preview,false);assert.equal(instance.data.setup,true);assert.equal(instance.previewPlan,null);
  assert.equal(instance.data.error,'设置已更改，请重新预览。');assert.equal(stored(),undefined);assert.equal(saves.length,0);
});

test('无效手法和倾斜事件保留草稿，新建不会继承上条作品的选项',async()=>{
  const {instance}=await page();assert.equal(instance.data.methodIndex,0);assert.equal(instance.data.slantIndex,2);
  for(const value of ['invalid','-1','3','Infinity','1.5']){instance.onMethod({detail:{value}});instance.onSlant({detail:{value}});}
  assert.equal(instance.data.draft.incMethod,'stitch');assert.equal(instance.data.draft.incSlant,'right');
  instance.onMethod({detail:{value:'1'}});instance.onSlant({detail:{value:'1'}});instance.cancelSettings();instance.startNew();
  assert.equal(instance.data.methodIndex,0);assert.equal(instance.data.slantIndex,2);assert.equal(instance.data.draft.incMethod,'stitch');assert.equal(instance.data.draft.incSlant,'right');
  assert.equal(instance.data.draft.firstIncLead,2);assert.equal(instance.data.draft.incLead,3);
});

function input(instance,key,value){instance.onInput({currentTarget:{dataset:{key}},detail:{value:String(value)}});}
function adopt(instance,key){instance.onAdoptSuggestion({currentTarget:{dataset:{key}}});}

test('新建填写时联动后续行程，预览确认保存后重新打开继续跟随',async()=>{
  const {instance,stored,saves}=await page();input(instance,'max',10);input(instance,'interval',6);
  assert.equal(Number(instance.data.draft.firstInc),6);assert.equal(Number(instance.data.draft.tail),5);assert.equal(instance.data.firstDecrease,30);
  assert.match(instance.data.settingsHints.firstInc,/5/);assert.equal(stored(),undefined);assert.equal(saves.length,0);
  instance.generate();assert.equal(instance.previewPlan.total,54);
  assert.deepEqual(instance.previewPlan.rows.filter(row=>row.delta>0).map(row=>row.id),[6,12,18,24]);
  assert.deepEqual(instance.previewPlan.rows.filter(row=>row.delta<0).map(row=>row.id),[30,36,42,48]);
  await instance.confirmPreview();assert.equal(stored().params.guidance.auto.firstInc,true);assert.equal(stored().params.guidance.auto.tail,true);
  const restart=(await page(stored())).instance;restart.openSettings();assert.equal(restart.data.firstDecrease,30);
  input(restart,'interval',8);assert.equal(Number(restart.data.draft.firstInc),8);assert.equal(Number(restart.data.draft.tail),7);assert.equal(restart.data.firstDecrease,40);
});

test('手动填入相同建议也固定，修改上游只更新建议，采用建议才恢复跟随',async()=>{
  const {instance,stored}=await page();input(instance,'max',10);input(instance,'interval',6);input(instance,'firstInc',6);
  assert.equal(instance.data.guidance.auto.firstInc,false);input(instance,'interval',10);
  assert.equal(Number(instance.data.draft.firstInc),6);assert.equal(instance.data.settingsSuggestions.firstInc,10);
  input(instance,'tail',6);input(instance,'firstInc',8);assert.equal(Number(instance.data.draft.tail),6);assert.equal(instance.data.settingsSuggestions.tail,7);
  adopt(instance,'tail');assert.equal(Number(instance.data.draft.tail),7);assert.equal(instance.data.guidance.auto.tail,true);
  instance.generate();await instance.confirmPreview();
  const restart=(await page(stored())).instance;restart.openSettings();input(restart,'interval',12);
  assert.equal(Number(restart.data.draft.firstInc),8);assert.equal(Number(restart.data.draft.tail),7);assert.equal(restart.data.guidance.auto.firstInc,false);
  adopt(restart,'firstInc');assert.equal(Number(restart.data.draft.firstInc),12);assert.equal(Number(restart.data.draft.tail),11);
});

test('旧围巾显示真实总首减行，未编辑保持原始中间等待和段内首减',async()=>{
  const table=plan({max:10,center:20,firstDec:8}),saved={version:1,params:table.params,completed:[1,3]}, {instance,stored}=await page(saved);
  instance.openSettings();assert.equal(instance.data.firstDecrease,60);assert.equal(instance.data.draft.center,20);assert.equal(instance.data.draft.firstDec,8);
  for(const key of ['firstInc','end','firstDec','tail'])assert.equal(instance.data.guidance.auto[key],false);
  input(instance,'name','保留旧织法');instance.generate();await instance.confirmPreview();
  assert.equal(stored().params.center,20);assert.equal(stored().params.firstDec,8);assert.deepEqual(instance.plan.rows,table.rows);
  instance.openSettings();input(instance,'firstDecrease',64);assert.equal(Number(instance.data.firstDecrease),64);
  instance.generate();assert.equal(instance.previewPlan.rows.find(row=>row.delta<0).id,64);await instance.confirmPreview();
  assert.deepEqual(stored().completed,[1,3]);assert.equal(stored().params.center+stored().params.firstDec,32);
});

test('非法或空总首减行在预览前阻止，不把有效原始参数保存成另一个行号',async()=>{
  const {instance,stored,saves}=await page();input(instance,'max',10);input(instance,'interval',6);
  for(const value of ['24','','30.5','625']){
    input(instance,'firstDecrease',value);assert.ok(instance.data.settingsErrors.firstDecrease);instance.generate();
    assert.equal(instance.data.preview,false);assert.equal(instance.previewPlan,null);assert.ok(instance.data.error);assert.equal(stored(),undefined);assert.equal(saves.length,0);
  }
  input(instance,'firstDecrease',34);instance.generate();assert.equal(instance.data.preview,true);
  assert.equal(instance.previewPlan.rows.find(row=>row.delta<0).id,34);assert.equal(stored(),undefined);
});

test('仅加针和仅减针按各段联动，手填尾段切换模式仍保留',async()=>{
  const {instance}=await page();instance.onMode({detail:{value:'1'}});input(instance,'max',10);input(instance,'interval',6);
  assert.equal(Number(instance.data.draft.firstInc),6);assert.equal(Number(instance.data.draft.tail),0);
  instance.generate();assert.equal(instance.previewPlan.total,24);instance.backToSettings();
  input(instance,'tail',3);instance.onMode({detail:{value:'0'}});assert.equal(Number(instance.data.draft.tail),3);
  instance.onMode({detail:{value:'2'}});input(instance,'interval',8);
  assert.equal(instance.data.draft.decLayout,'single');assert.equal(instance.data.firstDecrease,8);assert.equal(Number(instance.data.draft.tail),3);
  instance.generate();assert.equal(instance.previewPlan.rows.find(row=>row.delta<0).id,8);
});

test('联动不能改变已织稀疏加针操作，也不能通过修改连续进度绕过',async()=>{
  const first=await page();input(first.instance,'max',10);first.instance.generate();await first.instance.confirmPreview();
  await first.instance.onRow({currentTarget:{dataset:{id:'8'}}});
  const {instance,stored,saves}=await page(first.stored()),original=instance.plan;instance.openSettings();input(instance,'interval',6);input(instance,'resume',0);instance.generate();
  assert.equal(instance.data.preview,false);assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');assert.equal(instance.plan,original);
  assert.deepEqual(stored().completed,[8]);assert.equal(saves.length,0);
});

test('明确设置最宽处后的自选首减行保存为手动，重开改名不恢复旧自动建议',async()=>{
  const initial=await page();input(initial.instance,'max',10);initial.instance.generate();await initial.instance.confirmPreview();
  const saved=Object.assign({},initial.stored(),{completed:Array.from({length:16},(_,i)=>i+1)}),{instance,stored}=await page(saved);
  instance.openTurn();instance.onTurnInput({detail:{value:'18'}});instance.previewTurn();await instance.confirmPreview();
  assert.equal(stored().params.guidance.auto.firstDec,false);assert.equal(instance.plan.rows.find(row=>row.delta<0).id,18);
  const restart=(await page(stored())).instance;restart.openSettings();assert.equal(restart.data.firstDecrease,18);assert.equal(restart.data.guidance.auto.firstDec,false);
  input(restart,'name','转折后改名');restart.generate();assert.equal(restart.previewPlan.rows.find(row=>row.delta<0).id,18);
});

test('新计数方案采用简化织法默认，保存重开保留联动与实际2/3针位置',async()=>{
  const {instance,stored}=await page();
  assert.equal(instance.data.guidance.weave,'linked');
  for(const [key,value] of Object.entries({firstIncLead:2,incLead:3,decLead:3,lastDecLead:2,slip:3})) assert.equal(instance.data.draft[key],value,key);
  input(instance,'max',10); instance.generate();
  const inc=instance.previewPlan.rows.filter(row=>row.delta>0);
  assert.equal(inc[0].segments.find(s=>s.kind==='increase').text,'第 3 针 +1');
  assert.equal(inc[1].segments.find(s=>s.kind==='increase').text,'第 4 针 +1');
  await instance.confirmPreview();
  const restart=(await page(stored())).instance; restart.openSettings();
  assert.equal(restart.data.guidance.weave,'linked'); assert.equal(restart.data.draft.incLead,3);
  assert.deepEqual(restart.plan.rows,instance.plan.rows);
});

test('共用加针方式在仅减针同步减针侧别，首次位置沿用切换前选择',async()=>{
  const {instance,stored}=await page();
  input(instance,'max',10); instance.onPosition({detail:{value:'1'}}); instance.onMode({detail:{value:'2'}});
  assert.equal(instance.data.draft.decFirst,'end');
  instance.onLayout({detail:{value:'1'}});
  assert.equal(instance.data.draft.decLayout,'alternating'); assert.equal(instance.data.decLayoutIndex,2);
  instance.generate();
  assert.equal(instance.previewPlan.rows.find(row=>row.delta<0).decreasePosition,'end');
  const edges=instance.previewPlan.rows.filter(row=>row.delta<0).map(row=>row.fabricEdge);
  edges.forEach((edge,i)=>assert.equal(edge,edges[0]^(i%2)));
  await instance.confirmPreview();
  const restart=(await page(stored())).instance; restart.openSettings();
  assert.equal(restart.data.guidance.weave,'linked'); assert.equal(restart.data.draft.decLayout,'alternating');
  restart.onMode({detail:{value:'0'}}); assert.equal(restart.data.draft.decLayout,'follow');
  restart.onMode({detail:{value:'2'}}); assert.equal(restart.data.draft.decLayout,'alternating'); assert.equal(restart.data.draft.decFirst,'end');
});

test('旧隐藏减针与滑针参数改名颜色可保存，普通针数编辑不偷偷迁移',async()=>{
  const hidden={firstIncLead:1,incLead:2,decLead:1,lastDecLead:1,slip:2,decLayout:'alternating',decFirst:'end'};
  const table=plan(Object.assign({max:10},hidden)), saved={version:1,params:table.params,completed:[1,3,40]};
  const {instance,stored}=await page(saved); instance.openSettings();
  assert.equal(instance.data.guidance.weave,undefined);
  input(instance,'name','旧织法保留'); chooseColor(instance,'blue'); instance.generate();
  assert.equal(instance.data.preview,true); await instance.confirmPreview();
  for(const [key,value] of Object.entries(hidden)) assert.equal(stored().params[key],value,key);
  assert.deepEqual(stored().completed,[1,3,40]); assert.deepEqual(instance.plan.rows,table.rows);
  instance.openSettings(); input(instance,'max',11);
  for(const [key,value] of Object.entries(hidden)) assert.equal(instance.data.draft[key],value,key);
  assert.equal(instance.data.guidance.weave,undefined);
});

test('明确修改旧加针侧启用跟随，但稀疏已织减针行被双层保存保护',async()=>{
  const table=plan({max:10,incLead:2,decLead:1,lastDecLead:1,slip:2,decLayout:'alternating',decFirst:'end'});
  const saved={version:1,params:table.params,completed:[1,3,40]}, {instance,stored,saves}=await page(saved);
  instance.openSettings(); instance.onLayout({detail:{value:'0'}});
  assert.equal(instance.data.guidance.weave,'linked'); assert.equal(instance.data.draft.decLayout,'follow');
  assert.equal(instance.data.draft.incLead,2); assert.equal(instance.data.draft.decLead,1); assert.equal(instance.data.draft.slip,2);
  instance.generate();
  assert.equal(instance.data.preview,false); assert.equal(instance.data.error,'已织行不能更改，请保留原织法。');
  assert.equal(stored(),saved); assert.equal(saves.length,0);
  // A stale or manually substituted preview still cannot bypass confirmation.
  instance.previewPlan=pattern.generate(instance.data.draft); instance.data.preview=true;
  await instance.confirmPreview();
  assert.equal(stored(),saved); assert.equal(saves.length,0); assert.deepEqual(Array.from(instance.completed),[1,3,40]);
});
