/**
 * CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH
 * Máy chủ ứng dụng – Node.js thuần + SQLite (node:sqlite), không dependency.
 *
 * Khởi động:  node server/index.js   (hoặc npm start)
 * Biến môi trường: xem .env.example
 */
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const libHttp = require('./lib/http');
const sec = require('./lib/security');
const auth = require('./lib/auth');
const db = require('./lib/db');

const authRoutes = require('./routes/auth');
const cmsRoutes = require('./routes/cms');
const wsRoutes = require('./routes/workspace');
const publicRoutes = require('./routes/public');
const sharedRoutes = require('./routes/shared');

// Nạp biến môi trường từ .env (nếu có) – không cần thư viện ngoài
(function loadEnv() {
  const envFile = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
})();

db.initialize({ seed: true });

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || '0.0.0.0';
const ENV = (process.env.APP_ENV || 'development').toLowerCase();

/* ---------------------------- Định nghĩa route ------------------------------ */
const routes = [
  // Auth
  ['POST', '/api/auth/login', authRoutes.login],
  ['POST', '/api/auth/logout', authRoutes.logout],
  ['GET', '/api/auth/me', authRoutes.me],
  ['POST', '/api/auth/change-password', authRoutes.changePassword],
  ['GET', '/api/auth/permissions', authRoutes.permissions],

  // Public
  ['GET', '/api/public/health', publicRoutes.health],
  ['GET', '/api/public/articles', publicRoutes.listArticles],
  ['GET', '/api/public/articles/:id', publicRoutes.getArticle],
  ['GET', '/api/public/categories', publicRoutes.listCategories],
  ['GET', '/api/public/system-categories', publicRoutes.listSystemCategories],
  ['GET', '/api/public/system-category-types', publicRoutes.listSystemCategoryTypes],
  ['GET', '/api/public/event-statuses', publicRoutes.listEventStatuses],
  ['GET', '/api/public/summary', publicRoutes.listSummary],
  ['GET', '/api/public/legal-documents', publicRoutes.listLegal],
  ['GET', '/api/public/events', publicRoutes.listEvents],
  ['GET', '/api/public/agencies', publicRoutes.listAgencies],
  ['GET', '/api/public/statistics', publicRoutes.listStatistics],
  ['GET', '/api/public/support-facilities', publicRoutes.listSupport],
  ['GET', '/api/public/banners', publicRoutes.listBanners],
  ['GET', '/api/public/notifications', publicRoutes.listNotifications],
  ['POST', '/api/public/submissions', publicRoutes.createSubmission],
  ['GET', '/api/public/submissions/lookup', publicRoutes.lookupSubmission],

  // Shared (CMS + WORKSPACE)
  ['GET', '/api/shared/users', sharedRoutes.users],
  ['GET', '/api/shared/organizations', sharedRoutes.organizations],
  ['GET', '/api/shared/system-categories', sharedRoutes.systemCategories],
  ['GET', '/api/shared/system-category-types', sharedRoutes.systemCategoryTypes],
  ['GET', '/api/shared/notifications', sharedRoutes.notifications],
  ['POST', '/api/shared/notifications/read', sharedRoutes.markRead],
  ['GET', '/api/shared/settings', sharedRoutes.settings],
  ['GET', '/api/shared/summary', sharedRoutes.summary],

  // CMS
  ['GET', '/api/cms/stats', cmsRoutes.stats],
  ['GET', '/api/cms/articles', cmsRoutes.listArticles],
  ['POST', '/api/cms/articles', cmsRoutes.createArticle],
  ['GET', '/api/cms/articles/:id', cmsRoutes.getArticle],
  ['PUT', '/api/cms/articles/:id', cmsRoutes.updateArticle],
  ['DELETE', '/api/cms/articles/:id', cmsRoutes.deleteArticle],
  ['POST', '/api/cms/articles/:id/:action', cmsRoutes.articleAction],
  ['GET', '/api/cms/categories', cmsRoutes.listCategories],
  ['POST', '/api/cms/categories', cmsRoutes.saveCategory],
  ['PUT', '/api/cms/categories/:id', cmsRoutes.saveCategory],
  ['POST', '/api/cms/categories/:id/reorder', cmsRoutes.reorderCategory],
  ['DELETE', '/api/cms/categories/:id', cmsRoutes.deleteCategory],
  ['GET', '/api/cms/system-categories', cmsRoutes.listSystemCategories],
  ['GET', '/api/cms/system-category-types', cmsRoutes.listSystemCategoryTypes],
  ['POST', '/api/cms/system-categories', cmsRoutes.saveSystemCategory],
  ['PUT', '/api/cms/system-categories/:id', cmsRoutes.saveSystemCategory],
  ['PATCH', '/api/cms/system-categories/:id/status', cmsRoutes.setSystemCategoryStatus],
  ['DELETE', '/api/cms/system-categories/:id', cmsRoutes.deleteSystemCategory],
  ['GET', '/api/cms/media', cmsRoutes.listMedia],
  ['POST', '/api/cms/media', cmsRoutes.addMedia],
  ['DELETE', '/api/cms/media/:id', cmsRoutes.deleteMedia],
  /* Danh mục công khai: văn bản, cơ quan, sự kiện, thống kê, cơ sở hỗ trợ */
  ['GET', '/api/cms/catalog/:kind', cmsRoutes.listCatalog],
  ['POST', '/api/cms/catalog/:kind', cmsRoutes.saveCatalog],
  ['PUT', '/api/cms/catalog/:kind/:id', cmsRoutes.saveCatalog],
  ['DELETE', '/api/cms/catalog/:kind/:id', cmsRoutes.deleteCatalog],
  ['GET', '/api/cms/workflow', cmsRoutes.workflow],
  ['GET', '/api/cms/submissions', cmsRoutes.listSubmissions],
  ['GET', '/api/cms/submissions/:id', cmsRoutes.getSubmission],
  ['PUT', '/api/cms/submissions/:id', cmsRoutes.updateSubmission],
  ['POST', '/api/cms/submissions/:id/assign', cmsRoutes.assignToWorkspace],
  ['GET', '/api/cms/proposals', cmsRoutes.listProposals],
  ['POST', '/api/cms/proposals/:id/review', cmsRoutes.reviewProposal],
  ['POST', '/api/cms/collaborations', cmsRoutes.createCollaboration],
  ['GET', '/api/cms/logs', cmsRoutes.activityLog],

  // Workspace
  ['GET', '/api/workspace/stats', wsRoutes.stats],
  ['GET', '/api/workspace/tasks', wsRoutes.listTasks],
  ['POST', '/api/workspace/tasks', wsRoutes.createTask],
  ['GET', '/api/workspace/tasks/:id', wsRoutes.getTask],
  ['PUT', '/api/workspace/tasks/:id', wsRoutes.updateTask],
  ['POST', '/api/workspace/tasks/:id/items', wsRoutes.addTaskItem],
  ['PUT', '/api/workspace/tasks/:id/items', wsRoutes.updateTaskItems],
  ['POST', '/api/workspace/tasks/:id/comments', wsRoutes.addTaskComment],
  ['POST', '/api/workspace/tasks/:id/:action', wsRoutes.taskAction],
  ['GET', '/api/workspace/organizations', wsRoutes.listOrganizations],
  ['POST', '/api/workspace/organizations', wsRoutes.saveOrganization],
  ['PUT', '/api/workspace/organizations/:id', wsRoutes.saveOrganization],
  ['DELETE', '/api/workspace/organizations/:id', wsRoutes.deleteOrganization],
  ['GET', '/api/workspace/users', wsRoutes.listUsers],
  ['POST', '/api/workspace/users', wsRoutes.saveUser],
  ['PUT', '/api/workspace/users/:id', wsRoutes.saveUser],
  ['POST', '/api/workspace/users/:id/reset-password', wsRoutes.resetUserPassword],
  ['GET', '/api/workspace/roles', wsRoutes.listRoles],
  ['POST', '/api/workspace/roles', wsRoutes.saveRole],
  ['PUT', '/api/workspace/roles/:id', wsRoutes.saveRole],
  ['DELETE', '/api/workspace/roles/:id', wsRoutes.deleteRole],
  ['GET', '/api/workspace/permissions', wsRoutes.listPermissions],
  ['GET', '/api/workspace/documents', wsRoutes.listDocuments],
  ['POST', '/api/workspace/documents', wsRoutes.saveDocument],
  ['PUT', '/api/workspace/documents/:id', wsRoutes.saveDocument],
  ['DELETE', '/api/workspace/documents/:id', wsRoutes.deleteDocument],
  ['GET', '/api/workspace/events', wsRoutes.listEvents],
  ['POST', '/api/workspace/events', wsRoutes.saveEvent],
  ['PUT', '/api/workspace/events/:id', wsRoutes.saveEvent],
  ['DELETE', '/api/workspace/events/:id', wsRoutes.deleteEvent],
  ['GET', '/api/workspace/reports', wsRoutes.listReports],
  ['POST', '/api/workspace/reports', wsRoutes.saveReport],
  ['GET', '/api/workspace/reports/:id', wsRoutes.getReport],
  ['PUT', '/api/workspace/reports/:id', wsRoutes.saveReport],
  ['POST', '/api/workspace/reports/:id/:action', wsRoutes.reportAction],
  ['GET', '/api/workspace/proposals', wsRoutes.listProposals],
  ['POST', '/api/workspace/proposals', wsRoutes.createProposal],
  ['GET', '/api/workspace/collaborations', wsRoutes.listCollaborations],
  ['PUT', '/api/workspace/collaborations/:id', wsRoutes.updateCollaboration],
  ['GET', '/api/workspace/notifications', wsRoutes.listNotifications],
  ['POST', '/api/workspace/notifications/:id/read', wsRoutes.markNotification],
  ['GET', '/api/workspace/logs', wsRoutes.activityLog],
];

