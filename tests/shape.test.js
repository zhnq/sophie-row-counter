const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const pattern=require('../src/pattern');
const shape=require('../src/shape');
function plan(options){return pattern.generate(Object.assign({max:10,tail:0,finish:'none',gaugeStitches:22},options));}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-9,actual+' ≠ '+expected);}

test('单侧加减的一条布边不动，另一边扩张后收回',()=>{
  const outline=shape.build(plan({incLayout:'single',decLayout:'follow'}));
  assert.equal(outline.start.width,6);assert.equal(outline.widest.stitches,10);assert.equal(outline.end.width,6);
  assert.ok(outline.lower.every(p=>p.y===3));assert.equal(Math.min(...outline.upper.map(p=>p.y)),-7);
  assert.equal(outline.end.upper,-3);assert.equal(outline.end.lower,3);assert.equal(outline.end.center,0);
  assert.equal(outline.counts.increaseRows,4);assert.equal(outline.counts.decreaseRows,4);assert.equal(outline.counts.edge0Increase,4);assert.equal(outline.counts.edge0Decrease,4);
});

test('左右交替在两条布边扩张，跟随减针回到起针中心',()=>{
  const outline=shape.build(plan({incLayout:'alternating',decLayout:'follow'}));
  assert.equal(Math.min(...outline.upper.map(p=>p.y)),-5);assert.equal(Math.max(...outline.lower.map(p=>p.y)),5);
  assert.equal(outline.counts.edge0Increase,2);assert.equal(outline.counts.edge1Increase,2);
  assert.equal(outline.counts.edge0Decrease,2);assert.equal(outline.counts.edge1Decrease,2);
  assert.equal(outline.end.upper,-3);assert.equal(outline.end.lower,3);assert.equal(outline.end.center,0);
  assert.deepEqual(outline.events.filter(e=>e.delta>0).map(e=>e.fabricEdge),[0,1,0,1]);
  assert.deepEqual(outline.events.filter(e=>e.delta<0).map(e=>e.fabricEdge),[1,0,1,0]);
});

test('奇数中间平织后选错独立减针侧，轮廓明确保留尾端横移',()=>{
  const follow=shape.build(plan({center:1,decLayout:'follow'}));
  const opposite=shape.build(plan({center:1,decLayout:'single',decFirst:'start'}));
  assert.equal(follow.rowCount,65);assert.equal(opposite.rowCount,65);
  assert.equal(follow.end.center,0);assert.equal(opposite.end.center,-4);assert.equal(opposite.end.width,6);
  assert.equal(opposite.end.upper,-7);assert.equal(opposite.end.lower,-1);
  assert.equal(opposite.counts.edge0Increase,4);assert.equal(opposite.counts.edge1Decrease,4);
});

test('奇数工作方向由每行fabricEdge决定，不把行首行尾重新当作布边',()=>{
  const table=plan({interval:3,firstInc:4,firstDec:5,center:1,incLayout:'single',decLayout:'follow'});
  assert.deepEqual(table.rows.filter(r=>r.delta>0).map(r=>r.increasePosition),['start','end','start','end']);
  const outline=shape.build(table);assert.ok(outline.lower.every(p=>p.y===3));assert.equal(outline.end.center,0);
  assert.ok(outline.events.every(e=>e.fabricEdge===0));
});

test('中间平织、不等起止与各计划段的界面保留',()=>{
  const table=plan({max:10,end:8,center:3,tail:2,finish:'bindoff'}),outline=shape.build(table);
  assert.equal(outline.rowCount,32+3+16+2);assert.equal(outline.start.width,6);assert.equal(outline.end.width,8);
  assert.deepEqual(outline.phases.map(p=>[p.name,p.startRow,p.endRow,p.startX,p.endX,p.rowCount]),[
    ['加针段',1,32,0,32,32],['中间平织',33,35,32,35,3],['减针段',36,51,35,51,16],['末尾平织',52,53,51,53,2],['收针',54,54,53,53,0]
  ]);
  assert.ok(outline.rows.filter(r=>r.phase==='中间平织').every(r=>r.width===10));
  assert.equal(outline.upper.length,outline.rowCount+1);assert.equal(outline.lower.length,outline.rowCount+1);
});

