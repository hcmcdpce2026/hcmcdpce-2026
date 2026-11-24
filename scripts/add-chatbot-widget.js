/* Thêm widget trợ lý ảo (chatbot) vào tất cả trang PUBLIC. Chạy một lần. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const files = [path.join(ROOT, 'index.html')]
  .concat(fs.readdirSync(path.join(ROOT, 'pages', 'public'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(ROOT, 'pages', 'public', name)));

let changed = 0;
files.forEach((file) => {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('js/chatbot.js')) return;
  const inSubdir = path.basename(path.dirname(file)) === 'public';
  const prefix = inSubdir ? '../../' : '';
  const cssTag = `    <link rel="stylesheet" href="${prefix}css/chatbot.css">\n`;
  const jsTag = `    <script src="${prefix}js/chatbot.js" defer></script>\n`;

  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) throw new Error(`Không thấy </head> trong ${file}`);
  html = html.slice(0, headEnd) + cssTag + html.slice(headEnd);

  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd === -1) throw new Error(`Không thấy </body> trong ${file}`);
  html = html.slice(0, bodyEnd) + jsTag + html.slice(bodyEnd);

  fs.writeFileSync(file, html);
  changed += 1;
  console.log(`Đã thêm widget: ${path.relative(ROOT, file)}`);
});

console.log(`Tổng: ${changed}/${files.length} tệp được cập nhật.`);
