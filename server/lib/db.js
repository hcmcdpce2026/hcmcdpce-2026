/**
 * Lớp truy cập cơ sở dữ liệu SQLite (module node:sqlite có sẵn từ Node.js 22).
 * Không cần cài dependency bên ngoài. Hỗ trợ prepared statement & transaction.
 *
 * Hai cách dùng:
 *   const { getDb }   = require('./db');       // DatabaseSync instance
 *   const { get, all, run } = require('./db'); // helper chuẩn
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..', '..');
const DB_FILE = process.env.DB_FILE
  ? path.resolve(ROOT, process.env.DB_FILE)
  : path.join(ROOT, 'server', 'data', 'portal.sqlite');

let instance = null;

/** Mở (hoặc lấy) kết nối database dùng chung */
function getDb() {
  if (instance) return instance;

  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  instance = new DatabaseSync(DB_FILE);
  instance.exec('PRAGMA journal_mode = WAL;');
  instance.exec('PRAGMA foreign_keys = ON;');
  instance.exec('PRAGMA busy_timeout = 5000;');

  const schemaPath = path.join(ROOT, 'server', 'db', 'schema.sql');
  instance.exec(fs.readFileSync(schemaPath, 'utf8'));

  return instance;
}

/**
 * Bổ sung cột còn thiếu cho các bảng nội dung công khai (idempotent).
 * Database tạo trước khi có schema mới cần bước này để các trường chuyên biệt
 * của từng loại nội dung (lĩnh vực pháp luật, toạ độ cơ sở, …) luôn tồn tại.
 */
function ensureContentTypeColumns() {
  const db = getDb();
  const columns = {
    legal_documents: [
      ['slug', 'TEXT'], ['legal_field', 'TEXT'], ['expiry_at', 'TEXT'],
      ['effect_status', "TEXT NOT NULL DEFAULT 'in_effect'"],
      ['is_public', 'INTEGER NOT NULL DEFAULT 1'], ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ],
    public_events: [
      ['slug', 'TEXT'], ['event_type', 'TEXT'], ['co_organizer', 'TEXT'],
      ['publish_status', "TEXT NOT NULL DEFAULT 'published'"],
    ],
    public_agencies: [
      ['slug', 'TEXT'], ['management_level', 'TEXT'], ['functions_text', 'TEXT'],
      ['structure', 'TEXT'], ['head_name', 'TEXT'],
    ],
    support_facilities: [
      ['code', 'TEXT'], ['managing_org', 'TEXT'], ['org_id', 'TEXT'], ['ward', 'TEXT'],
      ['city', 'TEXT'], ['latitude', 'REAL'], ['longitude', 'REAL'], ['email', 'TEXT'],
      ['website', 'TEXT'], ['contact_person', 'TEXT'], ['services', 'TEXT'],
      ['audience', 'TEXT'], ['scope', 'TEXT'], ['conditions', 'TEXT'], ['procedures', 'TEXT'],
      ['cost_note', 'TEXT'], ['image_url', 'TEXT'], ['source', 'TEXT'], ['verified_at', 'TEXT'],
      ['publish_status', "TEXT NOT NULL DEFAULT 'published'"],
    ],
  };
  Object.keys(columns).forEach((table) => {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    columns[table].forEach(([col, def]) => {
      if (existing.has(col)) return;
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (err) {
        console.warn(`[db] Không thêm được cột ${table}.${col}: ${err.message}`);
      }
    });
  });
}

/** Helper: lấy một bản ghi */
function get(sql, params = []) {
  return getDb().prepare(sql).get(...params) || null;
}

/** Helper: lấy danh sách bản ghi */
function all(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

/** Helper: thực thi ghi */
function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

/** Chạy toàn bộ seed nếu database còn trống */
function initialize({ seed = true } = {}) {
  const db = getDb();
  ensureContentTypeColumns();
  if (!seed) return db;
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (!row || row.c === 0) {
    ensureSeed();
  }
  return db;
}

/**
 * Nạp seed một lần. Không gọi trong transaction đang mở và không giữ kết nối
 * khác (SQLite chỉ cho một writer).
 */
function ensureSeed() {
  const { seedAll } = require('../db/seed');
  const creds = seedAll({ reset: false });
  const count = Object.keys(creds).length;
  if (count) console.log(`[init] Đã nạp dữ liệu khởi tạo ban đầu (${count} tài khoản).`);
  return count;
}

module.exports = { getDb, get, all, run, initialize, ensureContentTypeColumns, DB_FILE };