test('只有加针或减针时起始宽度与末宽正确',()=>{
  const inc=shape.build(plan({mode:'increase'}));assert.equal(inc.start.width,6);assert.equal(inc.end.width,10);assert.equal(inc.counts.decreaseRows,0);
  const dec=shape.build(plan({mode:'decrease'}));assert.equal(dec.start.width,10);assert.equal(dec.end.width,6);assert.equal(dec.widest.stitches,10);assert.equal(dec.counts.increaseRows,0);
  assert.equal(inc.rowCount,32);assert.equal(dec.rowCount,32);
});

test('收针行不消除实体宽度，也不增加实体长度',()=>{
  const plain=shape.build(plan()),finished=shape.build(plan({finish:'bindoff'}));
  assert.equal(finished.rowCount,plain.rowCount);assert.deepEqual(finished.upper,plain.upper);assert.deepEqual(finished.lower,plain.lower);
  assert.equal(finished.end.width,6);assert.equal(finished.counts.bindoffRows,1);assert.equal(finished.bindoff.length,1);
  assert.equal(finished.bindoff[0].id,65);assert.equal(finished.bindoff[0].x,64);assert.equal(finished.bindoff[0].width,6);
});

test('厘米比例独立使用行密度与针密度，宽度与轮廓包围盒区别明确',()=>{
  const outline=shape.build(plan({gaugeRows:40,gaugeStitches:20,center:1,decLayout:'single',decFirst:'start'}));
  close(outline.cm.length,65*10/40);close(outline.cm.width,10*10/20);close(outline.cm.height,10*10/20);
  close(outline.rows[7].cm.x,8*10/40);close(outline.rows[7].cm.width,7*10/20);
  close(outline.cm.upper[8].y,-4*10/20);assert.equal(outline.cm.estimated,true);
  const stretched=shape.build(plan({gaugeRows:20,gaugeStitches:40}));
  close(stretched.cm.length,64*10/20);close(stretched.cm.width,10*10/40);
  const fractional=shape.build(plan({gaugeStitches:0.5}));close(fractional.cm.width,10*10/0.5);
});

test('几何直接读取行事件，忽略已过时的间隔和布局参数',()=>{
  const table=plan({mode:'increase'}),expected=shape.build(table);
  const stale=Object.assign({},table,{params:Object.assign({},table.params,{max:100,interval:2,incLayout:'alternating',incFirst:'end'})});
  const actual=shape.build(stale);assert.deepEqual(actual.upper,expected.upper);assert.deepEqual(actual.lower,expected.lower);assert.deepEqual(actual.events,expected.events);
  assert.equal(actual.widest.stitches,10);assert.equal(actual.rowCount,32);
});

test('相同行数存档改加减针布局后轮廓随实际行事件变化，勾选不参与几何',()=>{
  const table=plan({center:1}),saved={version:1,params:table.params,completed:[1,3,32,64]};
  const restored=pattern.restore(saved),single=shape.build(restored.plan);
  const changed=pattern.restore({version:1,params:Object.assign({},saved.params,{incLayout:'alternating'}),completed:saved.completed});
  const alternate=shape.build(changed.plan);assert.equal(single.rowCount,alternate.rowCount);assert.notDeepEqual(single.upper,alternate.upper);
  assert.deepEqual(changed.progress.completed,saved.completed);
  const otherProgress=pattern.restore(Object.assign({},saved,{completed:[]}));assert.deepEqual(shape.build(otherProgress.plan),single);
});

test('4000行保留首尾、每个变针事件和全部边界节点',()=>{
  const table=plan({max:56,interval:40,firstInc:40,firstDec:40,tail:0}),outline=shape.build(table);
  assert.equal(outline.rowCount,4000);assert.equal(outline.upper.length,4001);assert.equal(outline.lower.length,4001);
  assert.equal(outline.events.length,100);assert.equal(outline.events[0].rowId,40);assert.equal(outline.events.at(-1).rowId,4000);
  assert.equal(outline.start.x,0);assert.equal(outline.end.x,4000);assert.equal(outline.end.width,6);
});

