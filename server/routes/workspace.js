/**
 * API phân hệ WORKSPACE: nhiệm vụ, đơn vị, người dùng, vai trò, tài liệu,
 * báo cáo, lịch công tác, thông báo, đề xuất, yêu cầu phối hợp, nhật ký.
 */
'use strict';

const { getDb } = require('../lib/db');
const http = require('../lib/http');
const auth = require('../lib/auth');
const sec = require('../lib/security');
const m = require('../lib/mapper');

const nowIso = () => new Date().toISOString();
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function notify(db, { system = 'workspace', type = 'info', title, body, href, toUserId = null }) {
  db.prepare(`INSERT INTO notifications (id, system_key, type, title, body, href, to_user_id, audience, is_read, created_at)
              VALUES (?,?,?,?,?,?,?,?,0,?)`)
    .run(sec.makeId('notif'), system, type, title, body || '', href || '', toUserId, toUserId ? 'user' : 'all', nowIso());
}

function nextCode(db, table, prefix, field = 'code') {
  const year = new Date().getFullYear();
  const rows = db.prepare(`SELECT ${field} AS code FROM ${table} WHERE ${field} LIKE ?`).all(`${prefix}-${year}-%`);
  const max = rows.reduce((acc, r) => {
    const mm = String(r.code || '').match(/(\d+)$/);
    return mm ? Math.max(acc, Number(mm[1])) : acc;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}

function scopeFilter(user, alias = 't') {
  if (user.dataScope === 'all') return { sql: '', params: [] };
  if (user.dataScope === 'unit') return { sql: ` AND (${alias}.owner_org_id = ? OR ${alias}.owner_org_id IS NULL)`, params: [user.orgId] };
  return { sql: ` AND (${alias}.assignee_ids LIKE ? OR ${alias}.owner_org_id = ?)`, params: [`%"${user.id}"%`, user.orgId] };
}

/* ============================== NHIỆM VỤ ================================== */

function taskRow(db, id) {
  return db.prepare(`SELECT t.*, o.name AS owner_org_name, u.full_name AS assigner_name
      FROM tasks t LEFT JOIN organizations o ON o.id = t.owner_org_id
      LEFT JOIN users u ON u.id = t.assigner_id WHERE t.id = ?`).get(id);
}

async function listTasks(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.view' });
  if (!s) return;
  const db = getDb();
  const scope = scopeFilter(s.user);
  const rows = db.prepare(`SELECT t.*, o.name AS owner_org_name, u.full_name AS assigner_name
      FROM tasks t LEFT JOIN organizations o ON o.id = t.owner_org_id
      LEFT JOIN users u ON u.id = t.assigner_id
      WHERE 1 = 1 ${scope.sql} ORDER BY t.due_date`).all(...scope.params);
  let items = rows.map(m.task);
  const q = ctx.query;
  if (q.status && q.status !== 'all') items = items.filter((t) => t.status === q.status);
  if (q.priority) items = items.filter((t) => t.priority === q.priority);
  if (q.assigneeId) items = items.filter((t) => t.assigneeIds.includes(q.assigneeId));
  if (q.orgId) items = items.filter((t) => t.ownerOrgId === q.orgId);
  if (q.mine === 'true') items = items.filter((t) => t.assigneeIds.includes(s.user.id));
  if (q.search) items = items.filter((t) => norm(t.title).includes(norm(q.search)) || norm(t.code).includes(norm(q.search)));
  return http.ok(res, items);
}

async function getTask(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.view' });
  if (!s) return;
  const db = getDb();
  const row = taskRow(db, ctx.params.id);
  if (!row) return http.notFound(res, 'Nhiệm vụ không tồn tại.');
  const items = db.prepare('SELECT * FROM task_items WHERE task_id = ? ORDER BY sort_order').all(row.id);
  const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at').all(row.id);
  const history = db.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY created_at DESC').all(row.id);
  const docs = db.prepare(`SELECT d.* FROM documents d JOIN task_documents td ON td.doc_id = d.id WHERE td.task_id = ?`).all(row.id);
  return http.ok(res, m.task(row, {
    items: items.map((i) => ({ id: i.id, title: i.title, done: !!i.done, assigneeId: i.assignee_id, dueDate: i.due_date })),
    comments: comments.map((c) => ({ id: c.id, userId: c.user_id, userName: c.user_name, body: c.body, createdAt: c.created_at })),
    history: history.map((h) => ({ id: h.id, userId: h.user_id, userName: h.user_name, action: h.action, detail: h.detail, createdAt: h.created_at })),
    documents: docs.map(m.document),
  }));
}

async function createTask(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.create' });
  if (!s) return;
  const body = await http.readJson(req);
  const title = sec.cleanText(body.title, 300);
  if (!title) return http.badRequest(res, 'Tiêu đề nhiệm vụ là bắt buộc.');
  const db = getDb();
  const id = sec.makeId('task');
  const code = nextCode(db, 'tasks', 'NV');
  const ts = nowIso();
  const assignees = (Array.isArray(body.assigneeIds) ? body.assigneeIds : []).filter(Boolean);
  const partners = (Array.isArray(body.partnerOrgIds) ? body.partnerOrgIds : []).filter(Boolean);

  /*
   * Liệt kê ĐÚNG các cột có trong VALUES.
   * Bản trước ghi 21 cột nhưng VALUES chỉ có 14 placeholder + 7 hằng, trong khi
   * `.run()` nhận 15 tham số → lệch số lượng, mọi lần tạo nhiệm vụ đều trả 500.
   */
  db.prepare(`INSERT INTO tasks (id, code, title, description, owner_org_id, assigner_id, assignee_ids, partner_org_ids,
      start_date, due_date, priority, status, progress, source_type, source_id, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',0,'internal',NULL,'operational',0,?,?,?,?)`).run(
    id, code, title, sec.cleanText(body.description || body.desc, 5000), body.ownerOrgId || s.user.orgId,
    s.user.id, JSON.stringify(assignees), JSON.stringify(partners),
    body.startDate || ts.slice(0, 10), body.dueDate || null,
    ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal',
    process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  (Array.isArray(body.items) ? body.items : []).forEach((it, idx) => {
    db.prepare('INSERT INTO task_items (id, task_id, title, done, assignee_id, due_date, sort_order) VALUES (?,?,?,0,?,?,?)')
      .run(sec.makeId('ti'), id, sec.cleanText(it.title || it, 300), it.assigneeId || null, it.dueDate || null, idx + 1);
  });
  db.prepare('INSERT INTO task_history (id, task_id, user_id, user_name, action, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(sec.makeId('th'), id, s.user.id, s.user.name, 'Tạo nhiệm vụ', `Giao ${assignees.length} cán bộ thực hiện`, ts);
  if (assignees.length) {
    notify(db, { system: 'workspace', type: 'task', title: 'Nhiệm vụ mới được giao', body: `${code} — ${title}`, href: `task-detail.html?id=${id}` });
  }
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'task.create', targetType: 'Nhiệm vụ', targetId: id, targetName: title, detail: code, req });
  return http.created(res, m.task(taskRow(db, id)));
}

async function updateTask(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.edit' });
  if (!s) return;
  const db = getDb();
  const row = taskRow(db, ctx.params.id);
  if (!row) return http.notFound(res, 'Nhiệm vụ không tồn tại.');
  const body = await http.readJson(req);
  const ts = nowIso();
  const patch = {};
  if (body.title !== undefined) patch.title = sec.cleanText(body.title, 300) || row.title;
  if (body.description !== undefined || body.desc !== undefined) patch.description = sec.cleanText(body.description ?? body.desc, 5000);
  if (body.dueDate !== undefined) patch.due_date = body.dueDate || null;
  if (body.priority !== undefined) patch.priority = ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : row.priority;
  if (body.assigneeIds !== undefined) {
    if (!auth.hasPermission(s.user, 'task.assign')) return http.forbidden(res, 'Bạn không có quyền phân công nhiệm vụ.');
    patch.assignee_ids = JSON.stringify((body.assigneeIds || []).filter(Boolean));
  }
  if (body.partnerOrgIds !== undefined) patch.partner_org_ids = JSON.stringify((body.partnerOrgIds || []).filter(Boolean));
  if (body.resultNote !== undefined) patch.result_note = sec.cleanText(body.resultNote, 5000);
  if (!Object.keys(patch).length) return http.badRequest(res, 'Không có dữ liệu cập nhật.');
  db.prepare(`UPDATE tasks SET ${Object.keys(patch).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...Object.values(patch), ts, row.id);
  db.prepare('INSERT INTO task_history (id, task_id, user_id, user_name, action, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(sec.makeId('th'), row.id, s.user.id, s.user.name, 'Cập nhật nhiệm vụ', 'Cập nhật thông tin nhiệm vụ', ts);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'task.update', targetType: 'Nhiệm vụ', targetId: row.id, targetName: row.title, detail: 'Cập nhật thông tin nhiệm vụ', req });
  return http.ok(res, m.task(taskRow(db, row.id)));
}

async function taskAction(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.view' });
  if (!s) return;
  const db = getDb();
  const row = taskRow(db, ctx.params.id);
  if (!row) return http.notFound(res, 'Nhiệm vụ không tồn tại.');
  const body = await http.readJson(req).catch(() => ({}));
  const action = ctx.params.action;
  const ts = nowIso();
  const patch = {};
  let detail = '';
  const isAssignee = String(row.assignee_ids || '').includes(s.user.id);

  switch (action) {
    case 'progress': {
      if (!isAssignee && !auth.hasPermission(s.user, 'task.edit')) return http.forbidden(res, 'Chỉ cán bộ được giao mới cập nhật tiến độ.');
      const value = Math.max(0, Math.min(100, Math.round(Number(body.progress) || 0)));
      patch.progress = value;
      if (!['done', 'cancelled', 'paused'].includes(row.status)) {
        patch.status = value >= 100 ? 'review' : value > 0 ? 'doing' : 'new';
      }
      detail = `Tiến độ: ${row.progress}% → ${value}%${body.note ? ` — ${sec.cleanText(body.note, 300)}` : ''}`;
      break;
    }
    case 'submit': {
      if (!isAssignee && !auth.hasPermission(s.user, 'task.edit')) return http.forbidden(res, 'Bạn không có quyền gửi kết quả nhiệm vụ.');
      patch.status = 'review';
      patch.progress = 100;
      patch.result_note = sec.cleanText(body.resultNote, 5000) || row.result_note || '';
      detail = 'Gửi kết quả, đề nghị xác nhận hoàn thành';
      notify(db, { system: 'workspace', type: 'task', title: 'Nhiệm vụ chờ xác nhận', body: `${row.code} — ${row.title}`, href: `task-detail.html?id=${row.id}` });
      break;
    }
    case 'complete': {
      if (!auth.hasPermission(s.user, 'task.approve')) return http.forbidden(res, 'Bạn không có quyền xác nhận hoàn thành nhiệm vụ.');
      patch.status = 'done';
      patch.progress = 100;
      patch.completed_at = ts;
      patch.result_note = sec.cleanText(body.resultNote, 5000) || row.result_note || '';
      detail = 'Xác nhận hoàn thành nhiệm vụ';
      notify(db, { system: 'workspace', type: 'task', title: 'Nhiệm vụ đã hoàn thành', body: `${row.code} — ${row.title}`, href: `task-detail.html?id=${row.id}` });
      break;
    }
    case 'revision': {
      if (!auth.hasPermission(s.user, 'task.approve')) return http.forbidden(res, 'Bạn không có quyền yêu cầu bổ sung.');
      patch.status = 'doing';
      detail = `Yêu cầu bổ sung: ${sec.cleanText(body.note, 500)}`;
      break;
    }
    case 'pause': {
      patch.status = 'paused';
      detail = `Tạm dừng: ${sec.cleanText(body.note, 500) || 'Theo đề nghị'}`;
      break;
    }
    case 'resume': {
      patch.status = row.progress > 0 ? 'doing' : 'new';
      detail = 'Tiếp tục thực hiện nhiệm vụ';
      break;
    }
    case 'cancel': {
      if (!auth.hasPermission(s.user, 'task.approve')) return http.forbidden(res, 'Bạn không có quyền hủy nhiệm vụ.');
      patch.status = 'cancelled';
      detail = `Hủy nhiệm vụ: ${sec.cleanText(body.note, 500) || 'Theo quyết định'}`;
      break;
    }
    default:
      return http.badRequest(res, 'Hành động không hợp lệ.');
  }
  patch.updated_at = ts;
  db.prepare(`UPDATE tasks SET ${Object.keys(patch).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...Object.values(patch), row.id);
  db.prepare('INSERT INTO task_history (id, task_id, user_id, user_name, action, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(sec.makeId('th'), row.id, s.user.id, s.user.name, action === 'progress' ? 'Cập nhật tiến độ' : 'Thay đổi trạng thái', detail, ts);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: `task.${action}`, targetType: 'Nhiệm vụ', targetId: row.id, targetName: row.title, detail, req });
  return http.ok(res, m.task(taskRow(db, row.id)));
}

async function addTaskItem(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.edit' });
  if (!s) return;
  const db = getDb();
  const row = taskRow(db, ctx.params.id);
  if (!row) return http.notFound(res, 'Nhiệm vụ không tồn tại.');
  const body = await http.readJson(req);
  const title = sec.cleanText(body.title, 300);
  if (!title) return http.badRequest(res, 'Nội dung công việc là bắt buộc.');
  const id = sec.makeId('ti');
  const count = db.prepare('SELECT COUNT(*) AS c FROM task_items WHERE task_id = ?').get(row.id).c;
  db.prepare('INSERT INTO task_items (id, task_id, title, done, assignee_id, due_date, sort_order) VALUES (?,?,?,0,?,?,?)')
    .run(id, row.id, title, body.assigneeId || null, body.dueDate || null, count + 1);
  return http.created(res, { id, taskId: row.id, title, done: false });
}

async function updateTaskItems(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.edit' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const items = Array.isArray(body.items) ? body.items : [];
  items.forEach((it) => {
    db.prepare('UPDATE task_items SET done = ? WHERE id = ? AND task_id = ?').run(it.done ? 1 : 0, it.id, ctx.params.id);
  });
  return http.ok(res, db.prepare('SELECT * FROM task_items WHERE task_id = ? ORDER BY sort_order').all(ctx.params.id)
    .map((i) => ({ id: i.id, title: i.title, done: !!i.done, assigneeId: i.assignee_id, dueDate: i.due_date })));
}

async function addTaskComment(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'task.view' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const text = sec.cleanText(body.body, 2000);
  if (!text) return http.badRequest(res, 'Nội dung trao đổi không được để trống.');
  const row = taskRow(db, ctx.params.id);
  if (!row) return http.notFound(res, 'Nhiệm vụ không tồn tại.');
  const id = sec.makeId('tc');
  const ts = nowIso();
  db.prepare('INSERT INTO task_comments (id, task_id, user_id, user_name, body, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, row.id, s.user.id, s.user.name, text, ts);
  db.prepare('INSERT INTO task_history (id, task_id, user_id, user_name, action, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(sec.makeId('th'), row.id, s.user.name, 'Trao đổi nội bộ', text.slice(0, 200), ts);
  return http.created(res, { id, userId: s.user.id, userName: s.user.name, body: text, createdAt: ts });
}

/* ============================== ĐƠN VỊ ==================================== */

async function listOrganizations(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT o.*,
      (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.password_algo = 'scrypt') AS member_count
      FROM organizations o ORDER BY o.sort_order, o.name`).all();
  return http.ok(res, rows.map(m.organization));
}

async function saveOrganization(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'org.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const name = sec.cleanText(body.name, 400);
  if (!name) return http.badRequest(res, 'Tên đơn vị là bắt buộc.');
  const id = ctx.params.id || body.id;
  const ts = nowIso();
  const payload = {
    name, short_name: sec.cleanText(body.shortName, 150) || null, type: body.type || 'unit',
    parent_id: body.parentId || null, address: sec.cleanText(body.address, 300) || null,
    phone: sec.cleanText(body.phone, 50) || null, email: sec.cleanText(body.email, 150) || null,
    website: sec.cleanText(body.website, 200) || null, head_name: sec.cleanText(body.head, 150) || null,
    description: sec.cleanText(body.description || body.note, 1000) || null,
    status: ['active', 'paused', 'archived'].includes(body.status) ? body.status : 'active',
  };
  if (id) {
    const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Đơn vị không tồn tại.');
    if (body.parentId === id) return http.badRequest(res, 'Đơn vị không thể trực thuộc chính nó.');
    db.prepare(`UPDATE organizations SET ${Object.keys(payload).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...Object.values(payload), ts, id);
    auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'org.update', targetType: 'Tổ chức', targetId: id, targetName: name, detail: 'Cập nhật thông tin đơn vị', req });
    return http.ok(res, m.organization(db.prepare('SELECT * FROM organizations WHERE id = ?').get(id)));
  }
  const newId = sec.makeId('org');
  const code = sec.cleanText(body.code, 50) || `DV-${newId.slice(-6).toUpperCase()}`;
  db.prepare(`INSERT INTO organizations (id, code, name, short_name, type, parent_id, address, phone, email, website,
      head_name, description, status, sort_order, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,99,'operational',0,?,?,?,?)`).run(
    newId, code, payload.name, payload.short_name, payload.type, payload.parent_id, payload.address,
    payload.phone, payload.email, payload.website, payload.head_name, payload.description, payload.status,
    process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'org.create', targetType: 'Tổ chức', targetId: newId, targetName: name, detail: 'Thêm đơn vị mới', req });
  return http.created(res, m.organization(db.prepare('SELECT * FROM organizations WHERE id = ?').get(newId)));
}

async function deleteOrganization(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'org.manage' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Đơn vị không tồn tại.');
  const children = db.prepare('SELECT COUNT(*) AS c FROM organizations WHERE parent_id = ?').get(row.id).c;
  if (children) return http.conflict(res, 'Đơn vị còn đơn vị trực thuộc, không thể xóa.');
  const used = db.prepare('SELECT COUNT(*) AS c FROM users WHERE org_id = ?').get(row.id).c;
  if (used) return http.conflict(res, `Đơn vị đang có ${used} người dùng, không thể xóa.`);
  db.prepare('DELETE FROM organizations WHERE id = ?').run(row.id);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'org.delete', targetType: 'Tổ chức', targetId: row.id, targetName: row.name, detail: 'Xóa đơn vị', req });
  return http.ok(res, { id: row.id, message: 'Đã xóa đơn vị.' });
}

