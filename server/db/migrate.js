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
const {
  CATEGORY_GROUP_ALIASES,
  CATEGORY_GROUP_LABELS,
} = require('../lib/category-groups');

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
const categoryGroupLabels = Object.assign({}, CATEGORY_GROUP_LABELS);
Object.entries(CATEGORY_GROUP_ALIASES).forEach(([legacyCode, canonicalCode]) => {
  categoryGroupLabels[legacyCode] = CATEGORY_GROUP_LABELS[canonicalCode];
});

const LEGACY_CATEGORY_LABELS = {
  category_group: categoryGroupLabels,
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

const id6 = '006-canonical-category-groups';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id6)) {
  const ts = new Date().toISOString();
  const findCategoryGroup = db.prepare(`SELECT * FROM system_categories
    WHERE category_type = 'category_group' AND code = ?`);
  const findName = db.prepare(`SELECT id FROM system_categories
    WHERE category_type = 'category_group' AND name = ? COLLATE NOCASE AND id NOT IN (?, ?)`);
  const countReferences = db.prepare('SELECT COUNT(*) AS count FROM categories WHERE group_key = ?');
  const updateReferences = db.prepare('UPDATE categories SET group_key = ? WHERE group_key = ?');
  const deleteCategoryGroup = db.prepare('DELETE FROM system_categories WHERE id = ?');
  const insertCategoryGroup = db.prepare(`INSERT INTO system_categories
    (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
    VALUES (?, 'category_group', ?, ?, ?, 'active', ?, ?, 'migration')`);

  db.exec('BEGIN IMMEDIATE');
  try {
    Object.entries(CATEGORY_GROUP_ALIASES).forEach(([legacyCode, canonicalCode]) => {
      const legacyRow = findCategoryGroup.get(legacyCode);
      const canonicalRow = findCategoryGroup.get(canonicalCode);
      const referenceCount = countReferences.get(legacyCode).count;
      updateReferences.run(canonicalCode, legacyCode);
      const label = CATEGORY_GROUP_LABELS[canonicalCode];

      if (legacyRow && canonicalRow) {
        const conflictingName = findName.get(label, canonicalRow.id, legacyRow.id);
        deleteCategoryGroup.run(legacyRow.id);
        db.prepare(`UPDATE system_categories SET name = ?, description = COALESCE(NULLIF(description, ''), ?),
          sort_order = MIN(sort_order, ?), updated_at = ? WHERE id = ?`)
          .run(conflictingName ? canonicalRow.name : label, legacyRow.description,
            legacyRow.sort_order, ts, canonicalRow.id);
      } else if (legacyRow) {
        const conflictingName = findName.get(label, legacyRow.id, legacyRow.id);
        db.prepare(`UPDATE system_categories SET code = ?, name = ?, updated_at = ? WHERE id = ?`)
          .run(canonicalCode, conflictingName ? legacyRow.name : label, ts, legacyRow.id);
      } else if (referenceCount && !canonicalRow) {
        const idHash = crypto.createHash('sha1').update(`category_group:${canonicalCode}`).digest('hex').slice(0, 20);
        insertCategoryGroup.run(`sc-${idHash}`, canonicalCode, label, 0, ts, ts);
      }
    });
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id6, ts);
    db.exec('COMMIT');
    console.log('  ✓ Đồng bộ mã nhóm chuyên mục CMS về mã chuẩn');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
} else {
  console.log('  • Migration', id6, 'đã áp dụng trước đó');
}

/**
 * Bảo đảm mọi loại danh mục hệ thống đã được đăng ký có ít nhất các mã mà
 * dữ liệu thực tế đang dùng, để bộ lọc ở CMS/PUBLIC không bao giờ rỗng vì
 * danh mục chưa được nạp. Chỉ thêm, không sửa/xóa danh mục người dùng đã tạo.
 */
