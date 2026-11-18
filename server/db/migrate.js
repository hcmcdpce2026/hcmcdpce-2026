/**
 * migrate.js – Tạo/khởi tạo cấu trúc cơ sở dữ liệu (idempotent).
 * Chạy:  node server/db/migrate.js
 * Áp dụng toàn bộ tệp server/db/schema.sql và ghi nhận vào bảng schema_migrations.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDb, DB_FILE } = require('../lib/db');

const db = getDb();

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumnIfMissing(table, column, definition) {
  if (columnExists(table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`  + ${table}.${column}`);
  return true;
}

console.log('═══════════════════════════════');
console.log('  KHỞI TẠO CƠ SỞ DỮ LIỆU CỔNG THÔNG TIN');
console.log('═══════════════════════════════');
console.log('  Tệp:', path.relative(path.resolve(__dirname, '..', '..'), DB_FILE));

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
console.log('  ✓ Đã áp dụng schema.sql');

/* Bổ sung cột phân biệt nguồn dữ liệu nếu schema cũ chưa có */
console.log('  Đối chiếu các cột theo dõi nguồn dữ liệu…');
['data_source', 'is_seed_data', 'environment'].forEach((col) => {
  ['articles', 'categories', 'tasks', 'reports', 'documents', 'submissions', 'proposals'].forEach((table) => {
    const def = { data_source: "TEXT NOT NULL DEFAULT 'operational'", is_seed_data: 'INTEGER NOT NULL DEFAULT 0', environment: "TEXT NOT NULL DEFAULT 'development'" }[col];
    addColumnIfMissing(table, col, def);
  });
});

/* Ghi nhận migration */
const id = '001-init-schema';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) {
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id, new Date().toISOString());
  console.log('  ✓ Ghi nhận migration', id);
} else {
  console.log('  • Migration', id, 'đã áp dụng trước đó');
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log(`  ✓ Tổng số bảng: ${tables.length}`);
console.log('═══════════════════════════════');
console.log('  Hoàn tất. Bước tiếp theo: npm run db:seed');
