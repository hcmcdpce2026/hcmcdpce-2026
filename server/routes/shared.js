/**
 * API dùng chung cho cả CMS và WORKSPACE (liên thông dữ liệu):
 *   GET  /api/shared/users                 – danh bạ người dùng (cả hai phân hệ)
 *   GET  /api/shared/organizations         – danh mục đơn vị
 *   GET  /api/shared/notifications         – thông báo của phiên hiện tại
 *   POST /api/shared/notifications/read    – đánh dấu đã đọc tất cả
 *   GET  /api/shared/settings              – cấu hình chung (đọc)
 *   GET  /api/shared/summary               – số liệu tổng hợp liên thông
 */
'use strict';

const { getDb } = require('../lib/db');
const http = require('../lib/http');
const auth = require('../lib/auth');
const m = require('../lib/mapper');
const { isSystemCategoryType, listSystemCategoryTypes } = require('../lib/system-category-types');

const nowIso = () => new Date().toISOString();

async function users(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  if (!auth.hasPermission(s.user, 'user.view') && s.user.dataScope !== 'all') {
    return http.forbidden(res, 'Bạn không có quyền xem danh bạ người dùng.');
  }
  const db = getDb();
  let where = `u.password_algo = 'scrypt' AND u.status = 'active'`;
  const params = [];
  if (s.user.dataScope === 'unit') {
    where += ' AND u.org_id = ?';
    params.push(s.user.orgId);
  } else if (s.user.dataScope === 'own') {
    where += ' AND u.id = ?';
    params.push(s.user.id);
  }
  const rows = db.prepare(`
    SELECT u.*, r.name AS role_name, r.code AS role_code, o.name AS org_name
    FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN organizations o ON o.id = u.org_id
    WHERE ${where}
    ORDER BY u.system_key, u.full_name`).all(...params);
  return http.ok(res, rows.map((u) => ({
    id: u.id, code: u.code, username: u.username, name: u.full_name, email: u.email, phone: u.phone,
    position: u.position, system: u.system_key, orgId: u.org_id, orgName: u.org_name,
    roleId: u.role_id, roleCode: u.role_code, roleName: u.role_name, status: u.status,
    initials: (u.full_name || '?').trim().split(/\s+/).slice(-2).map((w) => w.charAt(0).toUpperCase()).join(''),
  })));
}

async function organizations(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  const db = getDb();
  const rows = db.prepare('SELECT * FROM organizations WHERE status = \'active\' ORDER BY sort_order, name').all();
  return http.ok(res, rows.map(m.organization));
}

async function systemCategories(req, res, ctx) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  const categoryType = ctx.query.type || '';
  if (!isSystemCategoryType(categoryType)) {
    return http.badRequest(res, 'Loại danh mục không hợp lệ.');
  }
  const rows = getDb().prepare(`SELECT id, code, name, category_type AS categoryType, status, sort_order AS sortOrder
    FROM system_categories WHERE category_type = ? AND status = 'active'
    ORDER BY sort_order, name`).all(categoryType);
  return http.ok(res, rows);
}

/** Danh sách loại danh mục hệ thống — dùng cho dropdown quản trị đơn vị. */
async function systemCategoryTypes(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  return http.ok(res, listSystemCategoryTypes());
}

async function notifications(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE (system_key = ? OR system_key IN ('shared','public'))
      AND (to_user_id IS NULL OR to_user_id = ?)
    ORDER BY created_at DESC LIMIT 50`).all(s.user.system, s.user.id);
  return http.ok(res, rows.map(m.notification), {
    unreadCount: rows.filter((r) => !r.is_read).length,
  });
}

async function markRead(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  const db = getDb();
  db.prepare(`UPDATE notifications SET is_read = 1
              WHERE (system_key = ? OR system_key IN ('shared','public'))
                AND (to_user_id IS NULL OR to_user_id = ?)`)
    .run(s.user.system, s.user.id);
  return http.ok(res, { message: 'Đã đánh dấu tất cả thông báo là đã đọc.', at: nowIso() });
}

async function settings(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM settings').all();
  const map = {};
  row.forEach((r) => { try { map[r.key] = JSON.parse(r.value); } catch (e) { map[r.key] = r.value; } });
  return http.ok(res, map);
}

/** Số liệu tổng hợp của cả ba phân hệ – dùng cho dashboard liên thông */
async function summary(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  const db = getDb();
  const one = (sql) => db.prepare(sql).get().c;
  return http.ok(res, {
    articles: {
      published: one("SELECT COUNT(*) AS c FROM articles WHERE status = 'published'"),
      pending: one("SELECT COUNT(*) AS c FROM articles WHERE status = 'pending'"),
      workspaceOrigin: one("SELECT COUNT(*) AS c FROM articles WHERE origin = 'workspace' AND status = 'published'"),
    },
    submissions: {
      open: one("SELECT COUNT(*) AS c FROM submissions WHERE status IN ('new','assigned','in_progress')"),
      answered: one("SELECT COUNT(*) AS c FROM submissions WHERE status = 'answered'"),
      publicResults: one('SELECT COUNT(*) AS c FROM submissions WHERE is_public_result = 1'),
    },
    proposals: {
      waiting: one("SELECT COUNT(*) AS c FROM proposals WHERE status IN ('submitted','in_review','revision')"),
      published: one("SELECT COUNT(*) AS c FROM proposals WHERE status = 'published'"),
    },
    tasks: {
      open: one("SELECT COUNT(*) AS c FROM tasks WHERE status IN ('new','doing','review','overdue')"),
      done: one("SELECT COUNT(*) AS c FROM tasks WHERE status = 'done'"),
    },
    reports: {
      pending: one("SELECT COUNT(*) AS c FROM reports WHERE status IN ('sent','pending')"),
      approved: one("SELECT COUNT(*) AS c FROM reports WHERE status = 'approved'"),
      public: one('SELECT COUNT(*) AS c FROM reports WHERE is_public = 1'),
    },
    organizations: one('SELECT COUNT(*) AS c FROM organizations'),
    users: one("SELECT COUNT(*) AS c FROM users WHERE password_algo = 'scrypt'"),
  });
}

module.exports = { users, organizations, systemCategories, systemCategoryTypes, notifications, markRead, settings, summary };
