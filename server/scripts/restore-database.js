/**
 * Phục hồi database từ bản sao SQLite.
 * Bắt buộc dừng server trước khi chạy để không ghi đè dữ liệu đang được dùng.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DB_FILE } = require('../lib/db');

const ROOT = path.resolve(__dirname, '..', '..');
const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error('Cách dùng: npm.cmd run db:restore -- <đường-dẫn-bản-sao.sqlite>');
  process.exit(1);
}
const source = path.resolve(ROOT, sourceArg);
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
  console.error('Không tìm thấy bản sao:', source);
  process.exit(1);
}
for (const suffix of ['-wal', '-shm']) {
  const sidecar = `${DB_FILE}${suffix}`;
  if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
}
fs.copyFileSync(source, DB_FILE);
console.log(`Đã phục hồi database từ: ${path.relative(ROOT, source)}`);
console.log(`Database hiện tại: ${path.relative(ROOT, DB_FILE)}`);
