/**
 * reset-content.js – Chuẩn hóa toàn bộ NỘI DUNG nghiệp vụ về 0.
 *
 * Giữ nguyên phần hệ thống: tổ chức, vai trò, quyền, tài khoản, cấu hình site.
 * Xoá sạch: chuyên mục, bài viết, văn bản, cơ quan, sự kiện, thống kê, cơ sở hỗ trợ,
 * nhiệm vụ, báo cáo, đề xuất, phản ánh, thông báo, banner, media, nhật ký, phiên.
 *
 * Chạy:  node server/scripts/reset-content.js [--yes]
 *
 * Sau khi chạy, Cổng thông tin hiển thị trạng thái "chưa có nội dung" cho tới khi
 * nội dung được nhập từ CMS (hoặc Workspace → CMS).
 */
'use strict';

const { getDb } = require('../lib/db');

const CONTENT_TABLES = [
  'statistics_items', 'statistics_periods', 'support_facilities', 'public_events', 'public_agencies',
  'legal_documents', 'notifications', 'activity_logs', 'collaboration_requests', 'proposals',
  'report_documents', 'reports', 'events', 'task_documents', 'task_history', 'task_comments',
  'task_items', 'tasks', 'doc_versions', 'documents', 'submission_events', 'submissions',
  'banners', 'media', 'article_revisions', 'articles',
  'login_attempts', 'sessions',
];

const KEEP_TABLES = ['organizations', 'roles', 'permissions', 'role_permissions', 'users', 'categories', 'settings'];

function resetContent() {
  const db = getDb();
  const removed = {};

  db.exec('BEGIN IMMEDIATE');
  try {
    CONTENT_TABLES.forEach((table) => {
      const n = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      if (n) {
        db.prepare(`DELETE FROM ${table}`).run();
        removed[table] = n;
      }
      try { db.exec(`DELETE FROM sqlite_sequence WHERE name = '${table}'`); } catch (_) { /* bảng không có AUTOINCREMENT */ }
    });
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  }
  return removed;
}

if (require.main === module) {
  const confirmed = process.argv.includes('--yes') || process.argv.includes('-y');
  const db = getDb();

  const before = CONTENT_TABLES.reduce((sum, t) => sum + db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c, 0);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CHUẨN HÓA NỘI DUNG NGHIỆP VỤ VỀ 0');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Bản ghi nội dung hiện có: ${before}`);

  if (before === 0) {
    console.log('  ✓ Nội dung đã ở trạng thái 0, không cần xoá.');
  } else if (!confirmed) {
    console.log('\n  Đây là thao tác XOÁ KHÔNG THỂ HOÀN TÁC.');
    console.log('  Chạy lại với tham số --yes để xác nhận:');
    console.log('      node server/scripts/reset-content.js --yes\n');
    process.exit(1);
  } else {
    const removed = resetContent();
    Object.entries(removed).forEach(([t, n]) => console.log(`  − ${t}: ${n}`));
    console.log(`  ✓ Đã xoá ${Object.values(removed).reduce((a, b) => a + b, 0)} bản ghi nội dung.`);
  }

  console.log('\n  Giữ nguyên phần hệ thống:');
  KEEP_TABLES.forEach((t) => {
    console.log(`    · ${t}: ${db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c}`);
  });
  console.log('═══════════════════════════════════');
  console.log('  Cổng thông tin hiện không có nội dung; nội dung sẽ hiển thị');
  console.log('  khi được nhập và xuất bản từ CMS.');
  console.log('═══════════════════════════════════════════════════════════');
}

module.exports = { resetContent, CONTENT_TABLES, KEEP_TABLES };
