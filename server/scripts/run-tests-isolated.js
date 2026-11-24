/**
 * run-tests-isolated.js – Chạy bộ kiểm thử tích hợp trên một database TÁCH BIỆT.
 *
 * Vấn đề: test-api.js và smoke-interconnect.js thao tác qua HTTP tới máy chủ
 * thật. Nếu chạy với `npm start` đang trỏ vào database vận hành, dữ liệu kiểm
 * thử (bài viết, phản ánh, nhiệm vụ) sẽ lẫn vào nội dung thật.
 *
 * Cách giải quyết: dựng một máy chủ tạm trên cổng riêng, dùng tệp SQLite tạm,
 * nạp seed vào đó, chạy kiểm thử rồi xoá sạch. Database vận hành không bị chạm tới.
 *
 * Chạy: node server/scripts/run-tests-isolated.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.TEST_PORT || 8123);
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcm-portal-test-'));
const dbFile = path.join(tmpDir, 'portal.test.sqlite');

const env = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  DB_FILE: dbFile,
  APP_ENV: 'development',
  RATE_LIMIT_DISABLED: 'true',
  COOKIE_SECURE: 'false',
  CORS_ORIGIN: '',
  /* Mật khẩu cố định chỉ tồn tại trong tiến trình con của lần chạy này */
  SEED_PASSWORD_CMS_ADMIN: 'test-cms-password',
  SEED_PASSWORD_WS_ADMIN: 'test-ws-password',
  /* Bỏ riêng giới hạn từng tệp để test upload 26 MB chạy được cả khi
     máy chủ đang giữ MAX_UPLOAD_MB nhỏ trong .env của người phát triển. */
  MAX_UPLOAD_MB: '0',
};

function log(msg) { console.log(`[isolated] ${msg}`); }

function runNode(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status;
}

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/public/health`);
      if (res.ok) return true;
    } catch (_) { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  let server = null;
  let exitCode = 1;
  try {
    log(`Database tạm: ${dbFile}`);
    log('Nạp schema + dữ liệu khởi tạo...');
    if (runNode(['server/db/migrate.js']) !== 0) throw new Error('migrate thất bại');
    /* Bộ seed ghi server/data/credentials.local.txt: sao lưu bản thật trước,
       khôi phục sau để lần chạy kiểm thử không ghi đè mật khẩu vận hành. */
    const realCreds = path.join(ROOT, 'server', 'data', 'credentials.local.txt');
    const credsBackup = fs.existsSync(realCreds) ? fs.readFileSync(realCreds) : null;
    try {
      if (runNode(['server/db/seed.js']) !== 0) throw new Error('seed thất bại');
    } finally {
      if (credsBackup) fs.writeFileSync(realCreds, credsBackup);
      else if (fs.existsSync(realCreds)) fs.unlinkSync(realCreds);
    }
    const fixture = `
      const { getDb } = require('./server/lib/db');
      const db = getDb();
      const ts = new Date().toISOString();
      db.prepare(\`INSERT OR IGNORE INTO system_categories
        (id, category_type, code, name, sort_order, status, created_at, updated_at, created_by)
        VALUES ('test-org-type', 'organization_type', 'test-unit', 'Đơn vị kiểm thử', 1, 'active', ?, ?, 'test')\`).run(ts, ts);
      db.prepare(\`INSERT OR IGNORE INTO organizations
        (id, code, name, type, status, sort_order, data_source, is_seed_data, environment, created_at, updated_at, created_by)
        VALUES ('org-02', 'TEST-ORG', 'Đơn vị kiểm thử', 'test-unit', 'active', 1, 'test', 1, 'development', ?, ?, 'test')\`).run(ts, ts);
    `;
    if (runNode(['-e', fixture]) !== 0) throw new Error('khởi tạo fixture tổ chức thất bại');

    log(`Khởi động máy chủ kiểm thử trên ${BASE} ...`);
    server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (d) => process.stdout.write(`  ${d}`));
    server.stderr.on('data', (d) => process.stderr.write(`  ${d}`));

    if (!await waitForServer()) throw new Error('Máy chủ kiểm thử không khởi động được');

    const testEnv = { ...env, API_BASE: BASE };
    log('Chạy test-api.js ...');
    const apiStatus = spawnSync(process.execPath, ['server/scripts/test-api.js'], {
      cwd: ROOT, env: testEnv, stdio: 'inherit',
    }).status;

    log('Chạy smoke-interconnect.js ...');
    const smokeStatus = spawnSync(process.execPath, ['server/scripts/smoke-interconnect.js'], {
      cwd: ROOT, env: testEnv, stdio: 'inherit',
    }).status;

    log('Chạy smoke-security.js ...');
    const secStatus = spawnSync(process.execPath, ['server/scripts/smoke-security.js'], {
      cwd: ROOT, env: testEnv, stdio: 'inherit',
    }).status;

    log('Chạy smoke-workspace-crud.js ...');
    const crudStatus = spawnSync(process.execPath, ['server/scripts/smoke-workspace-crud.js'], {
      cwd: ROOT, env: testEnv, stdio: 'inherit',
    }).status;

    log('Chạy smoke-chatbot.js ...');
    const chatStatus = spawnSync(process.execPath, ['server/scripts/smoke-chatbot.js'], {
      cwd: ROOT, env: testEnv, stdio: 'inherit',
    }).status;

    exitCode = (apiStatus === 0 && smokeStatus === 0 && secStatus === 0 && crudStatus === 0
      && chatStatus === 0) ? 0 : 1;
    log(exitCode === 0 ? 'TẤT CẢ ĐẠT' : 'CÓ MỤC KHÔNG ĐẠT');
  } catch (err) {
    console.error(`[isolated] Lỗi: ${err.message}`);
  } finally {
    if (server && !server.killed) {
      server.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbFile + suffix); } catch (_) { /* không có */ }
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* bỏ qua */ }
    log('Đã xoá database tạm.');
    process.exit(exitCode);
  }
})();
