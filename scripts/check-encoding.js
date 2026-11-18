/* Kiểm tra HTML/CSS/JS có bị lỗi mã hóa (mojibake) hay không. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (['node_modules', '.git', 'data', 'scripts'].includes(e.name)) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|css|js|md)$/.test(e.name)) files.push(p);
  });
})(root);

// Chuỗi mojibake điển hình khi UTF-8 bị đọc như Windows-1252
const MOJIBAKE = /\u00C3[\u00A1-\u00BF\u2018\u2019\u201C\u201D\u2013\u2014\u2026]|\u00C4\u2018|\u00E1\u00BB|\u00E1\u00BA|\u00C2\u00BB|\u00E2\u20AC/;

const bad = files.filter((f) => MOJIBAKE.test(fs.readFileSync(f, 'utf8')));
console.log(bad.length
  ? 'Bị lỗi mã hóa:\n' + bad.map((f) => path.relative(root, f)).join('\n')
  : `Không có tệp bị lỗi mã hóa (đã kiểm tra ${files.length} tệp).`);
process.exitCode = bad.length ? 1 : 0;