test('非法针数、密度或缺失物理布边拒绝生成，不修改原计划',()=>{
  const table=plan(),before=JSON.stringify(table);shape.build(table);assert.equal(JSON.stringify(table),before);
  for(const options of [{gaugeRows:0},{gaugeRows:false},{gaugeStitches:0},{gaugeStitches:101},{gaugeStitches:' '}]){
    assert.throws(()=>shape.build(Object.assign({},table,{params:Object.assign({},table.params,options)})));
  }
  const missingEdge=JSON.parse(JSON.stringify(table));missingEdge.rows[7].fabricEdge=null;assert.throws(()=>shape.build(missingEdge),/位置/);
  const wrongWidth=JSON.parse(JSON.stringify(table));wrongWidth.rows[7].stitches++;assert.throws(()=>shape.build(wrongWidth),/不一致/);
  const unordered=JSON.parse(JSON.stringify(table));unordered.rows[1].id=1;assert.throws(()=>shape.build(unordered),/顺序/);
});

test('同一源码同时支持浏览器UMD与Node，无外部依赖',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/shape.js'),'utf8'),context);
  assert.equal(typeof context.SophieShape.build,'function');
  const outline=context.SophieShape.build(plan());assert.equal(outline.rowCount,64);assert.equal(outline.end.width,6);
});

test('显示轮廓将同边相邻加针连成斜边，保留真实行表和端点宽度',()=>{
  const table=plan({tail:7}),actual=shape.build(table);
  const originalTable=JSON.stringify(table),originalShape=JSON.stringify(actual),smooth=shape.display(actual);
  assert.equal(shape.renderOutline,shape.display);
  assert.notEqual(smooth.upper,actual.upper);assert.notEqual(smooth.rows[0],actual.rows[0]);
  assert.equal(smooth.upper[8].y,-4);assert.equal(smooth.upper[12].y,-4.5);assert.equal(smooth.upper[16].y,-5);
  assert.equal(actual.upper[12].y,-4);assert.ok(smooth.lower.every(p=>p.y===3));
  assert.equal(smooth.rows[11].width,7.5);assert.equal(actual.rows[11].width,7);
  close(smooth.rows[11].cm.width,7.5*10/22);
  assert.equal(smooth.rows.at(-1).width,6);assert.equal(smooth.rows.at(-1).center,0);
  assert.equal(JSON.stringify(table),originalTable);assert.equal(JSON.stringify(actual),originalShape);
  assert.deepEqual(smooth.extent,actual.extent);assert.deepEqual(smooth.cm.extent,actual.cm.extent);
});

test('显示保留起针前平织、最宽等待和尾端平织，不跨峰值连线',()=>{
  const actual=shape.build(plan({center:12,tail:9})),smooth=shape.display(actual);
  const changes=actual.events,first=changes[0].x,lastIncrease=changes.filter(e=>e.delta>0).at(-1).x;
  const firstDecrease=changes.find(e=>e.delta<0).x,lastDecrease=changes.at(-1).x;
  for(let index=0;index<first;index++){
    assert.deepEqual(smooth.upper[index],actual.upper[index]);assert.deepEqual(smooth.lower[index],actual.lower[index]);
  }
  for(let index=lastIncrease;index<firstDecrease;index++){
    assert.equal(smooth.upper[index].y,-7);assert.equal(smooth.lower[index].y,3);
    assert.equal(smooth.rows[index-1].width,10);
  }
  for(let index=lastDecrease;index<=actual.rowCount;index++){
    assert.deepEqual(smooth.upper[index],actual.upper[index]);assert.deepEqual(smooth.lower[index],actual.lower[index]);
  }
  assert.equal(smooth.upper[firstDecrease].y,-6);
  assert.equal(smooth.upper[firstDecrease+4].y,-5.5);
});

