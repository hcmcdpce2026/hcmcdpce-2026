/**
 * smoke-workspace-crud.js – Kiểm thử tạo/sửa/đọc bản ghi nghiệp vụ Workspace.
 *
 * Bối cảnh: `createTask` từng trả HTTP 500 cho MỌI lần tạo nhiệm vụ vì câu
 * INSERT khai 21 cột nhưng VALUES chỉ có 14 placeholder + 7 hằng trong khi
 * `.run()` nhận 15 tham số. Lỗi không bị bắt vì bộ kiểm thử cũ chỉ đọc danh sách.
 *
 * Chạy trên database tách biệt (qua run-tests-isolated.js) hoặc DB thử nghiệm:
 *   API_BASE=http://127.0.0.1:8123 node server/scripts/smoke-workspace-crud.js
 *
 * Bản ghi do bộ này tạo đều mang tiền tố `[Kiểm thử]` và được dọn ở cuối.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.API_BASE || 'http://localhost:8099';
const TAG = '[Kiểm thử] workspace-crud ' + Date.now();

let passed = 0;
let failed = 0;
const check = (ok, label, detail) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
};

/** Đọc mật khẩu khởi tạo từ tệp bàn giao (không in ra) */
function readCredentials() {
  const file = path.resolve(__dirname, '..', 'data', 'credentials.local.txt');
  const out = {};
  if (!fs.existsSync(file)) return out;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const [pwd, user] = line.trim().split(/\s+/);
    if (user) out[user] = pwd;
  });
  return out;
}

