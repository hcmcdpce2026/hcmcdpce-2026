/**
 * content-types.js – Sáu nhóm nội dung độc lập của CMS.
 *
 *  1. Tin tức              → articles + categories(group_key = 'news' | 'statistics')
 *  2. Tuyên truyền-Giáo dục → articles + categories(group_key = 'education')
 *  3. Sự kiện              → public_events
 *  4. Pháp luật            → legal_documents
 *  5. Cơ quan - Đơn vị     → public_agencies
 *  6. Cơ sở y tế - Tư vấn  → support_facilities
 *
 * Service này chỉ dùng để NẠP / GỠ dữ liệu mẫu phục vụ kiểm thử. Mọi bản ghi
 * do nó tạo đều mang `data_source = 'demo'` và `is_seed_data = 1` để có thể
 * nhận diện chính xác và xoá sạch khi hoàn thành kiểm thử.
 *
 * Chạy:
 *   node server/db/content-types.js --demo     # nạp dữ liệu mẫu
 *   node server/db/content-types.js --purge    # xoá dữ liệu mẫu (mặc định chỉ báo cáo)
 *   node server/db/content-types.js --purge --yes
 */
'use strict';

const { getDb } = require('../lib/db');

const BATCH_TAG = 'DEMO-CT';          // đánh dấu lô dữ liệu mẫu
const DEMO_SOURCE = 'demo';

