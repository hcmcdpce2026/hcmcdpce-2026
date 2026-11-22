/**
 * Xác thực phía máy chủ:
 * - Phiên lưu trong DB, token gửi qua cookie HttpOnly (SameSite=Lax) hoặc Authorization: Bearer.
 * - CSRF token riêng cho mỗi phiên; bắt buộc với POST/PUT/PATCH/DELETE khi dùng cookie.
 * - Giới hạn số lần đăng nhập sai; khóa tạm thời.
 * - Kiểm tra quyền (RBAC) dựa trên role_permissions lưu ở DB.
 */
'use strict';

const db = require('./db');
const sec = require('./security');
const http = require('./http');

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MINUTES || 480) * 60 * 1000; // 8 giờ
const MAX_FAILED = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 15);
const COOKIE_NAME = 'hcm_portal_session';
const COOKIE_SECURE = process.env.APP_ENV === 'production'
  ? process.env.COOKIE_SECURE !== 'false'
  : process.env.COOKIE_SECURE === 'true';

const nowIso = () => new Date().toISOString();
const addMinutes = (d, m) => new Date(d.getTime() + m * 60_000).toISOString();

function parseJsonList(value) {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

/** Gắn thông tin người dùng + quyền vào object gọn để trả về client */
function buildUserRow(user) {
  if (!user) return null;
  const role = db.get('SELECT * FROM roles WHERE id = ?', [user.role_id]);
  const perms = role
    ? db.all('SELECT permission_code FROM role_permissions WHERE role_id = ?', [role.id]).map((r) => r.permission_code)
    : [];
  const org = user.org_id ? db.get('SELECT id, code, name, short_name FROM organizations WHERE id = ?', [user.org_id]) : null;
  return {
    id: user.id,
    code: user.code,
    username: user.username,
    name: user.full_name,
    email: user.email,
    phone: user.phone,
    position: user.position,
    system: user.system_key,
    status: user.status,
    orgId: user.org_id,
    orgName: org ? org.name : null,
    org: org,
    roleId: user.role_id,
    roleCode: role ? role.code : null,
    role: role ? role.code : null,
    roleName: role ? role.name : null,
    dataScope: role ? role.data_scope : 'own',
    permissions: perms,
    mustChangePassword: !!user.must_change_password,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}

/** Lấy người dùng từ request (cookie hoặc Bearer) */
function authenticate(req) {
  const cookies = http.parseCookies(req);
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const rawToken = bearer || cookies[COOKIE_NAME] || '';
  if (!rawToken) return null;

  const tokenHash = sec.hashToken(rawToken);
  const session = db.get(
    `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    [tokenHash, nowIso()],
  );
  if (!session) return null;

  const user = db.get('SELECT * FROM users WHERE id = ?', [session.user_id]);
  if (!user) return null;
  if (user.status !== 'active') return null;

  db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [nowIso(), session.id]);

  return {
    sessionId: session.id,
    csrfToken: session.csrf_token,
    token: rawToken,
    usedCookie: !bearer,
    user: buildUserRow(user),
    raw: user,
  };
}

/** Tạo phiên mới sau khi đăng nhập thành công */
function createSession(req, res, userId) {
  const token = sec.randomToken(32);
  const csrf = sec.randomToken(24);
  const id = sec.makeId('sess');
  const now = new Date();
  db.run(
    `INSERT INTO sessions (id, user_id, token_hash, csrf_token, user_agent, ip, created_at, last_seen_at, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, userId, sec.hashToken(token), csrf, String(req.headers['user-agent'] || '').slice(0, 250),
      sec.clientIp(req), now.toISOString(), now.toISOString(), addMinutes(now, SESSION_TTL_MS / 60000)],
  );
  http.setCookie(res, COOKIE_NAME, token, {
    maxAge: SESSION_TTL_MS / 1000,
    httpOnly: true,
    sameSite: 'Lax',
    secure: COOKIE_SECURE,
  });
  return { token, csrfToken: csrf, expiresAt: addMinutes(now, SESSION_TTL_MS / 60000) };
}

function destroySession(req, res) {
  const auth = authenticate(req);
  if (auth) {
    db.run('UPDATE sessions SET revoked_at = ? WHERE id = ?', [nowIso(), auth.sessionId]);
  }
  http.clearCookie(res, COOKIE_NAME, { secure: COOKIE_SECURE });
  return !!auth;
}

/** Kiểm tra CSRF cho request ghi dữ liệu */
function verifyCsrf(req, auth) {
  if (!auth) return false;
  if (!auth.usedCookie) return true; // Bearer token không dùng cookie -> không có CSRF
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  const sent = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  if (!sent) return false;
  // So sánh hằng thời gian để tránh lộ thông tin qua thời gian phản hồi
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(auth.csrfToken));
  return a.length === b.length && require('node:crypto').timingSafeEqual(a, b);
}

/** Middleware: yêu cầu đăng nhập + (tuỳ chọn) quyền cụ thể */
function requireAuth(req, res, options = {}) {
  const auth = authenticate(req);
  if (!auth) {
    http.unauthorized(res, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    return null;
  }
  if (!verifyCsrf(req, auth)) {
    http.forbidden(res, 'Phiên làm việc không hợp lệ (CSRF). Vui lòng tải lại trang và thử lại.');
    return null;
  }
  if (options.system && auth.user.system !== options.system) {
    http.forbidden(res, 'Tài khoản không thuộc phân hệ này.');
    return null;
  }
  if (options.permission && !hasPermission(auth.user, options.permission)) {
    http.forbidden(res, 'Bạn không có quyền thực hiện thao tác này.');
    return null;
  }
  return auth;
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (!permission) return true;
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some((p) => user.permissions.includes(p));
}

/** Ghi nhật ký hoạt động */
function logActivity({ systemKey, user, action, targetType, targetId, targetName, detail, result, req }) {
  try {
    db.run(
      `INSERT INTO activity_logs (system_key, user_id, user_name, action, target_type, target_id, target_name, detail, result, ip, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        systemKey || (user && user.system) || 'shared',
        user ? user.id : null,
        user ? user.name : 'Khách',
        action,
        targetType || '',
        targetId || '',
        targetName || '',
        detail || '',
        result || 'success',
        req ? sec.clientIp(req) : '',
        nowIso(),
      ],
    );
  } catch (err) {
    // Không để lỗi log làm hỏng nghiệp vụ; chỉ ghi ra stderr
    console.error('[log] ', err.message);
  }
}

/** Đăng nhập: kiểm tra mật khẩu, khóa tạm, ghi log */
function login(req, res, { username, password, system }) {
  const uname = String(username || '').trim();
  const ip = sec.clientIp(req);

  // Giới hạn tần suất theo IP (chống dò quét hàng loạt); chống brute-force từng
  // tài khoản được xử lý bằng bộ đếm failed_attempts + khóa tạm trong DB bên dưới.
  const ipLimit = sec.rateLimit(`login-ip:${ip}`, 200, 60_000);
  if (!ipLimit.allowed) {
    return { ok: false, status: 429, message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.' };
  }

  if (!uname || !password) {
    return { ok: false, status: 400, message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' };
  }

  const user = db.get('SELECT * FROM users WHERE lower(username) = lower(?)', [uname]);

  const recordAttempt = (success, reason) => {
    db.run(
      'INSERT INTO login_attempts (username, ip, success, reason, created_at) VALUES (?,?,?,?,?)',
      [uname, ip, success ? 1 : 0, reason || '', nowIso()],
    );
  };

  if (!user) {
    recordAttempt(false, 'unknown_user');
    // Trả lời giống nhau để không lộ tài khoản có tồn tại hay không
    return { ok: false, status: 401, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
  }

  if (system && user.system_key !== system) {
    recordAttempt(false, 'wrong_system');
    return { ok: false, status: 401, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
  }

  if (user.status === 'locked') {
    recordAttempt(false, 'locked');
    return { ok: false, status: 401, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
  }
  if (user.status === 'pending') {
    recordAttempt(false, 'pending');
    return { ok: false, status: 401, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    recordAttempt(false, 'temp_locked');
    return { ok: false, status: 429, message: 'Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.' };
  }

  if (!sec.verifyPassword(password, user.password_hash)) {
    const failed = (user.failed_attempts || 0) + 1;
    const remaining = Math.max(0, MAX_FAILED - failed);
    const patch = { failed_attempts: failed };
    if (failed >= MAX_FAILED) {
      patch.locked_until = addMinutes(new Date(), LOCK_MINUTES);
      patch.failed_attempts = 0;
    }
    db.run(
      'UPDATE users SET failed_attempts = ?, locked_until = COALESCE(?, locked_until), updated_at = ? WHERE id = ?',
      [patch.failed_attempts, patch.locked_until || null, nowIso(), user.id],
    );
    recordAttempt(false, 'bad_password');
    logActivity({
      systemKey: user.system_key, user: null, action: 'auth.login_failed',
      targetType: 'Hệ thống', targetName: uname, detail: 'Sai mật khẩu', result: 'failed', req,
    });
    const message = failed >= MAX_FAILED
      ? `Sai mật khẩu ${MAX_FAILED} lần liên tiếp. Tài khoản tạm khóa ${LOCK_MINUTES} phút.`
      : `Tên đăng nhập hoặc mật khẩu không đúng. Còn ${remaining} lần thử.`;
    return { ok: false, status: 401, message };
  }

  // Thành công
  db.run(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?',
    [nowIso(), ip, nowIso(), user.id],
  );
  recordAttempt(true, 'ok');
  const session = createSession(req, res, user.id);
  const fresh = db.get('SELECT * FROM users WHERE id = ?', [user.id]);
  const publicUser = buildUserRow(fresh);
  logActivity({
    systemKey: user.system_key, user: publicUser, action: 'auth.login',
    targetType: 'Hệ thống', targetName: 'Phiên đăng nhập', detail: `Đăng nhập ${system || user.system_key}`, req,
  });
  return { ok: true, user: publicUser, ...session };
}

/** Đổi mật khẩu cá nhân */
function changePassword(auth, { currentPassword, newPassword }) {
  const user = db.get('SELECT * FROM users WHERE id = ?', [auth.user.id]);
  if (!user) return { ok: false, status: 404, message: 'Không tìm thấy tài khoản.' };
  if (!sec.verifyPassword(currentPassword || '', user.password_hash)) {
    return { ok: false, status: 400, message: 'Mật khẩu hiện tại không đúng.' };
  }
  const check = validatePasswordStrength(newPassword);
  if (!check.ok) return { ok: false, status: 400, message: check.message };
  if (sec.verifyPassword(newPassword, user.password_hash)) {
    return { ok: false, status: 400, message: 'Mật khẩu mới không được trùng mật khẩu hiện tại.' };
  }
  db.run(
    'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
    [sec.hashPassword(newPassword), nowIso(), user.id],
  );
  // Thu hồi các phiên khác của người dùng (giữ phiên hiện tại)
  db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ?', [nowIso(), user.id, auth.sessionId]);
  return { ok: true, message: 'Đã đổi mật khẩu thành công.' };
}

function validatePasswordStrength(pwd) {
  const value = String(pwd || '');
  if (value.length < 10) return { ok: false, message: 'Mật khẩu phải có tối thiểu 10 ký tự.' };
  if (!/[A-Z]/.test(value)) return { ok: false, message: 'Mật khẩu phải có ít nhất một chữ in hoa.' };
  if (!/[a-z]/.test(value)) return { ok: false, message: 'Mật khẩu phải có ít nhất một chữ thường.' };
  if (!/\d/.test(value)) return { ok: false, message: 'Mật khẩu phải có ít nhất một chữ số.' };
  if (!/[^A-Za-z0-9]/.test(value)) return { ok: false, message: 'Mật khẩu phải có ít nhất một ký tự đặc biệt.' };
  return { ok: true };
}

module.exports = {
  COOKIE_NAME, authenticate, createSession, destroySession, requireAuth, hasPermission,
  logActivity, login, changePassword, buildUserRow, validatePasswordStrength, parseJsonList,
};
