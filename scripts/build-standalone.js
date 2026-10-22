'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {validateSource} = require('./build');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const output = path.join(root, 'release', 'sophie-row-counter-v' + version + '.html');
let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
validateSource('index.html', html);

html = html.replace('<link rel="stylesheet" href="./style.css">', function () {
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
  validateSource('style.css', css);
  return '<style data-source="style.css">\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>';
});

let scriptCount = 0;
html = html.replace(/<script src="\.\/([a-z-]+\.js)"><\/script>/g, function (_, name) {
  const file = path.join(root, 'src', name);
  const js = fs.readFileSync(file, 'utf8');
  validateSource(name, js);
  const syntax = spawnSync(process.execPath, ['--check', file]);
  if (syntax.status !== 0) throw Error(syntax.stderr.toString());
  scriptCount += 1;
  return '<script data-source="' + name + '">\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
});

if (scriptCount !== 7 || /<(?:script|link)\b[^>]*\b(?:src|href)=/i.test(html))
  throw Error('独立 HTML 仍有外置资源或脚本数量不符');
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, html);
console.log(path.relative(root, output) + ' · ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KiB');