/* ============================== NGƯỜI DÙNG ================================ */

async function listUsers(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'user.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT u.*, r.name AS role_name, r.code AS role_code, o.name AS org_name
      FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.system_key = 'workspace' AND u.password_algo = 'scrypt' ORDER BY u.full_name`).all();
  return http.ok(res, rows.map((u) => ({
    id: u.id, code: u.code, name: u.full_name, username: u.username, email: u.email, phone: u.phone,
    orgId: u.org_id, orgName: u.org_name, position: u.position, roleId: u.role_id, roleCode: u.role_code, roleName: u.role_name,
    status: u.status, createdAt: u.created_at, lastLogin: u.last_login_at, hasAccount: u.password_algo === 'scrypt',
  })));
}

async function saveUser(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'user.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const id = ctx.params.id || body.id;
  const ts = nowIso();
  const name = sec.cleanText(body.name, 200);
  if (!name) return http.badRequest(res, 'Họ tên là bắt buộc.');

  if (id) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Người dùng không tồn tại.');
    const patch = {
      full_name: name,
      email: sec.cleanText(body.email, 150) || null,
      phone: sec.cleanText(body.phone, 50) || null,
      position: sec.cleanText(body.position, 200) || null,
      org_id: body.orgId || row.org_id,
      role_id: body.roleId || row.role_id,
      status: ['active', 'locked', 'pending'].includes(body.status) ? body.status : row.status,
    };
    db.prepare(`UPDATE users SET ${Object.keys(patch).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...Object.values(patch), ts, id);
    if (patch.status === 'locked') {
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(ts, id);
    }
    auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'user.update', targetType: 'Người dùng', targetId: id, targetName: name, detail: 'Cập nhật tài khoản', req });
    return http.ok(res, { id, message: 'Đã cập nhật tài khoản.' });
  }

  const username = sec.cleanText(body.username, 60).toLowerCase();
  if (!/^[a-z0-9._]{4,40}$/.test(username)) {
    return http.badRequest(res, 'Tên đăng nhập chỉ gồm chữ thường, số, dấu chấm hoặc gạch dưới (4-40 ký tự).');
  }
  if (db.prepare('SELECT 1 FROM users WHERE lower(username) = ?').get(username)) {
    return http.conflict(res, 'Tên đăng nhập đã được sử dụng.');
  }
  const check = auth.validatePasswordStrength(body.password);
  if (!check.ok) return http.badRequest(res, `Mật khẩu khởi tạo không đạt yêu cầu: ${check.message}`);
  const newId = sec.makeId('u');
  const code = nextCode(db, 'users', 'NS', 'code');
  db.prepare(`INSERT INTO users (id, code, username, password_hash, password_algo, full_name, email, phone, position,
      system_key, role_id, org_id, status, must_change_password, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,'scrypt',?,?,?,?,'workspace',?,?,?,1,'operational',0,?,?,?,?)`).run(
    newId, code, username, sec.hashPassword(body.password), name, sec.cleanText(body.email, 150) || null,
    sec.cleanText(body.phone, 50) || null, sec.cleanText(body.position, 200) || null,
    body.roleId || null, body.orgId || null, body.status === 'pending' ? 'pending' : 'active',
    process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'user.create', targetType: 'Người dùng', targetId: newId, targetName: name, detail: 'Tạo tài khoản mới (phải đổi mật khẩu lần đầu)', req });
  return http.created(res, { id: newId, username, message: 'Đã tạo tài khoản. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.' });
}

