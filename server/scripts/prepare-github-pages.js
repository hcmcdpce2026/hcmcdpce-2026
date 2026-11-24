/**
 * Chuẩn bị artifact GitHub Pages chỉ chứa PUBLIC.
 * Không sao chép server/, CMS/Workspace, database, credential, backup hoặc uploads/.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'github-pages');

const copy = (source, target) => {
  const src = path.join(ROOT, source);
  const dst = path.join(OUT, target || source);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach((entry) => copy(path.join(source, entry), path.join(target || source, entry)));
  } else {
    fs.copyFileSync(src, dst);
  }
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

['index.html', '404.html'].forEach((file) => copy(file));
copy('assets');
['style.css', 'main.css', 'responsive.css', 'chatbot.css'].forEach((file) => copy(path.join('css', file)));
['api.js', 'main.js', 'public-pages.js', 'article-tags.js', 'chatbot.js'].forEach((file) => copy(path.join('js', file)));
copy('public-data');

const GITHUB_MAX_FILE_BYTES = 100 * 1024 * 1024;
const oversize = [];
const scan = (dir) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (fs.statSync(full).size > GITHUB_MAX_FILE_BYTES) {
      oversize.push(path.relative(OUT, full));
    }
  });
};
scan(OUT);
if (oversize.length) {
  throw new Error(`GitHub Pages artifact có tệp vượt 100 MB:\n${oversize.join('\n')}`);
}
copy('pages/public', 'pages/public');

console.log(`Đã chuẩn bị GitHub Pages public-only: ${path.relative(ROOT, OUT)}`);
