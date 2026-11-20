/**
 * run-content-type-tests.js – Kiểm thử 6 nhóm nội dung trên database TÁCH BIỆT.
 *
 * Dựng máy chủ tạm trên cổng riêng với tệp SQLite tạm, nạp dữ liệu hệ thống +
 * dữ liệu mẫu của 6 nhóm, chạy kiểm thử API công khai, sau đó xoá dữ liệu mẫu,
 * dừng máy chủ và xoá database tạm. Database vận hành không bị chạm tới.
 *
 * Chạy: npm run test:content-types
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.CONTENT_TEST_PORT || 8137);
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcm-portal-ct-'));
const dbFile = path.join(tmpDir, 'portal.ct.sqlite');

const env = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  DB_FILE: dbFile,
  APP_ENV: 'development',
  RATE_LIMIT_DISABLED: 'true',
  COOKIE_SECURE: 'false',
  CORS_ORIGIN: '',
};

const log = (msg) => console.log(`[content-types] ${msg}`);

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
    if (runNode(['server/db/migrate.js']) !== 0) throw new Error('migrate thất bại');
    const realCreds = path.join(ROOT, 'server', 'data', 'credentials.local.txt');
    const credsBackup = fs.existsSync(realCreds) ? fs.readFileSync(realCreds) : null;
    try {
      if (runNode(['server/db/seed.js']) !== 0) throw new Error('seed thất bại');
    } finally {
      if (credsBackup) fs.writeFileSync(realCreds, credsBackup);
      else if (fs.existsSync(realCreds)) fs.unlinkSync(realCreds);
    }
    if (runNode(['server/db/content-types.js', '--demo']) !== 0) throw new Error('nạp dữ liệu mẫu thất bại');

    log(`Khởi động máy chủ kiểm thử trên ${BASE} ...`);
    server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (d) => process.stdout.write(`  ${d}`));
    server.stderr.on('data', (d) => process.stderr.write(`  ${d}`));

    if (!await waitForServer()) throw new Error('Máy chủ kiểm thử không khởi động được');

    const status = spawnSync(process.execPath, ['server/scripts/smoke-content-types.js'], {
      cwd: ROOT, env: { ...env, API_BASE: BASE }, stdio: 'inherit',
    }).status;

    /* Gỡ dữ liệu mẫu ngay sau khi kiểm thử để xác nhận thao tác purge hoạt động */
    server.kill();
    await new Promise((r) => setTimeout(r, 400));

    log('Gỡ dữ liệu mẫu (purge) ...');
    runNode(['server/db/content-types.js', '--purge', '--yes']);
    const leftovers = spawnSync(process.execPath, ['-e', `
      const { getDb } = require('./server/lib/db');
      const d = getDb();
      const t = ['articles','categories','legal_documents','public_agencies','public_events','support_facilities'];
      const left = t.reduce((n, x) => n + d.prepare("SELECT COUNT(*) c FROM " + x + " WHERE data_source = 'demo'").get().c, 0);
      console.log('Còn lại dữ liệu mẫu:', left);
      process.exit(left === 0 ? 0 : 1);
    `], { cwd: ROOT, env, stdio: 'inherit', encoding: 'utf8' }).status;

    exitCode = (status === 0 && leftovers === 0) ? 0 : 1;
    log(exitCode === 0 ? 'TẤT CẢ ĐẠT' : 'CÓ MỤC KHÔNG ĐẠT');
  } catch (err) {
    console.error(`[content-types] Lỗi: ${err.message}`);
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
