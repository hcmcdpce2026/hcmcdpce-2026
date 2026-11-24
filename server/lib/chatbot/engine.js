/**
 * Bộ máy trợ lý ảo của Chuyên trang (chatbot hỏi đáp).
 *
 * Cách làm: truy hồi – chấm điểm (retrieval + scoring) trên hai nguồn:
 *   1) Tri thức biên soạn sẵn trong knowledge.js;
 *   2) Dữ liệu công khai do CMS quản lý đọc trực tiếp từ SQLite (bài viết đã
 *      xuất bản, văn bản pháp luật, cơ sở hỗ trợ, sự kiện, cơ quan, thống kê).
 *
 * Nguyên tắc:
 *   - Chỉ trả lời từ dữ liệu đã có; khi không đủ căn cứ thì nói rõ và chuyển
 *     hướng tới kênh liên hệ – không bịa nội dung.
 *   - Không lưu lại nội dung hội thoại của người dùng (không ghi DB/log).
 *   - Mọi đầu ra là JSON thuần; giao diện tự escape trước khi hiển thị.
 *   - Hoạt động cả khi máy chủ không truy cập được DB: chỉ dùng tri thức tĩnh.
 */
'use strict';

const { KB, SUGGESTED_QUESTIONS, CONTACT } = require('./knowledge');

/*
 * Từ khóa quá phổ biến trong kho dữ liệu của Chuyên trang (“ma túy”, “thành phố”…):
 * chỉ trùng những từ này chưa đủ căn cứ để trả lời. Bộ lọc này là lớp bổ sung
 * cho IDF và vẫn tách dấu để so khớp với `normalize()`. Nó chỉ lọc TÀI LIỆU DỮ
 * LIỆU; mục tri thức biên soạn được so khớp theo từ khóa chủ đề riêng.
 */
const WEAK_TOKENS = new Set((
  'phong chong thanh pho ho chi minh nam 2026 hcm viet cong tac hoat dong noi dung '
  + 'dan tin bai viet hinh anh chuong trinh muc cong dong dia ban cap quoc gia '
).split(/\s+/).filter((w) => w.length > 2));

/* Câu hỏi duyệt/liệt kê — trả về danh sách nguồn thay vì nội dung một bài */
const BROWSE_RE = /(nhung|danh sach|cac)\s+(bai|tin|van ban|su kien|co so)|toan van|toan bo van ban|liet ke|moi nhat|moi cap nhat|tin tuc moi/;

const MAX_MESSAGE = 500;
const MAX_HISTORY = 6;

/* ----------------------------- Chuẩn hóa tiếng Việt ------------------------- */

/** Bỏ dấu, chữ thường, gộp khoảng trắng – dùng so khớp không phân biệt dấu */
function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * Từ dừng: KHÔNG đưa vào danh sách này các danh từ thường gặp trong câu hỏi
 * (tình trạng, cách, thuốc, biện pháp…), vì chúng giúp phân biệt chủ đề.
 */
const STOPWORDS = new Set((
  'la gi va cua cho toi minh ban em anh chi khong duoc the nao nhu o dau khi thi ma '
  + 'nay do da dang can muon hoi xin vui long giup voi a ah nhe nhi hay cac mot nhung '
  + 'trong ra de bi phai lam sao bao nhieu ai giup toi can '
  + 'toi muon hieu xin hay cho toi biet co the hay khong nao gi rang cung vi thi '
  + 'roi nhe nha'
).split(/\s+/).filter(Boolean));

/**
 * Từ ghép “chạy qua đường ghép từ khóa”: những cụm thường bị bộ tách từ và
 * từ ghép không tự nhận ra (“tra cứu văn bản”, “tin tức”, “đăng ký”…). Được
 * thêm vào token của câu hỏi khi câu hỏi chứa đúng cụm đó.
 * Từ vựng đã nằm trong cụm ghép sẽ bị bỏ khỏi token đơn (vd. “văn bản” trong
 * “văn bản pháp luật”), tránh trùng lặp điểm cho cùng một cụm.
 */
const PHRASES = [
  'ma tuy', 'van ban phap luat', 'luat phong chong ma tuy', 'co so ho tro', 'thuoc thay the', 'tai hoa nhap',
  'van ban', 'phap luat', 'tra cuu', 'tin tuc', 'tin moi', 'bai viet', 'su kien', 'co so',
  'cai nghien', 'tu nguyen', 'methadone', 'tu choi', 'bi ru re', 'to giac', 'bao tin',
  'qua lieu', 'cap cuu', 'dau hieu', 'nhan biet', 'tac hai', 'sau cai', 'xu phat',
  'hinh su', 'trung tam', 'dia chi', 'thong ke', 'so lieu', 'hotline', 'lien he',
];

/** Từ chỉ xuất hiện trong cụm ghép — bỏ khỏi token đơn để không tính điểm hai lần */
const PHRASE_WORDS = new Set((
  'phap luat luat tra cuu tin tuc moi bai viet su kien co so cai nghien tu nguyen thuoc thay the '
  + 'ru re to giac bao tin qua lieu cap cuu dau hieu nhan biet tac hai sau cai tai hoa nhap xu phat '
  + 'hinh su trung tam dia chi thong ke so lieu hotline lien he ma tuy '
).split(/\s+/).filter(Boolean));

/* Động từ/đại từ phổ biến không mang nội dung khi so khớp */
const INTENT_WORDS = new Set((
  'tra cuu tim xem cho biet liet ke danh sach nhung cac moi nhat lay tu van ho tro'
).split(/\s+/).filter(Boolean));

/* Cụm chỉ loại dữ liệu (không phải nội dung): dùng cho ý định tra cứu */
const SEARCH_PHRASES = new Set(['van ban', 'van ban phap luat', 'thong ke', 'tin tuc', 'bai viet', 'su kien']);

function tokenize(text) {
  /* Đánh dấu ranh giới cụm bằng ký tự “&” (bị main normalize xoá sau khi ghép) */
  const raw = normalize(text).split(' ').filter(Boolean);
  const joined = raw.join(' ');
  const phrases = PHRASES.filter((p) => joined.includes(p));
  const words = raw
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !INTENT_WORDS.has(w) && !PHRASE_WORDS.has(w));
  return words.concat(phrases.map((p) => `&${p}`));
}

/** Tập bigram giúp nhận diện cụm từ ghép (“cai nghien”, “tu choi”…) */
function bigrams(tokens) {
  const out = [];
  const list = tokens
    .map((t) => t.replace(/^&/, ''))
    .filter((t) => !t.includes(' '));
  for (let i = 0; i < list.length - 1; i += 1) out.push(`${list[i]} ${list[i + 1]}`);
  return out;
}