test('交替加减平滑两边仍为双边扩缩，不能画成单侧三角或隐藏6针的截尖',()=>{
  const actual=shape.build(plan({incLayout:'alternating',decLayout:'follow',tail:5})),smooth=shape.display(actual);
  assert.equal(smooth.upper[16].y,-4.5);assert.equal(smooth.lower[24].y,4.5);
  assert.equal(smooth.rows[31].width,10);assert.equal(smooth.rows[31].center,0);
  assert.equal(smooth.upper[0].y,-3);assert.equal(smooth.lower[0].y,3);
  assert.equal(smooth.rows.at(-1).width,6);assert.equal(smooth.rows.at(-1).center,0);
  assert.ok(smooth.upper.some(p=>p.y===-5));assert.ok(smooth.lower.some(p=>p.y===5));
  for(const event of actual.events){
    const points=event.fabricEdge===0?smooth.upper:smooth.lower;
    assert.equal(points[event.x].y,event.y);
  }
});

test('显示保留独立减针造成的尾端横移和原尺寸比例',()=>{
  const table=plan({center:1,decLayout:'single',decFirst:'start',gaugeRows:40,gaugeStitches:20}),actual=shape.build(table);
  const smooth=shape.display(table),end=smooth.rows.at(-1);
  assert.equal(end.upper,-7);assert.equal(end.lower,-1);assert.equal(end.width,6);assert.equal(end.center,-4);
  close(end.cm.center,-2);close(smooth.cm.length,65*10/40);close(smooth.cm.width,5);
  assert.deepEqual(smooth.cm.extent,actual.cm.extent);
  smooth.upper.forEach((point,index)=>{
    close(smooth.cm.upper[index].x,point.x*10/40);close(smooth.cm.upper[index].y,point.y*10/20);
  });
});

test('单独加针、减针和4000行的显示边界都保留全部行与原事件',()=>{
  for(const options of [{mode:'increase'},{mode:'decrease'},{max:56,interval:40,firstInc:40,firstDec:40}]){
    const actual=shape.build(plan(options)),original=JSON.stringify(actual),smooth=shape.display(actual);
    assert.equal(smooth.upper.length,actual.rowCount+1);assert.equal(smooth.rows.length,actual.rowCount);
    assert.deepEqual(smooth.upper[0],actual.upper[0]);assert.deepEqual(smooth.lower[0],actual.lower[0]);
    assert.deepEqual(smooth.upper.at(-1),actual.upper.at(-1));assert.deepEqual(smooth.lower.at(-1),actual.lower.at(-1));
    assert.ok(smooth.rows.every(row=>row.width>0&&row.width<=actual.widest.stitches));
    assert.equal(JSON.stringify(actual),original);
  }
  assert.throws(()=>shape.display(null),/轮廓/);
});

test('画布与首页缩略图使用形状示意，仍返回实际几何且不更改行表',()=>{
  const table=plan(),actual=shape.build(table),illustration=shape.illustration(actual),before=JSON.stringify(table);
  const fills=[],attributes={};let current=[];
  const ctx={
    beginPath(){current=[];},moveTo(x,y){current.push({x,y});},lineTo(x,y){current.push({x,y});},
    fill(){fills.push(current.slice());},createLinearGradient(){return {addColorStop(){}};}
  };
  for(const method of ['setTransform','clearRect','save','restore','translate','scale','closePath','clip','fillRect','stroke','bezierCurveTo','ellipse'])ctx[method]=()=>{};
  const canvas={getContext(){return ctx;},getBoundingClientRect(){return {width:360,height:180};},
    setAttribute(key,value){attributes[key]=value;}};
  const browser={SophieShape:shape,SophiePattern:pattern,devicePixelRatio:1};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/preview.js'),'utf8'),browser);
  const returned=browser.SophiePreview.draw(canvas,table);
  assert.equal(attributes['data-rendered'],'true');assert.equal(attributes['data-schematic'],'true');
  assert.equal(attributes['data-outline-kind'],'triangle');
  assert.deepEqual(returned,actual);assert.equal(JSON.stringify(table),before);
  assert.deepEqual(fills[0],illustration.upper.concat(illustration.lower.slice().reverse()).map(p=>({x:p.x,y:p.y})));
  assert.equal(fills[0].length,2*illustration.rows.length);
});

