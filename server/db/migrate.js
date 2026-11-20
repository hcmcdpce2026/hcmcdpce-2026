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
/* Logo cơ quan: cột bổ sung cho phiên bản có upload ảnh trong CMS */
if (addColumnIfMissing('public_agencies', 'logo_url', 'TEXT')) {
  console.log('  ✓ Thêm cột public_agencies.logo_url');
}

const id = '001-init-schema';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) {
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id, new Date().toISOString());
  console.log('  ✓ Ghi nhận migration', id);
} else {
  console.log('  • Migration', id, 'đã áp dụng trước đó');
}

/* ---------------------------------------------------------------------------
 * 002 – Trường dữ liệu riêng cho từng loại nội dung công khai
 *   Legal documents : slug, lĩnh vực pháp luật, ngày hết hiệu lực, tình trạng
 *                     hiệu lực, trạng thái công khai
 *   Events          : slug, loại sự kiện, đơn vị phối hợp, trạng thái xuất bản
 *   Agencies        : slug, cấp quản lý, chức năng nhiệm vụ, cơ cấu tổ chức,
 *                     người đứng đầu
 *   Support         : mã định danh, đơn vị quản lý, phường/xã, toạ độ, liên hệ,
 *                     dịch vụ, đối tượng, nguồn, ngày xác minh, kiểm duyệt
 * Idempotent: chỉ thêm cột còn thiếu, giữ nguyên dữ liệu đang vận hành.
 * ------------------------------------------------------------------------- */
const CONTENT_TYPE_COLUMNS = {
  legal_documents: [
    ['slug', 'TEXT'], ['legal_field', 'TEXT'], ['expiry_at', 'TEXT'],
    ['effect_status', "TEXT NOT NULL DEFAULT 'in_effect'"],
    ['is_public', 'INTEGER NOT NULL DEFAULT 1'], ['status', "TEXT NOT NULL DEFAULT 'active'"],
  ],
  public_events: [
    ['slug', 'TEXT'], ['event_type', 'TEXT'], ['co_organizer', 'TEXT'],
    ['publish_status', "TEXT NOT NULL DEFAULT 'published'"],
  ],
  public_agencies: [
    ['slug', 'TEXT'], ['management_level', 'TEXT'], ['functions_text', 'TEXT'],
    ['structure', 'TEXT'], ['head_name', 'TEXT'],
  ],
  support_facilities: [
    ['code', 'TEXT'], ['managing_org', 'TEXT'], ['org_id', 'TEXT'], ['ward', 'TEXT'],
    ['city', 'TEXT'], ['latitude', 'REAL'], ['longitude', 'REAL'], ['email', 'TEXT'],
    ['website', 'TEXT'], ['contact_person', 'TEXT'], ['services', 'TEXT'],
    ['audience', 'TEXT'], ['scope', 'TEXT'], ['conditions', 'TEXT'], ['procedures', 'TEXT'],
    ['cost_note', 'TEXT'], ['image_url', 'TEXT'], ['source', 'TEXT'], ['verified_at', 'TEXT'],
    ['publish_status', "TEXT NOT NULL DEFAULT 'published'"],
  ],
};

console.log('  Đối chiếu trường dữ liệu theo loại nội dung…');
Object.keys(CONTENT_TYPE_COLUMNS).forEach((table) => {
  CONTENT_TYPE_COLUMNS[table].forEach(([col, def]) => addColumnIfMissing(table, col, def));
});

const id2 = '002-content-type-fields';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id2)) {
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id2, new Date().toISOString());
  console.log('  ✓ Ghi nhận migration', id2);
} else {
  console.log('  • Migration', id2, 'đã áp dụng trước đó');
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log(`  ✓ Tổng số bảng: ${tables.length}`);
console.log('═══════════════════════════════');
console.log('  Hoàn tất. Bước tiếp theo: npm run db:seed');