const now = () => new Date().toISOString();
const day = (offset, hour = 9, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const date = (offset) => day(offset).slice(0, 10);

/* ---------------------------------------------------------------------------
 * Nội dung mẫu: chỉ là cấu trúc minh hoạ, mang nhãn "mẫu" để không bị nhầm
 * với dữ liệu thật và không chứa thông tin liên hệ giả mạo cơ quan, cơ sở y tế.
 * ------------------------------------------------------------------------- */

const DEMO_CATEGORIES = [
  { id: 'demo-cat-news', name: '[Mẫu] Tin chỉ đạo', slug: 'mau-tin-chi-dao', group: 'news', order: 1 },
  { id: 'demo-cat-news-2', name: '[Mẫu] Cảnh báo - Thông tin', slug: 'mau-canh-bao-thong-tin', group: 'news', order: 2 },
  { id: 'demo-cat-news-3', name: '[Mẫu] Hoạt động địa bàn', slug: 'mau-hoat-dong-dia-ban', group: 'news', order: 3 },
  { id: 'demo-cat-edu', name: '[Mẫu] Tuyên truyền - Giáo dục', slug: 'mau-tuyen-truyen-giao-duc', group: 'education', order: 1 },
  { id: 'demo-cat-edu-2', name: '[Mẫu] Học đường', slug: 'mau-hoc-duong', group: 'education', order: 2 },
];

const DEMO_ARTICLES = [
  { id: 'demo-art-news-1', cat: 'demo-cat-news', group: 'news', title: '[Mẫu] Bài tin tức kiểm thử – Triển khai kế hoạch tháng', status: 'published', days: -1 },
  { id: 'demo-art-news-2', cat: 'demo-cat-news-2', group: 'news', title: '[Mẫu] Bài tin tức kiểm thử – Cảnh báo thủ đoạn mới', status: 'published', days: -3 },
  { id: 'demo-art-news-3', cat: 'demo-cat-news', group: 'news', title: '[Mẫu] Bài nháp kiểm thử – Không hiển thị công khai', status: 'draft', days: -2 },
  /* Thêm bài đã xuất bản để kiểm tra cột phải khi có đủ 2 và đủ 3 bài */
  { id: 'demo-art-news-4', cat: 'demo-cat-news-3', group: 'news', title: '[Mẫu] Bài tin tức kiểm thử – Hoạt động tại địa bàn', status: 'published', days: -5 },
  { id: 'demo-art-news-5', cat: 'demo-cat-news-2', group: 'news', title: '[Mẫu] Bài tin tức kiểm thử – Thông tin tuyên truyền tháng', status: 'published', days: -7 },
  { id: 'demo-art-edu-1', cat: 'demo-cat-edu', group: 'education', title: '[Mẫu] Chuyên đề tuyên truyền – Nhận diện nguy cơ', status: 'published', days: -1 },
  { id: 'demo-art-edu-2', cat: 'demo-cat-edu-2', group: 'education', title: '[Mẫu] Chuyên đề tuyên truyền – Kỹ năng học đường', status: 'published', days: -2 },
  { id: 'demo-art-edu-3', cat: 'demo-cat-edu', group: 'education', title: '[Mẫu] Chuyên đề tuyên truyền – Gia đình đồng hành', status: 'published', days: -4 },
  { id: 'demo-art-edu-4', cat: 'demo-cat-edu', group: 'education', title: '[Mẫu] Chuyên đề nháp – Chưa xuất bản', status: 'draft', days: -1 },
];

const DEMO_LEGAL = [
  { id: 'demo-law-1', code: 'demo-73-2021', number: '73/2021/QH14', title: '[Mẫu] Văn bản pháp luật kiểm thử – Luật', type: 'luat', effect: 'in_effect', issued: date(-400) },
  { id: 'demo-law-2', code: 'demo-105-2021', number: '105/2021/NĐ-CP', title: '[Mẫu] Văn bản pháp luật kiểm thử – Nghị định', type: 'nghi-dinh', effect: 'in_effect', issued: date(-380) },
  { id: 'demo-law-3', code: 'demo-expired', number: '00/2000/NĐ-CP', title: '[Mẫu] Văn bản kiểm thử – Đã hết hiệu lực', type: 'nghi-dinh', effect: 'expired', issued: date(-2000) },
];

const DEMO_AGENCIES = [
  { id: 'demo-ag-1', name: '[Mẫu] Cơ quan kiểm thử – Cấp Thành phố', role: 'coordination', level: 'thanh-pho', order: 1 },
  { id: 'demo-ag-2', name: '[Mẫu] Cơ quan kiểm thử – Sở, ngành', role: 'health', level: 'so-nganh', order: 2 },
  { id: 'demo-ag-3', name: '[Mẫu] Cơ quan kiểm thử – Đoàn thể', role: 'association', level: 'thanh-pho', order: 3 },
  { id: 'demo-ag-4', name: '[Mẫu] Cơ quan kiểm thử – Địa bàn cơ sở', role: 'local', level: 'phuong-xa', order: 4 },
];

const DEMO_EVENTS = [
  { id: 'demo-ev-1', title: '[Mẫu] Sự kiện kiểm thử – Sắp diễn ra', type: 'truyen-thong', start: day(5), end: day(5, 11), status: 'upcoming' },
  { id: 'demo-ev-2', title: '[Mẫu] Sự kiện kiểm thử – Đang diễn ra', type: 'tap-huan', start: day(-1), end: day(1), status: 'ongoing' },
  { id: 'demo-ev-3', title: '[Mẫu] Sự kiện kiểm thử – Đã kết thúc', type: 'hoi-thao', start: day(-20), end: day(-20, 11), status: 'past' },
  { id: 'demo-ev-4', title: '[Mẫu] Sự kiện kiểm thử – Chưa công khai', type: 'truyen-thong', start: day(9), end: day(9, 11), status: 'upcoming', publish: 'draft' },
];

const DEMO_SUPPORT = [
  {
    id: 'demo-sf-1', code: 'DEMO-001', name: '[Mẫu] Cơ sở kiểm thử – Điều trị thay thế', type: 'methadone',
    district: 'Quận thử nghiệm', ward: 'Phường thử nghiệm', lat: 10.7769, lng: 106.7009,
    services: ['Điều trị nghiện các chất dạng thuốc phiện bằng thuốc thay thế'],
  },
  {
    id: 'demo-sf-2', code: 'DEMO-002', name: '[Mẫu] Cơ sở kiểm thử – Điểm tư vấn', type: 'tu-van',
    district: 'Quận thử nghiệm', ward: 'Phường thử nghiệm 2', lat: 10.78, lng: 106.71,
    services: ['Tư vấn tâm lý', 'Hỗ trợ tái hòa nhập cộng đồng'],
  },
  {
    id: 'demo-sf-3', code: 'DEMO-003', name: '[Mẫu] Cơ sở kiểm thử – Chưa xác minh', type: 'co-so',
    district: 'Huyện thử nghiệm', ward: '', lat: null, lng: null,
    services: ['Cai nghiện ma túy'], publish: 'pending',
  },
];

/* ---------------------------------------------------------------------------
 * Thao tác
 * ------------------------------------------------------------------------- */

function deleteDemoData(db) {
  const where = `data_source = '${DEMO_SOURCE}'`;
  const counts = {};
  const one = (label, sql, params = []) => {
    const r = db.prepare(sql).run(...params);
    counts[label] = (counts[label] || 0) + Number(r.changes || 0);
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    one('articles', `DELETE FROM articles WHERE ${where}`);
    one('categories', `DELETE FROM categories WHERE ${where}`);
    one('legal_documents', `DELETE FROM legal_documents WHERE ${where}`);
    one('public_agencies', `DELETE FROM public_agencies WHERE ${where}`);
    one('public_events', `DELETE FROM public_events WHERE ${where}`);
    one('support_facilities', `DELETE FROM support_facilities WHERE ${where}`);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
  return counts;
}

const DEMO_META = { data_source: DEMO_SOURCE, is_seed_data: 1 };

/**
 * Chèn một bản ghi mẫu. Ghép cột với giá trị qua cùng một danh sách nên không
 * thể lệch số placeholder; các cột đánh dấu nguồn dữ liệu luôn được gán thống nhất.
 */
function insertRow(db, table, values) {
  const row = Object.assign({ environment: process.env.APP_ENV || 'development' }, values, DEMO_META);
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => row[k]));
}

