/**
 * test-api.js - Kiểm thử tích hợp API bằng Node.js (không cần thư viện ngoài).
 * Chạy:  node server/scripts/test-api.js
 * Yêu cầu: máy chủ đang chạy (npm start) và đã nạp seed.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.API_BASE || 'http://localhost:8099';
const credFile = path.resolve(__dirname, '..', 'data', 'credentials.local.txt');

function readCredentials() {
  if (!fs.existsSync(credFile)) {
    const env = process.env;
    return {
      'cms.nguyenvandat': env.SEED_PASSWORD_CMS_ADMIN || 'cms25082005',
      'ws.nguyenvandat': env.SEED_PASSWORD_WS_ADMIN || 'ws25082005',
    };
  }
  const out = {};
  // Định dạng dòng: "<mật khẩu>  <tên đăng nhập>" (server/db/seed.js xuất theo thứ tự này)
  fs.readFileSync(credFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 2) return;
    if (parts[1].includes('.')) out[parts[1]] = parts[0];
  });
  if (process.env.TEST_DEBUG) console.log('[debug] creds:', Object.keys(out).join(', '));
  return out;
}

/** Phiên đăng nhập đơn giản: giữ cookie + CSRF */
class Session {
  constructor(name) { this.name = name; this.cookie = ''; this.csrf = ''; this.user = null; }

