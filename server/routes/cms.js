/**
 * API phân hệ CMS:
 *  - Nội dung: /api/cms/articles ...
 *  - Chuyên mục: /api/cms/categories
 *  - Tài nguyên: /api/cms/media
 *  - Quy trình xuất bản: /api/cms/workflow
 *  - Tiếp nhận: /api/cms/submissions
 *  - Đề xuất từ Workspace: /api/cms/proposals
 *  - Yêu cầu phối hợp: /api/cms/collaborations
 *  - Nhật ký, thống kê: /api/cms/logs, /api/cms/stats
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');
const http = require('../lib/http');
const auth = require('../lib/auth');
const sec = require('../lib/security');
const uploadPolicy = require('../lib/upload');
const m = require('../lib/mapper');
const { normalizeCategoryGroupCode } = require('../lib/category-groups');
const sysCategories = require('../lib/system-category-types');

const nowIso = () => new Date().toISOString();

/** Thư mục mặc định trong thư viện tài nguyên theo loại tệp */
const FOLDER_BY_TYPE = {
  image: 'Hình ảnh hoạt động',
  video: 'Video',
  audio: 'Âm thanh',
  document: 'Tài liệu tải lên',
};

function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 90);
}

function uniqueSlug(db, table, base, excludeId = null) {
  let slug = slugify(base) || `item-${Date.now().toString(36)}`;
  let i = 2;
  while (true) {
    const row = excludeId
      ? db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`).get(slug, excludeId)
      : db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug);
    if (!row) return slug;
    slug = `${slugify(base)}-${i++}`;
  }
}

function notify(db, { system = 'cms', type = 'info', title, body, href, toUserId = null }) {
  db.prepare(`INSERT INTO notifications (id, system_key, type, title, body, href, to_user_id, audience, is_read, created_at)
              VALUES (?,?,?,?,?,?,?,?,0,?)`)
    .run(sec.makeId('notif'), system, type, title, body || '', href || '', toUserId, toUserId ? 'user' : 'all', nowIso());
}

function paginate(list, query) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(query.limit || '20', 10)));
  const total = list.length;
  return { items: list.slice((page - 1) * limit, (page - 1) * limit + limit), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ============================== NỘI DUNG ================================== */

async function listArticles(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'content.view' });
  if (!s) return;
  const db = getDb();
  const q = ctx.query;
  const rows = db.prepare(`
    SELECT a.*, c.name AS category_name, u.full_name AS author_name
    FROM articles a LEFT JOIN categories c ON c.id = a.category_id
    LEFT JOIN users u ON u.id = a.author_id
    ORDER BY a.updated_at DESC`).all();

  let items = rows.map((r) => m.article(r));
  if (q.status && q.status !== 'all') items = items.filter((a) => a.status === q.status);
  if (q.categoryId) items = items.filter((a) => a.categoryId === q.categoryId);
  if (q.authorId) items = items.filter((a) => a.authorId === q.authorId);
  if (q.origin) items = items.filter((a) => a.origin === q.origin);
  if (q.search) {
    const needle = norm(q.search);
    items = items.filter((a) => norm(a.title).includes(needle) || norm(a.excerpt).includes(needle) || a.tags.some((t) => norm(t).includes(needle)));
  }
  if (q.relatedTo) items = items.filter((a) => a.originRef === q.relatedTo);

  const page = paginate(items, q);
  return http.ok(res, page.items.map(({ body, ...rest }) => rest), {
    pagination: { page: page.page, limit: page.limit, total: page.total, totalPages: page.totalPages },
  });
}

async function getArticle(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'content.view' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare(`SELECT a.*, c.name AS category_name FROM articles a LEFT JOIN categories c ON c.id = a.category_id WHERE a.id = ? OR a.slug = ?`).get(ctx.params.id, ctx.params.id);
  if (!row) return http.notFound(res, 'Bài viết không tồn tại.');
  const revisions = db.prepare('SELECT * FROM article_revisions WHERE article_id = ? ORDER BY created_at DESC LIMIT 20').all(row.id);
  return http.ok(res, m.article(row, {
    revisions: revisions.map((r) => ({ id: r.id, title: r.title, status: r.status, note: r.note, userName: r.user_name, at: r.created_at })),
  }));
}

async function createArticle(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'content.create' });
  if (!s) return;
  const body = await http.readJson(req);
  const title = sec.cleanText(body.title, 300);
  if (!title) return http.badRequest(res, 'Tiêu đề bài viết là bắt buộc.');

  const db = getDb();
  const id = sec.makeId('art');
  const slug = uniqueSlug(db, 'articles', body.slug || title);
  const ts = nowIso();
  const status = ['draft', 'pending'].includes(body.status) ? body.status : 'draft';
  db.prepare(`INSERT INTO articles (id, title, slug, excerpt, body, thumbnail, category_id, status, author_id, author_name,
      source, tags, seo_title, seo_description, views, submitted_at, submitted_by, origin, origin_ref,
      data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,'operational',0,?,?,?,?)`).run(
    id, title, slug, sec.cleanText(body.excerpt, 1000), sec.sanitizeHtml(body.body),
    sec.cleanText(body.thumbnail, 500), body.categoryId || null, status, s.user.id, s.user.name,
    sec.cleanText(body.source, 200), JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20) : []),
    sec.cleanText(body.seoTitle, 200), sec.cleanText(body.seoDescription, 300),
    status === 'pending' ? ts : null, status === 'pending' ? s.user.id : null,
    ['cms', 'workspace', 'public'].includes(body.origin) ? body.origin : 'cms', body.originRef || null,
    (process.env.APP_ENV || 'development'), ts, ts, s.user.id,
  );

  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'content.create', targetType: 'Nội dung', targetId: id, targetName: title, detail: 'Tạo nội dung mới', req });
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  return http.created(res, m.article(row));
}

async function updateArticle(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'content.edit' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Bài viết không tồn tại.');

  // Biên tập viên chỉ sửa bài của mình
  if (s.user.role === 'cms_editor' && row.author_id !== s.user.id) {
    return http.forbidden(res, 'Bạn chỉ được chỉnh sửa bài viết do mình tạo.');
  }

  const body = await http.readJson(req);
  const patch = {};
  if (body.title !== undefined) patch.title = sec.cleanText(body.title, 300);
  if (patch.title === '') return http.badRequest(res, 'Tiêu đề không được để trống.');
  if (body.excerpt !== undefined) patch.excerpt = sec.cleanText(body.excerpt, 1000);
  if (body.body !== undefined) patch.body = sec.sanitizeHtml(body.body);
  if (body.thumbnail !== undefined) patch.thumbnail = sec.cleanText(body.thumbnail, 500);
  if (body.categoryId !== undefined) patch.category_id = body.categoryId || null;
  if (body.source !== undefined) patch.source = sec.cleanText(body.source, 200);
  if (body.tags !== undefined) patch.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20) : []);
  if (body.seoTitle !== undefined) patch.seo_title = sec.cleanText(body.seoTitle, 200);
  if (body.seoDescription !== undefined) patch.seo_description = sec.cleanText(body.seoDescription, 300);
  if (body.slug !== undefined) patch.slug = uniqueSlug(db, 'articles', body.slug || row.title, row.id);

  const keys = Object.keys(patch);
  if (!keys.length) return http.badRequest(res, 'Không có dữ liệu cập nhật.');

  // Lưu phiên bản trước khi cập nhật
  db.prepare(`INSERT INTO article_revisions (id, article_id, title, body, status, note, user_id, user_name, created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(sec.makeId('rev'), row.id, row.title, row.body, row.status, 'Trước khi cập nhật', s.user.id, s.user.name, nowIso());

  const setSql = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE articles SET ${setSql}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => patch[k]), nowIso(), row.id);

  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'content.update', targetType: 'Nội dung', targetId: row.id, targetName: patch.title || row.title, detail: 'Cập nhật nội dung bài viết', req });
  const fresh = db.prepare('SELECT * FROM articles WHERE id = ?').get(row.id);
  return http.ok(res, m.article(fresh));
}

