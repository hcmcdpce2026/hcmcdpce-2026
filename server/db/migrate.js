/**
 * migrate.js – Tạo/khởi tạo cấu trúc cơ sở dữ liệu (idempotent).
 * Chạy:  node server/db/migrate.js
 * Áp dụng toàn bộ tệp server/db/schema.sql và ghi nhận vào bảng schema_migrations.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

addColumnIfMissing('organizations', 'management_level', 'TEXT');

/* ---------------------------------------------------------------------------
 * 003 – Danh mục nghiệp vụ động + loại bỏ trường quận/huyện
 * Chỉ chuyển các mã đang được bản ghi nghiệp vụ sử dụng; không tạo lựa chọn mẫu.
 * Giá trị địa bàn cũ được ghép vào địa chỉ trước khi bỏ cột district.
 * ------------------------------------------------------------------------- */
const LEGACY_CATEGORY_LABELS = {
  category_group: { news: 'Tin tức', education: 'Tuyên truyền - Giáo dục' },
  doc_type: {
    luat: 'Luật', 'bo-luat': 'Bộ luật', 'nghi-dinh': 'Nghị định',
    'thong-tu': 'Thông tư', 'chi-thi': 'Chỉ thị', 'van-ban-tphcm': 'Văn bản TP.HCM',
  },
  legal_field: {
    'phong-chong-ma-tuy': 'Phòng, chống ma túy', 'hinh-su': 'Hình sự',
    'hanh-chinh': 'Hành chính', 'y-te': 'Y tế', 'giao-duc': 'Giáo dục', khac: 'Lĩnh vực khác',
  },
  agency_type: {
    coordination: 'Chỉ đạo & Chuyên trách', enforcement: 'Thực thi pháp luật',
    health: 'Y tế & Điều trị', education: 'Giáo dục - Tuyên truyền',
    association: 'Mặt trận & Đoàn thể', local: 'Chính quyền cơ sở',
    rehab: 'Cơ sở cai nghiện', treatment: 'Cơ sở điều trị',
  },
  management_level: {
    'thanh-pho': 'Cấp Thành phố', 'so-nganh': 'Cấp sở, ngành',
    'quan-huyen': 'Cấp quận, huyện', 'phuong-xa': 'Cấp phường, xã',
  },
  facility_type: {
    methadone: 'Cơ sở điều trị Methadone', 'tu-van': 'Điểm tư vấn, hỗ trợ',
    'co-so': 'Cơ sở điều trị, cai nghiện', 'co-so-tp': 'Cơ sở cai nghiện công lập',
    'cong-dong': 'Tổ tư vấn cộng đồng', 'duong-day-nong': 'Đường dây nóng',
  },
  organization_type: {
    coordination: 'Cơ quan phối hợp', department: 'Cơ quan chuyên môn',
    association: 'Tổ chức đoàn thể', ward: 'Chính quyền cơ sở', unit: 'Đơn vị',
  },
};

const CATEGORY_SOURCES = [
  ['category_group', 'categories', 'group_key'],
  ['doc_type', 'legal_documents', 'doc_type'],
  ['legal_field', 'legal_documents', 'legal_field'],
  ['agency_type', 'public_agencies', 'role_type'],
  ['management_level', 'public_agencies', 'management_level'],
  ['management_level', 'organizations', 'management_level'],
  ['facility_type', 'support_facilities', 'type'],
  ['organization_type', 'organizations', 'type'],
];

CATEGORY_SOURCES.forEach(([type, table, column]) => {
  if (!columnExists(table, column)) return;
  const values = db.prepare(`SELECT DISTINCT ${column} AS value FROM ${table}
    WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''`).all();
  values.forEach(({ value }, index) => {
    const name = (LEGACY_CATEGORY_LABELS[type] || {})[value] || value;
    const idHash = crypto.createHash('sha1').update(`${type}:${value}`).digest('hex').slice(0, 20);
    db.prepare(`INSERT OR IGNORE INTO system_categories
      (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 'migration')`)
      .run(`sc-${idHash}`, type, value, name, index, new Date().toISOString(), new Date().toISOString());
  });
});

if (columnExists('support_facilities', 'district')) {
  db.exec(`UPDATE support_facilities
    SET address = CASE
      WHEN address IS NULL OR TRIM(address) = '' THEN district
      WHEN INSTR(address, district) > 0 THEN address
      ELSE district || ', ' || address
    END
    WHERE district IS NOT NULL AND TRIM(district) <> ''`);
  db.exec('ALTER TABLE support_facilities DROP COLUMN district');
  console.log('  ✓ Đã chuyển địa bàn cũ vào địa chỉ và bỏ support_facilities.district');
}