function compile(pattern) {
  const names = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z_]+)/g, (_, n) => {
    names.push(n);
    return '([^/]+)';
  }) + '$');
  return { regex, names };
}

const compiledRoutes = routes.map(([method, pattern, handler]) => ({ method, ...compile(pattern), handler }));

function matchRoute(method, pathname) {
  for (const r of compiledRoutes) {
    if (r.method !== method) continue;
    const match = r.regex.exec(pathname);
    if (match) {
      const params = {};
      try {
        r.names.forEach((n, i) => { params[n] = decodeURIComponent(match[i + 1]); });
      } catch (_) {
        return null;
      }
      return { handler: r.handler, params };
    }
  }
  return null;
}

/* ----------------------------- Bảo mật HTTP -------------------------------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function applySecurityHeaders(req, res, isApi) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (isApi) {
    const allowedOrigin = process.env.CORS_ORIGIN || '';
    if (allowedOrigin && req.headers.origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
  } else {
    res.setHeader('Content-Security-Policy', CSP);
  }
}

function log(message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

/**
 * Kiểm tra ranh giới phân hệ: phiên CMS chỉ dùng được /api/cms/*,
 * phiên Workspace chỉ dùng được /api/workspace/*.
 * Trả về false khi đã gửi phản hồi lỗi.
 */
