/**
 * Danh mục hệ thống (system_categories) – một nguồn duy nhất cho:
 *   - danh sách `categoryType` hợp lệ;
 *   - nhãn hiển thị của từng loại;
 *   - bảng/cột tham chiếu để chặn đổi mã khi đang được dữ liệu sử dụng.
 *
 * CMS (quản trị danh mục), SHARED (dropdown của Workspace) và PUBLIC (bộ lọc
 * của Cổng thông tin) đều đọc từ đây hoặc qua API, không tự khai báo lại.
 */
'use strict';

/** Thứ tự khai báo = thứ tự hiển thị mặc định trên giao diện quản trị. */
const SYSTEM_CATEGORY_TYPES = Object.freeze({
  category_group: { label: 'Nhóm chuyên mục', references: [['categories', 'group_key']] },
  doc_type: { label: 'Loại văn bản', references: [['legal_documents', 'doc_type']] },
  legal_field: { label: 'Lĩnh vực pháp luật', references: [['legal_documents', 'legal_field']] },
  agency_type: { label: 'Loại hình cơ quan', references: [['public_agencies', 'role_type']] },
  management_level: {
    label: 'Cấp quản lý',
    references: [['public_agencies', 'management_level'], ['organizations', 'management_level']],
  },
  facility_type: { label: 'Loại hình cơ sở', references: [['support_facilities', 'type']] },
  organization_type: { label: 'Loại hình tổ chức', references: [['organizations', 'type']] },
  contact_topic: { label: 'Nhóm nội dung liên hệ', references: [['submissions', 'topic_code']] },
  /*
   * Trạng thái hoạt động / sự kiện. Mã phải khớp CHECK constraint của
   * public_events.status. `role` cho biết cách PUBLIC diễn giải mã: `open` =
   * được coi là sắp diễn ra khi chưa có ngày bắt đầu, `closed` = đã kết thúc.
   * Không có `role` nghĩa là trạng thái được tính từ ngày bắt đầu/kết thúc.
   */
  event_status: {
    label: 'Trạng thái hoạt động, sự kiện',
    references: [['public_events', 'status']],
    roles: { upcoming: 'open', ongoing: 'open', past: 'closed' },
  },
});

const CODES = Object.freeze(Object.keys(SYSTEM_CATEGORY_TYPES));

/** True nếu `type` là một loại danh mục hệ thống đã đăng ký. */
function isSystemCategoryType(type) {
  return Object.prototype.hasOwnProperty.call(SYSTEM_CATEGORY_TYPES, String(type || ''));
}

/** Danh sách { type, label } để dựng bộ lọc/dropdown, không phải viết lại ở client. */
function listSystemCategoryTypes() {
  return CODES.map((type) => ({ type, label: SYSTEM_CATEGORY_TYPES[type].label }));
}

/**
 * Bộ lọc trạng thái dựng từ danh mục CMS: mỗi mục đang sử dụng là một lựa chọn.
 * `role` giúp PUBLIC biết mã nào là "còn mở" hay "đã kết thúc" theo ý người
 * quản trị; mục không có role thì được tính theo ngày của bản ghi.
 * @returns {Array<{code:string,name:string,role:string}>}
 */
function listEventStatuses(db) {
  const rows = db.prepare(`SELECT code, name FROM system_categories
    WHERE category_type = 'event_status' AND status = 'active'
    ORDER BY sort_order, name`).all();
  return rows.map((row) => ({ code: row.code, name: row.name, role: roleOf('event_status', row.code) }));
}

/** Bảng/cột đang tham chiếu tới mã của loại danh mục (dùng khi đổi mã). */
function referencesOf(type) {
  return SYSTEM_CATEGORY_TYPES[type] ? SYSTEM_CATEGORY_TYPES[type].references : [];
}

/**
 * Cách PUBLIC diễn giải một mã trạng thái: `open` | `closed` | '' (tính theo ngày).
 * Dùng cho bộ lọc trạng thái ở trang Sự kiện.
 */
function roleOf(type, code) {
  const entry = SYSTEM_CATEGORY_TYPES[type];
  if (!entry || !entry.roles) return '';
  return entry.roles[String(code || '')] || '';
}

module.exports = {
  SYSTEM_CATEGORY_TYPES: CODES,
  SYSTEM_CATEGORY_TYPE_LABELS: Object.freeze(
    CODES.reduce((acc, type) => { acc[type] = SYSTEM_CATEGORY_TYPES[type].label; return acc; }, {}),
  ),
  isSystemCategoryType,
  listSystemCategoryTypes,
  listEventStatuses,
  referencesOf,
  roleOf,
};
