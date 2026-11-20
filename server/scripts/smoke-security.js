/**
 * smoke-security.js – Kiểm thử bảo mật máy chủ (path traversal, DoS, lộ tệp nội bộ).
 *
 * Chạy trên một máy chủ đã khởi động:
 *   node server/scripts/smoke-security.js
 *   API_BASE=http://127.0.0.1:8099 node server/scripts/smoke-security.js
 *
 * Bộ này KHÔNG tạo hay sửa dữ liệu; chỉ gửi request đọc và request sai định dạng.
 *
 * Bối cảnh: bản trước đây chuẩn hóa đường dẫn TRƯỚC khi giải mã URL, nên
 * `GET /..%2f.env` trả về nội dung tệp `.env` (HTTP 200) và `GET //..%2f.env`
 * làm treo kết nối vì `new URL()` ném lỗi thoát khỏi handler async.
 * Các bài dưới đây khóa lại hai lỗi đó.
 */
'use strict';

const http = require('node:http');

const BASE = process.env.API_BASE || 'http://localhost:8099';
const parsed = new URL(BASE);
const HOST = parsed.hostname;
const PORT = Number(parsed.port) || 80;

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

/** Gửi request thô để giữ nguyên chuỗi `path` (fetch sẽ tự chuẩn hóa). */
function rawRequest(path, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.request({ host: HOST, port: PORT, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, timedOut: false }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 0, body: '', timedOut: true });
    });
    req.on('error', (err) => resolve({ status: -1, body: err.message, timedOut: false }));
    req.end();
  });
}

/** Chuỗi KHÔNG được xuất hiện trong phản hồi công khai */
const SECRET_MARKERS = [
  'SEED_PASSWORD', 'SESSION_SECRET', 'DATABASE_URL', 'password_hash',
  'BEGIN PRIVATE KEY', 'SQLite format', 'PORTAL_SQLITE', 'APP_ENV',
];

const TRAVERSAL_VECTORS = [
  '/..%2f.env',
  '/..%2f..%2f.env',
  '/..%5c.env',
  '/%2e%2e/.env',
  '/.%2e/.env',
  '/pages/..%2f..%2f.env',
  '/assets/..%2f..%2f.env',
  '/..%2fserver%2fdata%2fportal.sqlite',
  '/..%2fserver%2fdata%2fcredentials.local.txt',
  '/..%2fserver%2fdb%2fschema.sql',
  '/..%2fpackage.json',
  '/..%2f.git%2fconfig',
  '/..%2fbackups%2f',
];

(async () => {
  console.log(`\nKIỂM THỬ BẢO MẬT — ${BASE}\n`);

  /* 1. Path traversal không được lộ dữ liệu nhạy cảm */
  console.log('1. Path traversal (giải mã URL trước khi chuẩn hóa)');
  for (const vector of TRAVERSAL_VECTORS) {
    const r = await rawRequest(vector);
    const leaked = SECRET_MARKERS.some((marker) => r.body.includes(marker));
    check(`${vector} → không lộ dữ liệu`, !leaked, leaked ? 'phản hồi chứa dữ liệu nhạy cảm' : `HTTP ${r.status}`);
  }

  /* 2. Đường dẫn sai định dạng không được treo máy chủ */
  console.log('\n2. Chịu được request sai định dạng (không treo kết nối)');
  const hangVectors = ['///..%2f.env', '//..%2f.env', '////..%2f.env', '///'];
  for (const vector of hangVectors) {
    const r = await rawRequest(vector, 3000);
    check(`${vector} → phản hồi trong 3s`, !r.timedOut, r.timedOut ? 'TREO: không có phản hồi' : `HTTP ${r.status}`);
  }

  /* 3. Máy chủ vẫn phục vụ bình thường sau các request trên */
  console.log('\n3. Máy chủ còn hoạt động sau các request bất thường');
  const health = await fetch(BASE + '/api/public/health').then((r) => r.status).catch(() => 0);
  check('GET /api/public/health → 200', health === 200, `HTTP ${health}`);
  const home = await fetch(BASE + '/index.html').then((r) => r.status).catch(() => 0);
  check('GET /index.html → 200', home === 200, `HTTP ${home}`);

  /* 4. Thư mục nội bộ bị chặn ở đường dẫn thông thường */
  console.log('\n4. Thư mục nội bộ không được phục vụ');
  for (const p of ['/server/index.js', '/server/data/portal.sqlite', '/.env',
    '/server/db/schema.sql', '/node_modules/x', '/backups']) {
    const res = await fetch(BASE + p).catch(() => ({ status: 0 }));
    check(`${p} → 404/403`, res.status === 404 || res.status === 403, `HTTP ${res.status}`);
  }

  /* 5. API nội bộ yêu cầu đăng nhập */
  console.log('\n5. API nội bộ yêu cầu xác thực');
  for (const p of ['/api/cms/articles', '/api/workspace/tasks', '/api/shared/users']) {
    const res = await fetch(BASE + p).catch(() => ({ status: 0 }));
    check(`${p} → 401`, res.status === 401, `HTTP ${res.status}`);
  }

  console.log(`\nKẾT QUẢ: ${passed} đạt / ${failed} không đạt\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