function ensureCatalogueBaseline() {
  const BASELINE = {
    category_group: [
      ['tin-tuc', 'Tin tức'], ['tuyen-truyen-giao-duc', 'Tuyên truyền - Giáo dục'],
      ['phap-luat', 'Pháp luật'], ['su-kien', 'Sự kiện'],
    ],
    doc_type: [
      ['luat', 'Luật'], ['nghi-quyet', 'Nghị quyết'], ['nghi-dinh', 'Nghị định'],
      ['quyet-dinh', 'Quyết định'], ['thong-tu', 'Thông tư'],
    ],
    legal_field: [['phong-chong-toi-pham-ve-ma-tuy', 'Phòng, chống tội phạm về ma túy']],
    agency_type: [
      ['co-quan-hanh-chinh-nha-nuoc', 'Cơ quan hành chính nhà nước'],
      ['co-quan-cong-an', 'Cơ quan Công an'], ['co-quan-y-te', 'Cơ quan Y tế'],
    ],
    management_level: [
      ['trung-uong', 'Trung ương'], ['cap-tinh-thanh-pho', 'Cấp tỉnh, thành phố'],
      ['cap-xa-phuong-dac-khu', 'Cấp xã, phường, đặc khu'],
    ],
    facility_type: [
      ['co-so-cai-nghien-ma-tuy-cong-lap', 'Cơ sở cai nghiện ma túy công lập'],
      ['co-so-dieu-tri-nghien-cac-chat-dang-thuoc-phien-bang-thuoc-thay-the',
        'Cơ sở điều trị nghiện các chất dạng thuốc phiện bằng thuốc thay thế'],
      ['co-so-tu-van-ho-tro-cai-nghien-ma-tuy', 'Cơ sở tư vấn, hỗ trợ cai nghiện ma túy'],
    ],
    organization_type: [
      ['co-quan-nha-nuoc', 'Cơ quan nhà nước'], ['to-chuc-chinh-tri-xa-hoi', 'Tổ chức chính trị - xã hội'],
      ['doanh-nghiep', 'Doanh nghiệp'],
    ],
    contact_topic: [],
    /* Mã trạng thái được dùng trực tiếp trong public_events.status. */
    event_status: [
      ['sap-dien-ra', 'Sắp diễn ra'],
      ['dang-dien-ra', 'Đang diễn ra'],
      ['da-ket-thuc', 'Đã kết thúc'],
      ['tam-dung', 'Tạm dừng'],
      ['da-huy', 'Đã hủy'],
    ],
  };
  const ts = new Date().toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO system_categories
    (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 'migration')`);
  let added = 0;
  Object.entries(BASELINE).forEach(([type, rows]) => {
    rows.forEach(([code, name], index) => {
      const idHash = crypto.createHash('sha1').update(`baseline:${type}:${code}`).digest('hex').slice(0, 20);
      added += Number(insert.run(`sc-${idHash}`, type, code, name, index, ts, ts).changes || 0);
    });
  });
  return added;
}

const ensured = ensureCatalogueBaseline();
if (ensured > 0) console.log(`  ✓ Bổ sung ${ensured} mã danh mục cơ sở còn thiếu`);

/* ---------------------------------------------------------------------------
 * 007 – Trạng thái hoạt động/sự kiện do CMS quản lý (category_type = event_status)
 * Thêm vào CHECK constraint để danh mục này lưu được trong system_categories.
 * ------------------------------------------------------------------------- */
const id7 = '007-event-status-category';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id7)) {
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'system_categories'").get();
  if (tableSql && !tableSql.sql.includes("'event_status'")) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE system_categories_new (
        id              TEXT PRIMARY KEY,
        category_type   TEXT NOT NULL CHECK (category_type IN (
          'category_group', 'doc_type', 'legal_field', 'agency_type',
          'management_level', 'facility_type', 'organization_type', 'contact_topic', 'event_status'
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
      db.exec('CREATE UNIQUE INDEX uq_system_categories_type_name\n        ON system_categories(category_type, name COLLATE NOCASE)');
      db.exec('CREATE INDEX idx_system_categories_status_order\n        ON system_categories(category_type, status, sort_order, name)');
      db.exec('COMMIT');
      console.log('  ✓ Mở rộng nhóm danh mục hệ thống event_status');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
      throw err;
    }
  }
  ensureCatalogueBaseline();
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id7, new Date().toISOString());
} else {
  console.log('  • Migration', id7, 'đã áp dụng trước đó');
}

/* ---------------------------------------------------------------------------
 * 008 – Dùng mã tiếng Việt không dấu cho trạng thái hoạt động/sự kiện.
 * ------------------------------------------------------------------------- */
const id8 = '008-vietnamese-event-status-codes';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id8)) {
  const statuses = [
    ['upcoming', 'sap-dien-ra'],
    ['ongoing', 'dang-trien-khai'],
    ['past', 'da-to-chuc'],
  ];
  const ts = new Date().toISOString();
  const findCategory = db.prepare(`SELECT id FROM system_categories
    WHERE category_type = 'event_status' AND code = ?`);
  const updateEvents = db.prepare('UPDATE public_events SET status = ? WHERE status = ?');
  const updateCategory = db.prepare(`UPDATE system_categories
    SET code = ?, updated_at = ? WHERE id = ?`);
  const deleteCategory = db.prepare('DELETE FROM system_categories WHERE id = ?');

  db.exec('BEGIN IMMEDIATE');
  try {
    statuses.forEach(([oldCode, newCode]) => {
      updateEvents.run(newCode, oldCode);
      const oldRow = findCategory.get(oldCode);
      if (!oldRow) return;
      const newRow = findCategory.get(newCode);
      if (newRow) deleteCategory.run(oldRow.id);
      else updateCategory.run(newCode, ts, oldRow.id);
    });

    const eventsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'public_events'").get();
    if (eventsSql && eventsSql.sql.includes("DEFAULT 'upcoming'")) {
      db.exec(`CREATE TABLE public_events_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT,
        category TEXT,
        event_type TEXT,
        start_at TEXT,
        end_at TEXT,
        location TEXT,
        organizer TEXT,
        co_organizer TEXT,
        summary TEXT,
        content TEXT,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'sap-dien-ra',
        publish_status TEXT NOT NULL DEFAULT 'published',
        data_source TEXT NOT NULL DEFAULT 'seed',
        is_seed_data INTEGER NOT NULL DEFAULT 1,
        environment TEXT NOT NULL DEFAULT 'development',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      db.exec(`INSERT INTO public_events_new
        (id, title, slug, category, event_type, start_at, end_at, location, organizer,
          co_organizer, summary, content, image_url, status, publish_status, data_source,
          is_seed_data, environment, created_at, updated_at)
        SELECT id, title, slug, category, event_type, start_at, end_at, location, organizer,
          co_organizer, summary, content, image_url, status, publish_status, data_source,
          is_seed_data, environment, created_at, updated_at
        FROM public_events`);
      db.exec('DROP TABLE public_events');
      db.exec('ALTER TABLE public_events_new RENAME TO public_events');
    }

    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id8, ts);
    db.exec('COMMIT');
    console.log('  ✓ Đổi mã trạng thái sự kiện sang tiếng Việt không dấu');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
} else {
  console.log('  • Migration', id8, 'đã áp dụng trước đó');
}