/**
 * Tỉ lệ từ của tiêu đề xuất hiện trong câu hỏi (0..1). Tiêu đề chỉ 1 tiếng
 * (vd. “Ma túy là gì?”) không dùng tiêu chí này để tránh khớp ngẫu nhiên; tiêu
 * đề 2 tiếng chỉ được coi là khớp khi câu hỏi rất ngắn.
 */
function titleCoverage(titleTokens, queryTokens) {
  if (!titleTokens.length) return 0;
  const hit = titleTokens.filter((tok) => queryTokens.includes(tok)).length;
  return hit / titleTokens.length;
}

/**
 * Đếm số tiếng có nghĩa trong câu (dùng cho luật “câu hỏi ngắn”).
 */
function meaningCount(text) {
  return normalize(text).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w) && !INTENT_WORDS.has(w)).length;
}

/**
 * Nhận diện một câu liệt kê/định nghĩa (“… gồm những gì”, “các bước”, “loại nào”).
 * Câu trả lời nên trình bày theo từng mục thay vì một khối văn bản dài.
 */
const LIST_WORDS = new Set((
  'gom bao buoc quy trinh thu tuc loai phan loai nhung danh liet ke may cach hinh thuc'
).split(/\s+/).filter(Boolean));

function isListQuestion(normalized) {
  const words = normalized.split(' ');
  if (words.some((w) => LIST_WORDS.has(w))) return true;
  return /(gom|bao gom|cac buoc|quy trinh|thu tuc|loai|phan loai|danh sach|liet ke|cac cach|hinh thuc)/.test(normalized);
}

/**
 * Bốn hình thức cai nghiện và hỗ trợ điều trị theo Luật Phòng, chống ma túy và
 * hướng dẫn của Chuyên trang (dùng khi người dùng hỏi “các hình thức cai nghiện”).
 */
const FORMS_ANSWER = 'Có 4 hình thức cai nghiện và hỗ trợ điều trị:\n'
  + '• Cai nghiện tự nguyện tại gia đình, cộng đồng – tại nơi cư trú, có sự phối hợp của gia đình, Công an cấp xã, '
  + 'Trạm y tế và tổ công tác xã hội.\n'
  + '• Cai nghiện tự nguyện tại cơ sở công lập – điều trị tập trung theo phác đồ y khoa, kết hợp giáo dục phục hồi, '
  + 'lao động trị liệu và đào tạo nghề.\n'
  + '• Điều trị nghiện chất dạng thuốc phiện bằng thuốc thay thế (Methadone) – do ngành Y tế triển khai, giúp kiểm soát '
  + 'cơn thèm nhớ và giảm nguy cơ lây nhiễm qua đường máu.\n'
  + '• Quản lý sau cai nghiện và tái hòa nhập cộng đồng – theo dõi, tư vấn tâm lý, hỗ trợ cư trú, học nghề và việc làm.\n'
  + 'Chi tiết từng hình thức có trên trang Hỗ trợ cai nghiện; gọi 0982.120.908 để được tư vấn cụ thể.';

/**
 * Tách nhãn đầu mục trong câu trả lời biên soạn để hiển thị dạng danh sách:
 * tách ở “(1)”, “1.”, “•”, “–” và dấu chấm phẩy cuối mệnh đề.
 */
function bulletize(answer) {
  const numbered = String(answer).match(/\(\d+\)/g);
  if (!numbered || numbered.length < 2) return null;
  const parts = String(answer).split(/(?=\(\d+\))/).map((s) => s.trim()).filter(Boolean);
  return parts.map((part) => part.replace(/^\(\d+\)\s*/, '- ').replace(/;\s*$/, '.'));
}