function enforceSystemScope(req, res, pathname) {
  const needed = pathname.startsWith('/api/cms/') ? 'cms'
    : pathname.startsWith('/api/workspace/') ? 'workspace' : null;
  if (!needed) return true;
  const session = auth.authenticate(req);
  if (!session) return true; // để handler trả 401 với thông báo chuẩn
  if (session.user.system !== needed) {
    libHttp.forbidden(res, needed === 'cms'
      ? 'Tài khoản không thuộc phân hệ quản trị nội dung (CMS).'
      : 'Tài khoản không thuộc không gian làm việc (Workspace).');
    return false;
  }
  return true;
}

/* ------------------------------- Server ----------------------------------- */
const server = http.createServer(async (req, res) => {
  /*
   * Bọc TOÀN BỘ handler trong try/catch.
   * Request ``GET //..%2f.env`` không phải URL hợp lệ đối với `new URL()` (phần
   * sau `//` bị hiểu là authority) → ném `Invalid URL`. Với handler async, lỗi
   * này không do bộ định tuyến bắt, phản hồi không bao giờ được gửi và kết nối
   * bị treo (một client đơn lẻ có thể chiếm hết kết nối).
   */
  try {
    await handleRequest(req, res);
  } catch (err) {
    if (res.headersSent) { try { res.end(); } catch (_) { /* bỏ qua */ } return; }
    try {
      if (String(req.url || '').startsWith('/api/')) {
        libHttp.fail(res, 400, 'Đường dẫn yêu cầu không hợp lệ.');
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        res.end('Yêu cầu không hợp lệ.');
      }
    } catch (_) { /* đã đóng */ }
  }
});

/*
 * Trang lỗi 404 dùng chung cho các đường dẫn HTML không tồn tại.
 * Trả kèm HTTP 404 để trình duyệt và công cụ tìm kiếm hiểu đúng đây là trang lỗi,
 * nhưng nội dung vẫn là trang 404 định dạng HTML (không phải JSON).
 */