/* ---------------------------------------------------------------------------
 * 009 – Chuẩn hóa danh mục trạng thái hoạt động/sự kiện theo 5 trạng thái.
 * ------------------------------------------------------------------------- */
const id9 = '009-event-status-lifecycle';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id9)) {
  const statuses = [
    ['sap-dien-ra', 'Sắp diễn ra'],
    ['dang-dien-ra', 'Đang diễn ra'],
    ['da-ket-thuc', 'Đã kết thúc'],
    ['tam-dung', 'Tạm dừng'],
    ['da-huy', 'Đã hủy'],
  ];
  const replacements = [
    ['dang-trien-khai', 'dang-dien-ra'],
    ['da-to-chuc', 'da-ket-thuc'],
  ];
  const ts = new Date().toISOString();
  const findCategory = db.prepare(`SELECT id FROM system_categories
    WHERE category_type = 'event_status' AND code = ?`);
  const updateEvents = db.prepare('UPDATE public_events SET status = ? WHERE status = ?');
  const updateCategory = db.prepare(`UPDATE system_categories
    SET code = ?, name = ?, updated_at = ? WHERE id = ?`);
  const deleteCategory = db.prepare('DELETE FROM system_categories WHERE id = ?');
  const updateStatusCategory = db.prepare(`UPDATE system_categories
    SET name = ?, sort_order = ?, status = 'active', updated_at = ?
    WHERE category_type = 'event_status' AND code = ?`);
  const insertStatusCategory = db.prepare(`INSERT OR IGNORE INTO system_categories
    (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
    VALUES (?, 'event_status', ?, ?, ?, 'active', ?, ?, 'migration')`);

  db.exec('BEGIN IMMEDIATE');
  try {
    replacements.forEach(([oldCode, newCode]) => {
      updateEvents.run(newCode, oldCode);
      const oldRow = findCategory.get(oldCode);
      if (!oldRow) return;
      const newRow = findCategory.get(newCode);
      if (newRow) deleteCategory.run(oldRow.id);
      else {
        const status = statuses.find(([code]) => code === newCode);
        updateCategory.run(newCode, status[1], ts, oldRow.id);
      }
    });

    statuses.forEach(([code, name], index) => {
      const idHash = crypto.createHash('sha1').update(`baseline:event_status:${code}`).digest('hex').slice(0, 20);
      insertStatusCategory.run(`sc-${idHash}`, code, name, index, ts, ts);
      updateStatusCategory.run(name, index, ts, code);
    });
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id9, ts);
    db.exec('COMMIT');
    console.log('  ✓ Cập nhật đủ 5 trạng thái hoạt động/sự kiện');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
} else {
  console.log('  • Migration', id9, 'đã áp dụng trước đó');
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log(`  ✓ Tổng số bảng: ${tables.length}`);
console.log('═══════════════════════════════');
console.log('  Hoàn tất. Bước tiếp theo: npm run db:seed');