const id3 = '003-dynamic-categories-remove-district';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id3)) {
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id3, new Date().toISOString());
  console.log('  ✓ Ghi nhận migration', id3);
} else {
  console.log('  • Migration', id3, 'đã áp dụng trước đó');
}

/* ---------------------------------------------------------------------------
 * 004 – Nhóm nội dung liên hệ do CMS quản lý
 * ------------------------------------------------------------------------- */
const categoriesTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'system_categories'").get();
if (categoriesTable && !categoriesTable.sql.includes("'contact_topic'")) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE system_categories_new (
      id              TEXT PRIMARY KEY,
      category_type   TEXT NOT NULL CHECK (category_type IN (
        'category_group', 'doc_type', 'legal_field', 'agency_type',
        'management_level', 'facility_type', 'organization_type', 'contact_topic'
      )),
      code            TEXT NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      created_by      TEXT,
      updated_by      TEXT,
      UNIQUE (category_type, code)
    )`);
    db.exec(`INSERT INTO system_categories_new
      (id, category_type, code, name, description, sort_order, status, created_at, updated_at, created_by, updated_by)
      SELECT id, category_type, code, name, description, sort_order, status, created_at, updated_at, created_by, updated_by
      FROM system_categories`);
    db.exec('DROP TABLE system_categories');
    db.exec('ALTER TABLE system_categories_new RENAME TO system_categories');
    db.exec(`CREATE UNIQUE INDEX uq_system_categories_type_name
      ON system_categories(category_type, name COLLATE NOCASE)`);
    db.exec(`CREATE INDEX idx_system_categories_status_order
      ON system_categories(category_type, status, sort_order, name)`);
    db.exec('COMMIT');
    console.log('  ✓ Mở rộng nhóm danh mục hệ thống contact_topic');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
}

addColumnIfMissing('submissions', 'topic_code', 'TEXT');

const id4 = '004-contact-topic-categories';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id4)) {
  const topics = [
    ['tu-van-cai-nghien', 'Tư vấn quy trình cai nghiện tự nguyện & điều trị Methadone'],
    ['hoi-dap-phap-luat', 'Hỏi đáp quy định pháp luật về phòng, chống ma túy'],
    ['phan-anh-cong-dong', 'Phản ánh, kiến nghị bảo đảm an toàn khu dân cư'],
    ['phoi-hop-tuyen-truyen', 'Đề xuất phối hợp tuyên truyền tại trường học / cơ quan'],
    ['gop-y-cong-thong-tin', 'Góp ý nội dung Chuyên trang điện tử'],
  ];
  const ts = new Date().toISOString();
  const insertTopic = db.prepare(`INSERT OR IGNORE INTO system_categories
    (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
    VALUES (?, 'contact_topic', ?, ?, ?, 'active', ?, ?, 'migration')`);
  topics.forEach(([code, name], index) => {
    insertTopic.run(`sc-contact-topic-${code}`, code, name, index, ts, ts);
  });
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id4, ts);
  console.log('  ✓ Nạp nhóm lựa chọn liên hệ vào danh mục CMS');
} else {
  console.log('  • Migration', id4, 'đã áp dụng trước đó');
}

const id5 = '005-legal-field-categories';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id5)) {
  const fields = [
    ['luat-chung', 'Quy định chung & Trách nhiệm'],
    ['cai-nghien', 'Cai nghiện & Quản lý sau cai'],
    ['xu-phat', 'Xử phạt vi phạm & Hình sự'],
    ['dia-phuong', 'Kế hoạch triển khai tại TP.HCM'],
  ];
  const ts = new Date().toISOString();
  const insertField = db.prepare(`INSERT OR IGNORE INTO system_categories
    (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
    VALUES (?, 'legal_field', ?, ?, ?, 'active', ?, ?, 'migration')`);
  fields.forEach(([code, name], index) => {
    insertField.run(`sc-legal-field-${code}`, code, name, index, ts, ts);
  });
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id5, ts);
  console.log('  ✓ Nạp lĩnh vực pháp luật hiện hành vào danh mục CMS');
} else {
  console.log('  • Migration', id5, 'đã áp dụng trước đó');
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log(`  ✓ Tổng số bảng: ${tables.length}`);
console.log('═══════════════════════════════');
console.log('  Hoàn tất. Bước tiếp theo: npm run db:seed');