(async () => {
  const creds = readCredentials();
  const user = process.env.WS_TEST_USER || 'ws.nguyenvandat';
  /*
   * Mật khẩu có thể đến từ tệp bàn giao (máy thật) hoặc từ biến môi trường
   * (database tạm của run-tests-isolated.js dùng SEED_PASSWORD_WS_ADMIN).
   */
  /*
   * Thứ tự ưu tiên: biến môi trường > tệp bàn giao.
   * Khi chạy trên database tạm (run-tests-isolated.js), `.env`/tệp bàn giao của
   * máy thật KHÔNG khớp mật khẩu seed của database tạm — biến môi trường phải
   * được dùng trước, nếu không bài kiểm thử sẽ đăng nhập bằng mật khẩu sai.
   */
  const password = process.env.WS_TEST_PASSWORD
    || process.env.SEED_PASSWORD_WS_ADMIN
    || creds[user];
  if (!password) {
    console.log(`Bỏ qua: không có mật khẩu cho ${user} (credentials.local.txt hoặc SEED_PASSWORD_WS_ADMIN)`);
    process.exit(0);
  }

  console.log(`\nKIỂM THỬ CRUD WORKSPACE — ${BASE}\n`);

  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password, system: 'workspace' }),
  });
  check(login.status === 200, 'Đăng nhập Workspace', `HTTP ${login.status}`);
  if (login.status !== 200) {
    const body = await login.text();
    console.log(`    phản hồi: ${body.slice(0, 200)}`);
    console.log(`    nguồn mật khẩu: ${process.env.WS_TEST_PASSWORD ? 'WS_TEST_PASSWORD'
      : creds[user] ? 'credentials.local.txt' : process.env.SEED_PASSWORD_WS_ADMIN ? 'SEED_PASSWORD_WS_ADMIN' : 'không có'}`);
    console.log(`\nKẾT QUẢ: ${passed} đạt / ${failed} không đạt\n`);
    process.exit(1);
  }

  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const csrf = (await login.json()).data.csrfToken;
  const H = { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf };

  /* ---- 1. Tạo nhiệm vụ: phải 201, không phải 500 ---- */
  const createRes = await fetch(BASE + '/api/workspace/tasks', {
    method: 'POST', headers: H,
    body: JSON.stringify({
      title: `${TAG} tạo nhiệm vụ`, description: 'Nội dung kiểm thử.', priority: 'normal',
      items: [{ title: 'Bước kiểm thử 1' }, { title: 'Bước kiểm thử 2' }],
    }),
  });
  let created = null;
  try { created = (await createRes.json()).data; } catch (_) { created = null; }
  check(createRes.status === 201, 'POST /tasks → 201 (không còn 500)', `HTTP ${createRes.status}`);
  check(!!created && !!created.id, 'Phản hồi có id nhiệm vụ');

  if (created && created.id) {
    /* ---- 2. Đọc lại chi tiết ---- */
    const getRes = await fetch(BASE + '/api/workspace/tasks/' + encodeURIComponent(created.id),
      { headers: { Cookie: cookie } });
    const got = await getRes.json();
    check(getRes.status === 200 && got.data && got.data.id === created.id, 'GET /tasks/:id trả đúng bản ghi');
    check(got.data && got.data.title === `${TAG} tạo nhiệm vụ`, 'Tiêu đề lưu đúng');
    check(got.data && got.data.status === 'new', 'Trạng thái mặc định là "new"');
    check(got.data && got.data.items.map((item) => item.title).join('|') === 'Bước kiểm thử 1|Bước kiểm thử 2',
      'Thứ tự các mục checklist được tạo tự động');

    const itemRes = await fetch(BASE + '/api/workspace/tasks/' + encodeURIComponent(created.id) + '/items', {
      method: 'POST', headers: H, body: JSON.stringify({ title: 'Bước kiểm thử 3' }),
    });
    const addedItem = await itemRes.json();
    check(itemRes.status === 201 && addedItem.data && addedItem.data.sortOrder === 3,
      'Mục checklist mới tự nhận số thứ tự tiếp theo');

    /* ---- 3. Cập nhật ---- */
    const updRes = await fetch(BASE + '/api/workspace/tasks/' + encodeURIComponent(created.id), {
      method: 'PUT', headers: H,
      body: JSON.stringify({ title: `${TAG} đã sửa`, priority: 'high' }),
    });
    check(updRes.status === 200, 'PUT /tasks/:id → 200', `HTTP ${updRes.status}`);

    /* ---- 4. Lịch sử thao tác được ghi ---- */
    const histRes = await fetch(BASE + '/api/workspace/tasks/' + encodeURIComponent(created.id),
      { headers: { Cookie: cookie } });
    const hist = await histRes.json();
    check(Array.isArray(hist.data && hist.data.history) && hist.data.history.length >= 2,
      'Nhật ký nhiệm vụ ghi nhận tạo + cập nhật',
      `${(hist.data && hist.data.history || []).length} mục`);

    /* ---- 5. Dọn: huỷ nhiệm vụ kiểm thử ---- */
    const cancelRes = await fetch(BASE + '/api/workspace/tasks/' + encodeURIComponent(created.id) + '/cancel', {
      method: 'POST', headers: H, body: JSON.stringify({ note: 'Dọn dữ liệu kiểm thử' }),
    });
    check([200, 204].includes(cancelRes.status), 'Huỷ nhiệm vụ kiểm thử', `HTTP ${cancelRes.status}`);
  }

  /* ---- 6. Đầu vào không hợp lệ ---- */
  const badRes = await fetch(BASE + '/api/workspace/tasks', {
    method: 'POST', headers: H, body: JSON.stringify({ description: 'thiếu tiêu đề' }),
  });
  check([400, 422].includes(badRes.status), 'Tạo nhiệm vụ thiếu tiêu đề → 400', `HTTP ${badRes.status}`);

  /* ---- 7. Không có CSRF ---- */
  const noCsrf = await fetch(BASE + '/api/workspace/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title: 'x' }),
  });
  check(noCsrf.status === 403, 'Tạo nhiệm vụ không CSRF → 403', `HTTP ${noCsrf.status}`);

  console.log(`\nKẾT QUẢ: ${passed} đạt / ${failed} không đạt\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
