/**
 * API công khai (PUBLIC) – chỉ trả dữ liệu đã được phê duyệt/xuất bản.
 *   GET  /api/public/health
 *   GET  /api/public/articles             (+ /:idOrSlug)
 *   GET  /api/public/categories
 *   GET  /api/public/legal-documents      (+ /:idOrSlug)
 *   GET  /api/public/events
 *   GET  /api/public/agencies
 *   GET  /api/public/statistics
 *   GET  /api/public/support-facilities
 *   GET  /api/public/banners
 *   GET  /api/public/notifications
 *   POST /api/public/submissions          (tiếp nhận phản ánh, câu hỏi, yêu cầu)
 *   GET  /api/public/submissions/lookup?code=...   (tra cứu theo mã)
 */
'use strict';

const crypto = require('node:crypto');
const { getDb } = require('../lib/db');
const http = require('../lib/http');
const sec = require('../lib/security');
const m = require('../lib/mapper');

const nowIso = () => new Date().toISOString();
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

async function health(req, res) {
  return http.ok(res, {
    status: 'ok',
    service: 'HO CHI MINH CITY DRUG PREVENTION AND CONTROL E-PORTAL',
    version: '1.1.0',
    timestamp: nowIso(),
    uptime: Math.floor(process.uptime()),
  });
}