async function articleAction(req, res, ctx) {
  const action = ctx.params.action;
  const permissionMap = {
    submit: 'content.submit', approve: 'content.review', reject: 'content.review',
    revise: 'content.review', publish: 'content.publish', unpublish: 'content.publish', archive: 'content.archive',
  };
  const s = auth.requireAuth(req, res, { system: 'cms', permission: permissionMap[action] || 'content.edit' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Bài viết không tồn tại.');

  const body = await http.readJson(req).catch(() => ({}));
  const note = sec.cleanText(body.note, 1000);
  const ts = nowIso();
  let patch = {};

  const transitions = {
    submit: { from: ['draft', 'rejected', 'revision'], to: 'pending' },
    approve: { from: ['pending'], to: 'approved' },
    reject: { from: ['pending', 'approved'], to: 'rejected' },
    revise: { from: ['pending'], to: 'revision' },
    publish: { from: ['approved', 'pending'], to: 'published' },
    unpublish: { from: ['published'], to: 'approved' },
    archive: { from: ['published', 'approved', 'draft', 'rejected', 'revision'], to: 'archived' },
  };
  const t = transitions[action];
  if (!t) return http.badRequest(res, 'Hành động không hợp lệ.');
  if (!t.from.includes(row.status)) {
    return http.badRequest(res, `Không thể thực hiện thao tác này khi nội dung đang ở trạng thái "${row.status}".`);
  }
  // Biên tập viên chỉ được gửi duyệt bài của mình
  if (action === 'submit' && s.user.role === 'cms_editor' && row.author_id !== s.user.id) {
    return http.forbidden(res, 'Bạn chỉ được gửi duyệt bài viết do mình tạo.');
  }
  if (action === 'publish' && row.status === 'pending' && !['cms_admin', 'cms_manager'].includes(s.user.role)) {
    return http.forbidden(res, 'Nội dung chưa qua kiểm duyệt. Chỉ Trưởng ban biên tập hoặc Quản trị viên được phát hành.');
  }

  patch.status = t.to;
  if (action === 'submit') Object.assign(patch, { submitted_at: ts, submitted_by: s.user.id });
  if (['approve', 'reject', 'revise'].includes(action)) {
    Object.assign(patch, { reviewed_at: ts, reviewed_by: s.user.id, review_note: note || null });
  }
  if (action === 'publish') Object.assign(patch, { published_at: ts, reviewed_at: row.reviewed_at || ts, reviewed_by: row.reviewed_by || s.user.id });
  if (action === 'unpublish') patch.published_at = null;
  if (action === 'archive') patch.archived_at = ts;

  const keys = Object.keys(patch);
  db.prepare(`UPDATE articles SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => patch[k]), ts, row.id);

  db.prepare(`INSERT INTO article_revisions (id, article_id, title, body, status, note, user_id, user_name, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(sec.makeId('rev'), row.id, row.title, row.body, t.to, note || `Chuyển trạng thái sang ${t.to}`, s.user.id, s.user.name, ts);

  auth.logActivity({
    systemKey: 'cms', user: s.user, action: `content.${action}`, targetType: 'Nội dung',
    targetId: row.id, targetName: row.title,
    detail: note || `Chuyển trạng thái: ${row.status} → ${t.to}`,
    result: action === 'reject' ? 'warning' : 'success', req,
  });

  if (row.origin === 'workspace' && row.origin_ref) {
    if (action === 'publish') {
      db.prepare(`UPDATE proposals SET status = 'published', article_id = ?, published_at = ?, updated_at = ? WHERE id = ?`)
        .run(row.id, ts, ts, row.origin_ref);
      notify(db, { system: 'workspace', type: 'proposal_published', title: 'Đề xuất nội dung đã được xuất bản', body: row.title, href: 'content-list.html' });
    } else if (action === 'reject' || action === 'revise') {
      db.prepare(`UPDATE proposals SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
        .run(action === 'reject' ? 'rejected' : 'revision', note, s.user.name, ts, ts, row.origin_ref);
    } else if (action === 'approve') {
      db.prepare(`UPDATE proposals SET status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
        .run(s.user.name, ts, ts, row.origin_ref);
    }
  }

  const fresh = db.prepare('SELECT * FROM articles WHERE id = ?').get(row.id);
  return http.ok(res, m.article(fresh));
}

async function deleteArticle(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'content.delete' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Bài viết không tồn tại.');
  if (row.status === 'published') {
    return http.conflict(res, 'Bài viết đang được công khai. Hãy thu hồi (ngừng xuất bản) trước khi xóa.');
  }
  db.prepare('DELETE FROM articles WHERE id = ?').run(row.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'content.delete', targetType: 'Nội dung', targetId: row.id, targetName: row.title, detail: 'Xóa bài viết', req });
  return http.ok(res, { id: row.id, message: 'Đã xóa bài viết.' });
}

/* ============================== CHUYÊN MỤC ================================ */

async function listCategories(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.status <> 'archived') AS article_count
    FROM categories c ORDER BY c.sort_order, c.name`).all();
  return http.ok(res, rows.map(m.category));
}

async function saveCategory(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'category.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const name = sec.cleanText(body.name, 200);
  if (!name) return http.badRequest(res, 'Tên chuyên mục là bắt buộc.');
  const id = ctx.params.id || body.id || null;
  const ts = nowIso();

  if (id) {
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!row) return http.notFound(res, 'Chuyên mục không tồn tại.');
    if (body.parentId === id) return http.badRequest(res, 'Chuyên mục không thể là cha của chính nó.');
    const rawGroup = body.group === undefined ? row.group_key : sec.cleanText(body.group, 80);
    const group = normalizeCategoryGroupCode(rawGroup);
    const categoryGroup = db.prepare(`SELECT status FROM system_categories
      WHERE category_type = 'category_group' AND code = ?`).get(group);
    if (!categoryGroup || (categoryGroup.status !== 'active' && group !== row.group_key)) {
      return http.badRequest(res, 'Nhóm chuyên mục phải thuộc danh mục đang sử dụng.');
    }
    db.prepare(`UPDATE categories SET name = ?, slug = ?, parent_id = ?, description = ?, group_key = ?, status = ?, sort_order = ?, updated_at = ? WHERE id = ?`)
      .run(name, uniqueSlug(db, 'categories', body.slug || name, id), body.parentId || null,
        sec.cleanText(body.description, 500), group,
        body.status === 'inactive' ? 'inactive' : 'active',
        Number.isFinite(Number(body.order)) ? Number(body.order) : row.sort_order, ts, id);
    auth.logActivity({ systemKey: 'cms', user: s.user, action: 'category.update', targetType: 'Chuyên mục', targetId: id, targetName: name, detail: 'Cập nhật chuyên mục', req });
    return http.ok(res, m.category(db.prepare('SELECT * FROM categories WHERE id = ?').get(id)));
  }

  const group = normalizeCategoryGroupCode(sec.cleanText(body.group, 80));
  const categoryGroup = group && db.prepare(`SELECT status FROM system_categories
    WHERE category_type = 'category_group' AND code = ?`).get(group);
  if (!categoryGroup || categoryGroup.status !== 'active') {
    return http.badRequest(res, 'Hãy tạo và chọn nhóm chuyên mục đang sử dụng trước.');
  }

  const newId = sec.makeId('cat');
  db.prepare(`INSERT INTO categories (id, name, slug, parent_id, description, group_key, status, sort_order,
      data_source, is_seed_data, environment, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?)`)
    .run(newId, name, uniqueSlug(db, 'categories', body.slug || name), body.parentId || null,
      sec.cleanText(body.description, 500), group,
      body.status === 'inactive' ? 'inactive' : 'active',
      Number.isFinite(Number(body.order)) ? Number(body.order) : 99,
      'operational', process.env.APP_ENV || 'development', ts, ts, s.user.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'category.create', targetType: 'Chuyên mục', targetId: newId, targetName: name, detail: 'Tạo chuyên mục mới', req });
  return http.created(res, m.category(db.prepare('SELECT * FROM categories WHERE id = ?').get(newId)));
}

async function deleteCategory(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'category.manage' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Chuyên mục không tồn tại.');
  const used = db.prepare('SELECT COUNT(*) AS c FROM articles WHERE category_id = ?').get(row.id).c;
  if (used > 0) return http.conflict(res, `Chuyên mục đang được dùng bởi ${used} bài viết. Hãy chuyển bài viết sang chuyên mục khác trước khi xóa.`);
  const children = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id = ?').get(row.id).c;
  if (children > 0) return http.conflict(res, 'Chuyên mục còn chuyên mục con. Hãy xử lý các chuyên mục con trước khi xóa.');
  db.prepare('DELETE FROM categories WHERE id = ?').run(row.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'category.delete', targetType: 'Chuyên mục', targetId: row.id, targetName: row.name, detail: 'Xóa chuyên mục', req });
  return http.ok(res, { id: row.id, message: 'Đã xóa chuyên mục.' });
}

async function reorderCategory(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'category.manage' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Chuyên mục không tồn tại.');
  const siblings = db.prepare('SELECT * FROM categories WHERE IFNULL(parent_id, \'\') = IFNULL(?, \'\') ORDER BY sort_order, name').all(row.parent_id);
  const idx = siblings.findIndex((x) => x.id === row.id);
  const swap = siblings[idx + (body.direction === 'up' ? -1 : 1)];
  if (!swap) return http.badRequest(res, 'Không thể di chuyển chuyên mục.');
  db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(swap.sort_order, row.id);
  db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(row.sort_order, swap.id);
  return http.ok(res, { message: 'Đã cập nhật thứ tự chuyên mục.' });
}

/* ============================== TÀI NGUYÊN ================================ */

async function listMedia(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'content.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  let items = rows.map(m.media);
  const q = ctx.query;
  if (q.type) items = items.filter((x) => x.type === q.type);
  if (q.search) items = items.filter((x) => norm(x.name).includes(norm(q.search)));
  return http.ok(res, items);
}

async function addMedia(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'media.upload' });
  if (!s) return;
  const db = getDb();

  const contentType = String(req.headers['content-type'] || '');
  let name = '';
  let declaredMime = '';
  let fileBuffer = null;
  let alt = '';
  let folder = '';

  if (contentType.includes('multipart/form-data')) {
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return http.badRequest(res, 'Không xác định được dữ liệu multipart.');
    const boundary = match[1] || match[2];
    /* Giới hạn tổng dung lượng body ngay khi đọc: tránh ghi tệp quá lớn vào bộ nhớ. */
    const raw = await http.readRaw(req, uploadPolicy.MAX_BODY_BYTES);
    const delimiter = Buffer.from(`--${boundary}`);
    let offset = 0;

    while (offset < raw.length) {
      const start = raw.indexOf(delimiter, offset);
      if (start === -1) break;
      let partStart = start + delimiter.length;
      if (raw[partStart] === 13 && raw[partStart + 1] === 10) partStart += 2;
      if (raw.slice(partStart, partStart + 2).toString() === '--') break;
      const next = raw.indexOf(delimiter, partStart);
      if (next === -1) break;
      let partEnd = next;
      if (raw[partEnd - 2] === 13 && raw[partEnd - 1] === 10) partEnd -= 2;
      const part = raw.subarray(partStart, partEnd);
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) { offset = next; continue; }
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const data = Buffer.from(part.subarray(headerEnd + 4));
      const nameMatch = headers.match(/name="([^"]+)"/i);
      const field = nameMatch ? nameMatch[1] : '';
      if (field === 'file') {
        const fileNameMatch = headers.match(/filename="([^"]*)"/i);
        name = sec.cleanText(fileNameMatch ? fileNameMatch[1] : 'tep-tai-len', 250);
        const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
        declaredMime = sec.cleanText(mimeMatch ? mimeMatch[1] : 'application/octet-stream', 100);
        fileBuffer = data;
      } else if (field === 'alt') {
        alt = sec.cleanText(data.toString('utf8'), 250);
      } else if (field === 'folder') {
        folder = sec.cleanText(data.toString('utf8'), 120);
      }
      offset = next;
    }
  } else {
    const body = await http.readJson(req);
    name = sec.cleanText(body.name, 250);
  }

  if (!name) return http.badRequest(res, 'Thiếu tên tệp.');
  if (!fileBuffer) return http.badRequest(res, 'Vui lòng chọn tệp cần tải lên.');

  /* Chính sách tải tệp: chỉ nhận định dạng trong allow-list và giới hạn dung lượng.
   Từ chối HTML/SVG/mã thực thi để tránh stored XSS vì tệp được phục vụ cùng origin. */
  const verdict = uploadPolicy.checkFile(name, fileBuffer.length);
  if (!verdict.ok) return http.badRequest(res, verdict.message, { field: 'file' });

  const uploadDir = path.resolve(__dirname, '..', '..', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const ext = verdict.ext;
  const mime = uploadPolicy.normalizeMime(ext, declaredMime);
  const safeBase = path.basename(name, path.extname(name))
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'tep';
  const storedName = `${sec.makeId('upload')}-${safeBase}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, storedName), fileBuffer);
  const url = `/uploads/${storedName}`;
  const type = verdict.type;

  const id = sec.makeId('med');
  const ts = nowIso();
  db.prepare(`INSERT INTO media (id, name, url, type, ext, mime, size, folder, alt, data_source, is_seed_data, environment, created_at, updated_at, created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`)
    .run(id, name, url, type,
      ext, mime, fileBuffer.length,
      folder || FOLDER_BY_TYPE[type] || 'Tài liệu tải lên', alt,
      'operational', process.env.APP_ENV || 'development', ts, ts, s.user.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'media.upload', targetType: 'Tài nguyên', targetId: id, targetName: name, detail: 'Thêm tài nguyên vào thư viện', req });
  return http.created(res, m.media(db.prepare('SELECT * FROM media WHERE id = ?').get(id)));
}

