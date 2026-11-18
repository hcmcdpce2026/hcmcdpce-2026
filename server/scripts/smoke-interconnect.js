/**
 * smoke-interconnect.js – kiểm tra nhanh toàn bộ luồng liên thông PUBLIC → CMS → WORKSPACE.
 * Chạy khi máy chủ đang hoạt động: node server/scripts/smoke-interconnect.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.API_BASE || 'http://localhost:8099';
const credentialFile = path.resolve(__dirname, '..', 'data', 'credentials.local.txt');
const creds = {};
if (fs.existsSync(credentialFile)) {
  fs.readFileSync(credentialFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 2 && parts[1].includes('.')) creds[parts[1]] = parts[0];
  });
}
creds['cms.nguyenvandat'] = process.env.SEED_PASSWORD_CMS_ADMIN || creds['cms.nguyenvandat'] || 'cms25082005';
creds['ws.nguyenvandat'] = process.env.SEED_PASSWORD_WS_ADMIN || creds['ws.nguyenvandat'] || 'ws25082005';

class S {
  constructor() { this.c = ''; this.k = ''; }
  async r(m, u, b) {
    const h = { Accept: 'application/json' };
    if (this.c) h.Cookie = this.c;
    if (this.k && m !== 'GET') h['X-CSRF-Token'] = this.k;
    if (b !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + u, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) });
    const sc = res.headers.getSetCookie();
    if (sc.length) this.c = sc.map((x) => x.split(';')[0]).join('; ');
    const t = await res.text();
    let json; try { json = JSON.parse(t); } catch (e) { json = { raw: t }; }
    return { status: res.status, data: json.data, error: json.error };
  }
  async login(u, p, sys) {
    const r = await this.r('POST', '/api/auth/login', { username: u, password: p, system: sys });
    if (r.status === 200) this.k = (await this.r('GET', '/api/auth/me')).data.csrfToken;
    return r;
  }
}

const step = (n, ok, info) => console.log(`  ${ok ? '✓' : '✗'} ${n}${info ? ' — ' + info : ''}`);

(async () => {
  const tick = Date.now();
  console.log('LUỒNG LIÊN THÔNG PUBLIC → CMS → WORKSPACE\n');

  // 1. Công dân gửi phản ánh
  const pub = new S();
  const submit = await pub.r('POST', '/api/public/submissions', {
    formType: 'report', subject: `Phản ánh kiểm thử ${tick}`, name: 'Công dân kiểm thử',
    email: `cd${tick}@example.com`, phone: '0900000001',
    content: `Kiểm thử liên thông: phản ánh tình trạng tụ tập nghi vấn tại địa bàn số ${tick}.`, consent: true,
  });
  step('PUBLIC tiếp nhận phản ánh', submit.status === 201, submit.data && submit.data.ticketCode);
  const ticket = submit.data.ticketCode;

  // 2. CMS nhận và chuyển sang Workspace
  const cms = new S();
  await cms.login('cms.nguyenvandat', creds['cms.nguyenvandat'], 'cms');
  const list = await cms.r('GET', '/api/cms/submissions');
  const mine = list.data.find((s) => s.ticketCode === ticket);
  step('CMS nhận được yêu cầu', !!mine, mine && mine.id);

  const assign = await cms.r('PUT', `/api/cms/submissions/${mine.id}`, { assignedOrgId: 'org-02', priority: 'high', note: 'Chuyển đơn vị nghiệp vụ' });
  step('CMS phân công đơn vị', assign.status === 200, assign.data && assign.data.status);

  const toWs = await cms.r('POST', `/api/cms/submissions/${mine.id}/assign`, { orgId: 'org-02', dueDays: 5 });
  step('CMS tạo nhiệm vụ Workspace', toWs.status === 200, toWs.data && toWs.data.code);
  const taskId = toWs.data.taskId;

  // 3. Workspace xử lý nhiệm vụ
  const ws = new S();
  await ws.login('ws.nguyenvandat', creds['ws.nguyenvandat'], 'workspace');
  const t = await ws.r('GET', `/api/workspace/tasks/${taskId}`);
  step('Workspace nhận nhiệm vụ', t.status === 200 && t.data.sourceType === 'submission', t.data && t.data.code);

  const prog = await ws.r('POST', `/api/workspace/tasks/${taskId}/progress`, { progress: 70, note: 'Đã xác minh địa bàn' });
  step('Cán bộ cập nhật tiến độ', prog.status === 200 && prog.data.progress === 70);

  const sub = await ws.r('POST', `/api/workspace/tasks/${taskId}/submit`, { resultNote: 'Đã kiểm tra, đề nghị xác nhận.' });
  step('Cán bộ gửi kết quả', sub.status === 200 && sub.data.status === 'review');

  const mgr = new S();
  await mgr.login('ws.nguyenvandat', creds['ws.nguyenvandat'], 'workspace');
  const done = await mgr.r('POST', `/api/workspace/tasks/${taskId}/complete`, { resultNote: 'Đã kiểm tra và xử lý.' });
  step('Quản lý xác nhận hoàn thành', done.status === 200 && done.data.status === 'done');

  // 4. CMS phản hồi công dân, công khai kết quả
  const answer = await cms.r('PUT', `/api/cms/submissions/${mine.id}`, {
    response: 'Đã xác minh, xử lý theo quy định.',
    publicResponse: 'Cảm ơn công dân đã phản ánh. Cơ quan chức năng đã kiểm tra và xử lý theo quy định.',
    isPublicResult: true,
  });
  step('CMS phản hồi và cho phép công khai', answer.status === 200 && answer.data.isPublicResult === true);

  // 5. Công dân tra cứu kết quả
  const lookup = await pub.r('GET', `/api/public/submissions/lookup?code=${ticket}&contact=cd${tick}@example.com`);
  step('PUBLIC hiển thị kết quả được công khai', lookup.status === 200 && !!lookup.data.publicResponse,
    lookup.data && lookup.data.status);

  // 6. Workspace đề xuất nội dung → CMS duyệt → PUBLIC hiển thị
  const prop = await ws.r('POST', '/api/workspace/proposals', {
    title: `Đề xuất nội dung kiểm thử ${tick}`, summary: 'Tóm tắt đề xuất kiểm thử liên thông.',
    body: '<p>Nội dung đề xuất từ đơn vị nghiệp vụ.</p>',
  });
  step('Workspace gửi đề xuất nội dung', prop.status === 201, prop.data ? prop.data.code : `${prop.status} ${prop.error || ''}`);

  const approve = await cms.r('POST', `/api/cms/proposals/${prop.data.id}/review`, { action: 'approve', note: 'Đồng ý nội dung' });
  step('CMS phê duyệt đề xuất', approve.status === 200 && approve.data.status === 'approved');

  const publish = await cms.r('POST', `/api/cms/proposals/${prop.data.id}/review`, { action: 'publish' });
  step('CMS xuất bản đề xuất', publish.status === 200 && publish.data.proposal.status === 'published');

  const art = await pub.r('GET', `/api/public/articles/${publish.data.articleId}`);
  step('PUBLIC hiển thị nội dung từ Workspace', art.status === 200 && art.data.origin === 'workspace', art.data && art.data.title);

  // 7. Nhật ký & thông báo
  const logs = await cms.r('GET', '/api/cms/logs?limit=50');
  step('Nhật ký ghi nhận thao tác liên thông',
    logs.data.some((l) => l.action === 'submission.to_workspace') && logs.data.some((l) => l.action === 'proposal.publish'));

  const notices = await ws.r('GET', '/api/shared/notifications');
  step('Thông báo tới Workspace', notices.status === 200, `${notices.data.length} thông báo`);

  console.log('\nHoàn tất kiểm tra liên thông.');
  process.exit(0);
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
