const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1. 检查是否残留合并冲突标记
const conflictMarkerRegex = /^(<{7} |={7}|>{7} )/m;
if (conflictMarkerRegex.test(indexHtml)) {
  console.error('❌ 发现合并冲突标记');
  process.exit(1);
}

// 2. 提取 index.html 引用的本地 CSS/JS 资源
const cssRefs = [...indexHtml.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
const jsRefs = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
const refs = [...cssRefs, ...jsRefs].filter(r => !r.startsWith('http'));

let missing = 0;
for (const ref of refs) {
  const filePath = path.join(ROOT, ref);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 缺失资源文件: ${ref}`);
    missing++;
  } else {
    console.log(`✅ ${ref}`);
  }
}

// 3. 检查关键 JS 文件语法
const jsFiles = [
  'js/main.js',
  'js/dock.js',
  'js/menu.js',
  'js/window.js',
  'js/apps/finder.js',
  'js/apps/safari.js',
  'js/apps/terminal.js',
  'js/apps/settings.js'
];

for (const file of jsFiles) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 缺失 JS 文件: ${file}`);
    missing++;
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (conflictMarkerRegex.test(content)) {
    console.error(`❌ ${file} 中发现合并冲突标记`);
    missing++;
  }
  try {
    new Function(content);
    console.log(`✅ ${file} 语法正常`);
  } catch (err) {
    console.error(`❌ ${file} 语法错误: ${err.message}`);
    missing++;
  }
}

if (missing > 0) {
  console.error(`\n❌ 检查失败，共 ${missing} 个问题`);
  process.exit(1);
}

console.log('\n✅ 所有检查通过');