async function resetUserPassword(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'user.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Người dùng không tồn tại.');
  const check = auth.validatePasswordStrength(body.password);
  if (!check.ok) return http.badRequest(res, `Mật khẩu không đạt yêu cầu: ${check.message}`);
  db.prepare('UPDATE users SET password_hash = ?, password_algo = \'scrypt\', must_change_password = 1, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(sec.hashPassword(body.password), nowIso(), row.id);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(nowIso(), row.id);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'user.reset_password', targetType: 'Người dùng', targetId: row.id, targetName: row.full_name, detail: 'Đặt lại mật khẩu', req });
  return http.ok(res, { message: 'Đã đặt lại mật khẩu. Người dùng phải đổi mật khẩu khi đăng nhập.' });
}

/* ============================== VAI TRÒ =================================== */

async function listRoles(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
      FROM roles r WHERE r.system_key = 'workspace' ORDER BY r.is_system DESC, r.name`).all();
  return http.ok(res, rows.map((r) => m.role(r, db.prepare('SELECT permission_code FROM role_permissions WHERE role_id = ?').all(r.id).map((x) => x.permission_code))));
}

async function listPermissions(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  return http.ok(res, db.prepare('SELECT * FROM permissions ORDER BY group_code, code').all()
    .map((p) => ({ code: p.code, name: p.name, group: p.group_code })));
}

async function saveRole(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'role.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const id = ctx.params.id || body.id;
  const ts = nowIso();
  const perms = Array.isArray(body.perms) ? body.perms.filter((p) => typeof p === 'string') : [];
  const validPerms = new Set(db.prepare('SELECT code FROM permissions').all().map((p) => p.code));
  const filtered = perms.filter((p) => validPerms.has(p));

  if (id) {
    const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Vai trò không tồn tại.');
    if (row.is_system) return http.forbidden(res, 'Không thể chỉnh sửa vai trò hệ thống.');
    db.prepare('UPDATE roles SET name = ?, description = ?, data_scope = ?, updated_at = ? WHERE id = ?')
      .run(sec.cleanText(body.name, 200) || row.name, sec.cleanText(body.description, 500),
        ['own', 'unit', 'all'].includes(body.scope) ? body.scope : row.data_scope, ts, id);
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
    filtered.forEach((p) => db.prepare('INSERT INTO role_permissions (role_id, permission_code) VALUES (?,?)').run(id, p));
    auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'role.update', targetType: 'Phân quyền', targetId: id, targetName: body.name || row.name, detail: 'Cập nhật vai trò', req });
    return http.ok(res, { id, message: 'Đã cập nhật vai trò.' });
  }

  const name = sec.cleanText(body.name, 200);
  if (!name) return http.badRequest(res, 'Tên vai trò là bắt buộc.');
  const newId = sec.makeId('role');
  db.prepare(`INSERT INTO roles (id, code, name, system_key, description, data_scope, is_system, data_source, is_seed_data, environment, created_at, updated_at)
     VALUES (?,?,?,'workspace',?,?,0,'operational',0,?,?,?)`)
    .run(newId, sec.cleanText(body.code, 60) || newId, name, sec.cleanText(body.description, 500),
      ['own', 'unit', 'all'].includes(body.scope) ? body.scope : 'own',
      process.env.APP_ENV || 'development', ts, ts);
  filtered.forEach((p) => db.prepare('INSERT INTO role_permissions (role_id, permission_code) VALUES (?,?)').run(newId, p));
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'role.create', targetType: 'Phân quyền', targetId: newId, targetName: name, detail: 'Tạo vai trò mới', req });
  return http.created(res, { id: newId, message: 'Đã tạo vai trò.' });
}

async function deleteRole(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'role.manage' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Vai trò không tồn tại.');
  if (row.is_system) return http.forbidden(res, 'Không thể xóa vai trò hệ thống.');
  const used = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role_id = ?').get(row.id).c;
  if (used) return http.conflict(res, `Vai trò đang được gán cho ${used} người dùng.`);
  db.prepare('DELETE FROM roles WHERE id = ?').run(row.id);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'role.delete', targetType: 'Phân quyền', targetId: row.id, targetName: row.name, detail: 'Xóa vai trò', req });
  return http.ok(res, { id: row.id, message: 'Đã xóa vai trò.' });
}

/* ============================== TÀI LIỆU ================================== */

async function listDocuments(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT d.*, o.name AS org_name, u.full_name AS uploader_name FROM documents d
      LEFT JOIN organizations o ON o.id = d.org_id LEFT JOIN users u ON u.id = d.uploader_id
      WHERE d.status = 'active' ORDER BY d.created_at DESC`).all();
  let items = rows.map(m.document);
  if (ctx.query.folder) items = items.filter((d) => d.folder === ctx.query.folder);
  if (ctx.query.search) items = items.filter((d) => norm(d.name).includes(norm(ctx.query.search)) || norm(d.code).includes(norm(ctx.query.search)));
  return http.ok(res, items);
}