async function listArticles(req, res, ctx) {
  const db = getDb();
  const q = ctx.query;
  const limit = Math.min(50, Number(q.limit) || 12);
  const page = Math.max(1, Number(q.page) || 1);
  const cat = q.categoryId || q.category || null;
  const search = q.search || q.q || '';
  const group = q.group || null;
  const catStatus = q.categoryStatus === 'all' ? 'all' : 'active';

  if (q.id) {
    const row = db.prepare(`SELECT a.*, c.name AS category_name, c.slug AS category_slug FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id WHERE a.id = ? AND a.status = 'published'`).get(q.id);
    if (!row) return http.notFound(res, 'Bài viết không tồn tại hoặc chưa được xuất bản.');
    db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(row.id);
    row.views += 1;
    const related = db.prepare(`SELECT a.*, c.name AS category_name FROM articles a LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published' AND a.category_id = ? AND a.id <> ? ORDER BY a.published_at DESC LIMIT 4`)
      .all(row.category_id, row.id);
    return http.ok(res, m.article(row, { related: related.map((r) => m.article(r)) }));
  }

  const rows = db.prepare(`SELECT a.*, c.name AS category_name, c.slug AS category_slug, c.group_key AS category_group,
        c.status AS category_status
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.status = 'published'
      ORDER BY a.published_at DESC, a.created_at DESC, a.id DESC`).all();
  let items = rows.map((r) => m.article(r));
  if (group) items = items.filter((a) => a.categoryGroup === group);
  /* Chuyên mục đã ngừng hoạt động không còn hiển thị công khai trừ khi yêu cầu rõ */
  if (catStatus === 'active') items = items.filter((a) => !a.categoryId || a.categoryStatus !== 'inactive');
  if (cat) {
    /* Lọc theo id, slug hoặc tên chuyên mục */
    items = items.filter((a) => a.categoryId === cat || a.categorySlug === cat || a.categoryName === cat);
  }
  if (q.featured === 'true') items = items.filter((a) => a.tags.length > 0);
  if (search) {
    const n = norm(search);
    items = items.filter((a) => norm(a.title).includes(n) || norm(a.excerpt).includes(n) || a.tags.some((t) => norm(t).includes(n)));
  }
  const total = items.length;
  const slice = items.slice((page - 1) * limit, (page - 1) * limit + limit)
    .map(({ body, ...rest }) => rest);
  return http.ok(res, slice, { pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}

async function getArticle(req, res, ctx) {
  const db = getDb();
  const row = db.prepare(`SELECT a.*, c.name AS category_name FROM articles a LEFT JOIN categories c ON c.id = a.category_id
      WHERE (a.id = ? OR a.slug = ?) AND a.status = 'published'`).get(ctx.params.id, ctx.params.id);
  if (!row) return http.notFound(res, 'Bài viết không tồn tại hoặc chưa được xuất bản.');
  db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(row.id);
  row.views += 1;
  return http.ok(res, m.article(row));
}

async function listCategories(req, res, ctx) {
  const db = getDb();
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.status = 'published') AS article_count
      FROM categories c WHERE c.status = 'active' ORDER BY c.sort_order, c.name`).all();
  return http.ok(res, rows.map(m.category));
}

/**
 * Văn bản pháp luật: chỉ công khai bản ghi đã được bật công khai và chưa bị ẩn.
 * Các cột mới (lĩnh vực, tình trạng hiệu lực, ngày hết hiệu lực) có thể chưa tồn tại
 * trên database cũ nên luôn đọc qua bản ghi đầy đủ và trả `undefined` thành rỗng.
 */
function legalPublicWhere(r) {
  return r.is_public !== 0 && r.status !== 'inactive';
}

function legal(r) {
  return {
    id: r.id, code: r.code, title: r.title, docNumber: r.doc_number, docType: r.doc_type,
    issuedAt: r.issued_at, effectiveAt: r.effective_at, expiryAt: r.expiry_at || null,
    legalField: r.legal_field || '', issuer: r.issuer, summary: r.summary,
    content: r.content, fileUrl: r.file_url, status: r.status || 'active',
    effectStatus: r.effect_status || 'in_effect', sourceType: r.data_source,
  };
}

async function listLegal(req, res, ctx) {
  const db = getDb();
  const q = ctx.query;
  if (q.id) {
    const row = db.prepare('SELECT * FROM legal_documents WHERE (id = ? OR code = ?) AND is_public = 1').get(q.id, q.id);
    if (!row || !legalPublicWhere(row)) return http.notFound(res, 'Văn bản không tồn tại hoặc chưa được công bố.');
    return http.ok(res, legal(row));
  }
  let rows = db.prepare('SELECT * FROM legal_documents ORDER BY issued_at DESC').all().filter(legalPublicWhere).map(legal);
  if (q.type) rows = rows.filter((l) => l.docType === q.type);
  if (q.field) rows = rows.filter((l) => l.legalField === q.field);
  if (q.issuer) rows = rows.filter((l) => l.issuer === q.issuer);
  if (q.year) rows = rows.filter((l) => String(l.issuedAt || '').slice(0, 4) === String(q.year));
  if (q.effectStatus) rows = rows.filter((l) => l.effectStatus === q.effectStatus);
  if (q.search) {
    rows = rows.filter((l) => norm(l.title).includes(norm(q.search)) || norm(l.docNumber).includes(norm(q.search))
      || norm(l.summary).includes(norm(q.search)));
  }
  return http.ok(res, rows.map(({ content, ...rest }) => rest));
}

/** Sự kiện: trạng thái công khai + trạng thái xuất bản tách biệt với tiến trình thời gian. */
const eventMap = (r) => ({
  id: r.id, title: r.title, slug: r.slug || '', category: r.category, eventType: r.event_type || r.category || '',
  start: r.start_at, end: r.end_at, location: r.location,
  organizer: r.organizer, coOrganizer: r.co_organizer || '', summary: r.summary, content: r.content,
  image: r.image_url, status: r.status, publishStatus: r.publish_status || 'published',
});

function eventIsPublic(r) {
  return (r.publish_status || 'published') === 'published' && r.status !== 'inactive';
}

async function listEvents(req, res, ctx) {
  const db = getDb();
  const id = ctx.query.id;
  if (id) {
    const row = db.prepare('SELECT * FROM public_events WHERE id = ? OR slug = ?').get(id, id);
    if (!row || !eventIsPublic(row)) return http.notFound(res, 'Sự kiện không tồn tại hoặc chưa được công bố.');
    const related = db.prepare('SELECT * FROM public_events WHERE id <> ? ORDER BY start_at DESC LIMIT 8').all(id)
      .filter(eventIsPublic).slice(0, 3);
    return http.ok(res, { ...eventMap(row), related: related.map(eventMap) });
  }
  const q = ctx.query;
  let rows = db.prepare('SELECT * FROM public_events ORDER BY start_at DESC').all().filter(eventIsPublic).map(eventMap);
  if (q.type) rows = rows.filter((e) => e.eventType === q.type);
  if (q.status) rows = rows.filter((e) => e.status === q.status);
  if (q.search) {
    rows = rows.filter((e) => norm(e.title).includes(norm(q.search)) || norm(e.summary).includes(norm(q.search))
      || norm(e.location).includes(norm(q.search)));
  }
  return http.ok(res, rows);
}

const AGENCY_LINKS = `SELECT p.*, o.name AS org_name, o.code AS org_code
  FROM public_agencies p LEFT JOIN organizations o ON o.id = p.org_id`;

async function listAgencies(req, res, ctx) {
  const db = getDb();
  const id = ctx.query.id;
  const mapAgency = (r) => ({
    id: r.id, slug: r.slug || '', name: r.name, shortName: r.short_name, roleType: r.role_type,
    managementLevel: r.management_level || '', parentOrg: r.org_id ? (r.org_name || '') : '',
    logo: r.logo_url || '', address: r.address,
    phone: r.phone, email: r.email, website: r.website, description: r.description,
    functions: r.functions_text || '', headName: r.head_name || '',
    orgId: r.org_id || null, sortOrder: r.sort_order || 0, status: r.status,
  });
  const isPublic = (r) => r.status !== 'inactive';
  if (id) {
    const row = db.prepare(`${AGENCY_LINKS} WHERE p.id = ? OR p.slug = ?`).get(id, id);
    if (!row || !isPublic(row)) return http.notFound(res, 'Cơ quan, đơn vị không tồn tại.');
    const related = db.prepare(`${AGENCY_LINKS} WHERE p.id <> ? ORDER BY p.sort_order`).all(id)
      .filter(isPublic).slice(0, 3);
    return http.ok(res, { ...mapAgency(row), related: related.map(mapAgency) });
  }
  const rows = db.prepare(`${AGENCY_LINKS} WHERE p.status <> 'inactive' ORDER BY p.sort_order, p.name`).all().map(mapAgency);
  /* Danh mục lọc được dựng từ dữ liệu thật: loại hình + cấp quản lý hiện có */
  const taxonomy = db.prepare("SELECT role_type, COUNT(*) AS c FROM public_agencies WHERE status <> 'inactive' GROUP BY role_type").all();
  const levels = db.prepare("SELECT management_level, COUNT(*) AS c FROM public_agencies WHERE status <> 'inactive' GROUP BY management_level").all();
  return http.ok(res, rows, {
    taxonomy: {
      roleTypes: taxonomy.filter((t) => t.role_type).map((t) => ({ value: t.role_type, count: t.c })),
      levels: levels.filter((t) => t.management_level).map((t) => ({ value: t.management_level, count: t.c })),
    },
  });
}

async function listStatistics(req, res, ctx) {
  const db = getDb();
  const periods = db.prepare('SELECT * FROM statistics_periods ORDER BY created_at DESC').all();
  const items = db.prepare('SELECT * FROM statistics_items ORDER BY period_id, sort_order').all();
  const data = periods.map((p) => ({
    id: p.id,
    key: p.period_key,
    label: p.label,
    scope: p.scope,
    note: p.note,
    sourceType: p.source_type,
    verified: p.source_type === 'verified',
    items: items.filter((i) => i.period_id === p.id).map((i) => ({ key: i.metric_key, label: i.label, value: i.value, unit: i.unit })),
  }));
  return http.ok(res, data);
}

/** Trạng thái công khai của cơ sở hỗ trợ: đã công khai + chưa ngừng hoạt động. */
function supportMap(r) {
  const services = (() => {
    if (!r.services) return [];
    try { const a = JSON.parse(r.services); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  })();
  return {
    id: r.id, code: r.code || '', name: r.name, type: r.type, district: r.district || '',
    ward: r.ward || '', city: r.city || 'Thành phố Hồ Chí Minh', address: r.address,
    phone: r.phone, email: r.email || '', website: r.website || '', hours: r.hours,
    contactPerson: r.contact_person || '',
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    services, audience: r.audience || '', scope: r.scope || '', conditions: r.conditions || '',
    procedures: r.procedures || '', costNote: r.cost_note || '', description: r.description,
    /* Tên đơn vị quản lý (từ hồ sơ hoặc từ organizations) — không trả org_id nội bộ */
    managingOrg: r.managing_org || r.org_name || '', image: r.image_url || '',
    source: r.source || '', verifiedAt: r.verified_at || null,
    status: r.status || 'active', publishStatus: r.publish_status || 'published',
  };
}

function supportIsPublic(r) {
  return r.status !== 'inactive' && (r.publish_status || 'published') === 'published';
}

async function listSupport(req, res, ctx) {
  const db = getDb();
  const q = ctx.query || {};
  if (q.id) {
    const row = db.prepare(`SELECT s.*, o.name AS org_name FROM support_facilities s
        LEFT JOIN organizations o ON o.id = s.org_id WHERE s.id = ?`).get(q.id);
    if (!row || !supportIsPublic(row)) return http.notFound(res, 'Cơ sở không tồn tại hoặc chưa được công bố.');
    return http.ok(res, supportMap(row));
  }
  let rows = db.prepare(`SELECT s.*, o.name AS org_name FROM support_facilities s
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status <> 'inactive' ORDER BY s.name`).all()
    .filter(supportIsPublic).map(supportMap);
  if (q.type) rows = rows.filter((f) => f.type === q.type);
  if (q.district) rows = rows.filter((f) => f.district === q.district);
  if (q.service) rows = rows.filter((f) => f.services.some((s) => String(s).includes(q.service)));
  if (q.audience) rows = rows.filter((f) => String(f.audience || '').includes(q.audience));
  if (q.search) {
    rows = rows.filter((f) => norm(f.name).includes(norm(q.search)) || norm(f.address).includes(norm(q.search))
      || norm(f.description).includes(norm(q.search)) || norm(f.district).includes(norm(q.search)));
  }
  return http.ok(res, rows);
}

async function listBanners(req, res, ctx) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM banners WHERE status = 'active' ORDER BY sort_order").all().map((r) => ({
    id: r.id, title: r.title, image: r.image_url, link: r.link_url, position: r.position,
  }));
  return http.ok(res, rows);
}

async function listNotifications(req, res, ctx) {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM notifications WHERE system_key = 'public' ORDER BY created_at DESC LIMIT 20`).all();
  return http.ok(res, rows.map(m.notification));
}