async function handleRequest(req, res) {
  /* WHATWG URL thay cho url.parse() đã lỗi thời; luôn có base để xử lý URL tương đối */
  const parsed = new URL(req.url, 'http://localhost');
  const parsedQuery = Object.fromEntries(parsed.searchParams);
  const pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  const isApi = pathname.startsWith('/api/');
  applySecurityHeaders(req, res, isApi);

  if (req.method === 'OPTIONS') {
    // Preflight chỉ chấp nhận khi cấu hình origin cụ thể
    if (!process.env.CORS_ORIGIN || req.headers.origin !== process.env.CORS_ORIGIN) {
      res.writeHead(403);
      return res.end();
    }
    res.writeHead(204);
    return res.end();
  }

  if (isApi) {
    const route = matchRoute(req.method, pathname);
    if (!route) {
      return libHttp.notFound(res, `Không tìm thấy API: ${req.method} ${pathname}`);
    }
    // Đọc và giữ body JSON một lần để mọi handler dùng lại được (tránh treo socket
    // khi handler từ chối sớm trước khi body được tiêu thụ).
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (req.method === 'POST' && pathname === '/api/cms/media') {
        req.resumePending = true;
      } else {
      try {
        req.body = await libHttp.readJson(req, 2 * 1024 * 1024);
      } catch (err) {
        return libHttp.fail(res, err.status || 400, err.message || 'Dữ liệu gửi lên không hợp lệ.');
      }
      // Drain phần còn lại của stream nếu có (tránh keep-alive treo)
      req.resume();
      }
    }
    // Phân vùng bảo mật: token CMS không truy cập được API Workspace và ngược lại
    if (!enforceSystemScope(req, res, pathname)) return;
    try {
      return await route.handler(req, res, { params: route.params, query: parsedQuery, pathname });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[API ERROR]', err);
      if (res.headersSent) return res.end();
      /* 413 khi body còn dữ liệu chưa đọc: gửi lỗi rồi đóng kết nối để client
         nhận được phản hồi thay vì kết nối bị cắt giữa chừng. */
      if (status === 413) {
        res.setHeader('Connection', 'close');
      }
      return libHttp.fail(res, status, status >= 500
        ? 'Máy chủ gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại sau.'
        : (err.message || 'Yêu cầu không hợp lệ.'));
    }
  }

  // Không phục vụ các thư mục nội bộ
  //
  // Kiểm tra trên đường dẫn ĐÃ GIẢI MÃ: trước đây regex chạy trên pathname còn
  // mã hóa (`/..%2fserver%2f...`) nên không khớp và thư mục nội bộ vẫn bị phục vụ.
  let decodedPath = pathname;
  try { decodedPath = decodeURIComponent(pathname); } catch (_) { /* giữ nguyên nếu mã hóa sai */ }
  const blocked = /^\/(server|node_modules|\.git|\.env|docs\/internal|backups|scripts)(\/|$)/i;
  if (blocked.test(decodedPath) || /\.env(\.|$)/i.test(decodedPath)) {
    return libHttp.notFound(res, 'Không tìm thấy tài nguyên yêu cầu.');
  }

  let target = libHttp.resolveStaticPath(ROOT, pathname);
  if (!target) {
    /* Đường dẫn không an toàn: vẫn trả trang 404 định dạng HTML cho người dùng */
    return libHttp.serveNotFound(res, path.join(ROOT, '404.html'));
  }

  if (pathname === '/' || pathname.endsWith('/')) {
    target = path.join(target, 'index.html');
  }
  fs.stat(target, (err, stat) => {
    if (err && !path.extname(target)) {
      // Cho phép truy cập không có đuôi .html
      return libHttp.serveFile(req, res, `${target}.html`, { csp: CSP, fallbackIndex: true, notFoundPage: true });
    }
    if (err || !stat.isDirectory()) {
      return libHttp.serveFile(req, res, target, { csp: CSP, fallbackIndex: true, notFoundPage: true });
    }
    libHttp.serveFile(req, res, path.join(target, 'index.html'), { csp: CSP });
  });
}

server.listen(PORT, HOST, () => {
  log('════════════════════════════════');
  log('  Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh');
  log('  HO CHI MINH CITY DRUG PREVENTION AND CONTROL E-PORTAL');
  log('════════════════════════════════');
  log(`  Môi trường : ${ENV}`);
  log(`  Địa chỉ    : http://localhost:${PORT}`);
  log(`  API        : http://localhost:${PORT}/api/public/health`);
  log(`  Database   : ${path.relative(ROOT, db.DB_FILE)}`);
  log('════════════════════════════════');
  if (ENV === 'production' && !process.env.SESSION_SECRET) {
    log('  [CẢNH BÁO] Chưa cấu hình SESSION_SECRET nhưng không bắt buộc với xác thực bằng phiên DB.');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[LỖI] Cổng ${PORT} đang được sử dụng. Đổi PORT trong .env hoặc dừng tiến trình khác.`);
  } else {
    console.error('[LỖI]', err);
  }
  process.exit(1);
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    log('Đang dừng máy chủ...');
    server.close(() => process.exit(0));
  });
});

process.on('unhandledRejection', (err) => {
  console.error('[LỖI KHÔNG XỬ LÝ]', err && err.message ? err.message : err);
});

module.exports = server;
