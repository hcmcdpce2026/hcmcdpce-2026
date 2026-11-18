/**
 * Export only publicly visible content for a static PUBLIC deployment.
 *
 * Usage: node server/scripts/export-static-public.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');
const mapper = require('../lib/mapper');

const ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const outputDir = path.join(ROOT, 'public-data');
const mediaDir = path.join(outputDir, 'media');
const db = getDb();

function mapArticle(row) {
  const article = mapper.article(row);
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    summary: article.summary,
    body: article.body,
    content: article.content,
    thumbnail: article.thumbnail,
    categoryId: article.categoryId,
    categoryName: article.categoryName,
    categorySlug: article.categorySlug,
    categoryGroup: article.categoryGroup,
    status: article.status,
    tags: article.tags,
    authorName: article.authorName,
    source: article.source,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    views: article.views,
    publishedAt: article.publishedAt,
  };
}

function mapLegal(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    docNumber: row.doc_number,
    docType: row.doc_type,
    issuedAt: row.issued_at,
    effectiveAt: row.effective_at,
    issuer: row.issuer,
    summary: row.summary,
    content: row.content,
    fileUrl: row.file_url,
    sourceType: row.data_source,
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    start: row.start_at,
    end: row.end_at,
    location: row.location,
    organizer: row.organizer,
    summary: row.summary,
    content: row.content,
    image: row.image_url,
    status: row.status,
  };
}

function mapAgency(row) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    roleType: row.role_type,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    description: row.description,
  };
}

function collectPublicData() {
  const articles = db.prepare(`SELECT a.*, c.name AS category_name, c.slug AS category_slug,
      c.group_key AS category_group
    FROM articles a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.status = 'published'
    ORDER BY a.published_at DESC, a.created_at DESC, a.id DESC`).all().map(mapArticle);

  const categories = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.status = 'published') AS article_count
    FROM categories c
    WHERE c.status = 'active'
    ORDER BY c.sort_order, c.name`).all().map((row) => mapper.category(row));

  const legalDocuments = db.prepare('SELECT * FROM legal_documents ORDER BY issued_at DESC')
    .all().map(mapLegal);
  const events = db.prepare(`SELECT * FROM public_events
    WHERE status IN ('upcoming', 'ongoing', 'past')
    ORDER BY start_at DESC`).all().map(mapEvent);
  const agencies = db.prepare(`SELECT * FROM public_agencies
    WHERE status = 'active'
    ORDER BY sort_order`).all().map(mapAgency);

  const periods = db.prepare('SELECT * FROM statistics_periods ORDER BY created_at DESC').all();
  const metricRows = db.prepare('SELECT * FROM statistics_items ORDER BY period_id, sort_order').all();
  const statistics = periods.map((period) => ({
    id: period.id,
    key: period.period_key,
    label: period.label,
    scope: period.scope,
    note: period.note,
    sourceType: period.source_type,
    verified: period.source_type === 'verified',
    items: metricRows.filter((item) => item.period_id === period.id).map((item) => ({
      key: item.metric_key,
      label: item.label,
      value: item.value,
      unit: item.unit,
    })),
  }));

  const supportFacilities = db.prepare(`SELECT * FROM support_facilities
    WHERE status = 'active'
    ORDER BY name`).all().map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    district: row.district,
    address: row.address,
    phone: row.phone,
    hours: row.hours,
    description: row.description,
  }));

  const banners = db.prepare(`SELECT * FROM banners
    WHERE status = 'active'
    ORDER BY sort_order`).all().map((row) => ({
    id: row.id,
    title: row.title,
    image: row.image_url,
    link: row.link_url,
    position: row.position,
  }));

  const notifications = db.prepare(`SELECT * FROM notifications
    WHERE system_key = 'public'
    ORDER BY created_at DESC
    LIMIT 20`).all().map((row) => mapper.notification(row));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    articles,
    categories,
    legalDocuments,
    events,
    agencies,
    statistics,
    supportFacilities,
    banners,
    notifications,
  };
}

function copyAndRewriteUploads(value, copied) {
  if (Array.isArray(value)) return value.map((item) => copyAndRewriteUploads(item, copied));
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach((key) => { result[key] = copyAndRewriteUploads(value[key], copied); });
    return result;
  }
  if (typeof value !== 'string') return value;

  return value.replace(/(^|["'(=\s])\/uploads\/([^"'`\s?#)<>]+)/g, (match, prefix, rawName) => {
    const name = path.basename(decodeURIComponent(rawName));
    if (!name || name !== rawName || name === '.' || name === '..') {
      throw new Error(`Đường dẫn tệp tải lên không hợp lệ: ${match}`);
    }
    const source = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Không tìm thấy tệp được nội dung công khai tham chiếu: ${source}`);
    }
    if (!copied.has(name)) {
      fs.copyFileSync(source, path.join(mediaDir, name));
      copied.add(name);
    }
    return `${prefix}public-data/media/${name}`;
  });
}

function main() {
  fs.mkdirSync(mediaDir, { recursive: true });
  const copied = new Set();
  const data = copyAndRewriteUploads(collectPublicData(), copied);
  fs.writeFileSync(path.join(outputDir, 'public.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  console.log(`Đã xuất dữ liệu PUBLIC tĩnh: ${path.relative(ROOT, path.join(outputDir, 'public.json'))}`);
  console.log(`  Bài viết đã xuất bản: ${data.articles.length}`);
  console.log(`  Văn bản pháp luật: ${data.legalDocuments.length}`);
  console.log(`  Cơ quan: ${data.agencies.length}`);
  console.log(`  Sự kiện: ${data.events.length}`);
  console.log(`  Tệp công khai đã sao chép: ${copied.size}`);
  console.log('Chỉ nội dung công khai được xuất; không xuất tài khoản, nhật ký hay dữ liệu tiếp nhận.');
}

try {
  main();
} catch (error) {
  console.error(`Không thể xuất dữ liệu PUBLIC tĩnh: ${error.message}`);
  process.exitCode = 1;
}
