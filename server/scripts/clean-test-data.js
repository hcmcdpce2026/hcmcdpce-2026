/**
 * clean-test-data.js – Gỡ dữ liệu do các bộ kiểm thử tự động tạo ra.
 *
 * Kiểm thử tích hợp (test-api.js, smoke-interconnect.js) chạy trên máy chủ thật.
 * Nếu chạy nhầm trên database đang dùng, dữ liệu kiểm thử sẽ lẫn vào nội dung
 * công khai. Tập lệnh này nhận diện CHÍNH XÁC các bản ghi do kiểm thử sinh ra:
 *
 *   - Tiêu đề bắt đầu bằng "Đề xuất nội dung kiểm thử " (Workspace → CMS)
 *   - Tiêu đề đúng bằng "Bài kiểm thử liên thông CMS"
 *   - Tiêu đề đúng bằng "Kiểm thử XSS", "Bài kiểm thử của biên tập viên"
 *   - Phản ánh kiểm thử: tiêu đề/mô tả chứa "Kiểm thử phản ánh <timestamp>"
 *   - Tài nguyên tải lên trong thư mục gốc gốc: tên tệp mẫu của bộ kiểm thử
 *
 * Không nhận diện theo thời gian để tránh xoá nhầm nội dung người dùng vừa tạo.
 * Mặc định chỉ BÁO CÁO. Thêm --yes để thực sự xoá.
 *
 * Chạy: node server/scripts/clean-test-data.js [--yes]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');

const ARTICLE_TITLE_PREFIXES = ['Đề xuất nội dung kiểm thử '];
const ARTICLE_TITLE_EXACT = ['Bài kiểm thử liên thông CMS', 'Kiểm thử XSS', 'Bài kiểm thử của biên tập viên'];
const SUBMISSION_MARKERS = ['Kiểm thử phản ánh', 'Nội dung phản ánh kiểm thử hợp lệ'];

/* Tệp mẫu do bộ kiểm thử tải lên. Tên được lưu trong cột media.name. */
const TEST_MEDIA_NAMES = new Set([
  'normal.png', 'evil.html', 'evil.svg', 'evil.php', 'big.mp4', 'toolon.mp4',
  'fake.png.html', 'rong.pdf', 'anh-kiem-thu.png', 'qua-lon.mp4',
  'anh.svg', 'ma.php', 'gia-mao.png.html', 'tieng-viet-ảnh.PNG',
]);

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

function isTestArticle(row) {
  const title = String(row.title || '').trim();
  if (ARTICLE_TITLE_EXACT.includes(title)) return true;
  return ARTICLE_TITLE_PREFIXES.some((prefix) => title.startsWith(prefix));
}

function isTestMedia(row) {
  const name = String(row.name || '');
  if (TEST_MEDIA_NAMES.has(name)) return true;
  if (/(^|-)size-\d+mb\.mp4$/i.test(String(row.url || ''))) return true;
  /* Tên tệp mẫu của bộ kiểm thử sau khi máy chủ chuẩn hóa (bỏ dấu, thay khoảng trắng) */
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return /^(anh|tai-lieu|tep|normal|big|toolon)-kiem-thu|kiem-thu-tieng-viet|^doc-hai\b/.test(normalized);
}

/** Lớp con của một bản ghi phải xoá trước (khoá ngoại). */
const DEPENDENTS = {
  articles: [
    ['article_revisions', 'article_id'],
  ],
  submissions: [
    ['submission_events', 'submission_id'],
  ],
  tasks: [
    ['task_history', 'task_id'], ['task_comments', 'task_id'],
    ['task_items', 'task_id'], ['task_documents', 'task_id'],
  ],
  proposals: [],
};

function plan(db) {
  const articles = db.prepare('SELECT id, title, status FROM articles').all().filter(isTestArticle);
  const articleIds = new Set(articles.map((a) => a.id));

  const submissions = db.prepare('SELECT id, ticket_code, subject, content FROM submissions').all()
    .filter((s) => SUBMISSION_MARKERS.some((mark) => String(s.subject || '').includes(mark) ||
      String(s.content || '').includes(mark)));

  /* Nhiệm vụ được sinh từ phản ánh kiểm thử: tasks.source_id trỏ tới submission.id */
  const subIds = new Set(submissions.map((s) => s.id));
  const tasks = db.prepare('SELECT id, title, source_id FROM tasks').all()
    .filter((t) => (t.source_id && subIds.has(t.source_id)) || /Kiểm thử/.test(String(t.title || '')));

  const proposals = db.prepare('SELECT id, title, article_id FROM proposals').all()
    .filter((p) => (p.article_id && articleIds.has(p.article_id)) || /Kiểm thử/.test(String(p.title || '')));

  const media = db.prepare('SELECT id, name, url FROM media').all().filter(isTestMedia);

  return { articles, submissions, tasks, proposals, media };
}

