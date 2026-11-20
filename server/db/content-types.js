/**
 * Gỡ dữ liệu demo cũ đã được đánh dấu data_source = 'demo'.
 * Mặc định chỉ báo cáo; thêm --yes để xóa các bản ghi legacy.
 */
'use strict';

const { getDb } = require('../lib/db');

const DEMO_SOURCE = 'demo';

function deleteDemoData(db) {
  const where = `data_source = '${DEMO_SOURCE}'`;
  const counts = {};
  const one = (label, sql, params = []) => {
    const r = db.prepare(sql).run(...params);
    counts[label] = (counts[label] || 0) + Number(r.changes || 0);
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    one('articles', `DELETE FROM articles WHERE ${where}`);
    one('categories', `DELETE FROM categories WHERE ${where}`);
    one('legal_documents', `DELETE FROM legal_documents WHERE ${where}`);
    one('public_agencies', `DELETE FROM public_agencies WHERE ${where}`);
    one('public_events', `DELETE FROM public_events WHERE ${where}`);
    one('support_facilities', `DELETE FROM support_facilities WHERE ${where}`);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  }
  return counts;
}

/* ---------------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------------- */

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const db = getDb();
  try {
    if (args.has('--purge')) {
      const preview = db.prepare(`SELECT 'articles' AS t, COUNT(*) AS c FROM articles WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'categories', COUNT(*) FROM categories WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'legal_documents', COUNT(*) FROM legal_documents WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'public_agencies', COUNT(*) FROM public_agencies WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'public_events', COUNT(*) FROM public_events WHERE data_source = '${DEMO_SOURCE}'
        UNION ALL SELECT 'support_facilities', COUNT(*) FROM support_facilities WHERE data_source = '${DEMO_SOURCE}'`).all();
      preview.forEach((r) => console.log(`  ${r.t.padEnd(22)} ${r.c}`));
      if (!args.has('--yes')) {
        console.log('\nĐây là chế độ báo cáo. Chạy lại với --yes để xoá dữ liệu mẫu.');
      } else {
        const counts = deleteDemoData(db);
        console.log('Đã xoá dữ liệu mẫu:', JSON.stringify(counts));
      }
    } else {
      console.log(`Gỡ dữ liệu demo cũ đã được đánh dấu data_source = '${DEMO_SOURCE}'

  node server/db/content-types.js --purge         # xem số bản ghi cũ
  node server/db/content-types.js --purge --yes   # xoá bản ghi cũ
`);
    }
  } catch (err) {
    console.error('Lỗi:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { deleteDemoData, DEMO_SOURCE };