function illustrationRow(outline,row) {
  const point=outline.rows.find(p=>Math.abs(p.row-row)<1e-8);
  assert.ok(point,'示意中保留关键行边界 '+row);
  return point;
}

test('6→10→6 的单侧和交替示意合并整段变化，不按逐针峰值错位折线绘制',()=>{
  for(const layout of ['single','alternating']) {
    const table=plan({incLayout:layout,decLayout:'follow',tail:7}),outline=shape.illustration(table);
    assert.equal(outline.schematic,true);assert.equal(outline.kind,layout==='single'?'triangle':'diamond');
    assert.equal(outline.stylized,true);
    assert.ok(outline.start.width>0&&outline.start.width<.02);
    assert.ok(outline.end.width>0&&outline.end.width<.02);
    assert.deepEqual(outline.stitches,{start:6,max:10,end:6});
    assert.deepEqual(outline.needleRatio,{start:6/10,max:1,end:6/10});
    const peak=illustrationRow(outline,32);close(peak.width,1);
    assert.equal(outline.stages.length,2);
    if(layout==='single')assert.ok(outline.rows.every(p=>p.lower===outline.start.lower));
    else {
      assert.ok(outline.rows.every(p=>Math.abs(p.center)<1e-8));
      close(peak.upper,-.5);close(peak.lower,.5);
    }
    const first=outline.stages[0];
    const slopeStart=illustrationRow(outline,first.startRow);
    const following=outline.rows.find(p=>p.row>first.startRow);
    assert.ok(following.width>slopeStart.width&&following.width-slopeStart.width<.03,'首加为连续小变化，而非一整针跳变');
    const decreasing=outline.stages[1];
    const next=outline.rows.find(p=>p.row>decreasing.startRow);
    assert.ok(next.width<1&&next.width>.9,'首次减针不突然跳成较窄的段');
  }
});

test('示意保留真实变针行位置，压缩短等待但180行长等待仍显著',()=>{
  const table=plan({center:180,tail:90}),actual=shape.build(table),outline=shape.illustration(actual);
  const first=actual.events[0],lastInc=actual.events.filter(e=>e.delta>0).at(-1);
  const firstDec=actual.events.find(e=>e.delta<0),lastDec=actual.events.at(-1);
  assert.equal(outline.stages[0].startRow,first.x-1);
  assert.equal(outline.stages[0].endRow,lastInc.x);
  assert.equal(outline.stages[1].startRow,firstDec.x-1);
  assert.equal(outline.stages[1].endRow,lastDec.x);
  for(const row of outline.rows) {
    if(row.row>=lastInc.x&&row.row<=firstDec.x-1)close(row.width,1);
  }
  assert.ok(outline.start.width<illustrationRow(outline,first.x-1).width);
  assert.ok(outline.end.width<illustrationRow(outline,lastDec.x).width);
  assert.ok(outline.stages[1].startRow-outline.stages[0].endRow>180,'长等待没有被隐藏成尖峰');
  const plateauStart=illustrationRow(outline,lastInc.x).x;
  const plateauEnd=illustrationRow(outline,firstDec.x-1).x;
  assert.ok((plateauEnd-plateauStart)/outline.extent.width>.5,'长平织依然占据明显的展示长度');
  const ordinary=shape.illustration(plan({tail:7}));
  const shortPlateau=illustrationRow(ordinary,39).x-illustrationRow(ordinary,32).x;
  assert.ok(shortPlateau/ordinary.extent.width<.05,'普通7行平织不会变成长方形平台');
});

