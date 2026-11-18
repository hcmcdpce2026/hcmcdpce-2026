/**
 * data-tool.js – Nhập / Xuất dữ liệu nghiệp vụ (CSV, JSON).
 *
 *   node server/scripts/data-tool.js export <bảng|all> [--out <thư mục>]
 *   node server/scripts/data-tool.js import <bảng> <tệp.csv|json> [--dry-run]
 *   node server/scripts/data-tool.js stats
 *   node server/scripts/data-tool.js purge-seed [--confirm]
 *
 * Quy tắc an toàn:
 *  - Import cập nhật theo khóa chính; không xóa bản ghi hiện có nếu không có cột id.
 *  - Không ghi đè khóa ngoại không tồn tại (bỏ qua dòng có tham chiếu sai).
 *  - `purge-seed` chỉ xóa dữ liệu khởi tạo (is_seed_data = 1) và chỉ khi không còn
 *    bản ghi vận hành tham chiếu tới nó.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');

const db = getDb();
const ROOT = path.resolve(__dirname, '..', '..');

/* Bảng cho phép nhập/xuất theo thứ tự phụ thuộc khóa ngoại */
const TABLES = [
  'organizations', 'roles', 'permissions', 'role_permissions', 'users',
  'categories', 'articles', 'media', 'banners', 'documents', 'doc_versions',
  'submissions', 'submission_events', 'tasks', 'task_items', 'task_comments', 'task_history',
  'events', 'reports', 'proposals', 'collaboration_requests', 'notifications',
  'legal_documents', 'public_agencies', 'public_events',
  'statistics_periods', 'statistics_items', 'support_facilities', 'settings',
];

/* ============================ CSV ========================================= */

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((c) => c !== '')).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] === '' ? null : r[i]; });
    return obj;
  });
}

/* ============================ EXPORT ===================================== */

function exportTable(table, outDir) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  const target = path.join(outDir, `${table}.csv`);
  fs.writeFileSync(target, toCsv(rows), 'utf8');
  const jsonTarget = path.join(outDir, `${table}.json`);
  fs.writeFileSync(jsonTarget, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`  ✓ ${table}: ${rows.length} bản ghi → ${path.relative(ROOT, target)}`);
  return rows.length;
}

function cmdExport(args) {
  const target = args[0] || 'all';
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? path.resolve(ROOT, args[outIdx + 1]) : path.join(ROOT, 'backups', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
  fs.mkdirSync(outDir, { recursive: true });

  console.log('XUẤT DỮ LIỆU →', path.relative(ROOT, outDir));
  const list = target === 'all' ? TABLES : [target];
  let total = 0;
  list.forEach((t) => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)) {
      console.warn('  ! Bảng không tồn tại:', t);
      return;
    }
    total += exportTable(t, outDir);
  });
  console.log(`Hoàn tất: ${list.length} bảng, ${total} bản ghi.`);
}

/* ============================ IMPORT ===================================== */

/** Khóa ngoại cần kiểm tra: { cột: bảng } */
const FOREIGN_KEYS = {
  articles: { category_id: 'categories', author_id: 'users' },
  categories: { parent_id: 'categories' },
  users: { role_id: 'roles', org_id: 'organizations' },
  tasks: { owner_org_id: 'organizations', assigner_id: 'users' },
  reports: { org_id: 'organizations', author_id: 'users', task_id: 'tasks' },
  proposals: { category_id: 'categories', org_id: 'organizations', author_id: 'users' },
  documents: { org_id: 'organizations', uploader_id: 'users' },
  submissions: { assigned_org_id: 'organizations' },
  collaboration_requests: { to_org_id: 'organizations' },
  public_agencies: { org_id: 'organizations' },
  events: { org_id: 'organizations', owner_id: 'users' },
};