function report(p) {
  const section = (label, rows, fmt) => {
    if (!rows.length) return;
    console.log(`\n${label} (${rows.length}):`);
    rows.forEach((r) => console.log(`  - ${fmt(r)}`));
  };
  section('Bài viết kiểm thử', p.articles, (r) => `${r.id} | ${r.status} | ${r.title}`);
  section('Phản ánh kiểm thử', p.submissions, (r) => `${r.ticket_code} | ${r.id}`);
  section('Nhiệm vụ kiểm thử', p.tasks, (r) => `${r.id} | ${r.title}`);
  section('Đề xuất kiểm thử', p.proposals, (r) => `${r.id} | ${r.title}`);
  section('Tài nguyên kiểm thử', p.media, (r) => `${r.id} | ${r.name} | ${r.url}`);
  const total = p.articles.length + p.submissions.length + p.tasks.length + p.proposals.length + p.media.length;
  console.log(total ? `\nTổng bản ghi kiểm thử: ${total}` : 'Không phát hiện bản ghi kiểm thử.');
  return total;
}

function clean(db, p) {
  const fileList = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const del = (table, col, ids) => {
      if (!ids.size) return;
      const stmt = db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`);
      ids.forEach((id) => stmt.run(id));
    };

    /* Tài nguyên: xoá bản ghi và tệp trên đĩa */
    p.media.forEach((m) => {
      db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
      if (String(m.url || '').startsWith('/uploads/')) {
        const filePath = path.join(UPLOADS_DIR, path.basename(m.url));
        if (filePath.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(filePath)) fileList.push(filePath);
      }
    });

    const taskIds = new Set(p.tasks.map((t) => t.id));
    const subIds = new Set(p.submissions.map((s) => s.id));
    const propIds = new Set(p.proposals.map((x) => x.id));

    /* An toàn: phản ánh kiểm thử còn bị nhiệm vụ KHÔNG thuộc diện xoá tham chiếu? */
    const keptRefs = db.prepare('SELECT id, source_type, source_id FROM tasks').all()
      .filter((r) => !taskIds.has(r.id) && r.source_type === 'submission' && subIds.has(r.source_id));
    if (keptRefs.length) {
      throw new Error('Có nhiệm vụ không phải kiểm thử trỏ tới phản ánh kiểm thử — dừng để tránh mất dữ liệu.');
    }

    /* Thứ tự xoá theo khoá ngoại: tham chiếu phải được gỡ TRƯỚC khi xoá cha.
       tasks bị tham chiếu bởi proposals/reports/collaboration_requests, còn
       submissions.task_id trỏ tới tasks → gỡ liên kết submissions trước tiên. */
    subIds.forEach((id) => db.prepare('UPDATE submissions SET task_id = NULL WHERE id = ?').run(id));
    propIds.forEach((id) => db.prepare("UPDATE tasks SET source_id = NULL WHERE source_type = 'proposal' AND source_id = ?").run(id));
    taskIds.forEach((id) => {
      db.prepare('UPDATE proposals SET task_id = NULL WHERE task_id = ?').run(id);
      db.prepare('UPDATE reports SET task_id = NULL WHERE task_id = ?').run(id);
      db.prepare('UPDATE collaboration_requests SET task_id = NULL WHERE task_id = ?').run(id);
    });

    (DEPENDENTS.tasks || []).forEach(([t, c]) => del(t, c, taskIds));
    del('tasks', 'id', taskIds);

    (DEPENDENTS.submissions || []).forEach(([t, c]) => del(t, c, subIds));
    del('submissions', 'id', subIds);

    (DEPENDENTS.proposals || []).forEach(([t, c]) => del(t, c, propIds));
    del('proposals', 'id', propIds);

    const ids = new Set(p.articles.map((a) => a.id));
    /* Gỡ tham chiếu bài viết trước khi xoá (khoá ngoại trong article_revisions…) */
    ids.forEach((id) => db.prepare("UPDATE submissions SET article_id = NULL WHERE article_id = ?").run(id));
    (DEPENDENTS.articles || []).forEach(([t, c]) => del(t, c, ids));
    del('articles', 'id', ids);

    /* Nhật ký/nối tiếp liên quan tới các id đã xoá */
    const allIds = [...ids, ...p.submissions.map((s) => s.id), ...taskIds, ...p.proposals.map((x) => x.id)];
    const logStmt = db.prepare('DELETE FROM activity_logs WHERE target_id = ?');
    allIds.forEach((id) => logStmt.run(id));

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
  /* Kiểm tra khoá ngoại sau khi xoá: nếu còn vi phạm, báo rõ thay vì im lặng. */
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length) {
    console.warn(`Cảnh báo: còn ${violations.length} vi phạm khoá ngoại sau khi xoá.`);
    violations.slice(0, 5).forEach((v) => console.warn('  ', JSON.stringify(v)));
  }
  fileList.forEach((f) => { try { fs.unlinkSync(f); } catch (_) { /* tệp đã mất */ } });
  return fileList.length;
}

function main() {
  const yes = process.argv.includes('--yes') || process.argv.includes('-y');
  const db = getDb();
  const p = plan(db);
  const total = report(p);
  if (!total) return;
  if (!yes) {
    console.log('\nĐây là chế độ báo cáo. Chạy lại với --yes để xoá các bản ghi trên.');
    return;
  }
  const files = clean(db, p);
  console.log(`\nĐã xoá ${total} bản ghi kiểm thử và ${files} tệp tải lên đi kèm.`);
  console.log('Chạy lại bộ kiểm thử tách biệt (npm run test:isolated) để không lẫn dữ liệu vào database vận hành.');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error('Không thể dọn dữ liệu kiểm thử:', err.message); process.exitCode = 1; }
}

module.exports = { plan, clean, report, isTestArticle, isTestMedia };