async function saveDocument(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'doc.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const name = sec.cleanText(body.name, 300);
  if (!name) return http.badRequest(res, 'Tên tài liệu là bắt buộc.');
  const ts = nowIso();
  const id = ctx.params.id || body.id;
  if (id) {
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Tài liệu không tồn tại.');
    db.prepare(`UPDATE documents SET name = ?, type = ?, org_id = ?, access = ?, folder = ?, summary = ?, issued_at = ?, updated_at = ? WHERE id = ?`)
      .run(name, body.type || row.type, body.orgId || row.org_id,
        ['public', 'internal', 'restricted'].includes(body.access) ? body.access : row.access,
        sec.cleanText(body.folder, 120) || row.folder, sec.cleanText(body.summary, 1000),
        body.issuedAt || row.issued_at, ts, id);
    auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'doc.update', targetType: 'Tài liệu', targetId: id, targetName: name, detail: 'Cập nhật tài liệu', req });
    return http.ok(res, m.document(db.prepare('SELECT * FROM documents WHERE id = ?').get(id)));
  }
  const newId = sec.makeId('doc');
  const code = nextCode(db, 'documents', 'VB');
  db.prepare(`INSERT INTO documents (id, code, name, type, org_id, uploader_id, issued_at, format, size, access, folder,
      summary, status, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,'active','operational',0,?,?,?,?)`).run(
    newId, code, name, body.type || 'plan', body.orgId || s.user.orgId, s.user.id,
    body.issuedAt || ts.slice(0, 10), sec.cleanText(body.format, 20) || (name.split('.').pop() || '').toUpperCase(),
    Number(body.size) || 0, ['public', 'internal', 'restricted'].includes(body.access) ? body.access : 'internal',
    sec.cleanText(body.folder, 120) || 'Chưa phân loại', sec.cleanText(body.summary, 1000),
    process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  db.prepare('INSERT INTO doc_versions (id, doc_id, version, note, user_id, created_at) VALUES (?,?,?,?,?,?)')
    .run(sec.makeId('dv'), newId, 'v1.0', 'Tải lên lần đầu', s.user.id, ts);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'doc.upload', targetType: 'Tài liệu', targetId: newId, targetName: name, detail: 'Tạo tài liệu mới', req });
  return http.created(res, m.document(db.prepare('SELECT * FROM documents WHERE id = ?').get(newId)));
}