async function deleteMedia(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'media.delete' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Tài nguyên không tồn tại.');
  const used = db.prepare('SELECT COUNT(*) AS c FROM articles WHERE thumbnail = ?').get(row.url).c;
  if (used > 0) return http.conflict(res, `Tệp đang được sử dụng trong ${used} bài viết, không thể xóa.`);
  db.prepare('DELETE FROM media WHERE id = ?').run(row.id);
  if (String(row.url || '').startsWith('/uploads/')) {
    const fileName = path.basename(String(row.url));
    const filePath = path.resolve(__dirname, '..', '..', 'uploads', fileName);
    if (filePath.startsWith(path.resolve(__dirname, '..', '..', 'uploads') + path.sep)) {
      try { fs.unlinkSync(filePath); } catch (_) { /* file may already be missing */ }
    }
  }
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'media.delete', targetType: 'Tài nguyên', targetId: row.id, targetName: row.name, detail: 'Xóa tài nguyên', req });
  return http.ok(res, { id: row.id, message: 'Đã xóa tài nguyên.' });
}

/* ============================== QUY TRÌNH ================================= */

async function workflow(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms' });
  if (!s) return;
  const db = getDb();
  const pending = db.prepare(`
    SELECT a.*, c.name AS category_name FROM articles a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.status = 'pending' ORDER BY a.submitted_at`).all();
  const approved = db.prepare(`
    SELECT a.*, c.name AS category_name FROM articles a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.status = 'approved' ORDER BY a.reviewed_at DESC`).all();
  const rejected = db.prepare(`
    SELECT a.*, c.name AS category_name FROM articles a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.status IN ('rejected','revision') ORDER BY a.reviewed_at DESC LIMIT 20`).all();
  const published = db.prepare(`
    SELECT a.*, c.name AS category_name FROM articles a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.status = 'published' ORDER BY a.published_at DESC LIMIT 20`).all();
  const proposals = db.prepare(`SELECT p.*, o.name AS org_name, c.name AS category_name FROM proposals p
      LEFT JOIN organizations o ON o.id = p.org_id LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status IN ('submitted','in_review','revision') ORDER BY p.created_at`).all();
  const collaborations = db.prepare(`SELECT cr.*, o.name AS org_name FROM collaboration_requests cr
      LEFT JOIN organizations o ON o.id = cr.to_org_id
      WHERE cr.direction = 'cms-ws' AND cr.status <> 'completed' ORDER BY cr.created_at DESC`).all();

  return http.ok(res, {
    pending: pending.map(m.article),
    approved: approved.map(m.article),
    rejected: rejected.map(m.article),
    published: published.map(m.article),
    proposals: proposals.map(m.proposal),
    collaborations: collaborations.map((r) => ({ id: r.id, code: r.code, title: r.title, status: r.status, orgName: r.org_name, createdAt: r.created_at, taskId: r.task_id })),
  });
}

