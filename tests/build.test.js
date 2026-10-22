const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateSource}=require('../scripts/build');

test('构建检查拦截字符串参数、空参数和换行调用中的禁用能力',()=>{
  for(const source of [
    "fetch('/api')",'fetch(url)','fetch ()','fetch\n("/api")',
    "eval('1 + 1')",'eval()',"new Function('return 1')",'Function ()',
    'new XMLHttpRequest()','new WebSocket(url)','new EventSource(url)',
    'WebAssembly.compile(bytes)','queueMicrotask(callback)','globalThis.value','navigator.locks.request("library",save)','navigator . locks',
    'new Worker("./worker.js")','new SharedWorker("./worker.js")','new RTCPeerConnection()',
    'navigator.clipboard.writeText("进度")','navigator.geolocation.getCurrentPosition(done)',
    'navigator.serviceWorker.register("./worker.js")','navigator.storage.persist()',
    'window.open("/page")','window.prompt("名称")','canvas.requestFullscreen()',
    'navigator.mediaDevices.enumerateDevices()','document.execCommand("copy")'
  ]) assert.throws(()=>validateSource('app.js',source),/不允许的能力/);
  for(const source of ['function fetchRows() {}','var safeFunction = 1;','function evaluator() {}']) {
    assert.doesNotThrow(()=>validateSource('app.js',source));
  }
});

test('发布入口与源码通过静态检查，外部资源和内联脚本被拦截',()=>{
  for(const name of ['index.html','style.css','pattern.js','settings.js','storage.js','shape.js','preview.js','counter.js','app.js']) {
    const source=fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
    assert.doesNotThrow(()=>validateSource(name,source));
  }
  assert.throws(()=>validateSource('index.html','<script>alert(1)</script>'),/禁止的标记/);
  assert.throws(()=>validateSource('index.html','<button onclick="run()">完成</button>'),/禁止的标记/);
  assert.throws(()=>validateSource('index.html','<script src="./missing.js"></script>'),/资源缺失/);
  assert.throws(()=>validateSource('style.css','@import "https://example.com/app.css";'),/外部资源/);
  assert.doesNotThrow(()=>validateSource('preview.js','document.createElementNS("http://www.w3.org/2000/svg", "svg")'));
  assert.throws(()=>validateSource('preview.js','image.src = "https://www.w3.org/image.png";'),/外部资源/);
  assert.throws(()=>validateSource('index.html','<img src="http://www.w3.org/2000/svg">'),/外部资源/);
  for (const source of ['<a href="javascript:run()">继续</a>','<a download="围巾.json">导出</a>',
    '<a target="_blank">打开</a>','<form action="/save"></form>',
    '<meta http-equiv="Content-Security-Policy" content="default-src *">']) {
    assert.throws(()=>validateSource('index.html',source),/禁止的标记/);
  }
  for (const source of ['Object.hasOwn(data,"key")','structuredClone(data)','rows.at(-1)','save().finally(cleanup)']) {
    assert.throws(()=>validateSource('app.js',source),/未兼容的语法/);
  }
  assert.throws(()=>validateSource('index.html','<!doctype html><html lang="zh-CN"><meta charset="UTF-8"></html>'),/视口声明/);
});