async function deleteDocument(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'doc.manage' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Tài liệu không tồn tại.');
  db.prepare("UPDATE documents SET status = 'archived', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'doc.delete', targetType: 'Tài liệu', targetId: row.id, targetName: row.name, detail: 'Lưu trữ tài liệu', req });
  return http.ok(res, { id: row.id, message: 'Đã lưu trữ tài liệu.' });
}

/* ============================== LỊCH CÔNG TÁC ============================= */

async function listEvents(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT e.*, u.full_name AS owner_name FROM events e
      LEFT JOIN users u ON u.id = e.owner_id WHERE e.status = 'active' ORDER BY e.start_at`).all();
  return http.ok(res, rows.map(m.event));
}

async function saveEvent(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'calendar.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const title = sec.cleanText(body.title, 300);
  if (!title) return http.badRequest(res, 'Tiêu đề sự kiện là bắt buộc.');
  if (!body.start) return http.badRequest(res, 'Thời gian bắt đầu là bắt buộc.');
  const ts = nowIso();
  const id = ctx.params.id || body.id;
  if (id) {
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Sự kiện không tồn tại.');
    db.prepare(`UPDATE events SET title = ?, type = ?, start_at = ?, end_at = ?, location = ?, org_id = ?,
        participants = ?, description = ?, updated_at = ? WHERE id = ?`)
      .run(title, body.type || row.type, body.start, body.end || null, sec.cleanText(body.location, 300),
        body.orgId || row.org_id, JSON.stringify(body.participants || []), sec.cleanText(body.desc, 3000), ts, id);
    auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'calendar.update', targetType: 'Lịch công tác', targetId: id, targetName: title, detail: 'Cập nhật sự kiện', req });
    return http.ok(res, m.event(db.prepare('SELECT * FROM events WHERE id = ?').get(id)));
  }
  const newId = sec.makeId('ev');
  db.prepare(`INSERT INTO events (id, title, type, start_at, end_at, location, org_id, owner_id, participants, description,
      status, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,'active','operational',0,?,?,?,?)`).run(
    newId, title, body.type || 'meeting', body.start, body.end || null, sec.cleanText(body.location, 300),
    body.orgId || s.user.orgId, s.user.id, JSON.stringify(body.participants || []), sec.cleanText(body.desc, 3000),
    process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  notify(db, { system: 'workspace', type: 'calendar', title: 'Lịch công tác mới', body: `${title} — ${new Date(body.start).toLocaleString('vi-VN')}`, href: 'calendar.html' });
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'calendar.create', targetType: 'Lịch công tác', targetId: newId, targetName: title, detail: 'Tạo sự kiện mới', req });
  return http.created(res, m.event(db.prepare('SELECT * FROM events WHERE id = ?').get(newId)));
}

async function deleteEvent(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'calendar.manage' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Sự kiện không tồn tại.');
  db.prepare("UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  return http.ok(res, { id: row.id, message: 'Đã hủy sự kiện.' });
}

/* ============================== BÁO CÁO =================================== */

async function listReports(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'report.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT r.*, o.name AS org_name, u.full_name AS author_name FROM reports r
      LEFT JOIN organizations o ON o.id = r.org_id LEFT JOIN users u ON u.id = r.author_id
      ORDER BY r.updated_at DESC`).all();
  let items = rows.map(m.report);
  if (ctx.query.status) items = items.filter((r) => r.status === ctx.query.status);
  return http.ok(res, items);
}