/* ============================== TIẾP NHẬN ================================= */

async function listSubmissions(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'submission.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT s.*, o.name AS assigned_org_name, topic.name AS topic_name FROM submissions s
      LEFT JOIN organizations o ON o.id = s.assigned_org_id
      LEFT JOIN system_categories topic ON topic.category_type = 'contact_topic' AND topic.code = s.topic_code
      ORDER BY s.created_at DESC`).all();
  let items = rows.map(m.submission);
  const q = ctx.query;
  if (q.status && q.status !== 'all') items = items.filter((x) => x.status === q.status);
  if (q.formType) items = items.filter((x) => x.formType === q.formType);
  if (q.search) items = items.filter((x) => norm(x.subject).includes(norm(q.search)) || norm(x.ticketCode).includes(norm(q.search)) || norm(x.content).includes(norm(q.search)));
  return http.ok(res, items);
}

async function getSubmission(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'submission.view' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare(`SELECT s.*, o.name AS assigned_org_name, topic.name AS topic_name FROM submissions s
      LEFT JOIN organizations o ON o.id = s.assigned_org_id
      LEFT JOIN system_categories topic ON topic.category_type = 'contact_topic' AND topic.code = s.topic_code
      WHERE s.id = ? OR s.ticket_code = ?`).get(ctx.params.id, ctx.params.id);
  if (!row) return http.notFound(res, 'Yêu cầu không tồn tại.');
  const events = db.prepare('SELECT * FROM submission_events WHERE submission_id = ? ORDER BY id').all(row.id);
  return http.ok(res, m.submission(row, {
    events: events.map((e) => ({ action: e.action, from: e.from_status, to: e.to_status, note: e.note, userName: e.user_name, at: e.created_at })),
  }));
}

async function updateSubmission(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: ['submission.assign', 'submission.respond'] });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Yêu cầu không tồn tại.');
  const ts = nowIso();
  const patch = {};
  let action = body.action || 'update';

  if (body.assignedOrgId !== undefined) patch.assigned_org_id = body.assignedOrgId || null;
  if (body.priority !== undefined) patch.priority = ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : row.priority;
  if (body.response !== undefined) patch.response = sec.cleanText(body.response, 5000);
  if (body.publicResponse !== undefined) patch.public_response = sec.cleanText(body.publicResponse, 5000);
  if (body.isPublicResult !== undefined) patch.is_public_result = body.isPublicResult ? 1 : 0;
  if (body.publicResponse !== undefined && body.isPublicResult === undefined) patch.is_public_result = 1;
  if (body.status !== undefined) {
    const allowed = ['new', 'assigned', 'in_progress', 'answered', 'closed', 'rejected'];
    if (!allowed.includes(body.status)) return http.badRequest(res, 'Trạng thái không hợp lệ.');
    patch.status = body.status;
    action = body.status;
  } else if (body.assignedOrgId !== undefined) {
    patch.status = 'assigned';
    action = 'assigned';
  } else if (body.response !== undefined) {
    patch.status = 'answered';
    action = 'answered';
  }

  if (!Object.keys(patch).length) return http.badRequest(res, 'Không có dữ liệu cập nhật.');
  db.prepare(`UPDATE submissions SET ${Object.keys(patch).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...Object.values(patch), ts, row.id);
  db.prepare(`INSERT INTO submission_events (submission_id, action, from_status, to_status, note, user_id, user_name, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(row.id, action, row.status, patch.status || row.status, sec.cleanText(body.note, 1000), s.user.id, s.user.name, ts);

  auth.logActivity({ systemKey: 'cms', user: s.user, action: `submission.${action}`, targetType: 'Tiếp nhận', targetId: row.id, targetName: row.ticket_code, detail: body.note || `Cập nhật trạng thái ${row.status} → ${patch.status || row.status}`, req });

  // Nếu công khai kết quả: tạo thông báo trên PUBLIC
  if (patch.is_public_result) {
    notify(db, { system: 'public', type: 'info', title: 'Kết quả xử lý phản ánh', body: patch.public_response || row.public_response || '', href: 'pages/public/contact.html', toUserId: null });
  }
  const fresh = db.prepare('SELECT * FROM submissions WHERE id = ?').get(row.id);
  return http.ok(res, m.submission(fresh));
}

/** Tạo nhiệm vụ tại Workspace từ yêu cầu tiếp nhận */
async function assignToWorkspace(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'submission.assign' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Yêu cầu không tồn tại.');
  if (row.task_id) return http.conflict(res, 'Yêu cầu này đã được chuyển sang Workspace.');

  const orgId = body.orgId || row.assigned_org_id;
  if (!orgId) return http.badRequest(res, 'Vui lòng chọn đơn vị xử lý.');
  const ts = nowIso();
  const year = new Date().getFullYear();
  const seq = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE code LIKE ?").get(`NV-${year}-%`).c + 1;
  const taskId = sec.makeId('task');
  const code = `NV-${year}-${String(seq).padStart(3, '0')}`;
  const dueDate = body.dueDate || new Date(Date.now() + (Number(body.dueDays) || 7) * 86400000).toISOString().slice(0, 10);

  db.prepare(`INSERT INTO tasks (id, code, title, description, owner_org_id, assigner_id, assignee_ids, partner_org_ids,
      start_date, due_date, priority, status, progress, source_type, source_id, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    taskId, code, `Xử lý phản ánh ${row.ticket_code}: ${row.subject || row.content.slice(0, 80)}`,
    `Nội dung tiếp nhận từ Cổng thông tin:\n${row.content}`, orgId, s.user.id,
    JSON.stringify(body.assigneeIds || []), '[]', ts.slice(0, 10), dueDate,
    row.priority === 'high' ? 'high' : 'normal', 'new', 0, 'submission', row.id,
    'operational', 0, process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  db.prepare('UPDATE submissions SET task_id = ?, status = ?, assigned_org_id = ?, updated_at = ? WHERE id = ?')
    .run(taskId, 'in_progress', orgId, ts, row.id);
  db.prepare(`INSERT INTO submission_events (submission_id, action, from_status, to_status, note, user_id, user_name, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(row.id, 'task_created', row.status, 'in_progress', `Chuyển sang Workspace: ${code}`, s.user.id, s.user.name, ts);
  db.prepare(`INSERT INTO task_history (id, task_id, user_id, user_name, action, detail, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(sec.makeId('th'), taskId, s.user.id, s.user.name, 'Tạo nhiệm vụ từ tiếp nhận', `Nguồn: ${row.ticket_code}`, ts);
  notify(db, { system: 'workspace', type: 'task', title: 'Nhiệm vụ mới từ Cổng thông tin', body: `${code} — ${row.subject || row.ticket_code}`, href: `task-detail.html?id=${taskId}` });

  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'submission.to_workspace', targetType: 'Tiếp nhận', targetId: row.id, targetName: row.ticket_code, detail: `Tạo nhiệm vụ ${code}`, req });
  return http.ok(res, { taskId, code, message: 'Đã chuyển yêu cầu sang Workspace.' });
}

/* ============================== ĐỀ XUẤT =================================== */

async function listProposals(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'proposal.view' });
  if (!s) return;
  const db = getDb();
  const rows = db.prepare(`SELECT p.*, o.name AS org_name, c.name AS category_name FROM proposals p
      LEFT JOIN organizations o ON o.id = p.org_id LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC`).all();
  return http.ok(res, rows.map(m.proposal));
}

