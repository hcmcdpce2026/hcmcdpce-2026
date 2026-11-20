/**
 * Tiện ích HTTP: phản hồi JSON, đọc body, cookie, MIME, phục vụ tệp tĩnh an toàn.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.csv': 'text/csv; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
};

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

const ok = (res, data, meta = {}) => sendJson(res, 200, { success: true, data, ...meta });
const created = (res, data) => sendJson(res, 201, { success: true, data });
const noContent = (res) => { res.writeHead(204); res.end(); };

const fail = (res, status, message, extra = {}) =>
  sendJson(res, status, { success: false, error: message, ...extra });

const badRequest = (res, msg = 'Dữ liệu không hợp lệ.', extra) => fail(res, 400, msg, extra);
const unauthorized = (res, msg = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.') => fail(res, 401, msg);
const forbidden = (res, msg = 'Bạn không có quyền thực hiện thao tác này.') => fail(res, 403, msg);
const notFound = (res, msg = 'Không tìm thấy dữ liệu.') => fail(res, 404, msg);
const conflict = (res, msg = 'Dữ liệu đã tồn tại.') => fail(res, 409, msg);
const tooMany = (res, msg = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.', retryAfter) => {
  const headers = {};
  if (retryAfter) headers['Retry-After'] = String(Math.max(1, Math.ceil(retryAfter / 1000)));
  sendJson(res, 429, { success: false, error: msg }, headers);
};
const serverError = (res, msg = 'Máy chủ gặp sự cố. Vui lòng thử lại sau.') => fail(res, 500, msg);

/** Đọc body JSON với giới hạn dung lượng */
function readJson(req, limitBytes = 1024 * 1024) {
  // Body đã được bộ định tuyến đọc sẵn
  if (req.body !== undefined) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Dữ liệu gửi lên quá lớn.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(Object.assign(new Error('Dữ liệu JSON không hợp lệ.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Đọc body thô (dùng cho upload).
 * Khi vượt giới hạn, dừng nhận dữ liệu (req.pause) nhưng KHÔNG huỷ socket ngay:
 * handler vẫn trả được 413 rõ ràng cho trình duyệt. Bộ định tuyến sẽ đóng kết
 * nối sau khi phản hồi được gửi.
 */
function readRaw(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (limitBytes && size > limitBytes) {
        req.pause();
        reject(Object.assign(new Error('Tệp tải lên vượt quá dung lượng cho phép.'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
    } catch (_) {
      out[key] = '';
    }
  });
  return out;
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing.slice() : [existing]) : [];
  list.push(parts.join('; '));
  res.setHeader('Set-Cookie', list);
}

function clearCookie(res, name, options = {}) {
  setCookie(res, name, '', { ...options, maxAge: 0 });
}

/**
 * Chuẩn hóa & kiểm tra đường dẫn tệp tĩnh (chống path traversal).
 *
 * THỨ TỰ BẮT BUỘC: giải mã URL TRƯỚC rồi mới chuẩn hóa.
 * Bản cũ chuẩn hóa trước khi giải mã, nên `..%2f` chưa bị nhận diện ở bước
 * normalize; sau khi giải mã nó trở thành `../` và thoát ra ngoài thư mục gốc.
 * Lỗ hổng này cho phép tải toàn bộ `.env`, database, `.git/config`…
 *
 * Trả về null nếu đường dẫn không an toàn; nơi gọi phải coi null là 404.
 */
function resolveStaticPath(rootDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch (_) {
    return null;
  }

  /* Ký tự NUL và đường dẫn tuyệt đối của hệ điều hành không được chấp nhận */
  if (decoded.includes('\0')) return null;

  /* Backslash là dấu phân cách trên Windows — quy về '/' để kiểm tra thống nhất */
  const asPosix = decoded.replace(/\\/g, '/');

  /* Chuẩn hóa SAU khi đã giải mã */
  const normalized = path.posix.normalize(asPosix);

  /*
   * Từ chối nếu còn dấu hiệu thoát thư mục hoặc là đường dẫn tuyệt đối.
   * `path.posix.normalize('/../x')` → '/x' nên không thể chỉ dựa vào kết quả.
   */
  if (normalized.split('/').includes('..')) return null;
  if (/\.\./.test(asPosix)) return null;

  const relative = normalized.replace(/^\/+/, '');
  const root = path.resolve(rootDir);
  const full = path.resolve(root, relative);

  /* Kiểm tra lớp cuối: kết quả phải nằm trong thư mục gốc */
  if (full !== root && !full.startsWith(root + path.sep)) return null;

  return full;
}

/**
 * Phần mở rộng KHÔNG BAO GIỜ được phục vụ tĩnh, kể cả khi đường dẫn lọt qua
 * kiểm tra thư mục. Đây là lớp phòng ngự thứ hai cho lỗi path traversal: dù có
 * lọt ra ngoài web root thì database, tệp cấu hình và khóa bí mật vẫn bị chặn.
 */
const BLOCKED_EXTENSIONS = new Set([
  '.sqlite', '.sqlite3', '.db', '.db3', '.sql', '.wal', '.shm',
  '.env', '.pem', '.key', '.crt', '.p12', '.pfx', '.local',
]);

/** Tên tệp không bao giờ được phục vụ (tệp bàn giao, bí mật, log nội bộ) */
const BLOCKED_FILENAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.development', '.env.example',
  'credentials.local.txt', 'config', 'package.json', 'package-lock.json',
]);

/**
 * Tệp trang 404 đã nạp sẵn. Tìm từ thư mục chứa server/ lên một cấp để đọc
 * 404.html ở gốc dự án (có thể truyền đường dẫn qua `options.notFoundFile`).
 */
let notFoundHtmlCache = null;
function loadNotFoundPage(explicitPath) {
  if (notFoundHtmlCache) return notFoundHtmlCache;
  const candidates = [explicitPath, path.resolve(__dirname, '..', '..', '404.html')].filter(Boolean);
  for (const file of candidates) {
    try { notFoundHtmlCache = fs.readFileSync(file); return notFoundHtmlCache; } catch (_) { /* thử tệp kế tiếp */ }
  }
  return null;
}

/** Trả trang 404 định dạng HTML (không phải JSON) */
function serveNotFound(res, notFoundPath) {
  const html = loadNotFoundPage(notFoundPath);
  if (!html) return notFound(res, 'Không tìm thấy tài nguyên yêu cầu.');
  res.writeHead(404, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': html.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

/** Phục vụ tệp tĩnh, không cho phép chạy mã từ thư mục upload */
function serveFile(req, res, filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  if (BLOCKED_EXTENSIONS.has(ext) || BLOCKED_FILENAMES.has(base)) {
    return notFound(res, 'Không tìm thấy tài nguyên yêu cầu.');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (options.fallbackIndex) {
        const indexFile = path.join(filePath, 'index.html');
        return serveFile(req, res, indexFile, {});
      }
      if (options.spaFallback) {
        return serveFile(req, res, options.spaFallback, {});
      }
      /*
       * Yêu cầu HTML (đường dẫn có đuôi .html, hoặc không có đuôi mở rộng) mà
       * tệp không tồn tại → trả trang 404 tuỳ chỉnh với HTTP 404.
       */
      const wantsHtml = /\.html?$/i.test(filePath) || !path.extname(filePath);
      if (wantsHtml && options.notFoundPage !== false) {
        return serveNotFound(res);
      }
      return notFound(res, 'Không tìm thấy tài nguyên yêu cầu.');
    }
    const isUpload = /[/\\]uploads[/\\]/i.test(filePath);
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
    };
    /* Tệp trong thư mục uploads được phục vụ cùng origin. Với loại KHÔNG phải
       media (ảnh/video/âm thanh/PDF cần hiển thị trực tiếp), buộc tải xuống và
       sandbox để một tệp lọt qua allow-list cũng không thể chạy mã. */
    if (isUpload && !/^\.(png|jpe?g|gif|webp|avif|bmp|ico|mp4|webm|m4v|ogv|mp3|wav|ogg|pdf)$/i.test(ext)) {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Disposition'] =
        `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`;
      headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
      headers['Cache-Control'] = 'public, max-age=3600';
    } else if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache';
      headers['Content-Security-Policy'] = options.csp || "default-src 'self'";
    } else if (ext === '.js' || ext === '.css') {
      // CSS/JS luôn phải kiểm tra lại (revalidate) để bản sửa nội dung có hiệu lực ngay
      headers['Cache-Control'] = 'no-cache, must-revalidate';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }
    /*
     * So sánh If-Modified-Since theo độ chính xác 1 giây: chỉ trả 304 khi tệp
     * KHÔNG mới hơn thời điểm trình duyệt đã lưu. (Dùng '>' thay '>=' để tệp
     * vừa sửa trong cùng một giây không bị coi là “chưa thay đổi”.)
     */
    const lastModifiedMs = Math.floor(stat.mtimeMs / 1000) * 1000;
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && new Date(ifModifiedSince).getTime() > lastModifiedMs) {
      res.writeHead(304, { 'Cache-Control': headers['Cache-Control'] });
      return res.end();
    }
    headers['Last-Modified'] = stat.mtime.toUTCString();
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const parts = range.replace(/bytes=/, '').split('-');
      let start = parts[0] ? Number(parts[0]) : 0;
      let end = parts[1] ? Number(parts[1]) : stat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      if (!parts[0]) {
        start = Math.max(0, stat.size - end);
        end = stat.size - 1;
      }
      headers['Content-Length'] = end - start + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Accept-Ranges'] = 'bytes';
      res.writeHead(206, headers);
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    headers['Accept-Ranges'] = 'bytes';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = {
  MIME_TYPES, sendJson, ok, created, noContent, fail, badRequest, unauthorized, forbidden,
  notFound, conflict, tooMany, serverError, readJson, readRaw, parseCookies, setCookie,
  clearCookie, resolveStaticPath, serveFile, serveNotFound,
};