async function getReport(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'report.view' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Báo cáo không tồn tại.');
  const docs = db.prepare('SELECT d.* FROM documents d JOIN report_documents rd ON rd.doc_id = d.id WHERE rd.report_id = ?').all(row.id);
  return http.ok(res, m.report(row, { documents: docs.map(m.document) }));
}

async function saveReport(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: ['report.create', 'report.edit'] });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const name = sec.cleanText(body.name, 300);
  if (!name) return http.badRequest(res, 'Tên báo cáo là bắt buộc.');
  const ts = nowIso();
  const id = ctx.params.id || body.id;
  if (id) {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Báo cáo không tồn tại.');
    if (['approved', 'pending'].includes(row.status) && !auth.hasPermission(s.user, 'report.approve')) {
      return http.forbidden(res, 'Báo cáo đang trong quy trình duyệt, không thể chỉnh sửa.');
    }
    db.prepare(`UPDATE reports SET name = ?, type = ?, period = ?, content = ?, results = ?, issues = ?, proposals = ?,
        public_summary = ?, updated_at = ? WHERE id = ?`)
      .run(name, body.type || row.type, sec.cleanText(body.period, 100), sec.sanitizeHtml(body.content),
        sec.cleanText(body.results, 5000), sec.cleanText(body.issues, 5000), sec.cleanText(body.proposals, 5000),
        sec.cleanText(body.publicSummary, 2000), ts, id);
    db.prepare('DELETE FROM report_documents WHERE report_id = ?').run(id);
    (body.docIds || []).forEach((docId) => {
      db.prepare('INSERT OR IGNORE INTO report_documents (report_id, doc_id) VALUES (?,?)').run(id, docId);
    });
    auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'report.update', targetType: 'Báo cáo', targetId: id, targetName: name, detail: 'Lưu báo cáo', req });
    return http.ok(res, m.report(db.prepare('SELECT * FROM reports WHERE id = ?').get(id)));
  }
  const newId = sec.makeId('rep');
  const code = nextCode(db, 'reports', 'BC');
  db.prepare(`INSERT INTO reports (id, code, name, type, org_id, author_id, period, status, content, results, issues,
      proposals, task_id, public_summary, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,'operational',0,?,?,?,?,?)`).run(
    newId, code, name, body.type || 'monthly', body.orgId || s.user.orgId, s.user.id,
    sec.cleanText(body.period, 100), sec.sanitizeHtml(body.content), sec.cleanText(body.results, 5000),
    sec.cleanText(body.issues, 5000), sec.cleanText(body.proposals, 5000), body.taskId || null,
    sec.cleanText(body.publicSummary, 2000), process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  (body.docIds || []).forEach((docId) => {
    db.prepare('INSERT OR IGNORE INTO report_documents (report_id, doc_id) VALUES (?,?)').run(newId, docId);
  });
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'report.create', targetType: 'Báo cáo', targetId: newId, targetName: name, detail: code, req });
  return http.created(res, m.report(db.prepare('SELECT * FROM reports WHERE id = ?').get(newId)));
}