async function reviewProposal(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'proposal.review' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const row = db.prepare('SELECT * FROM proposals WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Đề xuất không tồn tại.');
  const ts = nowIso();
  const action = body.action; // approve | reject | revision | publish

  if (action === 'approve' || action === 'revision' || action === 'reject') {
    const to = { approve: 'approved', reject: 'rejected', revision: 'revision' }[action];
    db.prepare('UPDATE proposals SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?')
      .run(to, sec.cleanText(body.note, 1000), s.user.name, ts, ts, row.id);
    notify(db, { system: 'workspace', type: action === 'approve' ? 'proposal_approved' : 'proposal_feedback', title: action === 'approve' ? 'Đề xuất nội dung được chấp thuận' : 'Đề xuất nội dung cần bổ sung', body: `${row.code}: ${body.note || row.title}`, href: 'content-list.html' });
    auth.logActivity({ systemKey: 'cms', user: s.user, action: `proposal.${action}`, targetType: 'Đề xuất', targetId: row.id, targetName: row.code, detail: body.note || '', req });
    return http.ok(res, m.proposal(db.prepare('SELECT * FROM proposals WHERE id = ?').get(row.id)));
  }

  if (action === 'publish') {
    if (row.status !== 'approved' && row.status !== 'published') {
      return http.badRequest(res, 'Chỉ có thể xuất bản đề xuất đã được chấp thuận.');
    }
    if (!['cms_admin', 'cms_manager'].includes(s.user.role)) {
      return http.forbidden(res, 'Bạn không có quyền xuất bản nội dung.');
    }
    const artId = sec.makeId('art');
    const title = sec.cleanText(body.title, 300) || row.title;
    db.prepare(`INSERT INTO articles (id, title, slug, excerpt, body, thumbnail, category_id, status, author_id, author_name,
        source, tags, views, published_at, reviewed_at, reviewed_by, origin, origin_ref, data_source, is_seed_data, environment, created_at, updated_at, created_by)
       VALUES (?,?,?,?,?,?,?,'published',?,?,?,?,0,?,?,?,'workspace',?,?,0,?,?,?,?)`).run(
      artId, title, uniqueSlug(db, 'articles', title), sec.cleanText(body.excerpt || row.summary, 1000),
      sec.sanitizeHtml(body.body || row.body), sec.cleanText(body.thumbnail, 500), row.category_id || null,
      row.author_id, s.user.name, sec.cleanText(body.source, 200) || 'Khu vực làm việc nội bộ',
      JSON.stringify(body.tags || []), ts, ts, s.user.name, row.id,
      'operational', process.env.APP_ENV || 'development', ts, ts, s.user.id,
    );
    db.prepare(`UPDATE proposals SET status = 'published', article_id = ?, published_at = ?, updated_at = ? WHERE id = ?`)
      .run(artId, ts, ts, row.id);
    notify(db, { system: 'workspace', type: 'proposal_published', title: 'Đề xuất nội dung đã được xuất bản', body: `${row.code} — ${title}`, href: 'content-list.html' });
    auth.logActivity({ systemKey: 'cms', user: s.user, action: 'proposal.publish', targetType: 'Đề xuất', targetId: row.id, targetName: row.code, detail: `Xuất bản thành bài viết ${artId}`, req });
    return http.ok(res, { proposal: m.proposal(db.prepare('SELECT * FROM proposals WHERE id = ?').get(row.id)), articleId: artId });
  }

  return http.badRequest(res, 'Hành động không hợp lệ.');
}

/* ============================== PHỐI HỢP ================================== */

async function createCollaboration(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'collaboration.create' });
  if (!s) return;
  const db = getDb();
  const body = await http.readJson(req);
  const title = sec.cleanText(body.title, 300);
  if (!title) return http.badRequest(res, 'Tiêu đề yêu cầu là bắt buộc.');
  const ts = nowIso();
  const year = new Date().getFullYear();
  const seq = db.prepare('SELECT COUNT(*) AS c FROM collaboration_requests').get().c + 1;
  const id = sec.makeId('col');
  const code = `PH-${year}-${String(seq).padStart(3, '0')}`;
  db.prepare(`INSERT INTO collaboration_requests (id, code, title, description, direction, ref_type, ref_id,
      from_user_id, to_org_id, status, due_date, task_id, data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?)`).run(
    id, code, title, sec.cleanText(body.description, 5000), 'cms-ws', body.refType || 'article', body.refId || null,
    s.user.id, body.orgId || null, 'received', body.dueDate || null, body.taskId || null,
    'operational', process.env.APP_ENV || 'development', ts, ts, s.user.id,
  );
  notify(db, { system: 'workspace', type: 'collaboration', title: 'Yêu cầu phối hợp từ CMS', body: `${code}: ${title}`, href: 'tasks.html' });
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'collaboration.create', targetType: 'Phối hợp', targetId: id, targetName: code, detail: title, req });
  return http.created(res, { id, code, title, status: 'received', createdAt: ts });
}

/* ============================== NHẬT KÝ / THỐNG KÊ ======================== */

async function activityLog(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'log.view' });
  if (!s) return;
  const db = getDb();
  const limit = Math.min(500, Number(ctx.query.limit) || 200);
  const rows = db.prepare(`SELECT * FROM activity_logs WHERE system_key IN ('cms','shared') ORDER BY id DESC LIMIT ?`).all(limit);
  return http.ok(res, rows.map((r) => ({
    id: String(r.id), userId: r.user_id, userName: r.user_name, action: r.action,
    targetType: r.target_type, targetName: r.target_name, targetId: r.target_id,
    status: r.result, detail: r.detail, ip: r.ip, at: r.created_at,
  })));
}

async function stats(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms' });
  if (!s) return;
  const db = getDb();
  const counts = db.prepare(`SELECT status, COUNT(*) AS c FROM articles GROUP BY status`).all();
  const map = Object.fromEntries(counts.map((r) => [r.status, r.c]));
  const categories = db.prepare(`SELECT COUNT(*) AS c FROM categories`).get().c;
  const media = db.prepare('SELECT COUNT(*) AS c FROM media').get().c;
  const docs = db.prepare("SELECT COUNT(*) AS c FROM media WHERE type = 'document'").get().c;
  const images = db.prepare("SELECT COUNT(*) AS c FROM media WHERE type = 'image'").get().c;
  const submissions = db.prepare(`SELECT status, COUNT(*) AS c FROM submissions GROUP BY status`).all();
  const proposals = db.prepare(`SELECT status, COUNT(*) AS c FROM proposals GROUP BY status`).all();
  const totalViews = db.prepare('SELECT IFNULL(SUM(views),0) AS v FROM articles').get().v;

  const monthly = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).toISOString();
    const created = db.prepare('SELECT COUNT(*) AS c FROM articles WHERE created_at >= ? AND created_at < ?').get(start, end).c;
    const published = db.prepare('SELECT COUNT(*) AS c FROM articles WHERE published_at >= ? AND published_at < ?').get(start, end).c;
    monthly.push({ label: `T${new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth() + 1}`, created, published, pending: 0 });
  }

  return http.ok(res, {
    articles: {
      total: Object.values(map).reduce((a, b) => a + b, 0),
      draft: map.draft || 0, pending: map.pending || 0, approved: map.approved || 0,
      published: map.published || 0, rejected: map.rejected || 0, revision: map.revision || 0, archived: map.archived || 0,
      views: totalViews,
    },
    categories, media, documents: docs, images, monthly,
    submissions: Object.fromEntries(submissions.map((r) => [r.status, r.c])),
    proposals: Object.fromEntries(proposals.map((r) => [r.status, r.c])),
  });
}

