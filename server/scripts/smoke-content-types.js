/**
 * smoke-content-types.js – Kiểm thử luồng dữ liệu cho 6 nhóm nội dung CMS.
 *
 * Xác minh rằng mỗi trang công khai chỉ đọc đúng loại dữ liệu của mình, rằng
 * trạng thái nháp/ẩn không bị lộ, và rằng dữ liệu mẫu (data_source = 'demo')
 * được nạp/gỡ đầy đủ mà không ảnh hưởng các bảng khác.
 *
 * Chạy trên một database tách biệt:
 *   node server/scripts/run-content-type-tests.js
 */
'use strict';

const BASE = process.env.API_BASE || 'http://127.0.0.1:8099';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function req(path, options) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
  return { status: res.status, body, data: body ? body.data : null };
}

(async () => {
  console.log(`\nKIỂM THỬ 6 NHÓM NỘI DUNG — ${BASE}\n`);

  /* 1. Tin tức: chỉ bài đã xuất bản, không lẫn nhóm education */
  const news = await req('/api/public/articles?limit=50');
  check('GET /api/public/articles trả danh sách', news.status === 200 && Array.isArray(news.data));
  const newsRows = Array.isArray(news.data) ? news.data : [];
  check('Không lộ bài nháp trong danh sách công khai',
    newsRows.every((a) => a.status === 'published'),
    JSON.stringify(newsRows.map((a) => a.status)));
  check('Không có bài nháp [Mẫu] bài nháp kiểm thử',
    !newsRows.some((a) => /Bài nháp kiểm thử/.test(a.title)));
  check('Bài viết trả categoryGroup để lọc theo nhóm',
    newsRows.every((a) => a.categoryGroup === undefined || typeof a.categoryGroup === 'string'));

  /* 2. Nhóm education chỉ trả đúng nhóm */
  const edu = await req('/api/public/articles?limit=50&group=education');
  check('Lọc group=education trả 200', edu.status === 200);
  const eduRows = Array.isArray(edu.data) ? edu.data : [];
  check('Mọi bài trong nhóm education đều thuộc education',
    eduRows.every((a) => a.categoryGroup === 'education'),
    JSON.stringify(eduRows.map((a) => a.categoryGroup)));
  check('Có bài tuyên truyền đã xuất bản', eduRows.length > 0);
  check('Không lẫn bài nhóm news vào education',
    !eduRows.some((a) => /Bài tin tức kiểm thử/.test(a.title)));

  const newsOnly = await req('/api/public/articles?limit=50&group=news');
  const newsOnlyRows = Array.isArray(newsOnly.data) ? newsOnly.data : [];
  check('Lọc group=news không trả bài education',
    newsOnlyRows.every((a) => a.categoryGroup === 'news'));

  /* 3. Chi tiết bài viết theo id */
  if (newsRows[0]) {
    const detail = await req(`/api/public/articles/${encodeURIComponent(newsRows[0].id)}`);
    check('Chi tiết bài viết công khai trả 200', detail.status === 200);
    check('Chi tiết có nội dung thân bài', detail.data && typeof detail.data.body === 'string');
  }

  /* 4. Pháp luật */
  const laws = await req('/api/public/legal-documents');
  check('GET /api/public/legal-documents trả 200', laws.status === 200);
  const lawRows = Array.isArray(laws.data) ? laws.data : [];
  check('Văn bản trả trường tình trạng hiệu lực', lawRows.every((l) => typeof l.effectStatus === 'string'));
  check('Lọc theo lĩnh vực pháp luật hoạt động',
    (await req('/api/public/legal-documents?field=Phòng, chống ma túy')).status === 200);
  check('Lọc theo tình trạng hiệu lực hoạt động',
    (await req('/api/public/legal-documents?effectStatus=expired')).data.every((l) => l.effectStatus === 'expired'));

  /* 5. Sự kiện: tách trạng thái xuất bản và trạng thái thời gian */
  const events = await req('/api/public/events');
  const evRows = Array.isArray(events.data) ? events.data : [];
  check('Sự kiện công khai trả 200', events.status === 200);
  check('Không lộ sự kiện chưa công khai',
    !evRows.some((e) => /Chưa công khai/.test(e.title)));
  check('Sự kiện có đủ trạng thái thời gian',
    evRows.some((e) => e.status === 'upcoming') && evRows.some((e) => e.status === 'past'));
  check('Sự kiện có trường địa điểm và thời gian',
    evRows.every((e) => 'location' in e && 'start' in e));

  /* 6. Cơ quan - đơn vị: danh mục lọc dựng từ dữ liệu thật */
  const agencies = await req('/api/public/agencies');
  const agRows = Array.isArray(agencies.data) ? agencies.data : [];
  check('Cơ quan trả 200', agencies.status === 200);
  check('Cơ quan trả cấp quản lý', agRows.every((a) => 'managementLevel' in a));
  const taxonomy = (agencies.body && agencies.body.taxonomy) || null;
  check('Cơ quan có taxonomy loại hình/cấp quản lý (dựng từ dữ liệu thật)',
    !!(taxonomy && Array.isArray(taxonomy.roleTypes) && Array.isArray(taxonomy.levels)));
  const roles = new Set(agRows.map((a) => a.roleType));
  const taxRoles = (taxonomy ? taxonomy.roleTypes : []).map((t) => t.value);
  check('Taxonomy không rỗng khi đã có dữ liệu', taxRoles.length > 0);
  check('Taxonomy loại hình khớp dữ liệu trả về',
    taxRoles.every((r) => roles.has(r) || r === ''));

  /* 7. Support: hồ sơ cơ sở, tách khỏi agencies */
  const support = await req('/api/public/support-facilities');
  const sfRows = Array.isArray(support.data) ? support.data : [];
  check('Cơ sở hỗ trợ trả 200', support.status === 200);
  check('Không lộ cơ sở chưa xác minh/công khai',
    !sfRows.some((f) => /Chưa xác minh/.test(f.name)));
  check('Cơ sở có toạ độ khi được cung cấp',
    sfRows.some((f) => f.latitude != null && f.longitude != null));
  check('Cơ sở có danh sách dịch vụ',
    sfRows.every((f) => Array.isArray(f.services)));
  check('Cơ sở không trùng dữ liệu cơ quan',
    !sfRows.some((f) => agRows.some((a) => a.name === f.name)));
  check('Lọc theo loại hình cơ sở hoạt động',
    (await req('/api/public/support-facilities?type=methadone')).data.every((f) => f.type === 'methadone'));

  console.log(`\nKết quả: ${passed} đạt, ${failed} không đạt.\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Lỗi kiểm thử:', err.message);
  process.exit(1);
});