test('长起针平织和长尾平织保持直段，三角包络不能把99行与90行平段收斜',()=>{
  for(const layout of ['single','alternating']) {
    const table=plan({firstInc:100,max:10,center:180,tail:90,incLayout:layout,decLayout:'follow'});
    const actual=shape.build(table),beforePlan=JSON.stringify(table),beforeShape=JSON.stringify(actual);
    const outline=shape.illustration(actual);
    const startPlain=outline.rows.filter(row=>row.row<=99&&row.x/outline.extent.width>=.03);
    const endPlain=outline.rows.filter(row=>row.row>=336&&row.x/outline.extent.width<=.97);
    assert.ok(startPlain.length>10&&endPlain.length>10,'去除短帽后仍有足够采样核对长平织');
    for(const row of startPlain.concat(endPlain))close(row.width,(6/10)**2);
    for(const segment of [startPlain,endPlain]) {
      for(const row of segment) {
        close(row.upper,segment[0].upper);close(row.lower,segment[0].lower);
      }
    }
    assert.deepEqual(outline.stages.map(stage=>[stage.startRow,stage.endRow]),[[99,124],[311,336]]);
    close(illustrationRow(outline,99).width,.36);
    close(illustrationRow(outline,124).width,1);
    close(illustrationRow(outline,311).width,1);
    close(illustrationRow(outline,336).width,.36);
    assert.equal(outline.rowCount,426);assert.equal(outline.rowCount,actual.rowCount);
    assert.deepEqual(outline.needleRatio,{start:.6,max:1,end:.6});
    assert.deepEqual(outline.stitches,{start:6,max:10,end:6});
    assert.equal(JSON.stringify(table),beforePlan);assert.equal(JSON.stringify(actual),beforeShape);
  }
});

test('示意保留不同起止针数与旧独立减针的偏移方向',()=>{
  const unequal=shape.illustration(plan({end:8,decLayout:'follow'}));
  assert.ok(unequal.start.width>0&&unequal.start.width<.02);
  assert.ok(unequal.end.width>unequal.start.width,'不同起止针数在风格化尖端中仍可区分');
  assert.deepEqual(unequal.needleRatio,{start:6/10,max:1,end:8/10});
  assert.deepEqual(unequal.stitches,{start:6,max:10,end:8});
  close(unequal.stages[0].widthBefore,(6/10)**2);
  close(unequal.stages.at(-1).widthAfter,(8/10)**2);
  const table=plan({center:1,decLayout:'single',decFirst:'start'}),actual=shape.build(table),outline=shape.illustration(actual);
  assert.equal(outline.shifted,true);assert.ok(outline.end.width>0&&outline.end.width<.02);
  assert.equal(Math.sign(outline.end.center-outline.start.center),Math.sign(actual.end.center-actual.start.center));
  assert.ok(Math.abs(outline.end.center-outline.start.center)>.1);
  assert.equal(outline.stages[0].edge0,4);assert.equal(outline.stages[1].edge1,4);
});

test('单独加针和减针示意按整段正确展开或收拢',()=>{
  for(const mode of ['increase','decrease']) {
    const table=plan({mode,incLayout:'alternating',decLayout:'alternating'}),outline=shape.illustration(table);
    assert.equal(outline.kind,mode);assert.equal(outline.stages.length,1);
    const narrowEnd=mode==='increase'?outline.start:outline.end;
    assert.ok(narrowEnd.width>0&&narrowEnd.width<.02);
    assert.deepEqual(outline.needleRatio,mode==='increase'?{start:6/10,max:1,end:1}:{start:1,max:1,end:6/10});
    const wideEnd=mode==='increase'?outline.end:outline.start;
    close(wideEnd.upper,-.5);close(wideEnd.lower,.5);
    for(let index=1;index<outline.rows.length;index++) {
      const difference=outline.rows[index].width-outline.rows[index-1].width;
      assert.ok(mode==='increase'?difference>=-1e-8:difference<=1e-8);
    }
  }
});

