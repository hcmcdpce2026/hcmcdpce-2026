/**
 * Tạo bản sao SQLite nhất quán bằng WAL checkpoint + copy database.
 * Chạy khi ứng dụng có thể tạm dừng ghi hoặc server đang hoạt động.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getDb, DB_FILE } = require('../lib/db');

const ROOT = path.resolve(__dirname, '..', '..');
const backupDir = path.join(ROOT, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const db = getDb();
db.exec('PRAGMA wal_checkpoint(FULL);');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `portal-${stamp}.sqlite`);
fs.copyFileSync(DB_FILE, target);
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(target));

console.log(`Đã sao lưu database: ${path.relative(ROOT, target)}`);
console.log(`SHA-256: ${hash.digest('hex')}`);