module.exports = {
  listArticles, getArticle, createArticle, updateArticle, articleAction, deleteArticle,
  listCategories, saveCategory, deleteCategory, reorderCategory,
  listMedia, addMedia, deleteMedia,
  workflow, listSubmissions, getSubmission, updateSubmission, assignToWorkspace,
  listProposals, reviewProposal, createCollaboration, activityLog, stats,
};

/* =============================================================================
   DANH MỤC CÔNG KHAI (hiển thị trực tiếp trên Cổng thông tin)
   Toàn bộ nội dung dưới đây do CMS quản lý và PUBLIC đọc qua /api/public/*.
   Bảng dùng chung: legal_documents, public_agencies, public_events,
   statistics_periods + statistics_items, support_facilities.
   ============================================================================= */

/** Bảng được phép thao tác qua nhóm API này (chống chèn bảng tùy ý). */
const CATALOG_TABLES = {
  'legal-documents': 'legal_documents',
  agencies: 'public_agencies',
  events: 'public_events',
  statistics: 'statistics_periods',
  'support-facilities': 'support_facilities',
};

function catalogTable(param, res) {
  const table = CATALOG_TABLES[param];
  if (!table) {
    http.notFound(res, 'Danh mục không hợp lệ.');
    return null;
  }
  return table;
}

const CATALOG_ID_PREFIX = {
  legal_documents: 'law',
  public_agencies: 'pag',
  public_events: 'pev',
  statistics_periods: 'stp',
  support_facilities: 'sf',
};

/** Bảng có cột hay không (dùng để điền created_at/updated_at đúng chỗ). */
function colExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

/** Chuyển dữ liệu JSON từ client sang cột snake_case của bảng. */
function catalogRow(table, body, existing) {
  const pick = (keys, transform) => {
    for (const k of keys) if (body[k] !== undefined) return transform ? transform(body[k]) : body[k];
    return undefined;
  };
  const text = (v) => sec.cleanText(v, 5000);
  const ts = nowIso();

  if (table === 'legal_documents') {
    return {
      code: pick(['code', 'docNumber'], text),
      title: pick(['title'], text),
      slug: pick(['slug'], text),
      doc_number: pick(['docNumber', 'code'], text),
      doc_type: pick(['docType', 'doc_type'], text),
      legal_field: pick(['legalField', 'legal_field'], text),
      issued_at: pick(['issuedAt', 'issued_at'], (v) => v || null),
      effective_at: pick(['effectiveAt', 'effective_at'], (v) => v || null),
      expiry_at: pick(['expiryAt', 'expiry_at'], (v) => v || null),
      effect_status: pick(['effectStatus', 'effect_status'], (v) =>
        ['in_effect', 'expired', 'replaced', 'amended'].includes(v) ? v : undefined),
      issuer: pick(['issuer'], text),
      summary: pick(['summary'], text),
      content: pick(['content'], text),
      file_url: pick(['fileUrl', 'file_url'], text),
      is_public: pick(['isPublic', 'is_public'], (v) => (v === false || v === 'false' || v === 0 || v === '0' ? 0 : 1)),
      status: pick(['status'], (v) => (v === 'inactive' ? 'inactive' : 'active')),
    };
  }
  if (table === 'public_agencies') {
    return {
      name: pick(['name'], text),
      slug: pick(['slug'], text),
      short_name: pick(['shortName', 'short_name'], text),
      role_type: pick(['roleType', 'role_type'], text),
      management_level: pick(['managementLevel', 'management_level'], text),
      address: pick(['address'], text),
      phone: pick(['phone'], text),
      email: pick(['email'], text),
      website: pick(['website'], text),
      description: pick(['description'], text),
      functions_text: pick(['functions', 'functionsText', 'functions_text'], text),
      structure: pick(['structure'], text),
      head_name: pick(['headName', 'head_name'], text),
      logo_url: pick(['logo', 'logoUrl', 'logo_url'], text),
      org_id: pick(['orgId', 'org_id'], (v) => v || null),
      sort_order: pick(['sortOrder', 'sort_order'], (v) => Number(v) || 0),
      status: pick(['status'], (v) => (v === 'inactive' ? 'inactive' : 'active')),
    };
  }
  if (table === 'public_events') {
    return {
      title: pick(['title'], text),
      slug: pick(['slug'], text),
      category: pick(['category'], text),
      event_type: pick(['eventType', 'event_type', 'category'], text),
      start_at: pick(['start', 'startAt', 'start_at'], (v) => v || null),
      end_at: pick(['end', 'endAt', 'end_at'], (v) => v || null),
      location: pick(['location'], text),
      organizer: pick(['organizer'], text),
      co_organizer: pick(['coOrganizer', 'co_organizer'], text),
      summary: pick(['summary'], text),
      content: pick(['content'], text),
      image_url: pick(['image', 'imageUrl', 'image_url'], text),
      status: pick(['status'], text),
      publish_status: pick(['publishStatus', 'publish_status'], (v) =>
        ['draft', 'published', 'hidden'].includes(v) ? v : undefined),
    };
  }
  if (table === 'support_facilities') {
    const listToJson = (v) => {
      if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x).trim()).filter(Boolean).slice(0, 30));
      if (typeof v === 'string') {
        return JSON.stringify(v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30));
      }
      return undefined;
    };
    const coord = (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      code: pick(['code'], text),
      name: pick(['name'], text),
      type: pick(['type'], text),
      org_id: pick(['orgId', 'org_id'], (v) => v || null),
      ward: pick(['ward'], text),
      city: pick(['city'], text),
      address: pick(['address'], text),
      latitude: pick(['latitude', 'lat'], coord),
      longitude: pick(['longitude', 'lng'], coord),
      phone: pick(['phone'], text),
      email: pick(['email'], text),
      website: pick(['website'], text),
      hours: pick(['hours'], text),
      contact_person: pick(['contactPerson', 'contact_person'], text),
      services: pick(['services'], listToJson),
      audience: pick(['audience'], text),
      scope: pick(['scope'], text),
      conditions: pick(['conditions'], text),
      procedures: pick(['procedures'], text),
      cost_note: pick(['costNote', 'cost_note'], text),
      description: pick(['description'], text),
      image_url: pick(['image', 'imageUrl', 'image_url'], text),
      source: pick(['source'], text),
      verified_at: pick(['verifiedAt', 'verified_at'], (v) => v || null),
      status: pick(['status'], (v) => (v === 'inactive' ? 'inactive' : 'active')),
      publish_status: pick(['publishStatus', 'publish_status'], (v) =>
        ['pending', 'published', 'rejected'].includes(v) ? v : undefined),
    };
  }
  return {
    label: pick(['label'], text),
    period_key: pick(['key', 'periodKey', 'period_key'], text),
    scope: pick(['scope'], text),
    note: pick(['note'], text),
    source_type: pick(['sourceType', 'source_type'], (v) => (v === 'verified' ? 'verified' : 'reported')),
    data_source: 'operational',
    is_seed_data: 0,
    environment: process.env.APP_ENV || 'development',
  };
}

