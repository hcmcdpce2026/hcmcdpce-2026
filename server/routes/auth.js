/**
 * API xác thực & tài khoản cá nhân.
 *   POST /api/auth/login            { username, password, system }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   POST /api/auth/change-password  { currentPassword, newPassword }
 *   GET  /api/auth/permissions
 */
'use strict';

const http = require('../lib/http');
const auth = require('../lib/auth');
const sec = require('../lib/security');

async function login(req, res, ctx) {
  const body = await http.readJson(req);
  const system = ['cms', 'workspace'].includes(body.system) ? body.system : null;
  if (!system) return http.badRequest(res, 'Thiếu thông tin phân hệ đăng nhập.');

  const ip = sec.clientIp(req);
  const limit = sec.rateLimit(`login:${ip}:${String(body.username || '').toLowerCase()}`, 8, 5 * 60_000);
  if (!limit.allowed) {
    return http.tooMany(res, 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.', limit.resetAt - Date.now());
  }

  const result = auth.login(req, res, { username: body.username, password: body.password, system });
  if (!result.ok) return http.fail(res, result.status || 400, result.message);

  return http.ok(res, {
    user: result.user,
    csrfToken: result.csrfToken,
    expiresAt: result.expiresAt,
    token: result.token, // dùng cho client không hỗ trợ cookie (nhưng cookie vẫn là chính)
  });
}

async function logout(req, res, ctx) {
  const ok = auth.destroySession(req, res);
  return http.ok(res, { message: 'Đã đăng xuất.' });
}

async function me(req, res, ctx) {
  const session = auth.authenticate(req);
  if (!session) return http.unauthorized(res, 'Chưa đăng nhập.');
  return http.ok(res, {
    user: session.user,
    csrfToken: session.csrfToken,
    permissions: session.user.permissions,
  });
}

async function changePassword(req, res, ctx) {
  const session = auth.requireAuth(req, res);
  if (!session) return;
  const body = await http.readJson(req);
  const result = auth.changePassword(session, {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  if (!result.ok) return http.badRequest(res, result.message);
  auth.logActivity({
    systemKey: session.user.system, user: session.user, action: 'auth.change_password',
    targetType: 'Người dùng', targetId: session.user.id, targetName: session.user.name,
    detail: 'Đổi mật khẩu cá nhân', req,
  });
  return http.ok(res, { message: result.message });
}

async function permissions(req, res) {
  const session = auth.requireAuth(req, res);
  if (!session) return;
  return http.ok(res, {
    role: session.user.roleName,
    scope: session.user.dataScope,
    permissions: session.user.permissions,
  });
}

module.exports = { login, logout, me, changePassword, permissions };