async function reportAction(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'report.view' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Báo cáo không tồn tại.');
  const body = await http.readJson(req).catch(() => ({}));
  const action = ctx.params.action;
  const ts = nowIso();
  const patch = { updated_at: ts };
  let detail = '';

  if (action === 'send') {
    if (!auth.hasPermission(s.user, 'report.send')) return http.forbidden(res, 'Bạn không có quyền gửi báo cáo.');
    if (!['draft', 'ready', 'revision'].includes(row.status)) return http.badRequest(res, 'Báo cáo không ở trạng thái có thể gửi.');
    patch.status = 'pending';
    patch.submitted_at = ts;
    detail = 'Gửi báo cáo để duyệt';
    notify(db, { system: 'workspace', type: 'report', title: 'Báo cáo chờ duyệt', body: `${row.code} — ${row.name}`, href: `report-editor.html?id=${row.id}` });
  } else if (['approve', 'revision', 'reject'].includes(action)) {
    if (!auth.hasPermission(s.user, 'report.approve')) return http.forbidden(res, 'Bạn không có quyền duyệt báo cáo.');
    patch.status = { approve: 'approved', revision: 'revision', reject: 'rejected' }[action];
    patch.reviewed_at = ts;
    patch.reviewed_by = s.user.id;
    patch.review_note = sec.cleanText(body.note, 1000);
    detail = `Duyệt báo cáo: ${patch.status}`;
    notify(db, { system: 'workspace', type: action === 'approve' ? 'report' : 'warning', title: action === 'approve' ? 'Báo cáo được duyệt' : 'Báo cáo cần xử lý', body: `${row.code}: ${patch.review_note || ''}`, href: `report-editor.html?id=${row.id}`, toUserId: row.author_id });
  } else if (action === 'publish') {
    if (!auth.hasPermission(s.user, 'report.publish')) return http.forbidden(res, 'Bạn không có quyền công khai số liệu báo cáo.');
    if (row.status !== 'approved') return http.badRequest(res, 'Chỉ báo cáo đã duyệt mới được công khai số liệu.');
    patch.is_public = 1;
    patch.public_summary = sec.cleanText(body.publicSummary, 2000) || row.public_summary;
    detail = 'Công khai số liệu tổng hợp trên Cổng thông tin';
    notify(db, { system: 'cms', type: 'info', title: 'Báo cáo được công khai', body: `${row.code} — ${row.name}`, href: 'publishing-workflow.html' });
  } else {
    return http.badRequest(res, 'Hành động không hợp lệ.');
  }

  db.prepare(`UPDATE reports SET ${Object.keys(patch).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...Object.values(patch), row.id);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: `report.${action}`, targetType: 'Báo cáo', targetId: row.id, targetName: row.name, detail, req });
  return http.ok(res, m.report(db.prepare('SELECT * FROM reports WHERE id = ?').get(row.id)));
}

/* ============================== ĐỀ XUẤT =================================== */

async function listProposals(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'proposal.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT p.*, o.name AS org_name, c.name AS category_name FROM proposals p
      LEFT JOIN organizations o ON o.id = p.org_id LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC`).all();
  return http.ok(res, rows.map(m.proposal));
}