test('4000行示意保持有限采样、关键行位置和有效宽度',()=>{
  const table=plan({max:56,interval:40,firstInc:40,firstDec:40}),outline=shape.illustration(table);
  assert.equal(outline.rowCount,4000);assert.ok(outline.rows.length>=256&&outline.rows.length<=270);
  assert.equal(outline.start.row,0);assert.equal(outline.end.row,4000);
  close(illustrationRow(outline,2000).width,1);assert.ok(outline.end.width>0&&outline.end.width<.01);
  assert.deepEqual(outline.needleRatio,{start:6/56,max:1,end:6/56});
  assert.ok(outline.rows.every(row=>Number.isFinite(row.x)&&row.width>0&&row.width<=1+1e-8));
  for(let index=1;index<outline.rows.length;index++)
    assert.ok(outline.rows[index].x-outline.rows[index-1].x<=outline.extent.width/256+1e-8,'展示采样不会因短等待压缩而留下纹理空档');
});

test('形状示意不受密度影响，且不修改计划或实际几何',()=>{
  const first=plan({gaugeRows:20,gaugeStitches:40}),second=plan({gaugeRows:60,gaugeStitches:12});
  assert.deepEqual(shape.illustration(first),shape.illustration(second));
  const actual=shape.build(first),beforePlan=JSON.stringify(first),beforeShape=JSON.stringify(actual);
  assert.deepEqual(shape.illustration(actual),shape.illustration(first));
  assert.equal(JSON.stringify(first),beforePlan);assert.equal(JSON.stringify(actual),beforeShape);
  assert.throws(()=>shape.illustration(null),/轮廓/);
});

test('示意读取实际布边事件，忽略过时布局字段',()=>{
  const table=plan({incLayout:'single',decLayout:'follow'}),original=shape.illustration(table);
  const stale=JSON.parse(JSON.stringify(table));stale.params.incLayout='alternating';stale.params.decLayout='alternating';
  assert.deepEqual(shape.illustration(stale),original);
});

test('改变最宽针数保留真实针数比，绘图主宽度强调收窄趋势',()=>{
  for(const layout of ['single','alternating']) {
    const narrow=shape.illustration(plan({max:10,incLayout:layout,decLayout:'follow'}));
    const wide=shape.illustration(plan({max:26,incLayout:layout,decLayout:'follow'}));
    assert.deepEqual(narrow.needleRatio,{start:6/10,max:1,end:6/10});
    assert.deepEqual(wide.needleRatio,{start:6/26,max:1,end:6/26});
    close(narrow.stages[0].widthBefore,(6/10)**2);
    close(wide.stages[0].widthBefore,(6/26)**2);
    assert.ok(narrow.start.width>0&&narrow.start.width<.02);
    assert.ok(narrow.end.width>0&&narrow.end.width<.02);
    assert.ok(wide.start.width>0&&wide.end.width>0);
    assert.ok(wide.start.width<narrow.start.width);
    for(const outline of [narrow,wide]) {
      close(Math.max(...outline.rows.map(row=>row.width)),1);
      assert.ok(outline.extent.width>3.5&&outline.extent.width<4.5,'展示比例不把两端拉成过长绳头');
    }
  }
});

test('6→10示意从窄端持续展开为三角斜边，不拖成长绳或宽方头',()=>{
  for(const layout of ['single','alternating']) {
    const outline=shape.illustration(plan({incLayout:layout,decLayout:'follow',tail:7}));
    const capEnd=outline.rows.find(row=>Math.abs(row.x/outline.extent.width-.03)<1e-8);
    const capStart=outline.rows.find(row=>Math.abs(row.x/outline.extent.width-.97)<1e-8);
    assert.ok(capEnd&&capStart,'两个短帽的接缝有明确展示采样');
    assert.ok(capEnd.width>.08&&capEnd.width<.2,'短帽以后进入细长三角斜边，避免过宽方头');
    assert.ok(capStart.width>.08&&capStart.width<.2);
    assert.ok(outline.start.width<capEnd.width*.1&&outline.end.width<capStart.width*.1,'窄端不再直切成方头');
    const beyond=outline.rows.find(row=>row.x/outline.extent.width>=.04);
    assert.ok(beyond.width>outline.start.width*10&&beyond.width>capEnd.width,'离端4%处已持续变宽，没有过长细绳');
    assert.ok(outline.rows.every(row=>row.width>0),'尖端仍有有限织物宽度');
    const peakStart=outline.stages[0].endRow,peakEnd=outline.stages[1].startRow;
    const rising=outline.rows.filter(row=>row.row<=peakStart),falling=outline.rows.filter(row=>row.row>=peakEnd);
    for(let index=1;index<rising.length;index++)assert.ok(rising[index].width>=rising[index-1].width-1e-8);
    for(let index=1;index<falling.length;index++)assert.ok(falling[index].width<=falling[index-1].width+1e-8);
    if(layout==='single')assert.ok(outline.rows.every(row=>row.lower===outline.start.lower),'短帽也不弯曲不动布边');
    else assert.ok(outline.rows.every(row=>Math.abs(row.center)<1e-8),'交替短帽沿原中心收尖');
  }
});

