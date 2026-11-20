'use strict';

const CATEGORY_GROUP_LABELS = Object.freeze({
  'tin-tuc': 'Tin tức',
  'tuyen-truyen-giao-duc': 'Tuyên truyền - Giáo dục',
  'phap-luat': 'Pháp luật',
  'su-kien': 'Sự kiện',
  'co-quan-don-vi': 'Cơ quan - Đơn vị',
  'thong-ke': 'Thống kê',
  'ho-tro': 'Hỗ trợ',
  'lien-he': 'Liên hệ',
});

const CATEGORY_GROUP_ALIASES = Object.freeze({
  news: 'tin-tuc',
  education: 'tuyen-truyen-giao-duc',
  law: 'phap-luat',
  event: 'su-kien',
  agency: 'co-quan-don-vi',
  statistics: 'thong-ke',
  support: 'ho-tro',
});

function normalizeCategoryGroupCode(value) {
  const code = String(value == null ? '' : value).trim();
  const alias = Object.keys(CATEGORY_GROUP_ALIASES)
    .find((legacyCode) => legacyCode.toLowerCase() === code.toLowerCase());
  return alias ? CATEGORY_GROUP_ALIASES[alias] : code;
}

module.exports = {
  CATEGORY_GROUP_ALIASES,
  CATEGORY_GROUP_LABELS,
  normalizeCategoryGroupCode,
};