async function createProposal(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'proposal.create' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const title = sec.cleanText(body.title, 300);
  if (!title) return http.badRequest(res, 'Tiêu đề đề xuất là bắt buộc.');
  const ts = nowIso();
  const id = sec.makeId('prop');
  const code = nextCode(db, 'proposals', 'DX');
  db.prepare(`INSERT INTO proposals (id, code, title, summary, body, category_id, org_id, author_id, task_id, status,
      data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,'submitted','operational',0,?,?,?,?)`).run(
    id, code, title, sec.cleanText(body.summary, 1000), sec.sanitizeHtml(body.body),
    body.categoryId || null, s.user.orgId, s.user.id, body.taskId || null,
    process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  notify(db, { system: 'cms', type: 'proposal', title: 'Đề xuất nội dung mới', body: `${code} — ${title}`, href: 'publishing-workflow.html' });
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'proposal.create', targetType: 'Đề xuất', targetId: id, targetName: code, detail: title, req });
  return http.created(res, m.proposal(db.prepare('SELECT * FROM proposals WHERE id = ?').get(id)));
}

/* ============================== PHỐI HỢP ================================== */

async function listCollaborations(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'collaboration.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT cr.*, o.name AS org_name FROM collaboration_requests cr
      LEFT JOIN organizations o ON o.id = cr.to_org_id ORDER BY cr.created_at DESC`).all();
  return http.ok(res, rows.map((r) => ({
    id: r.id, code: r.code, title: r.title, description: r.description, direction: r.direction,
    refType: r.ref_type, refId: r.ref_id, orgName: r.org_name, status: r.status,
    taskId: r.task_id, createdAt: r.created_at, completedAt: r.completed_at,
  })));
}

async function updateCollaboration(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'collaboration.handle' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const row = db.prepare('SELECT * FROM collaboration_requests WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Yêu cầu phối hợp không tồn tại.');
  const status = ['received', 'processing', 'completed', 'cancelled'].includes(body.status) ? body.status : null;
  if (!status) return http.badRequest(res, 'Trạng thái không hợp lệ.');
  const ts = nowIso();
  db.prepare('UPDATE collaboration_requests SET status = ?, task_id = COALESCE(?, task_id), completed_at = ?, updated_at = ? WHERE id = ?')
    .run(status, body.taskId || null, status === 'completed' ? ts : null, ts, row.id);
  auth.logActivity({ systemKey: 'workspace', user: s.user, action: 'collaboration.update', targetType: 'Phối hợp', targetId: row.id, targetName: row.code, detail: `Trạng thái: ${status}`, req });
  return http.ok(res, { id: row.id, status });
}

/* ============================== THÔNG BÁO / NHẬT KÝ ======================== */

async function listNotifications(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM notifications WHERE system_key IN ('workspace','shared')
      AND (to_user_id IS NULL OR to_user_id = ?) ORDER BY created_at DESC LIMIT 100`).all(s.user.id);
  return http.ok(res, rows.map(m.notification), { unreadCount: rows.filter((r) => !r.is_read).length });
}

async function markNotification(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  if (ctx.params.id === 'all') {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE system_key IN ('workspace','shared') AND (to_user_id IS NULL OR to_user_id = ?)`)
      .run(s.user.id);
    return http.ok(res, { message: 'Đã đánh dấu tất cả thông báo là đã đọc.' });
  }
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Thông báo không tồn tại.');
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(row.id);
  return http.ok(res, { id: row.id, read: true });
}

async function activityLog(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace', permission: 'log.view' });
  if (!s) return;
  const db = getDb();
  const limit = Math.min(500, Number(ctx.query.limit) || 200);
  const rows = db.prepare(`SELECT * FROM activity_logs WHERE system_key IN ('workspace','shared') ORDER BY id DESC LIMIT ?`).all(limit);
  return http.ok(res, rows.map((r) => ({
    id: String(r.id), userId: r.user_id, userName: r.user_name, action: r.action,
    targetType: r.target_type, targetName: r.target_name, targetId: r.target_id,
    result: r.result, detail: r.detail, ip: r.ip, createdAt: r.created_at,
  })));
}

async function stats(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'workspace' });
  if (!s) return;
  const db = getDb();
  const t = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS c FROM tasks GROUP BY status').all().map((r) => [r.status, r.c]));
  const r = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS c FROM reports GROUP BY status').all().map((x) => [x.status, x.c]));
  return http.ok(res, {
    tasks: { total: Object.values(t).reduce((a, b) => a + b, 0), ...t },
    reports: { total: Object.values(r).reduce((a, b) => a + b, 0), ...r },
    proposals: db.prepare('SELECT COUNT(*) AS c FROM proposals').get().c,
    collaborations: db.prepare("SELECT COUNT(*) AS c FROM collaboration_requests WHERE status <> 'completed'").get().c,
    events: db.prepare("SELECT COUNT(*) AS c FROM events WHERE status = 'active'").get().c,
    documents: db.prepare("SELECT COUNT(*) AS c FROM documents WHERE status = 'active'").get().c,
    unread: db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE system_key = 'workspace' AND is_read = 0 AND (to_user_id IS NULL OR to_user_id = ?)`).get(s.user.id).c,
  });
}

module.exports = {
  listTasks, getTask, createTask, updateTask, taskAction, addTaskItem, updateTaskItems, addTaskComment,
  listOrganizations, saveOrganization, deleteOrganization,
  listUsers, saveUser, resetUserPassword,
  listRoles, listPermissions, saveRole, deleteRole,
  listDocuments, saveDocument, deleteDocument,
  listEvents, saveEvent, deleteEvent,
  listReports, getReport, saveReport, reportAction,
  listProposals, createProposal, listCollaborations, updateCollaboration,
  listNotifications, markNotification, activityLog, stats,
};