async function listCatalog(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'catalog.view' });
  if (!s) return;
  const table = catalogTable(ctx.params.kind, res);
  if (!table) return;
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (table !== 'statistics_periods') return http.ok(res, rows);
  const items = db.prepare('SELECT * FROM statistics_items ORDER BY period_id, sort_order').all();
  return http.ok(res, rows.map((p) => ({
    ...p,
    items: items.filter((i) => i.period_id === p.id),
  })));
}

async function saveCatalog(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'catalog.manage' });
  if (!s) return;
  const table = catalogTable(ctx.params.kind, res);
  if (!table) return;
  const db = getDb();
  const body = await http.readJson(req);
  if (!body || !Object.keys(body).length) return http.badRequest(res, 'Dữ liệu gửi lên rỗng.');

  const id = ctx.params.id || body.id || sec.makeId(CATALOG_ID_PREFIX[table] || 'cat');
  /*
   * Thống kê: nếu chỉ gửi `key` (mã kỳ) mà kỳ đó đã tồn tại thì cập nhật thay vì tạo
   * mới — tránh lỗi ràng buộc duy nhất trên period_key.
   */
  let existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!existing && table === 'statistics_periods' && body.key) {
    existing = db.prepare(`SELECT * FROM ${table} WHERE period_key = ?`).get(sec.cleanText(body.key, 120));
  }
  if (!existing && table === 'legal_documents' && (body.code || body.docNumber)) {
    const code = sec.cleanText(body.code || body.docNumber, 120);
    existing = db.prepare(`SELECT * FROM ${table} WHERE code = ? OR doc_number = ?`).get(code, code);
  }
  /* Cơ quan / sự kiện / cơ sở hỗ trợ: nhận diện theo tên để không tạo bản ghi trùng */
  if (!existing && ['public_agencies', 'public_events', 'support_facilities'].includes(table) && body.name) {
    existing = db.prepare(`SELECT * FROM ${table} WHERE name = ?`).get(sec.cleanText(body.name, 300));
  }
  if (!existing && table === 'public_events' && body.title) {
    existing = db.prepare(`SELECT * FROM ${table} WHERE title = ?`).get(sec.cleanText(body.title, 300));
  }
  const effectiveId = existing ? existing.id : id;
  const row = catalogRow(table, body, existing);

  const categoryFields = {
    legal_documents: [['doc_type', 'doc_type'], ['legal_field', 'legal_field']],
    public_agencies: [['role_type', 'agency_type'], ['management_level', 'management_level']],
    support_facilities: [['type', 'facility_type']],
  }[table] || [];
  for (const [column, categoryType] of categoryFields) {
    const value = row[column];
    if (['legal_documents.doc_type', 'public_agencies.role_type', 'support_facilities.type'].includes(`${table}.${column}`)
      && (value === undefined || value === null || value === '')) {
      return http.badRequest(res, `Trường ${column} là bắt buộc và cần chọn từ danh mục.`);
    }
    if (value === undefined || value === null || value === '') continue;
    const category = db.prepare('SELECT status FROM system_categories WHERE category_type = ? AND code = ?')
      .get(categoryType, value);
    const existingValue = existing && existing[column];
    if (!category || (category.status !== 'active' && existingValue !== value)) {
      return http.badRequest(res, `Giá trị ${column} phải thuộc danh mục đang sử dụng.`);
    }
  }
  if (row.org_id !== undefined && row.org_id !== null) {
    const organization = db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(row.org_id);
    if (!organization) return http.badRequest(res, 'Đơn vị quản lý không tồn tại.');
  }

  /* Thống kê: kỳ báo cáo + các chỉ số con */
  if (table === 'statistics_periods') {
    const ts = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (existing) {
        const entry = {};
        Object.keys(row).forEach((k) => { if (row[k] !== undefined) entry[k] = row[k]; });
        entry.updated_at = ts;
        const cols = Object.keys(entry);
        if (cols.length) {
          db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
            .run(...cols.map((c) => entry[c]), effectiveId);
        }
      } else {
        const entry = { id: effectiveId };
        Object.keys(row).forEach((k) => { if (row[k] !== undefined) entry[k] = row[k]; });
        if (colExists(db, table, 'created_at')) entry.created_at = ts;
        if (colExists(db, table, 'updated_at')) entry.updated_at = ts;
        const keys = Object.keys(entry).filter((k) => entry[k] !== undefined);
        db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
          .run(...keys.map((k) => entry[k]));
      }
      if (Array.isArray(body.items)) {
        db.prepare('DELETE FROM statistics_items WHERE period_id = ?').run(effectiveId);
        body.items.forEach((item, idx) => {
          if (!item || !item.label) return;
          db.prepare(`INSERT INTO statistics_items (id, period_id, metric_key, label, value, unit, sort_order)
                      VALUES (?,?,?,?,?,?,?)`)
            .run(`${effectiveId}-i${idx + 1}`, effectiveId, sec.cleanText(item.key, 80) || `metric-${idx + 1}`,
              sec.cleanText(item.label, 250), Number(item.value) || 0, sec.cleanText(item.unit, 40), idx);
        });
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    auth.logActivity({ systemKey: 'cms', user: s.user, action: existing ? 'catalog.update' : 'catalog.create', targetType: 'Số liệu thống kê', targetId: effectiveId, targetName: row.label || effectiveId, detail: 'Cập nhật kỳ báo cáo', req });
    return http.ok(res, { ...db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(effectiveId),
      items: db.prepare('SELECT * FROM statistics_items WHERE period_id = ? ORDER BY sort_order').all(effectiveId) });
  }

  /*
   * Giá trị null được giữ lại cho các trường có thể xoá có chủ đích (toạ độ,
   * ngày hết hiệu lực, tệp đính kèm) — nếu lọc bỏ null thì không thể xoá dữ liệu.
   */
  const NULLABLE = new Set(['latitude', 'longitude', 'expiry_at', 'org_id', 'verified_at', 'file_url', 'image_url']);
  const cols = Object.keys(row).filter((k) => row[k] !== undefined && (row[k] !== null || NULLABLE.has(k)));
  if (!cols.length) return http.badRequest(res, 'Không có trường hợp lệ để lưu.');

  /* Slug ổn định cho nhóm có hỗ trợ đường dẫn riêng */
  if (colExists(db, table, 'slug') && !row.slug) {
    const base = row.title || row.name || '';
    if (base) { row.slug = uniqueSlug(db, table, base, effectiveId); if (!cols.includes('slug')) cols.push('slug'); }
  }
  if (colExists(db, table, 'slug') && row.slug && row.slug !== existing?.slug) {
    row.slug = uniqueSlug(db, table, row.slug, effectiveId);
  }

  if (existing) {
    if (colExists(db, table, 'updated_at')) {
      row.updated_at = nowIso();
      if (!cols.includes('updated_at')) cols.push('updated_at');
    }
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => row[c]), effectiveId);
  } else {
    const ts = nowIso();
    if (colExists(db, table, 'created_at')) { row.created_at = ts; cols.push('created_at'); }
    if (colExists(db, table, 'updated_at')) { row.updated_at = ts; cols.push('updated_at'); }
    const keys = ['id', ...cols];
    const values = [id, ...cols.map((c) => row[c])];
    db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...values);
  }
  auth.logActivity({
    systemKey: 'cms', user: s.user, action: existing ? 'catalog.update' : 'catalog.create',
    targetType: table, targetId: id, targetName: row.title || row.name || id,
    detail: `Lưu ${table}`, req,
  });
  return http.ok(res, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

async function deleteCatalog(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'catalog.manage' });
  if (!s) return;
  const table = catalogTable(ctx.params.kind, res);
  if (!table) return;
  const db = getDb();
  const id = ctx.params.id;
  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!existing) return http.notFound(res, 'Bản ghi không tồn tại.');

  if (table === 'statistics_periods') {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM statistics_items WHERE period_id = ?').run(id);
      db.prepare('DELETE FROM statistics_periods WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } else {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'catalog.delete', targetType: table, targetId: id, targetName: existing.title || existing.name || id, detail: `Xoá ${table}`, req });
  return http.ok(res, { id });
}

const SYSTEM_CATEGORY_TYPES = new Set(sysCategories.SYSTEM_CATEGORY_TYPES);

const SYSTEM_CATEGORY_REFERENCES = Object.freeze(
  sysCategories.SYSTEM_CATEGORY_TYPES
    .reduce((acc, type) => { acc[type] = sysCategories.referencesOf(type); return acc; }, {}),
);

/** Danh sách loại danh mục + nhãn, để giao diện không phải khai báo lại. */
async function listSystemCategoryTypes(req, res) {
  const s = auth.requireAuth(req, res);
  if (!s) return;
  return http.ok(res, sysCategories.listSystemCategoryTypes());
}

async function listSystemCategories(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms' });
  if (!s) return;
  if (!auth.hasPermission(s.user, 'catalog.view') && !auth.hasPermission(s.user, 'category.manage')) {
    return http.forbidden(res, 'Bạn không có quyền xem danh mục nghiệp vụ.');
  }
  const type = ctx.query.type || '';
  if (type && !SYSTEM_CATEGORY_TYPES.has(type)) return http.badRequest(res, 'Nhóm danh mục không hợp lệ.');
  const db = getDb();
  const rows = type
    ? db.prepare('SELECT * FROM system_categories WHERE category_type = ? ORDER BY sort_order, name').all(type)
    : db.prepare('SELECT * FROM system_categories ORDER BY category_type, sort_order, name').all();
  return http.ok(res, rows);
}

async function saveSystemCategory(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'catalog.manage' });
  if (!s) return;
  const body = await http.readJson(req);
  const db = getDb();
  const id = ctx.params.id || body.id || null;
  const existing = id ? db.prepare('SELECT * FROM system_categories WHERE id = ?').get(id) : null;
  if (id && !existing) return http.notFound(res, 'Danh mục không tồn tại.');

  const type = existing ? existing.category_type : String(body.categoryType || body.category_type || '');
  if (!SYSTEM_CATEGORY_TYPES.has(type)) return http.badRequest(res, 'Nhóm danh mục không hợp lệ.');
  if (existing && (body.categoryType || body.category_type) && (body.categoryType || body.category_type) !== type) {
    return http.badRequest(res, 'Không thể chuyển danh mục sang nhóm khác.');
  }

  const name = sec.cleanText(body.name, 200);
  /*
   * Chỉ đổi mã khi người dùng chủ động gửi `code` khác. Trước đây mã được sinh
   * lại từ TÊN mỗi lần lưu, nên chỉ sửa nhãn (ví dụ "Đã tổ chức" → "Đã hoàn thành")
   * cũng làm đổi mã → mất liên kết với dữ liệu đang dùng mã đó.
   */
  const requestedCode = sec.cleanText(body.code, 100);
  const rawGeneratedCode = requestedCode
    ? slugify(requestedCode)
    : (existing ? existing.code : slugify(name));
  const code = type === 'category_group' ? normalizeCategoryGroupCode(rawGeneratedCode) : rawGeneratedCode;
  if (!name) return http.badRequest(res, 'Tên danh mục là bắt buộc.');
  if (!code) return http.badRequest(res, 'Mã danh mục không hợp lệ.');
  const duplicate = db.prepare(`SELECT id FROM system_categories
    WHERE category_type = ? AND (code = ? OR name = ? COLLATE NOCASE) AND id <> ?`)
    .get(type, code, name, id || '');
  if (duplicate) return http.conflict(res, 'Mã hoặc tên danh mục đã tồn tại trong nhóm này.');

  const refs = SYSTEM_CATEGORY_REFERENCES[type];
  const used = existing && refs.reduce((total, [table, column]) =>
    total + db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(existing.code).count, 0);
  if (used && existing.code !== code) return http.conflict(res, 'Không thể đổi mã danh mục đang được dữ liệu sử dụng.');

  const status = body.status === 'inactive' ? 'inactive' : 'active';
  const sortOrder = Number.isFinite(Number(body.sortOrder ?? body.order))
    ? Math.trunc(Number(body.sortOrder ?? body.order)) : (existing ? existing.sort_order : 0);
  const description = sec.cleanText(body.description, 1000) || null;
  const ts = nowIso();
  if (existing) {
    db.prepare(`UPDATE system_categories SET code = ?, name = ?, description = ?, sort_order = ?,
      status = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(code, name, description, sortOrder, status, ts, s.user.id, id);
    auth.logActivity({ systemKey: 'cms', user: s.user, action: 'system_category.update', targetType: type,
      targetId: id, targetName: name, detail: 'Cập nhật danh mục hệ thống', req });
    return http.ok(res, db.prepare('SELECT * FROM system_categories WHERE id = ?').get(id));
  }

  const newId = sec.makeId('syscat');
  db.prepare(`INSERT INTO system_categories
    (id, category_type, code, name, description, sort_order, status, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId, type, code, name, description, sortOrder, status, ts, ts, s.user.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'system_category.create', targetType: type,
    targetId: newId, targetName: name, detail: 'Tạo danh mục hệ thống', req });
  return http.created(res, db.prepare('SELECT * FROM system_categories WHERE id = ?').get(newId));
}

