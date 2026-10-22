const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const pattern=require('../src/pattern');
const shape=require('../src/shape');
function plan(options){return pattern.generate(Object.assign({max:12,tail:5,finish:'none',firstInc:6,interval:6},options));}

test('加针点来自实际行表，单侧与交替、奇偶起始行及行首行尾保持一致',()=>{
  for(const incLayout of ['single','alternating']) for(const incFirst of ['start','end']) for(const firstInc of [5,6]){
    const table=plan({incLayout,incFirst,firstInc}),original=JSON.stringify(table);
    const outline=shape.illustration(table),points=shape.increaseMarkers(table,outline);
    const increases=table.rows.filter(row=>row.delta>0);
    assert.equal(points.length,increases.length);
    points.forEach((point,i)=>{
      const row=increases[i];
      assert.equal(point.rowId,row.id);assert.equal(point.fabricEdge,row.fabricEdge);
      assert.equal(point.position,row.increasePosition);
      assert.equal(point.before,row.before);assert.equal(point.stitches,row.stitches);
      const j=outline.rows.findIndex(p=>p.row>=row.id),a=outline.rows[j-1],b=outline.rows[j];
      const ratio=(point.x-a.x)/(b.x-a.x),side=row.fabricEdge===0?'upper':'lower';
      assert.ok(Math.abs(point.y-(a[side]+ratio*(b[side]-a[side])))<1e-8);
    });
    assert.equal(JSON.stringify(table),original);
  }
});

test('仅减针不出现加针点，中途转折只标实际保留的加针行',()=>{
  assert.deepEqual(shape.increaseMarkers(plan({mode:'decrease'})),[]);
  const table=plan(),completed=Array.from({length:20},(_,i)=>i+1);
  const turned=pattern.makeTurn(table,completed,26);
  // The turn API returns the new plan with the completed prefix preserved.
  const next=turned.plan;
  const points=shape.increaseMarkers(next);
  assert.deepEqual(points.map(p=>p.rowId),next.rows.filter(r=>r.delta>0).map(r=>r.id));
  assert.ok(points.every(p=>p.rowId<=20));
});

test('手机与桌面投影对齐相同围巾轮廓，所有点都在画布内',()=>{
  const root={SophieShape:shape,SophiePattern:pattern};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/preview.js'),'utf8'),root);
  for(const size of [[284,140],[354,180],[598,240]]){
    const table=plan({max:36,incLayout:'alternating'}),outline=shape.illustration(table),box=outline.extent;
    const source=shape.shapingMarkers(table,outline),points=root.SophiePreview.shapingMarkers(table,...size);
    const scale=Math.min((size[0]-42)/box.width,(size[1]-46)/box.height);
    points.forEach((p,i)=>{
      assert.ok(p.x>=0&&p.x<=size[0]&&p.y>=0&&p.y<=size[1]);
      assert.ok(Math.abs(p.x-((source[i].x-box.width/2)*scale+size[0]/2))<1e-8);
      assert.ok(Math.abs(p.y-((source[i].y-(box.minY+box.maxY)/2)*scale+size[1]/2-3))<1e-8);
    });
  }
});


test('减针点按实际行号、边和位置生成，排除平织与收针，且不改变行表',()=>{
  for(const mode of ['full','increase','decrease']) for(const incLayout of ['single','alternating'])
  for(const incFirst of ['start','end']) for(const firstInc of [5,6]) {
    const table=plan({mode,incLayout,incFirst,firstInc,finish:'bindoff'});
    const original=JSON.stringify(table),outline=shape.illustration(table);
    const points=shape.shapingMarkers(table,outline),rows=table.rows.filter(r=>r.delta!==0&&r.phase!=='收针');
    assert.deepEqual(points.map(p=>p.rowId),rows.map(r=>r.id));
    points.forEach((p,i)=>{
      const r=rows[i];
      assert.equal(p.kind,r.delta>0?'increase':'decrease');
      assert.equal(p.delta,r.delta);
      assert.equal(p.position,r.delta>0?r.increasePosition:r.decreasePosition);
      assert.equal(p.fabricEdge,r.fabricEdge);
      assert.equal(p.before,r.before);assert.equal(p.stitches,r.stitches);
      const j=outline.rows.findIndex(section=>section.row>=r.id),a=outline.rows[j-1],b=outline.rows[j];
      const t=(r.id-a.row)/(b.row-a.row),edge=r.fabricEdge===0?'upper':'lower';
      assert.ok(Math.abs(p.y-(a[edge]+t*(b[edge]-a[edge])))<1e-8);
    });
    assert.equal(JSON.stringify(table),original);
  }
});

test('中途设为最宽处后，加减针点使用调整后的行表',()=>{
  const table=plan(),completed=Array.from({length:20},(_,i)=>i+1);
  const next=pattern.makeTurn(table,completed,26).plan,points=shape.shapingMarkers(next);
  assert.deepEqual(points.filter(p=>p.kind==='decrease').map(p=>p.rowId),next.rows.filter(r=>r.delta<0).map(r=>r.id));
  assert.equal(points.find(p=>p.kind==='decrease').rowId,26);
  assert.ok(points.filter(p=>p.kind==='increase').every(p=>p.rowId<=20));
});
