/**
 * run-content-type-tests.js – Kiểm thử 6 nhóm nội dung trên database TÁCH BIỆT.
 *
 * Dựng máy chủ tạm trên cổng riêng với tệp SQLite tạm, nạp dữ liệu hệ thống +
 * fixture tối thiểu cho 6 nhóm, chạy kiểm thử API công khai, rồi xoá database.
 * Database vận hành không bị chạm tới.
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
    const legacyCategoryGroups = `
      const { getDb } = require('./server/lib/db');
      const db = getDb();
      const ts = new Date().toISOString();
      const insertGroup = db.prepare(\`INSERT INTO system_categories
        (id, category_type, code, name, created_at, updated_at)
        VALUES (?, 'category_group', ?, ?, ?, ?)\`);
      insertGroup.run('test-legacy-news', 'news', 'Tin tức', ts, ts);
      insertGroup.run('test-canonical-news', 'tin-tuc', 'News', ts, ts);
      const insertCategory = db.prepare(\`INSERT INTO categories
        (id, name, slug, group_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)\`);
      insertCategory.run('test-legacy-news-category', 'Legacy news', 'legacy-news', 'news', ts, ts);
      insertCategory.run('test-legacy-education-category', 'Legacy education', 'legacy-education', 'education', ts, ts);
    `;
    if (runNode(['-e', legacyCategoryGroups]) !== 0) throw new Error('khởi tạo fixture mã nhóm cũ thất bại');
    if (runNode(['server/db/migrate.js']) !== 0) throw new Error('migrate thất bại');
    const verifyCategoryGroups = `
      const assert = require('node:assert/strict');
      const { getDb } = require('./server/lib/db');
      const db = getDb();
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM system_categories WHERE category_type = 'category_group' AND code IN ('news', 'education')").get().count, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM system_categories WHERE category_type = 'category_group' AND code = 'tin-tuc'").get().count, 1);
      assert.equal(db.prepare("SELECT name FROM system_categories WHERE category_type = 'category_group' AND code = 'tin-tuc'").get().name, 'Tin tức');
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM system_categories WHERE category_type = 'category_group' AND code = 'tuyen-truyen-giao-duc'").get().count, 1);
      assert.equal(db.prepare("SELECT group_key FROM categories WHERE id = 'test-legacy-news-category'").get().group_key, 'tin-tuc');
      assert.equal(db.prepare("SELECT group_key FROM categories WHERE id = 'test-legacy-education-category'").get().group_key, 'tuyen-truyen-giao-duc');
    `;
    if (runNode(['-e', verifyCategoryGroups]) !== 0) throw new Error('đồng bộ mã nhóm chuyên mục thất bại');
    const realCreds = path.join(ROOT, 'server', 'data', 'credentials.local.txt');
    const credsBackup = fs.existsSync(realCreds) ? fs.readFileSync(realCreds) : null;
    try {
      if (runNode(['server/db/seed.js']) !== 0) throw new Error('seed thất bại');
    } finally {
      if (credsBackup) fs.writeFileSync(realCreds, credsBackup);
      else if (fs.existsSync(realCreds)) fs.unlinkSync(realCreds);
    }
    const fixtures = `
      const { getDb } = require('./server/lib/db');
      const db = getDb();
      const ts = new Date().toISOString();
      const common = { data_source: 'test', is_seed_data: 1, environment: 'development', created_at: ts, updated_at: ts };
      const insert = (table, values) => {
        const row = Object.assign({}, common, values);
        const columns = Object.keys(row);
        db.prepare('INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES (' +
          columns.map(() => '?').join(', ') + ')').run(...columns.map((column) => row[column]));
      };

      db.exec('BEGIN IMMEDIATE');
      try {
        insert('categories', { id: 'test-cat-news', name: 'News test category', slug: 'news-test-category', group_key: 'tin-tuc' });
        insert('categories', { id: 'test-cat-education', name: 'Education test category', slug: 'education-test-category', group_key: 'tuyen-truyen-giao-duc' });

        insert('articles', {
          id: 'test-article-news', title: 'Tin tức kiểm thử', slug: 'test-article-news',
          excerpt: 'Nội dung kiểm thử.', body: '<p>Nội dung kiểm thử.</p>',
          category_id: 'test-cat-news', status: 'published', tags: '[]', published_at: ts,
        });
        insert('articles', {
          id: 'test-article-news-draft', title: 'Bản nháp tin tức kiểm thử', slug: 'test-article-news-draft',
          category_id: 'test-cat-news', status: 'draft', tags: '[]',
        });
        insert('articles', {
          id: 'test-article-education', title: 'Bài tuyên truyền kiểm thử', slug: 'test-article-education',
          excerpt: 'Nội dung kiểm thử.', body: '<p>Nội dung kiểm thử.</p>',
          category_id: 'test-cat-education', status: 'published', tags: '[]', published_at: ts,
        });

        insert('legal_documents', {
          id: 'test-law-current', code: 'test-law-current', title: 'Văn bản kiểm thử còn hiệu lực',
          doc_number: 'TEST/01', doc_type: 'luat', legal_field: 'Phòng, chống ma túy',
          issued_at: '2025-01-01', effective_at: '2025-01-01', effect_status: 'in_effect',
        });
        insert('legal_documents', {
          id: 'test-law-expired', code: 'test-law-expired', title: 'Văn bản kiểm thử hết hiệu lực',
          doc_number: 'TEST/02', doc_type: 'luat', legal_field: 'Phòng, chống ma túy',
          issued_at: '2020-01-01', effective_at: '2020-01-01', effect_status: 'expired',
        });

        insert('public_events', {
          id: 'test-event-upcoming', title: 'Sự kiện kiểm thử sắp diễn ra', slug: 'test-event-upcoming',
          event_type: 'truyen-thong', start_at: new Date(Date.now() + 86400000).toISOString(),
          end_at: new Date(Date.now() + 90000000).toISOString(), location: 'Địa điểm kiểm thử',
          status: 'sap-dien-ra', publish_status: 'published',
        });
        insert('public_events', {
          id: 'test-event-past', title: 'Sự kiện kiểm thử đã kết thúc', slug: 'test-event-past',
          event_type: 'hoi-thao', start_at: '2020-01-01T09:00:00.000Z',
          end_at: '2020-01-01T11:00:00.000Z', location: 'Địa điểm kiểm thử',
          status: 'da-ket-thuc', publish_status: 'published',
        });
        insert('public_events', {
          id: 'test-event-paused', title: 'Sự kiện kiểm thử tạm dừng', slug: 'test-event-paused',
          status: 'tam-dung', publish_status: 'published',
        });
        insert('public_events', {
          id: 'test-event-cancelled', title: 'Sự kiện kiểm thử đã hủy', slug: 'test-event-cancelled',
          status: 'da-huy', publish_status: 'published',
        });
        insert('public_events', {
          id: 'test-event-hidden', title: 'Sự kiện Chưa công khai kiểm thử', slug: 'test-event-hidden',
          event_type: 'truyen-thong', start_at: ts, status: 'sap-dien-ra', publish_status: 'draft',
        });

        insert('public_agencies', {
          id: 'test-agency', name: 'Cơ quan kiểm thử', slug: 'test-agency',
          role_type: 'coordination', management_level: 'thanh-pho', status: 'active',
        });
        insert('support_facilities', {
          id: 'test-support', code: 'TEST-SUPPORT', name: 'Cơ sở kiểm thử', type: 'methadone',
          latitude: 10.7769, longitude: 106.7009, services: JSON.stringify(['Dịch vụ kiểm thử']),
          status: 'active', publish_status: 'published',
        });
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw error;
      }
    `;
    if (runNode(['-e', fixtures]) !== 0) throw new Error('khởi tạo fixture kiểm thử thất bại');

    log(`Khởi động máy chủ kiểm thử trên ${BASE} ...`);
    server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (d) => process.stdout.write(`  ${d}`));
    server.stderr.on('data', (d) => process.stderr.write(`  ${d}`));

    if (!await waitForServer()) throw new Error('Máy chủ kiểm thử không khởi động được');

    const status = spawnSync(process.execPath, ['server/scripts/smoke-content-types.js'], {
      cwd: ROOT, env: { ...env, API_BASE: BASE }, stdio: 'inherit',
    }).status;

    server.kill();
    await new Promise((r) => setTimeout(r, 400));

    exitCode = status === 0 ? 0 : 1;
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