function seedDemoData(db) {
  const ts = now();
  const env = process.env.APP_ENV || 'development';
  const counts = {};

  db.exec('BEGIN IMMEDIATE');
  try {
    DEMO_CATEGORIES.forEach((c) => {
      db.prepare(`INSERT OR REPLACE INTO categories (id, name, slug, parent_id, description, group_key, status,
          sort_order, data_source, is_seed_data, environment, created_at, updated_at, created_by)
        VALUES (?,?,?,NULL,?,?,'active',?,?,1,?,?,?,'content-types')`)
        .run(c.id, c.name, c.slug, 'Chuyên mục mẫu dùng cho kiểm thử luồng CMS → Công khai.',
          c.group, c.order, DEMO_SOURCE, env, ts, ts);
    });
    counts.categories = DEMO_CATEGORIES.length;

    DEMO_ARTICLES.forEach((a) => {
      const published = a.status === 'published';
      insertRow(db, 'articles', {
        id: a.id, title: a.title, slug: a.id,
        excerpt: `${a.title} — mô tả ngắn dùng cho kiểm thử.`,
        body: `<p>${a.title}</p><p>Nội dung chi tiết mẫu phục vụ kiểm thử hiển thị trên trang công khai.</p>`,
        category_id: a.cat, status: a.status, author_name: 'Ban Biên tập (mẫu)',
        source: 'Nguồn kiểm thử', tags: JSON.stringify(['Kiểm thử', 'Dữ liệu mẫu']),
        published_at: published ? day(a.days) : null,
        created_at: day(a.days, 8), updated_at: ts, created_by: 'content-types',
      });
    });
    counts.articles = DEMO_ARTICLES.length;

    DEMO_LEGAL.forEach((l) => {
      insertRow(db, 'legal_documents', {
        id: l.id, code: l.code, title: l.title, slug: l.id, doc_number: l.number, doc_type: l.type,
        legal_field: 'Phòng, chống ma túy', issued_at: l.issued, effective_at: l.issued,
        expiry_at: l.effect === 'expired' ? date(-100) : null, effect_status: l.effect,
        issuer: '[Mẫu] Cơ quan ban hành (kiểm thử)', summary: 'Trích yếu văn bản mẫu dùng cho kiểm thử.',
        content: '<p>Nội dung văn bản mẫu.</p>', created_at: ts, updated_at: ts, created_by: 'content-types',
      });
    });
    counts.legal_documents = DEMO_LEGAL.length;

    DEMO_AGENCIES.forEach((a) => {
      insertRow(db, 'public_agencies', {
        id: a.id, name: a.name, slug: a.id, short_name: `${a.name} (viết tắt)`,
        role_type: a.role, management_level: a.level,
        description: 'Mô tả mẫu phục vụ kiểm thử danh bạ cơ quan.',
        functions_text: 'Chức năng, nhiệm vụ mẫu (kiểm thử).', sort_order: a.order,
        status: 'active', created_at: ts, updated_at: ts,
      });
    });
    counts.public_agencies = DEMO_AGENCIES.length;

    DEMO_EVENTS.forEach((e) => {
      insertRow(db, 'public_events', {
        id: e.id, title: e.title, slug: e.id, category: e.type, event_type: e.type,
        start_at: e.start, end_at: e.end, location: '[Mẫu] Địa điểm kiểm thử',
        organizer: '[Mẫu] Đơn vị tổ chức (kiểm thử)', co_organizer: '',
        summary: 'Mô tả ngắn sự kiện mẫu.', content: '<p>Nội dung sự kiện mẫu.</p>',
        status: e.status, publish_status: e.publish || 'published',
        created_at: ts, updated_at: ts,
      });
    });
    counts.public_events = DEMO_EVENTS.length;

    DEMO_SUPPORT.forEach((s) => {
      insertRow(db, 'support_facilities', {
        id: s.id, code: s.code, name: s.name, type: s.type,
        managing_org: '[Mẫu] Đơn vị quản lý (kiểm thử)', district: s.district, ward: s.ward,
        city: 'Thành phố Hồ Chí Minh', address: `[Mẫu] Địa chỉ kiểm thử – ${s.district}`,
        latitude: s.lat, longitude: s.lng, hours: 'Trong giờ hành chính (mẫu)',
        services: JSON.stringify(s.services), audience: 'Người có nhu cầu hỗ trợ (mẫu)',
        scope: 'Phạm vi hỗ trợ mẫu.', source: 'Nguồn dữ liệu mẫu – không phải thông tin xác minh.',
        verified_at: date(-5), status: 'active', publish_status: s.publish || 'published',
        created_at: ts, updated_at: ts,
      });
    });
    counts.support_facilities = DEMO_SUPPORT.length;

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
  return counts;
}

/* ---------------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------------- */

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const db = getDb();
  try {
    if (args.has('--demo') || args.has('--seed')) {
      const counts = seedDemoData(db);
      console.log('Đã nạp dữ liệu mẫu (data_source = ' + DEMO_SOURCE + ', lô ' + BATCH_TAG + '):');
      Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
      console.log('\nDữ liệu mẫu KHÔNG dùng cho môi trường thật. Gỡ bằng:');
      console.log('  node server/db/content-types.js --purge --yes');
    } else if (args.has('--purge')) {
      const preview = db.prepare(`SELECT 'articles' AS t, COUNT(*) AS c FROM articles WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'categories', COUNT(*) FROM categories WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'legal_documents', COUNT(*) FROM legal_documents WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'public_agencies', COUNT(*) FROM public_agencies WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'public_events', COUNT(*) FROM public_events WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'support_facilities', COUNT(*) FROM support_facilities WHERE data_source = '${DEMO_SOURCE}'`).all();
      preview.forEach((r) => console.log(`  ${r.t.padEnd(22)} ${r.c}`));
      if (!args.has('--yes')) {
        console.log('\nĐây là chế độ báo cáo. Chạy lại với --yes để xoá dữ liệu mẫu.');
      } else {
        const counts = deleteDemoData(db);
        console.log('Đã xoá dữ liệu mẫu:', JSON.stringify(counts));
      }
    } else {
      console.log(`Nạp / gỡ dữ liệu mẫu cho 6 nhóm nội dung CMS

  node server/db/content-types.js --demo          # nạp dữ liệu mẫu
  node server/db/content-types.js --purge         # xem số bản ghi mẫu
  node server/db/content-types.js --purge --yes   # xoá dữ liệu mẫu
`);
    }
  } catch (err) {
    console.error('Lỗi:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { seedDemoData, deleteDemoData, BATCH_TAG, DEMO_SOURCE };