/** Rút gọn văn bản HTML thành văn bản thuần, cắt theo số ký tự */
function stripHtml(html, max = 600) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}…`;
}

/* ------------------------------ Nhận diện ý định ---------------------------- */

const EMERGENCY_WORDS = [
  'qua lieu', 'overdose', 'ngat', 'kho tho', 'tim ngung', 'co giat', 'hoi ta', 'cap cuu', 'nguy kich',
  'bat tinh', 'khong thoi', 'cap cuu', 'say thuoc', 'tac dung phu nang',
];

const INTENTS = [
  {
    name: 'greeting',
    patterns: [
      /^(xin )?chao( ban| em| ad| shop| tro ly| nhi)?$/, /^hello$/, /^hi$/, /^alo$/, /^hey$/,
      /^ban la ai$/, /^ban ten la gi$/, /^ban (co the|lam duoc) (gi|nhung gi)$/, /^chuc nang/,
    ],
  },
  { name: 'thanks', patterns: [/^cam on/, /^thank/, /^ok( ban| nhe)?$/, /^da hieu$/, /^tot$/] },
  { name: 'farewell', patterns: [/^tam biet/, /^bye/, /^chao nhe$/, /^hen gap lai/] },
  { name: 'help', patterns: [/^(giup|huong dan)/, /^ban co the (giup|ho tro)/] },
  { name: 'hotline', patterns: [/hotline/, /duong day nong/, /tong dai/, /so dien thoai/, /^lien he/, /^email/] },
  { name: 'emergency', patterns: EMERGENCY_WORDS.map((w) => new RegExp(`(^| )${w}( |$)`)) },
];

function detectIntent(normalized) {
  for (const intent of INTENTS) {
    if (intent.patterns.some((re) => re.test(normalized))) return intent.name;
  }
  return null;
}

/* --------------------------- Nạp dữ liệu công khai -------------------------- */

/**
 * Nhóm chuyên mục “Tuyên truyền - Giáo dục” (category_group do CMS khai báo:
 * `tuyen-truyen-giao-duc` hoặc mã rút gọn `education`).
 */
function isEducationCategory(groupKey, name) {
  const key = String(groupKey || '');
  if (key === 'tuyen-truyen-giao-duc' || key === 'education') return true;
  return /tuyên truyền|tuyen truyen|giáo dục|giao duc/i.test(String(name || ''));
}

/**
 * Chỉ mục truy hồi cho một tài liệu dữ liệu công khai.
 * type: article | legal | support | event | agency | statistics
 */
function buildIndex(db) {
  const docs = [];
  const push = (doc) => {
    const corpus = normalize(`${doc.title} ${doc.summary || ''} ${(doc.keywords || []).join(' ')}`);
    const tokens = tokenize(corpus);
    const titleTokens = tokenize(doc.title || '');
    /* domain: chủ đề nội dung mà giao diện/CMS đang dùng (tin-tuc, hieu-biet-ma-tuy…) */
    docs.push({
      domain: doc.domain || doc.type,
      ...doc,
      corpus,
      tokens,
      titleTokens,
      titleGrams: new Set(bigrams(titleTokens)),
      grams: new Set(bigrams(tokens)),
    });
  };

  if (!db) return docs;

  try {
    db.prepare(`SELECT a.id, a.title, a.slug, a.excerpt, a.body, a.tags, a.published_at,
          c.group_key AS group_key, c.name AS category_name
        FROM articles a LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published'
        ORDER BY a.published_at DESC LIMIT 300`).all().forEach((row) => {
      const keywords = (() => {
        try { const v = JSON.parse(row.tags || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch (_) { return []; }
      })();
      const isEducation = isEducationCategory(row.group_key, row.category_name);
      push({
        type: 'article',
        domain: isEducation ? 'hieu-biet-ma-tuy' : 'tin-tuc',
        id: row.id,
        title: row.title,
        summary: stripHtml(row.body || row.excerpt, 700) || stripHtml(row.excerpt, 700),
        excerpt: stripHtml(row.excerpt || row.body, 220),
        keywords,
        date: row.published_at,
        url: `/pages/public/${isEducation ? 'education-detail' : 'news-detail'}.html?id=${encodeURIComponent(row.id)}`,
        label: isEducation ? 'Tuyên truyền - Giáo dục' : 'Tin tức',
      });
    });
  } catch (err) {
    warn('articles', err);
  }

  try {
    db.prepare(`SELECT id, code, title, doc_number, summary, legal_field, issuer, issued_at
        FROM legal_documents WHERE is_public <> 0 AND status <> 'inactive'
        ORDER BY issued_at DESC LIMIT 200`).all().forEach((row) => {
      push({
        type: 'legal',
        domain: 'phap-luat-bai-xu-ly',
        id: row.id,
        title: row.title,
        summary: stripHtml(row.summary, 600),
        excerpt: [row.doc_number || row.code, row.issuer, row.issued_at ? `ban hành ${String(row.issued_at).slice(0, 10)}` : '']
          .filter(Boolean).join(' • '),
        keywords: [row.doc_number || row.code, row.legal_field, 'van ban', 'phap luat', 'luat', 'nghi dinh', 'quy dinh',
          row.issuer].filter(Boolean).map(String),
        date: row.issued_at,
        url: `/pages/public/law-detail.html?id=${encodeURIComponent(row.id)}`,
        label: 'Văn bản pháp luật',
      });
    });
  } catch (err) {
    warn('legal', err);
  }

  try {
    db.prepare(`SELECT id, name, type, ward, address, phone, hours, services, audience, description, cost_note
        FROM support_facilities WHERE status <> 'inactive'
          AND (publish_status IS NULL OR publish_status = 'published') LIMIT 200`).all().forEach((row) => {
      let services = [];
      try {
        const parsed = JSON.parse(row.services || '[]');
        if (Array.isArray(parsed)) services = parsed.filter((s) => typeof s === 'string');
      } catch (_) { /* bỏ qua dịch vụ sai định dạng */ }
      push({
        type: 'support',
        domain: 'cai-nghien-ho-tro',
        id: row.id,
        title: row.name,
        summary: stripHtml(row.description, 500),
        excerpt: [row.address || row.ward, row.phone ? `ĐT: ${row.phone}` : '', row.hours ? `Giờ: ${row.hours}` : '']
          .filter(Boolean).join(' • '),
        keywords: [row.type, row.ward, row.audience, row.cost_note, 'co so', 'trung tam', 'dia chi', ...services]
          .filter(Boolean).map(String),
        url: '/pages/public/support.html',
        label: 'Cơ sở hỗ trợ',
      });
    });
  } catch (err) {
    warn('support', err);
  }

  try {
    db.prepare(`SELECT id, title, summary, location, organizer, start_at, status
        FROM public_events WHERE (publish_status IS NULL OR publish_status = 'published')
          AND status <> 'inactive' ORDER BY start_at DESC LIMIT 100`).all().forEach((row) => {
      push({
        type: 'event',
        domain: 'tin-tuc',
        id: row.id,
        title: row.title,
        summary: stripHtml(row.summary, 500),
        excerpt: [row.start_at ? String(row.start_at).slice(0, 10) : '', row.location, row.organizer]
          .filter(Boolean).join(' • '),
        keywords: [row.location, row.organizer, row.status, 'su kien', 'hoi thao'].filter(Boolean).map(String),
        date: row.start_at,
        url: `/pages/public/event-detail.html?id=${encodeURIComponent(row.id)}`,
        label: 'Sự kiện',
      });
    });
  } catch (err) {
    warn('events', err);
  }

  try {
    db.prepare(`SELECT id, name, short_name, role_type, address, phone, email, description, functions_text
        FROM public_agencies WHERE status <> 'inactive' LIMIT 100`).all().forEach((row) => {
      push({
        type: 'agency',
        id: row.id,
        title: row.name,
        summary: stripHtml(row.description || row.functions_text, 400),
        excerpt: [row.address, row.phone ? `ĐT: ${row.phone}` : '', row.email].filter(Boolean).join(' • '),
        keywords: [row.short_name, row.role_type].filter(Boolean).map(String),
        url: `/pages/public/agency-detail.html?id=${encodeURIComponent(row.id)}`,
        label: 'Cơ quan - Đơn vị',
      });
    });
  } catch (err) {
    warn('agencies', err);
  }

  try {
    const items = db.prepare(`SELECT p.id, p.label, p.note, p.period_key, i.label AS item_label, i.value, i.unit
        FROM statistics_periods p LEFT JOIN statistics_items i ON i.period_id = p.id
        ORDER BY p.created_at DESC, i.sort_order LIMIT 200`).all();
    const byPeriod = new Map();
    items.forEach((row) => {
      if (!byPeriod.has(row.id)) byPeriod.set(row.id, { label: row.label, note: row.note, key: row.period_key, items: [] });
      if (row.item_label) byPeriod.get(row.id).items.push(`${row.item_label}: ${row.value} ${row.unit || ''}`.trim());
    });
    byPeriod.forEach((period, id) => {
      push({
        type: 'statistics',
        domain: 'thong-ke',
        id,
        title: period.label,
        summary: period.items.slice(0, 12).join('; '),
        excerpt: 'Số liệu thống kê công khai trên Chuyên trang',
        keywords: ['thong ke', 'so lieu', 'bao cao', period.key].filter(Boolean).map(String),
        url: '/pages/public/statistics.html',
        label: 'Thống kê',
      });
    });
  } catch (err) {
    warn('statistics', err);
  }

  /* Bộ đệm chỉ mục: dữ liệu CMS đổi → xóa đệm để lần hỏi sau nạp lại */
  return docs;
}

function warn(scope, err) {
  if (process.env.NODE_ENV === 'test') return;
  console.warn(`[chatbot] Không nạp được dữ liệu ${scope}: ${err && err.message ? err.message : err}`);
}

let cache = { at: 0, docs: [] };
const CACHE_TTL_MS = 60 * 1000;

function getIndex(db) {
  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS) return cache.docs;
  cache = { at: now, docs: buildIndex(db) };
  return cache.docs;
}

/** Xóa đệm chỉ mục (dùng cho CMS/kiểm thử) */
function invalidateIndex() {
  cache = { at: 0, docs: [] };
}

/* --------------------------------- Chấm điểm -------------------------------- */

/**
 * Điểm phù hợp giữa câu hỏi và một tài liệu.
 *
 * Trọng số:
 *   - từ khóa trùng: IDF (từ hiếm quan trọng hơn từ chung như “ma túy”)
 *   - cụm 2 tiếng trùng trong thân tài liệu: +3; trong tiêu đề: +5
 *   - tri thức biên soạn (KB): cụm trùng được +2 (câu trả lời đã soạn sẵn)
 *   - ≥ 50% số từ của tiêu đề khớp câu hỏi: +3
 *   - khớp ≥ 50% số từ khóa của câu hỏi: x1,3;  tài liệu KB: +1,5
 *
 * Trả về null khi thiếu căn cứ: chỉ trùng từ chung (ma túy, thành phố, phòng
 * chống…), hoặc chỉ trùng 1 từ khóa đặc thù trong câu hỏi dài mà không có cụm
 * từ nào. Câu hỏi ngắn (≤ 2 tiếng có nghĩa) chỉ cần 1 từ khóa đặc thù.
 */
function scoreDoc(queryTokens, queryGrams, doc, idf = {}) {
  if (!queryTokens.length) return 0;
  const tokenSet = new Set(doc.tokens);
  const titleTokens = doc.titleTokens || [];

  let score = 0;
  let matched = 0;
  let strong = 0;
  queryTokens.forEach((tok) => {
    if (!tokenSet.has(tok)) return;
    score += idf[tok] || 1.5;
    if (!WEAK_TOKENS.has(tok)) strong += 1;
    matched += 1;
  });

  let gramHits = 0;
  queryGrams.forEach((gram) => {
    const inBody = doc.grams.has(gram);
    const inTitle = doc.titleGrams && doc.titleGrams.has(gram);
    if (inBody) { score += 3; gramHits += 1; }
    if (inTitle) score += inBody ? 5 : 3;
    if (!inBody && !inTitle && doc.type === 'kb') score += 2;
  });

  /* Cụm từ khóa trong bảng từ khóa: khớp đúng cụm (đánh dấu “&”) là đủ đặc thù */
  let phraseHit = 0;
  queryTokens.forEach((tok) => {
    if (tok.startsWith('&') && tokenSet.has(tok)) phraseHit += 1;
  });

  /* Tỉ lệ từ của tiêu đề khớp câu hỏi (độ tập trung chủ đề) */
  const coverageRatio = titleCoverage(titleTokens, queryTokens);
  if (coverageRatio >= 0.5) score += 3;

  /*
   * Thiếu căn cứ khi chỉ trùng từ chung (ma túy, thành phố, phòng chống…), hoặc
   * chỉ trùng 1 từ khóa đặc thù mà không có cụm từ nào. Từ khóa tra cứu dạng
   * cụm (văn bản pháp luật, thống kê, tin tức…) vẫn được tính là đủ căn cứ.
   * Câu hỏi ngắn (≤ 3 tiếng có nghĩa) chỉ cần 1 từ khóa đặc thù.
   */
  if (matched === 0) return null;
  if (strong === 0 && gramHits === 0) return null;
  const meaningfulCount = queryTokens.filter((tok) => !WEAK_TOKENS.has(tok) && !tok.startsWith('&')).length;
  if (strong < 2 && gramHits === 0 && phraseHit === 0 && meaningfulCount > 2) return null;
  /* Từ khóa đặc thù mà ngắn (≤ 4 ký tự, vd. “or don”, “tac”) không đủ căn cứ
     khi chỉ khớp duy nhất một từ và không có cụm/từ dài/tỉ lệ tiêu đề nào đi kèm. */
  const longHits = queryTokens.filter((tok) => !WEAK_TOKENS.has(tok) && tok.length >= 5 && tokenSet.has(tok)).length;
  if (strong === 1 && longHits === 0 && gramHits === 0 && phraseHit === 0 && coverageRatio < 0.5) return null;

  const coverage = matched / queryTokens.length;
  if (coverage >= 0.5) score *= 1.3;
  if (doc.type === 'kb') score += 1.5;
  return score;
}

/** Trọng số IDF cho từng từ khóa trên toàn bộ kho tài liệu */
function computeIdf(docs) {
  const df = new Map();
  docs.forEach((doc) => {
    new Set(doc.tokens).forEach((tok) => df.set(tok, (df.get(tok) || 0) + 1));
  });
  const total = docs.length || 1;
  const idf = {};
  df.forEach((count, tok) => {
    idf[tok] = Math.max(0.5, Math.log2(1 + total / count));
  });
  return idf;
}

/* ------------------------------ Câu trả lời --------------------------------- */

const HELP_TEXT = 'Tôi có thể giúp bạn: giải thích kiến thức cơ bản về ma túy và tác hại; hướng dẫn kỹ năng phòng ngừa, '
  + 'từ chối khi bị rủ rê; quy trình đăng ký cai nghiện tự nguyện, điều trị Methadone; tra cứu cơ sở hỗ trợ, văn bản pháp luật, '
  + 'số liệu thống kê và kênh báo tin. Bạn hãy đặt câu hỏi cụ thể, hoặc chọn một gợi ý bên dưới.';

function greetingText() {
  return 'Xin chào! Tôi là trợ lý ảo của Chuyên trang điện tử về phòng, chống ma túy tại TP. Hồ Chí Minh. '
    + 'Tôi trả lời dựa trên nội dung đã công bố của Chuyên trang và kiến thức phổ thông về phòng, chống ma túy. '
    + 'Bạn cần tìm hiểu nội dung nào?';
}

function emergencyText() {
  return `Trường hợp khẩn cấp (nghi quá liều, co giật, khó thở, bất tỉnh), hãy GỌI NGAY ${CONTACT.hotline} – không chờ đợi. `
    + 'Trong lúc chờ cấp cứu: đặt người bệnh nằm nghiêng an toàn, nới lỏng quần áo, giữ ấm, không cho ăn uống và không tự ý dùng thêm thuốc. '
    + `Nếu cần tư vấn cai nghiện hoặc hỗ trợ tâm lý, gọi ${CONTACT.consultPhone}.`;
}

function hotlineText() {
  return `Các kênh liên hệ của Chuyên trang:\n`
    + `• Cấp cứu/xử lý an ninh trật tự: ${CONTACT.hotline}\n`
    + `• Tư vấn pháp lý và cai nghiện: ${CONTACT.consultPhone}\n`
    + `• Email: ${CONTACT.email}\n`
    + `• Địa chỉ: ${CONTACT.address}\n`
    + 'Bạn cũng có thể gửi phản ánh, câu hỏi qua trang Liên hệ để được tiếp nhận và cấp mã tra cứu.';
}

function fallbackText(topTopics) {
  const hints = topTopics && topTopics.length
    ? ` Có thể bạn quan tâm: ${topTopics.slice(0, 3).map((t) => t.text).join('; ')}.`
    : '';
  return 'Xin lỗi, tôi chưa tìm thấy nội dung phù hợp với câu hỏi này trong dữ liệu công khai của Chuyên trang. '
    + `Bạn có thể diễn đạt lại cụ thể hơn (ví dụ nêu rõ cai nghiện, Methadone, tố giác, văn bản pháp luật…) hoặc gửi câu hỏi qua trang Liên hệ. `
    + `Khi cần hỗ trợ trực tiếp, gọi ${CONTACT.consultPhone} hoặc ${CONTACT.hotline} nếu là tình huống khẩn cấp.${hints}`;
}

function buildSuggestions(topic, excludeText) {
  const excluded = excludeText ? normalize(excludeText) : '';
  /* Bỏ qua câu gợi ý trùng với câu trả lời vừa đưa ra (so khớp tương đối) */
  const isDuplicate = (text) => {
    if (!excluded) return false;
    const normalized = normalize(text);
    return normalized === excluded || normalized.includes(excluded) || excluded.includes(normalized);
  };
  const pool = topic ? SUGGESTED_QUESTIONS.filter((q) => q.topic === topic) : [];
  const others = SUGGESTED_QUESTIONS.filter((q) => !pool.includes(q));
  return [...pool, ...others]
    .filter((q) => !isDuplicate(q.text))
    .slice(0, 3)
    .map((q) => q.text);
}

function toSource(doc, score) {
  return {
    type: doc.type,
    title: doc.title,
    excerpt: doc.excerpt || stripHtml(doc.summary, 220),
    url: doc.url || null,
    label: doc.label,
    score: Math.round(score * 10) / 10,
  };
}

/**
 * Dạng hiển thị của câu trả lời biên soạn:
 *   - Câu bao gồm/liệt kê ("… gồm những gì", "các bước") → tách thành từng gạch đầu dòng
 *   - Các câu khác → giữ nguyên văn bản
 */
function formatKbAnswer(answerText, question) {
  if (!isListQuestion(normalize(question))) return answerText;
  /* Danh sách đánh số (1) (2) (3) → mỗi mục một dòng, giữ câu dẫn/câu kết phía trước/sau.
     Hiểu đúng ranh giới câu: mỗi mục thường được ngăn bằng “.” hoặc “;”, câu kết
     sau mục cuối cùng không được gộp vào gạch đầu dòng. */
  const numbered = String(answerText).match(/\(\d+\)/g);
  if (numbered && numbered.length >= 2) {
    const parts = String(answerText).split(/\(\d+\)/);
    const prefix = parts[0].trim();
    const items = [];
    let tail = '';
    parts.slice(1, numbered.length + 1).forEach((part, idx) => {
      const isLast = idx === numbered.length - 1;
      const text = part.trim();
      if (!isLast) { items.push(text.replace(/;\s*$/, '.')); return; }
      /* Mục cuối: tách câu kết “Chi tiết…”, “Gọi …”, “Bạn có thể …” ra khỏi mục */
      const split = text.search(/\.\s+(Chi tiết|Gọi|Bạn có thể|Lưu ý|Nếu|Trường hợp|Các chuyên đề)/);
      if (split >= 0) {
        items.push(text.slice(0, split + 1).trim());
        tail = text.slice(split + 1).trim();
      } else {
        items.push(text);
      }
    });
    if (!tail) tail = parts.slice(numbered.length + 1).join(' ').trim();
    return [prefix, ...items.map((item) => `• ${item}`) , tail].filter(Boolean).join('\n');
  }
  if (answerText.includes('\n')) {
    return answerText.replace(/ • /g, '\n• ').replace(/^\n/, '');
  }
  return answerText;
}

/**
 * Kiểm tra câu hỏi có nhắm tới một mục tri thức cụ thể không (dựa trên từ khóa
 * của chính mục đó — không dùng chung cho mọi mục) để chọn câu trả lời đúng.
 */
function kbKeyScore(doc, tokens, idf) {
  let score = 0;
  tokens.forEach((tok) => { if (doc.tokens.includes(tok) && !WEAK_TOKENS.has(tok)) score += idf[tok] || 1.5; });
  return score;
}

/**
 * Nhận diện câu hỏi tra cứu có từ khóa đặc thù của dữ liệu Chuyên trang
 * (tài liệu, thống kê, sự kiện, cơ sở hỗ trợ, tin tức) để không trả lời bằng
 * tri thức chung khi người dùng thực sự muốn tìm trong danh mục.
 */
/**
 * Tra cứu có từ khóa đặc thù của dữ liệu Chuyên trang (tài liệu, thống kê, sự
 * kiện, cơ sở hỗ trợ, tin tức) để không trả lời bằng tri thức chung khi người
 * dùng thực sự muốn tìm trong danh mục.
 */
/**
 * Lựa chọn tra cứu theo LOẠI dữ liệu khi người dùng muốn xem danh sách
 * (tin tức / sự kiện / văn bản / thống kê).
 */
const BROWSE_TYPES = [
  ['legal', /(tra cuu|danh sach|toan van|nhung|cac)?\s*(van ban phap luat|van ban|nghi dinh|thong tu|luat so|quy dinh phap luat)/],
  ['statistics', /thong ke|so lieu|bao cao dinh ky/],
  ['events', /su kien|hoi thao|ngay hoi|hoat dong tuyen truyen/],
  ['support', /(co so|trung tam|dia chi)\s*(ho tro|cai nghien|dieu tri|tu van|y te)|co so (nao|o dau|gan)/],
  ['news', /tin tuc|tin moi|tin bai|bai viet|nhung bai/],
];

function detectBrowseType(normalized) {
  const found = BROWSE_TYPES.find(([, re]) => re.test(normalized));
  return found ? found[0] : null;
}

const BROWSE_DOMAIN = {
  news: 'tin-tuc', legal: 'phap-luat-bai-xu-ly', statistics: 'thong-ke', support: 'cai-nghien-ho-tro', events: 'events',
};

/** Danh sách tài liệu thuộc một loại dữ liệu, theo thứ tự ưu tiên hiển thị */
function browsePool(type, docs) {
  const domain = BROWSE_DOMAIN[type];
  return docs.filter((doc) => (type === 'events' ? doc.type === 'event' : doc.domain === domain));
}

function detectDataIntent(normalized) {
  if (/thong ke|so lieu|bao cao dinh ky/.test(normalized)) return 'statistics';
  if (/su kien|hoi thao|ngay hoi/.test(normalized)) return 'events';
  if (/co so (ho tro|dieu tri|tu van|y te)|dia chi co so|co so (nao|o dau)/.test(normalized)) return 'support';
  if (/tin tuc|tin moi|tin bai|bai viet/.test(normalized)) return 'news';
  if (/tra cuu|van ban phap luat|nghi dinh|thong tu|luat so|toan van/.test(normalized)) return 'legal';
  return null;
}

/** Chủ đề gợi ý đi kèm khi không đủ căn cứ trả lời chính xác */
function topicFor(domain) {
  switch (domain) {
    case 'hieu-biet-ma-tuy': return 'kien-thuc';
    case 'ky-nang-phong-ngua': return 'ky-nang';
    case 'cai-nghien-ho-tro': return 'ho-tro';
    case 'phap-luat-bai-xu-ly': return 'phap-luat';
    case 'to-giac-va-bai-xu-ly': return 'xu-ly';
    case 'tin-tuc': return null;
    case 'thong-ke': return null;
    case 'events': return null;
    case 'news': return null;
    default: return null;
  }
}

/** Câu trả lời dạng câu tham khảo (không tự khẳng định nội dung) */
function suggestTitles(docs) {
  return docs.map((d) => d.title).slice(0, 3);
}

function browseText(domain, docs, dataIntent) {
  const titles = suggestTitles(docs);
  const list = titles.map((t) => `• ${t}`).join('\n');
  const intros = {
    legal: 'Các văn bản pháp luật đang công bố trên Chuyên trang:',
    statistics: 'Các kỳ số liệu thống kê công khai trên Chuyên trang:',
    events: 'Các sự kiện, hoạt động đang được công bố trên Chuyên trang:',
    support: 'Các cơ sở hỗ trợ, tư vấn cai nghiện trên Chuyên trang:',
    news: 'Các tin tức mới trên Chuyên trang:',
    'tin-tuc': 'Các tin tức mới trên Chuyên trang:',
  };
  const pages = {
    news: 'trang Tin tức',
    events: 'trang Hoạt động - Sự kiện',
    'tin-tuc': 'trang Tin tức',
    'hieu-biet-ma-tuy': 'trang Tuyên truyền - Giáo dục',
    'ky-nang-phong-ngua': 'trang Tuyên truyền - Giáo dục',
    'cai-nghien-ho-tro': 'trang Hỗ trợ cai nghiện',
    'phap-luat-bai-xu-ly': 'trang Pháp luật',
    'to-giac-va-bai-xu-ly': 'trang Liên hệ',
    'thong-ke': 'trang Thống kê',
    events: 'trang Hoạt động - Sự kiện',
    news: 'trang Tin tức',
  };
  const intro = intros[dataIntent] || 'Trên Chuyên trang có các nội dung liên quan cho câu hỏi này:';
  return `${intro}\n${list}\n`
    + `Bạn có thể mở từng liên kết nguồn bên dưới để xem chi tiết, hoặc xem thêm ở ${pages[domain] || 'các trang chuyên mục'}.`;
}

/**
 * Trả lời từ “kho dữ liệu” khi câu hỏi là yêu cầu duyệt/liệt kê/tra cứu.
 * Chỉ trả về nguồn có liên kết xem chi tiết (bản ghi không có trang riêng thì bỏ).
 */
function browseAnswer(domain, docs, topic, dataIntent) {
  const linked = docs.filter((d) => d.url);
  if (!linked.length) {
    return {
      answer: 'Chưa có nội dung nào được công bố cho yêu cầu này. Vui lòng xem lại chuyên mục tương ứng hoặc gửi câu hỏi qua trang Liên hệ.',
      sources: [],
      suggestions: buildSuggestions(topic),
    };
  }
  return {
    answer: browseText(domain, linked, dataIntent),
    sources: linked.slice(0, 5).map((d) => toSource(d, 1)),
    suggestions: buildSuggestions(topic),
  };
}

/* -------------------------------- Điểm vào ---------------------------------- */

/**
 * Trả lời một câu hỏi.
 * @param {object} params
 * @param {string} params.message  câu hỏi của người dùng (đã được giới hạn độ dài ở route)
 * @param {Array}  [params.history] vài lượt gần nhất [{role:'user'|'bot', text}]
 * @param {object} [params.db]     kết nối SQLite; bỏ qua → chỉ dùng tri thức tĩnh
 */
function answer({ message, history = [], db = null } = {}) {
  const text = String(message || '').slice(0, MAX_MESSAGE).trim();
  const normalized = normalize(text);
  const intent = detectIntent(normalized);

  const base = {
    intent: intent || 'question',
    disclaimer: 'Thông tin do trợ lý ảo cung cấp mang tính tham khảo, không thay thế tư vấn của cơ quan chuyên môn.',
  };

  if (!text) {
    return { ...base, answer: HELP_TEXT, sources: [], suggestions: buildSuggestions(null) };
  }
  if (intent === 'emergency') {
    return {
      ...base,
      intent: 'emergency',
      urgent: true,
      answer: emergencyText(),
      sources: [],
      suggestions: ['Quy trình đăng ký cai nghiện tự nguyện gồm những gì?', 'Các kênh liên hệ của Chuyên trang'],
    };
  }
  /* Câu hỏi về các hình thức cai nghiện: trả lời đúng 4 lựa chọn thay vì trích một bài/khoản luật */
  if (/hinh thuc cai nghien|cac hinh thuc|cac cach cai nghien|nhung cach cai|cai nghien o dau/.test(normalized)) {
    return {
      ...base,
      topic: 'ho-tro',
      answer: FORMS_ANSWER,
      sources: [{ type: 'page', title: 'Trang Hỗ trợ cai nghiện', url: '/pages/public/support.html', label: 'Hỗ trợ cai nghiện', excerpt: '' }],
      suggestions: buildSuggestions('ho-tro'),
    };
  }

  if (intent === 'greeting') {
    return { ...base, answer: greetingText(), sources: [], suggestions: buildSuggestions(null) };
  }
  if (intent === 'thanks') {
    return {
      ...base,
      answer: 'Rất vui được hỗ trợ bạn. Nếu cần thêm thông tin về phòng, chống ma túy, bạn cứ đặt câu hỏi nhé.',
      sources: [],
      suggestions: buildSuggestions(null),
    };
  }
  if (intent === 'farewell') {
    return {
      ...base,
      answer: 'Chào bạn, chúc bạn nhiều sức khỏe. Khi cần tìm hiểu về phòng, chống ma túy hoặc kênh hỗ trợ, '
        + 'bạn quay lại trò chuyện bất cứ lúc nào.',
      sources: [],
      suggestions: buildSuggestions(null),
    };
  }
  if (intent === 'help') {
    return { ...base, answer: HELP_TEXT, sources: [], suggestions: buildSuggestions(null) };
  }
  if (intent === 'hotline') {
    return {
      ...base,
      answer: hotlineText(),
      sources: [{ type: 'page', title: 'Trang Liên hệ và hỗ trợ', url: '/pages/public/contact.html', label: 'Liên hệ', excerpt: '' }],
      suggestions: buildSuggestions('ho-tro'),
    };
  }

  /* Tra cứu theo loại dữ liệu (tin tức / sự kiện / văn bản / thống kê) → danh sách */
  const browseByType = detectBrowseType(normalized);
  if (browseByType) {
    const pool = browsePool(browseByType, getIndex(db));
    return { ...base, ...browseAnswer(browseByType, pool, topicFor(browseByType), browseByType) };
  }

  /* ------------------------------ Truy hồi -------------------------------- */

  const tokens = tokenize(text);
  const ownTokens = [...new Set(tokens)];
  const dataIntent = detectDataIntent(normalized);

  /* Câu hỏi nối tiếp rất ngắn (“còn Bình Thạnh?”, “methadone?”) dùng thêm từ khóa
     của câu hỏi trước để biết đang nói về chủ đề gì. */
  const lastUser = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .find((h) => h && h.role === 'user' && typeof h.text === 'string');
  const contextTokens = lastUser && meaningCount(text) <= 3 ? tokenize(lastUser.text).slice(0, 8) : [];
  const allTokens = [...new Set([...tokens, ...contextTokens])];
  const allGrams = bigrams(allTokens);

  const kbDocs = KB.map((item) => {
    const corpus = normalize(`${item.title} ${item.keywords.join(' ')} ${item.answer}`);
    const docTokens = tokenize(corpus);
    const titleTokens = tokenize(item.title);
    return {
      type: 'kb',
      id: item.id,
      topic: item.topic,
      title: item.title,
      answer: item.answer,
      url: null,
      label: 'Kiến thức của Chuyên trang',
      excerpt: '',
      corpus,
      tokens: docTokens,
      titleTokens,
      titleGrams: new Set(bigrams(titleTokens)),
      grams: new Set(bigrams(docTokens)),
    };
  });

  const dataDocs = getIndex(db);
  const allDocs = [...kbDocs, ...dataDocs];
  const idf = computeIdf(allDocs);

  /*
   * Điểm ưu tiên theo ý định tra cứu dữ liệu. “Số liệu thống kê …” là yêu cầu
   * xem số liệu nên xếp toàn bộ nhóm thống kê lên trước; “văn bản pháp luật”
   * tương tự. Chỉ áp dụng khi câu hỏi có từ chỉ định rõ ràng.
   */
  const INTENT_BOOST = { legal: 4, statistics: 4, events: 3, support: 3, news: 4 };
  const boostFor = (doc) => {
    if (!dataIntent) return 0;
    if (dataIntent === 'news') return doc.type === 'article' && doc.domain === 'tin-tuc' ? INTENT_BOOST.news : 0;
    return doc.type === dataIntent ? INTENT_BOOST[dataIntent] : 0;
  };

  const scored = allDocs
    .map((doc) => {
      const score = scoreDoc(allTokens, allGrams, doc, idf);
      if (score === null) return null;
      return { doc, score: score + boostFor(doc) };
    })
    .filter((item) => item && item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { ...base, answer: fallbackText(SUGGESTED_QUESTIONS), sources: [], suggestions: buildSuggestions(null) };
  }

  /*
   * Mức căn cứ — xét trên câu hỏi HIỆN TẠI (không tính từ khóa của câu trước):
   *   strong : khớp cụm 2 tiếng; hoặc ≥ 3 từ khóa đặc thù; hoặc câu ngắn có 1–2
   *            từ khóa đặc thù và không bị từ chung chi phối
   *   medium : khớp 2 từ khóa đặc thù trong câu dài (chưa đủ để khẳng định)
   *   weak   : chỉ trùng từ chung (ma túy, thành phố, phòng chống…)
   */
  const ownMeanings = meaningCount(text);
  const evidenceOf = (doc) => {
    let strong = 0;
    let weak = 0;
    ownTokens.forEach((tok) => {
      if (!doc.tokens.includes(tok)) return;
      if (tok.startsWith('&')) strong += 1; /* cụm từ khóa: rất đặc thù */
      else if (WEAK_TOKENS.has(tok)) weak += 1;
      else strong += 1;
    });
    const gramHits = bigrams(ownTokens).filter((g) => doc.grams.has(g)).length;
    if (strong >= 3 || (gramHits > 0 && strong > 0)) return 'strong';
    if (strong >= 2) return 'medium';
    if (strong === 1 && ownMeanings <= 3 && weak < ownMeanings) return 'strong';
    return 'weak';
  };
  scored.forEach((item) => { item.evidence = evidenceOf(item.doc); });

  const docMatches = scored.filter((item) => item.doc.type !== 'kb' && item.evidence !== 'weak');
  const topKb = scored.find((item) => item.doc.type === 'kb' && item.evidence !== 'weak');
  const topDoc = docMatches[0] || null;
  const domain = topDoc ? (topDoc.doc.domain || topDoc.doc.type) : null;

  /* 1) Câu hỏi duyệt/liệt kê, tin tức, hoặc tra cứu nhóm dữ liệu (văn bản/số liệu)
        → danh sách nguồn, không khẳng định nội dung một bản ghi duy nhất. */
  /*
   * Ý định duyệt danh mục: dùng đúng nhóm dữ liệu mà câu hỏi muốn xem.
   * “Những bài viết về …” ưu tiên bài viết/tin tức, KHÔNG phải văn bản pháp luật,
   * dù văn bản cũng có tựa chứa “phòng, chống ma túy”.
   */
  const browseNews = BROWSE_RE.test(normalized);
  const listDomain = browseNews
    ? (dataIntent && dataIntent !== 'news' ? dataIntent : 'news')
    : dataIntent === 'legal' ? 'phap-luat-bai-xu-ly'
      : dataIntent === 'statistics' ? 'thong-ke'
        : dataIntent === 'support' ? 'cai-nghien-ho-tro'
          : dataIntent === 'events' ? 'events'
            : dataIntent === 'news' ? 'news'
              : null;
  const listDocs = listDomain === 'news'
    ? docMatches.filter((item) => item.doc.type === 'article')
    : listDomain === 'events'
      ? docMatches.filter((item) => item.doc.type === 'event')
      : listDomain
        ? docMatches.filter((item) => (item.doc.domain || item.doc.type) === listDomain)
        : docMatches;
  if (listDomain && listDocs.length) {
    return { ...base, ...browseAnswer(listDomain, listDocs.map((item) => item.doc), topicFor(listDomain), listDomain) };
  }

  /* 2) Ưu tiên câu trả lời biên soạn khi nó là nguồn phù hợp nhất, hoặc khi câu hỏi
        nhắm chủ đề mà tri thức đã soạn và dữ liệu không khớp rõ hơn hẳn. */
  const kbWins = topKb && (
    (!topDoc && topKb.evidence !== 'weak')
    || (topDoc && topKb.score >= topDoc.score * 0.95 && topKb.evidence !== 'weak')
    || (topDoc && topKb.evidence === 'strong' && topDoc.evidence !== 'strong' && topKb.score >= topDoc.score * 0.8)
    || (topDoc && topKb.evidence === 'strong' && topDoc.evidence === 'strong' && topKb.score >= topDoc.score * 0.75)
  );
  if (kbWins) {
    /* Nguồn tham khảo chỉ khi mức căn cứ vững (không đưa bài trùng từ chung vào) */
    const minScore = Math.max(6, (topDoc ? topDoc.score : topKb.score) * 0.65);
    const related = docMatches
      .filter((item) => item.evidence === 'strong' && item.score >= minScore)
      .filter((item) => item.doc.tokens.some((tok) => ownTokens.includes(tok)))
      .slice(0, 3)
      .map((item) => toSource(item.doc, item.score));
    return {
      ...base,
      topic: topKb.doc.topic,
      answer: formatKbAnswer(topKb.doc.answer, text),
      sources: related,
      suggestions: buildSuggestions(topKb.doc.topic, topKb.doc.title),
    };
  }

  /* 3) Chỉ có căn cứ trung bình (khớp vài từ khóa nhưng không có cụm, không đủ 3 từ):
        giới thiệu nội dung liên quan thay vì trả lời như chắc chắn. */
  if (topDoc && topDoc.evidence === 'medium') {
    const related = docMatches.slice(0, 3).map((item) => item.doc);
    return {
      ...base,
      answer: 'Trên Chuyên trang có nội dung liên quan có thể hữu ích cho câu hỏi của bạn:\n'
        + related.map((d, i) => `${i + 1}. ${d.title}${d.excerpt ? ` — ${d.excerpt}` : ''}`).join('\n')
        + `\nBạn có thể mở liên kết nguồn bên dưới, hoặc gọi ${CONTACT.consultPhone} nếu cần tư vấn trực tiếp.`,
      sources: related.map((d) => toSource(d, topDoc.score)),
      suggestions: buildSuggestions(topicFor(domain)),
    };
  }

  /* 4) Trả lời bằng dữ liệu công khai của Chuyên trang */
  const doc = topDoc ? topDoc.doc : scored[0].doc;
  const body = doc.summary ? stripHtml(doc.summary, 700) : '';

  /* Câu hỏi tra cứu (văn bản / cơ sở / sự kiện / thống kê) có thể khớp NHIỀU bản ghi:
     liệt kê đủ danh sách thay vì chỉ đưa bản ghi đầu tiên. */
  const nearDocs = docMatches.filter((item) => item.score >= Math.max(3, topDoc.score * 0.6));
  if (dataIntent && dataIntent !== 'news' && nearDocs.length > 1) {
    return {
      ...base,
      answer: 'Kết quả phù hợp trên Chuyên trang:\n'
        + nearDocs.slice(0, 5).map((item, i) => `${i + 1}. ${item.doc.title}${item.doc.excerpt ? ` — ${item.doc.excerpt}` : ''}`).join('\n')
        + '\nBạn có thể mở từng liên kết nguồn bên dưới để xem chi tiết.',
      sources: nearDocs.slice(0, 5).map((item) => toSource(item.doc, item.score)),
      suggestions: buildSuggestions(topicFor(domain)),
    };
  }

  const lines = [`${doc.label}: ${doc.title}`];
  if (doc.excerpt) lines.push(doc.excerpt);
  if (body && body !== doc.excerpt) lines.push(body);

  /* Kèm kênh hỗ trợ khi nội dung là hướng dẫn cần trao đổi trực tiếp */
  const needContact = /tu van|ho tro|tiep nhan|cai nghien|methadone|to giac|bao tin|thu tuc|co so/.test(doc.corpus)
    && /tu van|ho tro|cai nghien|to giac|cong an|co so/.test(normalized);
  if (needContact) lines.push(`Cần hỗ trợ trực tiếp, gọi ${CONTACT.consultPhone} hoặc ${CONTACT.hotline}.`);
  if (doc.url) lines.push('Bạn có thể mở liên kết nguồn bên dưới để xem chi tiết.');

  return {
    ...base,
    answer: lines.join('\n'),
    sources: [{ doc, score: topDoc ? topDoc.score : scored[0].score }, ...nearDocs.filter((item) => item.doc !== doc)
      .slice(0, 3)]
      .map((item) => toSource(item.doc, item.score)),
    suggestions: buildSuggestions(topicFor(domain)),
  };
}

/** Gợi ý câu hỏi ban đầu cho khung chat */
function suggestions() {
  return SUGGESTED_QUESTIONS.slice(0, 6).map((q) => q.text);
}

module.exports = {
  answer, suggestions, invalidateIndex, MAX_MESSAGE, MAX_HISTORY, WEAK_TOKENS, detectDataIntent,
  // Xuất để kiểm thử
  _internal: { normalize, tokenize, stripHtml, detectIntent, buildIndex },
};