/** Tiếp nhận form từ công dân: kiểm tra, chống trùng, sinh mã, ghi log */
async function createSubmission(req, res, ctx) {
  const ip = sec.clientIp(req);
  const limit = sec.rateLimit(`submit:${ip}`, 20, 10 * 60_000);
  if (!limit.allowed) {
    return http.tooMany(res, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.', limit.resetAt - Date.now());
  }

  const body = await http.readJson(req, 512 * 1024);
  const content = sec.cleanText(body.content || body.message, 8000);
  const subject = sec.cleanText(body.subject, 300) || 'Liên hệ chung';
  const formType = ['contact', 'report', 'support', 'feedback'].includes(body.formType) ? body.formType : 'contact';
  const isAnonymous = !!body.isAnonymous;
  const fullName = sec.cleanText(body.name || body.fullName, 200);
  const email = sec.cleanText(body.email, 200);
  const phone = sec.cleanText(body.phone, 40);

  if (content.length < 10) return http.badRequest(res, 'Nội dung gửi lên quá ngắn (tối thiểu 10 ký tự).');
  if (!isAnonymous && !fullName) return http.badRequest(res, 'Vui lòng nhập họ tên hoặc chọn chế độ ẩn danh.', { field: 'name' });
  if (email && !sec.isEmail(email)) return http.badRequest(res, 'Địa chỉ email không hợp lệ.', { field: 'email' });
  if (phone && !sec.isPhone(phone)) return http.badRequest(res, 'Số điện thoại không hợp lệ.', { field: 'phone' });
  if (!email && !phone && !isAnonymous) {
    return http.badRequest(res, 'Vui lòng cung cấp email hoặc số điện thoại để liên hệ phản hồi.', { field: 'email' });
  }

  if (body.consent === false) return http.badRequest(res, 'Bạn cần đồng ý với chính sách xử lý dữ liệu cá nhân.');

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const dedupe = crypto.createHash('sha256').update(`${content.slice(0, 500)}|${email}|${today}`).digest('hex');
  const dup = db.prepare('SELECT ticket_code FROM submissions WHERE dedupe_hash = ? AND created_at >= ?').get(dedupe, today);
  if (dup) {
    return http.conflict(res, `Yêu cầu này đã được tiếp nhận trước đó. Mã tiếp nhận: ${dup.ticket_code}.`, { ticketCode: dup.ticket_code });
  }

  const year = new Date().getFullYear();
  const seq = db.prepare("SELECT COUNT(*) AS c FROM submissions WHERE ticket_code LIKE ?").get(`PCMT-${year}-%`).c + 1;
  const ticket = `PCMT-${year}-${String(seq).padStart(4, '0')}`;
  const id = sec.makeId('sub');
  const ts = nowIso();

  db.prepare(`INSERT INTO submissions (id, ticket_code, form_type, status, priority, subject, full_name, email, phone,
      is_anonymous, content, ip, user_agent, dedupe_hash,
      data_source, is_seed_data, environment, created_at, updated_at, created_by)
     VALUES (?,?,?,'new',?,?,?,?,?,?,?,?,?,?,'operational',0,?,?,?,?)`).run(
    id, ticket, formType, formType === 'report' ? 'high' : 'normal', subject, isAnonymous ? null : fullName,
    email || null, phone || null, isAnonymous ? 1 : 0, content, ip,
    String(req.headers['user-agent'] || '').slice(0, 250), dedupe,
    process.env.APP_ENV || 'development', ts, ts,
  );
  db.prepare(`INSERT INTO submission_events (submission_id, action, to_status, note, user_id, user_name, created_at)
      VALUES (?,?,?,'Tiếp nhận yêu cầu trực tuyến',NULL,'Công dân',?)`).run(id, 'created', 'new', ts);
  db.prepare(`INSERT INTO notifications (id, system_key, type, title, body, href, to_user_id, audience, is_read, created_at)
      VALUES (?,?,?,?,?,?,NULL,'all',0,?)`)
    .run(sec.makeId('notif'), 'cms', 'submission', 'Yêu cầu tiếp nhận mới', `${ticket} — ${subject}`, 'submissions.html', ts);

  return http.created(res, {
    ticketCode: ticket,
    status: 'new',
    message: 'Yêu cầu của bạn đã được tiếp nhận. Vui lòng lưu mã tiếp nhận để tra cứu kết quả.',
    receivedAt: ts,
  });
}

/** Tra cứu trạng thái hồ sơ bằng mã tiếp nhận + số điện thoại/email (nếu có) */
async function lookupSubmission(req, res, ctx) {
  const ip = sec.clientIp(req);
  const limit = sec.rateLimit(`lookup:${ip}`, 30, 10 * 60_000);
  if (!limit.allowed) return http.tooMany(res, 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau.');

  const code = sec.cleanText(ctx.query.code, 40).toUpperCase();
  if (!code) return http.badRequest(res, 'Vui lòng nhập mã tiếp nhận.');
  const db = getDb();
  const row = db.prepare(`SELECT * FROM submissions WHERE upper(ticket_code) = ?`).get(code);
  if (!row) return http.notFound(res, 'Không tìm thấy hồ sơ với mã tiếp nhận này.');

  const contact = sec.cleanText(ctx.query.contact, 200);
  const hasContact = !!(row.email || row.phone);
  if (hasContact && !row.is_anonymous) {
    if (!contact) return http.badRequest(res, 'Vui lòng nhập email hoặc số điện thoại đã dùng khi gửi yêu cầu.');
    const okEmail = row.email && contact.toLowerCase() === row.email.toLowerCase();
    const okPhone = row.phone && contact.replace(/\D/g, '') === String(row.phone).replace(/\D/g, '');
    if (!okEmail && !okPhone) return http.forbidden(res, 'Thông tin liên hệ không khớp với hồ sơ.');
  }

  const events = db.prepare('SELECT * FROM submission_events WHERE submission_id = ? ORDER BY id').all(row.id);
  return http.ok(res, {
    ticketCode: row.ticket_code,
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publicResponse: row.is_public_result ? row.public_response : '',
    timeline: events.map((e) => ({ action: e.action, note: e.note, at: e.created_at })),
  });
}

module.exports = {
  health, listArticles, getArticle, listCategories, listLegal, listEvents, listAgencies,
  listStatistics, listSupport, listBanners, listNotifications, createSubmission, lookupSubmission,
};