async function setSystemCategoryStatus(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'catalog.manage' });
  if (!s) return;
  const body = await http.readJson(req);
  if (!['active', 'inactive'].includes(body.status)) return http.badRequest(res, 'Trạng thái danh mục không hợp lệ.');
  const db = getDb();
  const row = db.prepare('SELECT * FROM system_categories WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Danh mục không tồn tại.');
  db.prepare('UPDATE system_categories SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?')
    .run(body.status, nowIso(), s.user.id, row.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'system_category.status', targetType: row.category_type,
    targetId: row.id, targetName: row.name, detail: `Chuyển trạng thái: ${body.status}`, req });
  return http.ok(res, db.prepare('SELECT * FROM system_categories WHERE id = ?').get(row.id));
}

async function deleteSystemCategory(req, res, ctx) {
  const s = auth.requireAuth(req, res, { system: 'cms', permission: 'catalog.manage' });
  if (!s) return;
  const db = getDb();
  const row = db.prepare('SELECT * FROM system_categories WHERE id = ?').get(ctx.params.id);
  if (!row) return http.notFound(res, 'Danh mục không tồn tại.');
  const used = SYSTEM_CATEGORY_REFERENCES[row.category_type].reduce((total, [table, column]) =>
    total + db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(row.code).count, 0);
  if (used) return http.conflict(res, `Danh mục đang được ${used} bản ghi sử dụng. Hãy ngừng sử dụng thay vì xóa.`);
  db.prepare('DELETE FROM system_categories WHERE id = ?').run(row.id);
  auth.logActivity({ systemKey: 'cms', user: s.user, action: 'system_category.delete', targetType: row.category_type,
    targetId: row.id, targetName: row.name, detail: 'Xóa danh mục hệ thống', req });
  return http.ok(res, { id: row.id });
}

module.exports.listCatalog = listCatalog;
module.exports.saveCatalog = saveCatalog;
module.exports.deleteCatalog = deleteCatalog;
module.exports.listSystemCategories = listSystemCategories;
module.exports.listSystemCategoryTypes = listSystemCategoryTypes;
module.exports.saveSystemCategory = saveSystemCategory;
module.exports.setSystemCategoryStatus = setSystemCategoryStatus;
module.exports.deleteSystemCategory = deleteSystemCategory;