test('只有一次加减针且中间长等待时，短帽不跨过峰值或遮住最宽平段',()=>{
  for(const layout of ['single','alternating']) {
    const table=plan({max:7,center:180,tail:0,incLayout:layout,decLayout:'follow'});
    const actual=shape.build(table),outline=shape.illustration(actual);
    const firstPeak=illustrationRow(outline,outline.stages[0].endRow);
    const lastPeak=illustrationRow(outline,outline.stages[1].startRow);
    assert.ok(firstPeak.x/outline.extent.width<.03,'此例首次峰值在展示的前3%以内');
    assert.ok(lastPeak.x/outline.extent.width>.97,'此例末次峰值在展示的后3%以内');
    close(firstPeak.width,1);close(lastPeak.width,1);
    assert.ok(outline.rows.filter(row=>row.row>=firstPeak.row&&row.row<=lastPeak.row)
      .every(row=>Math.abs(row.width-1)<1e-8),'长等待保持整段最宽，端帽不能制造凹陷');
    assert.deepEqual(outline.stitches,{start:6,max:7,end:6});
    assert.equal(outline.rowCount,actual.rowCount);
  }
});

test('纯平织轮廓保持矩形，不生成额外尖端或峰顶',()=>{
  const table=plan({firstInc:8});
  // A valid row-plan prefix before its first increase contains only plain rows.
  const prefix=Object.assign({},table,{rows:table.rows.slice(0,7)});
  const actual=shape.build(prefix),before=JSON.stringify(prefix),outline=shape.illustration(actual);
  assert.equal(outline.kind,'plain');assert.equal(outline.rowCount,7);assert.equal(outline.stages.length,0);
  assert.deepEqual(outline.stitches,{start:6,max:6,end:6});
  assert.ok(outline.rows.every(row=>row.width===1&&row.upper===-.5&&row.lower===.5));
  assert.equal(JSON.stringify(prefix),before);
});

test('变针段肩部及时进入斜边，最宽平织仍保持真实的平段',()=>{
  const table=plan({incLayout:'alternating',decLayout:'follow',tail:7});
  const outline=shape.illustration(table);
  for(const stage of outline.stages) {
    const span=stage.endRow-stage.startRow;
    function completedAt(fraction) {
      const target=stage.startRow+span*fraction;
      const point=outline.rows.reduce((closest,row)=>Math.abs(row.row-target)<Math.abs(closest.row-target)?row:closest);
      const before=illustrationRow(outline,stage.startRow).width;
      const after=illustrationRow(outline,stage.endRow).width;
      return (point.width-before)/(after-before);
    }
    assert.ok(completedAt(.1)>.065,'行程前10%已进入斜边，没有拖长近乎平直的肩部');
    assert.ok(completedAt(.9)<.935,'行程后10%仍有明确坡度，不提前扩展最宽平台');
  }
  const peakEnd=outline.stages[0].endRow,decreaseStart=outline.stages[1].startRow;
  assert.equal(peakEnd,32);assert.equal(decreaseStart,39);
  assert.ok(outline.rows.filter(row=>row.row>=peakEnd&&row.row<=decreaseStart).every(row=>Math.abs(row.width-1)<1e-8));
});
