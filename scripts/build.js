'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'build/sophie-row-counter');
const version = require('../package.json').version;
const release = path.join(root, 'release', 'sophie-row-counter-v' + version + '.zip');
const names = ['index.html', 'style.css', 'pattern.js', 'settings.js', 'storage.js', 'shape.js', 'preview.js', 'counter.js', 'app.js'];
function validateSource(name, source) {
  // The SVG namespace identifies an element type; createElementNS does not load it.
  const resourceSource = name.endsWith('.js') ? source.replace(/(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g, '""') : source;
  if (/\b(?:fetch|eval|Function)\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|WebAssembly|queueMicrotask|globalThis|RTCPeerConnection|Worker|SharedWorker|Accelerometer|Gyroscope|Magnetometer|DeviceMotionEvent|DeviceOrientationEvent|PaymentRequest)\b|\bnavigator\s*\.\s*(?:locks|geolocation|clipboard|bluetooth|usb|hid|serial|connection|credentials|serviceWorker)\b|\b(?:getBattery|enumerateDevices|getDisplayMedia|requestFullscreen|webkitRequestFullscreen)\s*\(|\bnavigator\s*\.\s*storage\s*\.\s*persist\s*\(|\bwindow\s*\.\s*(?:open|prompt)\s*\(|\bexecCommand\s*\(/.test(source)) throw Error(name + ' 含不允许的能力');
  if (/https?:\/\/|\?\.|\?\?|\.(?:at|finally)\s*\(|replaceAll\s*\(|Object\s*\.\s*hasOwn\s*\(|\bstructuredClone\s*\(|type=["']module/.test(resourceSource)) throw Error(name + ' 含外部资源或未兼容的语法');
  if (name === 'index.html') {
    if (/<script\b(?![^>]*\bsrc=)|\bon\w+\s*=|<base\b|<iframe\b|<object\b|<form\b|javascript:|\bdownload\s*(?:=|>|\s)|target\s*=\s*["']_blank|http-equiv\s*=\s*["']Content-Security-Policy/i.test(source)) throw Error('入口含禁止的标记');
    for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!match[1].startsWith('./') || !names.includes(match[1].slice(2))) throw Error('资源缺失：' + match[1]);
    }
    if (!/^<!doctype html>/i.test(source) || !/<html\s+lang=["']zh-CN["']/i.test(source) || !/charset=["']UTF-8/i.test(source) ||
        !/width=device-width/.test(source) || !/initial-scale=1\.0/.test(source) || !/viewport-fit=cover/.test(source)) throw Error('入口缺少必要的文档或视口声明');
  }
}
function build() {
  fs.mkdirSync(out, {recursive:true});
  fs.mkdirSync(path.dirname(release), {recursive:true});
  for (const file of fs.readdirSync(out)) {
    if (!names.includes(file)) throw Error('构建目录存在未知文件：' + file);
  }
  for (const name of names) {
    const source = fs.readFileSync(path.join(root, 'src', name), 'utf8');
    validateSource(name, source);
    if (name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', name)]);
      if (result.status !== 0) throw Error(result.stderr.toString());
    }
    fs.writeFileSync(path.join(out, name), source);
  }
  // Recreate only this release artifact; never append stale entries to an existing archive.
  if (fs.existsSync(release)) fs.unlinkSync(release);
  const zipped = spawnSync('zip', ['-q', release, ...names], {cwd:out});
  if (zipped.status !== 0) throw Error(zipped.stderr.toString());
  const bytes = fs.statSync(release).size;
  if (bytes > 10 * 1024 * 1024) throw Error('ZIP 超过 10 MiB');
  console.log(path.relative(root, release) + ' · ' + (bytes / 1024).toFixed(1) + ' KiB');
}
module.exports = {validateSource};
if (require.main === module) build();
