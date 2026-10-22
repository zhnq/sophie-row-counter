const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pattern = require('../src/pattern');
const shape = require('../src/shape');

function plan(options) {
  return pattern.generate(Object.assign({max:26, tail:7, center:12, incLayout:'alternating', decLayout:'follow'}, options));
}
function element(name) {
  return {name, style:{}, attributes:{}, children:[], parentNode:null, textContent:'',
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null; },
    removeAttribute(key) { delete this.attributes[key]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
    insertBefore(child, reference) {
      const index = reference ? this.children.indexOf(reference) : this.children.length;
      this.children.splice(index, 0, child); child.parentNode = this;
    }
  };
}
function context2d() {
  const ctx = {createLinearGradient() { return {addColorStop(){}}; }};
  for (const method of ['beginPath','moveTo','lineTo','closePath','setTransform','clearRect','save','restore','translate','scale','fill','clip','fillRect','stroke','bezierCurveTo','ellipse']) ctx[method] = () => {};
  return ctx;
}
function browser(initialContext, dimensions) {
  let drawingContext = initialContext;
  const document = {createElement:element, createElementNS(namespace, name) {
    assert.equal(namespace, 'http://www.w3.org/2000/svg'); return element(name);
  }};
  const parent = element('div'), canvas = element('canvas');
  canvas.style.display = ''; canvas.ownerDocument = document;
  canvas.setAttribute('aria-label', '形状示意，6 → 26 → 6 针，莓红');
  canvas.getContext = () => { if (drawingContext instanceof Error) throw drawingContext; return drawingContext; };
  canvas.getBoundingClientRect = () => canvas.style.display === 'none' ? {width:0,height:0} : dimensions || {width:360,height:180};
  Object.defineProperty(canvas, 'nextSibling', {get() { return parent.children[parent.children.indexOf(canvas) + 1] || null; }});
  parent.appendChild(canvas);
  const root = {document, SophieShape:shape, SophiePattern:pattern, devicePixelRatio:3};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/preview.js'), 'utf8'), root);
  return {canvas, parent, draw:root.SophiePreview.draw, changeContext(value) { drawingContext = value; }};
}
function fallback(p) {
  const nodes = p.parent.children.filter(node => node.getAttribute('data-preview-fallback') === 'true');
  assert.equal(nodes.length, 1); return nodes[0];
}
function coordinates(path) {
  return Array.from(path.getAttribute('d').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g), match => ({x:Number(match[1]),y:Number(match[2])}));
}

test('Canvas 2D 不可用时显示当前行表的同色轮廓，保留最宽平织段且不改变计数表', () => {
  const p = browser(null), table = plan(), before = JSON.stringify(table);
  assert.equal(p.draw(p.canvas, table), false);
  const node = fallback(p), path = node.children[0], points = coordinates(path);
  assert.equal(node.name, 'svg'); assert.equal(node.getAttribute('role'), 'img');
  assert.equal(node.getAttribute('aria-label'), p.canvas.getAttribute('aria-label'));
  assert.equal(path.getAttribute('fill'), '#ad596c');
  const outline = shape.illustration(table);
  assert.equal(points.length, outline.rows.length * 2);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const peakStart = outline.rows.findIndex(row => row.row === 160);
  const peakEnd = outline.rows.findIndex(row => row.row === 179);
  assert.ok(peakStart >= 0 && peakEnd > peakStart);
  assert.equal(points[peakStart].y, points[peakEnd].y);
  assert.equal(points[points.length - 1 - peakStart].y, points[points.length - 1 - peakEnd].y);
  assert.ok(points[peakEnd].x > points[peakStart].x);
  assert.equal(JSON.stringify(table), before);
  assert.equal(p.canvas.style.display, 'none'); assert.equal(p.canvas.getAttribute('aria-hidden'), 'true');
  assert.equal(p.canvas.getAttribute('data-rendered'), 'fallback');
});

test('getContext 抛错时清掉已画纹理和成功标记，显示新的围巾形状', () => {
  const p = browser(context2d()), old = plan(), changed = plan({yarnColor:'blue', incLayout:'single'});
  assert.ok(p.draw(p.canvas, old)); assert.equal(p.canvas.getAttribute('data-rendered'), 'true');
  assert.equal(p.canvas.width, 720); assert.equal(p.canvas.height, 360);
  p.changeContext(Error('context unavailable'));
  assert.doesNotThrow(() => p.draw(p.canvas, changed));
  const node = fallback(p);
  assert.equal(node.getAttribute('data-outline-kind'), 'triangle'); assert.equal(node.children[0].getAttribute('fill'), '#809fae');
  assert.equal(p.canvas.width, 0); assert.equal(p.canvas.height, 0);
  assert.equal(p.canvas.getAttribute('data-rendered'), 'fallback');
  assert.equal(p.canvas.getAttribute('data-outline-kind'), null);
});

test('连续降级会更新颜色轮廓并保持一个简图；上下文恢复后移除简图并恢复画布', () => {
  const p = browser(null), first = plan(), next = plan({max:18, yarnColor:'moss', incLayout:'single'});
  p.draw(p.canvas, first); const old = fallback(p), oldPath = old.children[0].getAttribute('d');
  p.draw(p.canvas, next); const current = fallback(p);
  assert.equal(old.parentNode, null); assert.notEqual(current.children[0].getAttribute('d'), oldPath);
  assert.equal(current.children[0].getAttribute('fill'), '#778575'); assert.equal(current.style.height, '180px');
  p.changeContext(context2d()); assert.deepEqual(p.draw(p.canvas, next), shape.build(next));
  assert.equal(current.parentNode, null); assert.equal(p.parent.children.length, 1);
  assert.equal(p.canvas.style.display, ''); assert.equal(p.canvas.getAttribute('aria-hidden'), null);
  assert.equal(p.canvas.getAttribute('data-rendered'), 'true'); assert.equal(p.canvas.sophieFallback, undefined);
});

test('上下文和轮廓同时无法创建时显示短提示，不能保留旧简图或旧纹理', () => {
  const p = browser(null); p.draw(p.canvas, plan()); const previous = fallback(p);
  assert.equal(p.draw(p.canvas, {params:{},rows:[]}), false);
  const node = fallback(p);
  assert.equal(previous.parentNode, null); assert.equal(node.name, 'div');
  assert.equal(node.textContent, '预览暂不可用'); assert.equal(node.children.length, 0);
  assert.equal(p.canvas.width, 0); assert.equal(p.canvas.height, 0);
});

test('未量到画布尺寸时仍提供可见简图，首页缩略图使用自身展示高度', () => {
  const empty = browser(context2d(), {width:0,height:0});
  assert.equal(empty.draw(empty.canvas, plan()), false);
  assert.equal(fallback(empty).getAttribute('viewBox'), '0 0 320 180');
  const home = browser(null, {width:360,height:92}); home.draw(home.canvas, plan());
  assert.equal(fallback(home).style.height, '92px'); assert.equal(fallback(home).getAttribute('viewBox'), '0 0 360 92');
});