function cmdImport(args) {
  const table = args[0];
  const file = args[1];
  const dryRun = args.includes('--dry-run');
  if (!table || !file) {
    console.error('Cách dùng: import <bảng> <tệp.csv|json> [--dry-run]');
    process.exit(1);
  }
  if (!TABLES.includes(table)) {
    console.error('Bảng không được phép nhập:', table);
    process.exit(1);
  }

  const full = path.resolve(ROOT, file);
  if (!fs.existsSync(full)) { console.error('Không tìm thấy tệp:', full); process.exit(1); }
  const text = fs.readFileSync(full, 'utf8');
  const rows = full.endsWith('.json') ? JSON.parse(text) : parseCsv(text);

  const existingCols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const fks = FOREIGN_KEYS[table] || {};
  const validRef = (fkTable, value) =>
    !value || !!db.prepare(`SELECT 1 FROM ${fkTable} WHERE id = ?`).get(value);

  let ok = 0;
  const skipped = [];

  const run = db.transaction(() => {
    rows.forEach((raw, idx) => {
      const row = {};
      Object.keys(raw).forEach((k) => { if (existingCols.includes(k)) row[k] = raw[k]; });
      if (!row.id) { skipped.push({ row: idx + 2, reason: 'thiếu cột id' }); return; }
      const fkError = Object.keys(fks).find((col) => row[col] && !validRef(fks[col], row[col]));
      if (fkError) { skipped.push({ row: idx + 2, id: row.id, reason: `khóa ngoại ${fkError} không tồn tại` }); return; }

      if (!row.updated_at) row.updated_at = new Date().toISOString();
      if (!row.created_at) row.created_at = new Date().toISOString();
      if ('data_source' in row && !row.data_source) row.data_source = 'production';
      if ('is_seed_data' in row) row.is_seed_data = Number(row.is_seed_data) ? 1 : 0;

      const cols = Object.keys(row);
      const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(row.id);
      if (exists) {
        db.prepare(`UPDATE ${table} SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
          .run(...cols.filter((c) => c !== 'id').map((c) => row[c]), row.id);
      } else {
        db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .run(...cols.map((c) => row[c]));
      }
      ok += 1;
    });
    if (dryRun) throw new Error('__DRY_RUN__');
  });

  console.log(`NHẬP DỮ LIỆU → ${table} (${rows.length} dòng)${dryRun ? ' [thử nghiệm]' : ''}`);
  try {
    run();
  } catch (err) {
    if (err.message !== '__DRY_RUN__') throw err;
  }
  console.log(`  ✓ Hợp lệ: ${ok}`);
  if (skipped.length) {
    console.log(`  ! Bỏ qua: ${skipped.length}`);
    skipped.slice(0, 10).forEach((s) => console.log(`      dòng ${s.row}${s.id ? ' (' + s.id + ')' : ''}: ${s.reason}`));
  }
  console.log(dryRun ? 'Chưa ghi dữ liệu (chế độ --dry-run).' : 'Đã ghi dữ liệu.');
}

/* ============================ STATS / PURGE ============================== */

function cmdStats() {
  console.log('THỐNG KÊ NGUỒN DỮ LIỆU\n');
  const tracked = ['articles', 'categories', 'users', 'organizations', 'tasks', 'reports', 'documents', 'submissions', 'proposals'];
  tracked.forEach((t) => {
    const total = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    const seed = db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE is_seed_data = 1`).get().c;
    const src = db.prepare(`SELECT data_source, COUNT(*) AS c FROM ${t} GROUP BY data_source`).all()
      .map((r) => `${r.data_source}: ${r.c}`).join(', ');
    console.log(`  ${t.padEnd(16)} tổng ${String(total).padStart(4)} | khởi tạo ${String(seed).padStart(4)} | ${src}`);
  });
}

function cmdPurgeSeed(args) {
  if (!args.includes('--confirm')) {
    console.error('Từ chối: thêm --confirm để xóa dữ liệu khởi tạo. Hãy sao lưu trước bằng lệnh export.');
    process.exit(1);
  }
  const guarded = [
    ['articles', 'SELECT COUNT(*) AS c FROM articles WHERE is_seed_data = 0'],
    ['submissions', 'SELECT COUNT(*) AS c FROM submissions WHERE is_seed_data = 0'],
    ['tasks', 'SELECT COUNT(*) AS c FROM tasks WHERE is_seed_data = 0'],
    ['reports', 'SELECT COUNT(*) AS c FROM reports WHERE is_seed_data = 0'],
  ];
  const hasOperational = guarded.some(([, sql]) => db.prepare(sql).get().c > 0);
  if (hasOperational) {
    console.error('Từ chối: đã có dữ liệu vận hành. Không xóa dữ liệu khởi tạo tự động để tránh mất liên kết.');
    process.exit(1);
  }
  const purge = db.transaction(() => {
    // Xóa theo thứ tự phụ thuộc
    ['article_revisions', 'report_documents', 'task_documents', 'task_history', 'task_comments', 'task_items']
      .forEach((t) => db.prepare(`DELETE FROM ${t}`).run());
    ['proposals', 'collaboration_requests', 'tasks', 'reports', 'documents', 'submissions', 'articles']
      .forEach((t) => db.prepare(`DELETE FROM ${t} WHERE is_seed_data = 1`).run());
    db.prepare('DELETE FROM categories WHERE is_seed_data = 1').run();
  });
  purge();
  console.log('Đã xóa dữ liệu khởi tạo. Chạy `npm run db:seed` nếu cần nạp lại.');
}

/* ============================ CLI ======================================== */

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'export': cmdExport(rest); break;
  case 'import': cmdImport(rest); break;
  case 'stats': cmdStats(); break;
  case 'purge-seed': cmdPurgeSeed(rest); break;
  default:
    console.log(`CÔNG CỤ DỮ LIỆU – CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH

  node server/scripts/data-tool.js export all [--out <thư mục>]
  node server/scripts/data-tool.js export <bảng> [--out <thư mục>]
  node server/scripts/data-tool.js import <bảng> <tệp.csv|json> [--dry-run]
  node server/scripts/data-tool.js stats
  node server/scripts/data-tool.js purge-seed --confirm
`);
}
