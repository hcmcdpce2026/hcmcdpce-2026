/**
 * Bảo mật: hash mật khẩu (scrypt – có sẵn trong Node core), token phiên,
 * CSRF token, giới hạn tần suất (rate limit), chuẩn hóa dữ liệu đầu vào.
 *
 * Định dạng lưu mật khẩu:  scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 * Không bao giờ lưu mật khẩu dạng văn bản. Không trả mật khẩu/hash ra API.
 */
'use strict';

const crypto = require('node:crypto');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function scryptHash(password, salt, N, r, p) {
  return crypto.scryptSync(String(password), salt, KEY_LEN, {
    N, r, p, maxmem: 64 * 1024 * 1024,
  });
}

/** Tạo hash mật khẩu */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = scryptHash(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Kiểm tra mật khẩu với hash đã lưu (so sánh hằng thời gian) */
function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptHash(password, salt, Number(n), Number(r), Number(p));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) {
    return false;
  }
}

/** Token ngẫu nhiên dùng cho phiên / CSRF */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Hash token để lưu DB (không lưu token thô) */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Sinh ID dạng prefix-NNN (tuần tự theo bảng) */
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Rate limiter trong bộ nhớ (đủ cho 1 instance; production nhiều instance cần Redis).
 * key -> { count, resetAt }
 */
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  // Cho phép kiểm thử tự động bỏ qua giới hạn tần suất bằng biến môi trường
  if (process.env.RATE_LIMIT_DISABLED === 'true') return { allowed: true, remaining: limit, resetAt: now + windowMs };
  const item = buckets.get(key);
  if (!item || item.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  item.count += 1;
  if (item.count > limit) {
    return { allowed: false, remaining: 0, resetAt: item.resetAt };
  }
  return { allowed: true, remaining: limit - item.count, resetAt: item.resetAt };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref();

/** Xoá toàn bộ bộ đếm (dùng cho kiểm thử) */
function resetRateLimits() {
  buckets.clear();
}

/** Áp dụng Rate limit theo IP */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || '';
  return ip.replace(/^::ffff:/, '');
}

/* ------------------------------- Làm sạch dữ liệu ---------------------------- */

/** Escape HTML cho dữ liệu hiển thị dạng văn bản */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Làm sạch HTML cho nội dung bài viết (whitelist thẻ).
 * Chặn script, iframe, on* handler, javascript: URL.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'figure', 'figcaption', 'font',
  'img', 'span', 'div', 'hr', 'code', 'pre',
]);
const ALLOWED_FONT_FAMILIES = new Map([
  ['arial', 'Arial'],
  ['georgia', 'Georgia'],
  ['tahoma', 'Tahoma'],
  ['times new roman', 'Times New Roman'],
  ['verdana', 'Verdana'],
]);

function sanitizeHtml(html) {
  let out = String(html || '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, '');
  // Chỉ giữ thuộc tính được phép và loại bỏ URL nguy hiểm.
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:\s[^>]*)?)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (m.startsWith('</')) return `</${t}>`;
    const allowed = new Set(t === 'a'
      ? ['href', 'title', 'target', 'rel']
      : t === 'img'
        ? ['src', 'alt', 'title', 'width', 'height', 'loading']
        : t === 'table'
          ? ['border', 'cellpadding', 'cellspacing']
          : t === 'font'
            ? ['face']
          : t === 'th' || t === 'td'
            ? ['colspan', 'rowspan', 'align']
            : []);
    const safeAttrs = [];
    const attrRe = /\s([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let attrMatch;
    while ((attrMatch = attrRe.exec(String(attrs || ''))) !== null) {
      const name = attrMatch[1].toLowerCase();
      if (!allowed.has(name)) continue;
      const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      if (t === 'font' && name === 'face') {
        const family = ALLOWED_FONT_FAMILIES.get(value.trim().toLowerCase());
        if (family) safeAttrs.push(` face="${escapeHtml(family)}"`);
        continue;
      }
      if ((name === 'href' || name === 'src') &&
          !/^(https?:\/\/|\/|\.\/|\.\.\/|#)[^\s]*$/i.test(value)) continue;
      if (name === 'target' && !['_blank', '_self'].includes(value)) continue;
      if (name === 'rel' && !/^([a-z]+)( [a-z]+)*$/i.test(value)) continue;
      safeAttrs.push(` ${name}="${escapeHtml(value)}"`);
    }
    return `<${t}${safeAttrs.join('')}>`;
  });
  return out;
}

/** Làm sạch chuỗi nhập (trim, giới hạn độ dài) */
function cleanText(value, max = 5000) {
  if (value == null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));
}

function isPhone(value) {
  const v = String(value || '').replace(/[\s.\-()]/g, '');
  return /^(\+?84|0)\d{8,10}$/.test(v);
}

module.exports = {
  hashPassword, verifyPassword, randomToken, hashToken, makeId,
  rateLimit, resetRateLimits, clientIp, escapeHtml, sanitizeHtml, cleanText, isEmail, isPhone,
};