  async request(method, url, body) {
    const headers = { Accept: 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    headers['X-Test-Suite'] = 'integration';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (process.env.TEST_DEBUG && url === '/api/auth/login') console.log('[debug] login payload:', JSON.stringify(body).slice(0, 120));
    const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (setCookie.length) this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
    return { status: res.status, body: json };
  }

  async login(username, password, system) {
    // Luôn bắt đầu bằng một phiên trống để tránh lẫn cookie giữa các lần thử
    this.cookie = '';
    this.csrf = '';
    const r = await this.request('POST', '/api/auth/login', { username, password, system });
    if (r.status === 200) {
      this.csrf = r.body.data.csrfToken;
      this.user = r.body.data.user;
    }
    return r;
  }
}

let pass = 0;
let fail = 0;
const failures = [];
const jsonlPath = process.argv.includes('--jsonl') ? process.argv[process.argv.indexOf('--jsonl') + 1] : null;
if (jsonlPath) fs.writeFileSync(jsonlPath, '');

function check(name, condition, detail) {
  if (condition) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; failures.push(`${name}${detail ? ` → ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` → ${detail}` : ''}`); }
  if (jsonlPath) {
    fs.appendFileSync(jsonlPath, JSON.stringify({ name, ok: !!condition, detail: detail || '' }) + '\n');
  }
}

async function run() {
  const creds = readCredentials();
  if (process.env.TEST_DEBUG) console.log('[debug] keys:', Object.keys(creds).join('|'));
  // Xoá bộ đếm giới hạn tần suất của lần chạy trước (chỉ có tác dụng khi chạy cùng tiến trình)
  try {
    const sec = require('../lib/security');
    if (typeof sec.resetRateLimits === 'function') sec.resetRateLimits();
  } catch (_) { /* chạy độc lập với máy chủ: bỏ qua */ }
  console.log('══════════════════════════');
  console.log('  KIỂM THỬ TÍCH HỢP API – CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH');
  console.log('══════════════════════════');

  /* 1. Public API */
  console.log('\n[1] PUBLIC API');
  const anon = new Session('anon');
  let r = await anon.request('GET', '/api/public/health');
  check('Health check trả 200', r.status === 200 && r.body.data.status === 'ok');
  r = await anon.request('GET', '/api/public/articles?limit=5');
  check('Danh sách tin công khai trả về mảng', r.status === 200 && Array.isArray(r.body.data));
  check('Bài chưa xuất bản không lộ ra public', r.body.data.every((a) => !['draft', 'pending', 'rejected', 'archived'].includes(a.status)));
  r = await anon.request('GET', '/api/public/articles?search=thuoc%20la%20dien%20tu');
  check('Tìm kiếm không dấu trả về mảng hợp lệ', r.status === 200 && Array.isArray(r.body.data));
  r = await anon.request('GET', '/api/public/categories');
  check('Danh mục công khai trả về mảng', r.status === 200 && Array.isArray(r.body.data));
  r = await anon.request('GET', '/api/public/legal-documents');
  check('Văn bản pháp luật trả về mảng', r.status === 200 && Array.isArray(r.body.data));
  r = await anon.request('GET', '/api/public/statistics');
  check('Số liệu thống kê trả về mảng (rỗng khi chưa công bố)',
    r.status === 200 && Array.isArray(r.body.data) && r.body.data.every((p) => p.sourceType !== undefined));
  r = await anon.request('GET', '/api/public/agencies');
  check('Cơ quan, đơn vị công khai trả về mảng', r.status === 200 && Array.isArray(r.body.data));
  r = await anon.request('GET', '/api/public/events');
  check('Sự kiện công khai trả về mảng', r.status === 200 && Array.isArray(r.body.data));
  check('Sự kiện chỉ trả trạng thái được phép công khai',
    r.status === 200 && Array.isArray(r.body.data) &&
    r.body.data.every((event) => ['upcoming', 'ongoing', 'past'].includes(event.status)));
  r = await anon.request('GET', '/api/public/support-facilities');
  check('Cơ sở hỗ trợ công khai trả về mảng', r.status === 200 && Array.isArray(r.body.data));

  /* 2. Đăng nhập */
  console.log('\n[2] XÁC THỰC');
  const cmsAdmin = new Session('cms.nguyenvandat');
  // Tài khoản không tồn tại: dùng định danh riêng để không làm khóa tài khoản thật
  r = await cmsAdmin.login(`khong.ton.tai.${Date.now()}`, 'sai-mat-khau-123', 'cms');
  check('Sai tài khoản/mật khẩu bị từ chối', r.status === 401);
  const wsWrongSystem = new Session('ws-system-check');
  r = await wsWrongSystem.login('ws.nguyenvandat', creds['ws.nguyenvandat'], 'cms');
  check('Tài khoản Workspace không đăng nhập được CMS', [401, 403].includes(r.status), `status=${r.status}`);
  if (process.env.TEST_DEBUG) {
    console.log('[debug] creds[cms.nguyenvandat] length =', (creds['cms.nguyenvandat'] || '').length, '| cookie =', cmsAdmin.cookie ? 'set' : 'none');
  }
  r = await cmsAdmin.login('cms.nguyenvandat', creds['cms.nguyenvandat'], 'cms');
  if (process.env.TEST_DEBUG && r.status !== 200) console.log('[debug] raw =', JSON.stringify(r.body));
  check('Đăng nhập CMS admin thành công', r.status === 200 && !!cmsAdmin.csrf, `status=${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 120) : ''}`);
  check('Không trả mật khẩu/hash trong phản hồi', !JSON.stringify(r.body).includes('scrypt') && !JSON.stringify(r.body).includes('password_hash'));

  const noCsrf = new Session('csrf');
  r = await noCsrf.login('cms.nguyenvandat', creds['cms.nguyenvandat'], 'cms');
  noCsrf.csrf = '';
  r = await noCsrf.request('POST', '/api/cms/articles', { title: 'Kiểm thử CSRF' });
  check('POST không có CSRF token bị chặn', r.status === 403, `status=${r.status}`);

  r = await anon.request('GET', '/api/cms/articles');
  check('API nội bộ chặn truy cập chưa đăng nhập', r.status === 401);
  r = await anon.request('GET', '/api/workspace/tasks');
  check('Workspace chặn truy cập chưa đăng nhập', r.status === 401);

  const allUsers = Object.keys(creds);
  check('Có 2 tài khoản quản trị khởi tạo', allUsers.length === 2, `có ${allUsers.length}`);
  const cmsUsers = allUsers.filter((u) => u.startsWith('cms.'));
  const wsUsers = allUsers.filter((u) => u.startsWith('ws.'));
  check('01 tài khoản CMS, 01 tài khoản Workspace', cmsUsers.length === 1 && wsUsers.length === 1);

  /* 3. Phân quyền */
  console.log('\n[3] PHÂN QUYỀN (RBAC)');
  const cmsEditor = new Session('cms.nguyenvandat');
  r = await cmsEditor.login('cms.nguyenvandat', creds['cms.nguyenvandat'], 'cms');
  check('Quản trị CMS đăng nhập', r.status === 200, `status=${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 120) : ''}`);
  r = await cmsEditor.request('GET', '/api/cms/articles');
  check('Quản trị CMS xem được danh sách', r.status === 200);
  r = await cmsEditor.request('POST', '/api/cms/articles', { title: 'Bài kiểm thử của biên tập viên', body: '<p>Nội dung</p>' });
  check('Quản trị CMS tạo nội dung', r.status === 201);
  let editorArticleId = r.body.data && r.body.data.id;
  r = await cmsEditor.request('DELETE', `/api/cms/articles/${editorArticleId}`);
  check('Quản trị CMS được xóa nội dung', r.status === 200);
  r = await cmsEditor.request('POST', `/api/cms/articles/${editorArticleId}/publish`);
  check('Quản trị CMS được xuất bản', r.status !== 403);
  r = await cmsEditor.request('POST', '/api/cms/articles', { title: 'Bài kiểm thử liên thông CMS', body: '<p>Nội dung liên thông kiểm thử</p>' });
  editorArticleId = r.body.data && r.body.data.id;

  const wsAdmin = new Session('ws.nguyenvandat');
  r = await wsAdmin.login('ws.nguyenvandat', creds['ws.nguyenvandat'], 'workspace');
  check('Workspace admin đăng nhập', r.status === 200);
  r = await cmsEditor.request('GET', '/api/workspace/tasks');
  check('Tài khoản CMS không vào được Workspace', [401, 403].includes(r.status), `status=${r.status}`);

  const wsStaff = new Session('ws.nguyenvandat');
  r = await wsStaff.login('ws.nguyenvandat', creds['ws.nguyenvandat'], 'workspace');
  check('Quản trị Workspace đăng nhập', r.status === 200);
  r = await wsStaff.request('POST', '/api/workspace/users', { name: 'X', username: 'x.test', password: 'Aa12345678@' });
  check('Quản trị Workspace được tạo/cập nhật người dùng', r.status !== 403);

  /* 4. Biểu mẫu PUBLIC → CMS */
  console.log('\n[4] BIỂU MẪU PUBLIC');
  r = await anon.request('POST', '/api/public/submissions', { content: 'ngắn', isAnonymous: true });
  check('Từ chối nội dung quá ngắn', r.status === 400);
  r = await anon.request('POST', '/api/public/submissions', { name: 'Kiểm thử', email: 'sai-email', content: 'Nội dung phản ánh kiểm thử hợp lệ cho hệ thống.' });
  check('Từ chối email sai định dạng', r.status === 400);

  const stamp = Date.now();
  const payload = {
    formType: 'report',
    subject: `Kiểm thử phản ánh ${stamp}`,
    name: 'Công dân kiểm thử',
    email: `test${stamp}@example.com`,
    phone: '0900000000',
    content: `Khu vực kiểm thử có dấu hiệu tụ tập nghi vấn. Nội dung kiểm thử tự động số ${stamp}.`,
    consent: true,
  };
  r = await anon.request('POST', '/api/public/submissions', payload);
  check('Gửi biểu mẫu thành công, có mã tiếp nhận', r.status === 201 && /^PCMT-\d{4}-\d{4}$/.test(r.body.data.ticketCode));
  const ticket = r.body.data && r.body.data.ticketCode;
  r = await anon.request('POST', '/api/public/submissions', payload);
  check('Chống gửi trùng', r.status === 409);
  r = await anon.request('GET', `/api/public/submissions/lookup?code=${ticket}&contact=test${stamp}@example.com`);
  check('Tra cứu theo mã + liên hệ', r.status === 200 && r.body.data.ticketCode === ticket);
  r = await anon.request('GET', `/api/public/submissions/lookup?code=${ticket}&contact=nguoikhac@example.com`);
  check('Tra cứu sai thông tin liên hệ bị từ chối', r.status === 403);

  r = await cmsAdmin.request('GET', '/api/cms/submissions');
  check('CMS tiếp nhận dữ liệu biểu mẫu', r.status === 200 && r.body.data.some((s) => s.ticketCode === ticket));
  const sub = r.body.data.find((s) => s.ticketCode === ticket);

  /* 5. CMS → PUBLIC (xuất bản) */
  console.log('\n[5] CMS ↔ PUBLIC');
  r = await cmsEditor.request('POST', `/api/cms/articles/${editorArticleId}/submit`);
  check('Gửi duyệt nội dung', r.status === 200 && r.body.data.status === 'pending');
  const cmsReviewer = new Session('cms.nguyenvandat');
  await cmsReviewer.login('cms.nguyenvandat', creds['cms.nguyenvandat'], 'cms');
  r = await cmsReviewer.request('POST', `/api/cms/articles/${editorArticleId}/approve`, { note: 'Đồng ý xuất bản' });
  check('Quản trị CMS phê duyệt', r.status === 200 && r.body.data.status === 'approved');
  r = await cmsReviewer.request('POST', `/api/cms/articles/${editorArticleId}/publish`);
  check('Quản trị CMS có quyền xuất bản', r.status === 200);
  check('Quản trị xuất bản thành công', r.status === 200 && r.body.data.status === 'published');

  const articleSlug = r.body.data && r.body.data.slug;
  r = await anon.request('GET', `/api/public/articles/${articleSlug}`);
  check('PUBLIC hiển thị bài đã xuất bản', r.status === 200 && r.body.data.title.includes('Bài kiểm thử'));

  r = await cmsAdmin.request('POST', `/api/cms/articles/${editorArticleId}/unpublish`);
  check('Thu hồi nội dung', r.status === 200 && r.body.data.status === 'approved');
  r = await anon.request('GET', `/api/public/articles/${articleSlug}`);
  check('PUBLIC cập nhật khi thu hồi', r.status === 404);

  /* 6. CMS → WORKSPACE */
  console.log('\n[6] CMS ↔ WORKSPACE');
  r = await cmsAdmin.request('PUT', `/api/cms/submissions/${sub.id}`, { assignedOrgId: 'org-02', priority: 'high', note: 'Chuyển đơn vị nghiệp vụ xác minh' });
  check('CMS phân công yêu cầu', r.status === 200 && r.body.data.status === 'assigned');
  r = await cmsAdmin.request('POST', `/api/cms/submissions/${sub.id}/assign`, { orgId: 'org-02', dueDays: 5 });
  check('CMS chuyển yêu cầu thành nhiệm vụ Workspace', r.status === 200 && !!r.body.data.taskId);
  const taskId = r.body.data.taskId;

  r = await wsAdmin.request('GET', `/api/workspace/tasks`);
  const wsTask = r.body.data.find((t) => t.id === taskId);
  check('Workspace nhận nhiệm vụ từ CMS', r.status === 200 && !!wsTask && wsTask.sourceType === 'submission');
  r = await wsAdmin.request('PUT', `/api/workspace/tasks/${taskId}`, { assigneeIds: [wsStaff.user.id] });
  check('Workspace phân công cán bộ', r.status === 200 && r.body.data.assigneeIds.includes(wsStaff.user.id));
  r = await wsStaff.request('POST', `/api/workspace/tasks/${taskId}/progress`, { progress: 60, note: 'Đang xác minh' });
  check('Cán bộ cập nhật tiến độ', r.status === 200 && r.body.data.progress === 60);
  r = await wsStaff.request('POST', `/api/workspace/tasks/${taskId}/submit`, { resultNote: 'Đã kiểm tra, đề nghị xác nhận.' });
  check('Cán bộ gửi kết quả', r.status === 200 && r.body.data.status === 'review');
  r = await wsAdmin.request('POST', `/api/workspace/tasks/${taskId}/complete`, { resultNote: 'Hoàn thành xác minh.' });
  check('Quản lý xác nhận hoàn thành', r.status === 200 && r.body.data.status === 'done');
  r = await wsAdmin.request('GET', `/api/workspace/tasks/${taskId}`);
  const historyLen = (r.body.data && r.body.data.history ? r.body.data.history.length : 0);
  check('Lịch sử nhiệm vụ được lưu', r.status === 200 && historyLen >= 3, `history=${historyLen}`);

  r = await cmsAdmin.request('PUT', `/api/cms/submissions/${sub.id}`, { response: 'Đã xác minh và xử lý theo quy định.', publicResponse: 'Cảm ơn công dân đã phản ánh. Kết quả kiểm tra đã được xử lý.', isPublicResult: true });
  check('CMS phản hồi kết quả và cho phép công khai', r.status === 200 && r.body.data.isPublicResult === true);
  r = await anon.request('GET', `/api/public/submissions/lookup?code=${ticket}&contact=test${stamp}@example.com`);
  check('PUBLIC hiển thị kết quả được phép công khai', r.status === 200 && r.body.data.publicResponse.length > 0);

  /* 7. WORKSPACE → CMS → PUBLIC */
  console.log('\n[7] WORKSPACE ↔ CMS (đề xuất nội dung)');
  // Danh mục là dữ liệu nghiệp vụ (do CMS tạo); hệ thống khởi đầu ở trạng thái 0 nên
  // chỉ gửi categoryId khi danh mục tồn tại.
  r = await anon.request('GET', '/api/public/categories');
  const anyCategoryId = (r.body.data && r.body.data[0] && r.body.data[0].id) || null;
  r = await wsStaff.request('POST', '/api/workspace/proposals', {
    title: `Đề xuất nội dung kiểm thử ${stamp}`, summary: 'Tóm tắt đề xuất kiểm thử',
    body: '<p>Nội dung đề xuất từ Workspace.</p>', categoryId: anyCategoryId,
  });
  check('Workspace gửi đề xuất nội dung', r.status === 201 && r.body.data.status === 'submitted');
  const proposalId = r.body.data && r.body.data.id;
  r = await cmsAdmin.request('GET', '/api/cms/proposals');
  check('CMS nhận đề xuất từ Workspace', r.status === 200 && r.body.data.some((p) => p.id === proposalId));
  r = await cmsAdmin.request('POST', `/api/cms/proposals/${proposalId}/review`, { action: 'approve', note: 'Đồng ý nội dung' });
  check('CMS phê duyệt đề xuất', r.status === 200 && r.body.data.status === 'approved');
  r = await cmsAdmin.request('POST', `/api/cms/proposals/${proposalId}/review`, { action: 'publish' });
  check('CMS xuất bản đề xuất lên PUBLIC', r.status === 200 && r.body.data.proposal.status === 'published');
  const artId = r.body.data && r.body.data.articleId;
  r = await anon.request('GET', `/api/public/articles/${artId}`);
  check('PUBLIC hiển thị nội dung từ Workspace', r.status === 200 && r.body.data.origin === 'workspace');

  /* 8. Nhật ký & thông báo */
  console.log('\n[8] NHẬT KÝ & THÔNG BÁO');
  r = await cmsAdmin.request('GET', '/api/cms/logs?limit=100');
  check('CMS đọc nhật ký hoạt động', r.status === 200 && r.body.data.length > 0);
  check('Nhật ký ghi được thao tác liên thông', r.body.data.some((l) => l.action === 'submission.to_workspace'));
  r = await wsStaff.request('GET', '/api/workspace/notifications');
  check('Workspace có thông báo', r.status === 200 && Array.isArray(r.body.data));
  r = await cmsAdmin.request('GET', '/api/cms/stats');
  check('Thống kê CMS', r.status === 200 && r.body.data.articles.total > 0);
  r = await wsAdmin.request('GET', '/api/workspace/stats');
  check('Thống kê Workspace', r.status === 200 && r.body.data.tasks.total > 0);

  /* 9. XSS */
  console.log('\n[9] BẢO MẬT NỘI DUNG');
  r = await cmsAdmin.request('POST', '/api/cms/articles', {
    title: 'Kiểm thử XSS', body: '<p>An toàn</p><script>alert(1)</script><img src=x onerror="alert(2)">',
  });
  check('Làm sạch script/onerror khi lưu nội dung', r.status === 201 && !/script|onerror/i.test(r.body.data.body));
  if (r.status === 201) await cmsAdmin.request('DELETE', `/api/cms/articles/${r.body.data.id}`);

  /* 10. Đăng xuất */
  console.log('\n[10] ĐĂNG XUẤT');
  r = await cmsAdmin.request('POST', '/api/auth/logout');
  check('Đăng xuất thành công', r.status === 200);
  r = await cmsAdmin.request('GET', '/api/auth/me');
  check('Phiên bị hủy sau đăng xuất', r.status === 401);

  console.log('\n══════════════════════════');
  console.log(`  KẾT QUẢ: ${pass} đạt / ${fail} không đạt`);
  if (fail) {
    console.log('  Các mục không đạt:');
    failures.forEach((f) => console.log(`   - ${f}`));
  }
  console.log('══════════════════════════');
  process.exitCode = fail ? 1 : 0;
}

run().catch((err) => {
  console.error('[TEST] Lỗi không mong đợi:', err);
  process.exitCode = 1;
}).finally(() => {
  // Thoát tường minh: keep-alive của fetch có thể giữ tiến trình sống
  setTimeout(() => process.exit(process.exitCode || 0), 300);
});
