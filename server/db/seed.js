/**
 * seed.js - Nạp dữ liệu khởi tạo (Seed Data) cho toàn bộ hệ thống.
 *
 * Mọi bản ghi nghiệp vụ đều được gắn:
 *   data_source   = 'seed'   ('seed' | 'operational' | 'production')
 *   is_seed_data  = 1
 *   environment   = APP_ENV
 *   import_batch  = mã lô khởi tạo
 *
 * Chạy:  node server/db/seed.js [--reset] [--with-demo]
 *   --reset     : xoá toàn bộ dữ liệu trong database rồi nạp lại phần hệ thống
 *                 (tổ chức, vai trò, quyền, tài khoản, cấu hình) – KHÔNG nạp nội dung demo
 *                 (chỉ cho phép ở development/staging).
 *   --with-demo : (tuỳ chọn, chỉ khi --reset) nạp thêm toàn bộ dữ liệu mẫu.
 *
 * Mặc định (không cờ) chỉ bổ sung phần còn thiếu, không tạo nội dung demo,
 * để Cổng thông tin khởi đầu ở trạng thái 0 và chỉ hiển thị dữ liệu nhập từ CMS.
 */
'use strict';

const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');
const { hashPassword } = require('../lib/security');

// Đọc .env để seed CLI áp dụng mật khẩu cấu hình mà không cần export thủ công.
(function loadEnv() {
    const envFile = path.resolve(__dirname, '..', '..', '.env');
    if (!fs.existsSync(envFile)) return;
    fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    });
})();

const BATCH = 'SEED-2026-11';
const ENV = (process.env.APP_ENV || 'development').toLowerCase();

const now = () => new Date().toISOString();

function d(offsetDays, hour = 9, minute = 0) {
    const x = new Date();
    x.setDate(x.getDate() + offsetDays);
    x.setHours(hour, minute, 0, 0);
    return x.toISOString();
}

function isoDate(offsetDays) {
    return d(offsetDays).slice(0, 10);
}



/* =============================================================================
   Thông tin tài khoản khởi tạo.
   Mật khẩu chỉ được sinh ngẫu nhiên nếu không truyền biến môi trường,
   và luôn được in ra MỘT LẦN ở cuối quá trình seed (không ghi vào mã nguồn).
   Trong Production: bắt buộc truyền SEED_PASSWORD_* hoặc dùng CLI tạo tài khoản.
   ============================================================================= */
function randomPassword(prefix) {
    const core = crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
    return `${prefix}${core}@${new Date().getFullYear()}`;
}

const ACCOUNTS = [
    { id: 'u-cms-01', username: 'cms.nguyenvandat', name: 'Nguyễn Văn Đạt', role: 'cms_admin', system: 'cms', org: 'org-01', position: 'Quản trị viên CMS', email: 'cms.nguyenvandat@example.gov.vn', envVar: 'SEED_PASSWORD_CMS_ADMIN', pwdPrefix: 'Cms' },
    { id: 'u-cms-02', username: 'cms.nguyenphuonguyen', name: 'Nguyễn Phương Uyên', role: 'cms_manager', system: 'cms', org: 'org-01', position: 'Trưởng ban biên tập', email: 'nguyenphuonguyen@example.gov.vn', envVar: 'SEED_PASSWORD_CMS_NGUYENPHUONGUYEN', pwdPrefix: 'Cms' },
    { id: 'u-cms-03', username: 'cms.nguyenhoangmytam', name: 'Nguyễn Hoàng Mỹ Tâm', role: 'cms_editor', system: 'cms', org: 'org-01', position: 'Biên tập viên', email: 'nguyenhoangmytam@example.gov.vn', envVar: 'SEED_PASSWORD_CMS_NGUYENHOANGMYTAM', pwdPrefix: 'Cms' },
    { id: 'u-cms-04', username: 'cms.phamminhnguyen', name: 'Phạm Minh Nguyên', role: 'cms_editor', system: 'cms', org: 'org-02', position: 'Biên tập viên', email: 'phamminhnguyen@example.gov.vn', envVar: 'SEED_PASSWORD_CMS_PHAMMINHNGUYEN', pwdPrefix: 'Cms' },
    { id: 'u-cms-05', username: 'cms.lohuyenthuong', name: 'Lò Huyền Thương', role: 'cms_reviewer', system: 'cms', org: 'org-01', position: 'Kiểm duyệt viên', email: 'lohuyenthuong@example.gov.vn', envVar: 'SEED_PASSWORD_CMS_LOHUYENTHUONG', pwdPrefix: 'Cms' },
    { id: 'u-ws-01', username: 'ws.nguyenvandat', name: 'Nguyễn Văn Đạt', role: 'ws_admin', system: 'workspace', org: 'org-01', position: 'Quản trị viên Workspace', email: 'ws.nguyenvandat@example.gov.vn', envVar: 'SEED_PASSWORD_WS_ADMIN', pwdPrefix: 'Ws' },
    { id: 'u-ws-02', username: 'ws.nguyenphuonguyen', name: 'Nguyễn Phương Uyên', role: 'ws_manager', system: 'workspace', org: 'org-01', position: 'Lãnh đạo / Quản lý', email: 'ws.nguyenphuonguyen@example.gov.vn', envVar: 'SEED_PASSWORD_WS_NGUYENPHUONGUYEN', pwdPrefix: 'Ws' },
    { id: 'u-ws-03', username: 'ws.nguyenhoangmytam', name: 'Nguyễn Hoàng Mỹ Tâm', role: 'ws_manager', system: 'workspace', org: 'org-01', position: 'Lãnh đạo / Quản lý', email: 'ws.nguyenhoangmytam@example.gov.vn', envVar: 'SEED_PASSWORD_WS_NGUYENHOANGMYTAM', pwdPrefix: 'Ws' },
    { id: 'u-ws-04', username: 'ws.phamminhnguyen', name: 'Phạm Minh Nguyên', role: 'ws_staff', system: 'workspace', org: 'org-02', position: 'Cán bộ nghiệp vụ', email: 'ws.phamminhnguyen@example.gov.vn', envVar: 'SEED_PASSWORD_WS_PHAMMINHNGUYEN', pwdPrefix: 'Ws' },
    { id: 'u-ws-05', username: 'ws.lohuyenthuong', name: 'Lò Huyền Thương', role: 'ws_manager', system: 'workspace', org: 'org-01', position: 'Lãnh đạo / Quản lý', email: 'ws.lohuyenthuong@example.gov.vn', envVar: 'SEED_PASSWORD_WS_LOHUYENTHUONG', pwdPrefix: 'Ws' },
];

/* Cán bộ tham chiếu (không có tài khoản đăng nhập) dùng cho phân công nhiệm vụ, lịch công tác */
const REFERENCE_USERS = [
    { id: 'u-ref-01', code: 'NS-101', name: 'Trần Quốc Hưng', org: 'org-02', position: 'Trưởng phòng Cảnh sát điều tra tội phạm về ma túy' },
    { id: 'u-ref-02', code: 'NS-102', name: 'Nguyễn Hoàng Anh', org: 'org-02', position: 'Đội trưởng Đội 3' },
    { id: 'u-ref-03', code: 'NS-103', name: 'Lê Thị Hồng Vân', org: 'org-03', position: 'Phó Giám đốc Sở Y tế' },
    { id: 'u-ref-04', code: 'NS-104', name: 'Đỗ Minh Trí', org: 'org-03', position: 'Chuyên viên Phòng Nghiệp vụ Y' },
    { id: 'u-ref-05', code: 'NS-105', name: 'Phạm Đức Anh', org: 'org-04', position: 'Trưởng phòng Chính trị tư tưởng' },
    { id: 'u-ref-06', code: 'NS-106', name: 'Võ Thanh Tùng', org: 'org-05', position: 'Bí thư Thành Đoàn' },
    { id: 'u-ref-07', code: 'NS-107', name: 'Nguyễn Hoàng Long', org: 'org-06', position: 'Phó Chủ tịch UBND phường' },
];

/* ============================== TỔ CHỨC ====================================== */
/* Tên đơn vị mang tính cấu trúc nghiệp vụ; không giả mạo văn bản, phát ngôn
   hay thông tin liên hệ chính thức của cơ quan nhà nước. */
const ORGANIZATIONS = [
    { id: 'org-01', code: 'BCĐ-138', name: 'Ban Chỉ đạo phòng, chống tội phạm, tệ nạn xã hội và xây dựng phong trào toàn dân bảo vệ an ninh Tổ quốc Thành phố Hồ Chí Minh', short_name: 'Ban Chỉ đạo 138 Thành phố', type: 'coordination', parent_id: null, phone: '028.0000.0001', email: 'bcd138@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', description: 'Cơ quan chỉ đạo, điều hành công tác phòng, chống ma túy cấp Thành phố.', sort_order: 1 },
    { id: 'org-02', code: 'PC04', name: 'Phòng Cảnh sát điều tra tội phạm về ma túy', short_name: 'PC04', type: 'department', parent_id: 'org-01', phone: '028.0000.0002', email: 'pc04@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', description: 'Đơn vị thường trực công tác đấu tranh phòng, chống tội phạm ma túy.', sort_order: 2 },
    { id: 'org-03', code: 'SO-YT', name: 'Sở Y tế Thành phố Hồ Chí Minh', short_name: 'Sở Y tế', type: 'department', parent_id: 'org-01', phone: '028.0000.0003', email: 'soyte@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', description: 'Chủ trì công tác điều trị, cai nghiện và phục hồi chức năng.', sort_order: 3 },
    { id: 'org-04', code: 'SO-GDDT', name: 'Sở Giáo dục và Đào tạo Thành phố Hồ Chí Minh', short_name: 'Sở GD&ĐT', type: 'department', parent_id: 'org-01', phone: '028.0000.0004', email: 'sgddt@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', description: 'Chủ trì công tác tuyên truyền, giáo dục phòng, chống ma túy trong trường học.', sort_order: 4 },
    { id: 'org-05', code: 'DOAN-TN', name: 'Thành Đoàn Thanh niên Cộng sản Hồ Chí Minh', short_name: 'Thành Đoàn', type: 'association', parent_id: 'org-01', phone: '028.0000.0005', email: 'thanhdoan@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', description: 'Tổ chức hoạt động truyền thông trong thanh thiếu niên.', sort_order: 5 },
    { id: 'org-06', code: 'UB-PHUONG', name: 'Ủy ban nhân dân phường (đơn vị tham chiếu)', short_name: 'UBND phường', type: 'ward', parent_id: 'org-01', phone: '028.0000.0006', email: 'ubnd.phuong@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', description: 'Địa bàn tham chiếu cho công tác quản lý người sau cai nghiện.', sort_order: 6 },
    { id: 'org-07', code: 'CS-CAINGHIEN', name: 'Cơ sở điều trị, cai nghiện (đơn vị tham chiếu)', short_name: 'Cơ sở cai nghiện', type: 'unit', parent_id: 'org-03', phone: '028.0000.0007', email: 'coso.cainghien@example.gov.vn', address: 'Huyện Củ Chi, Thành phố Hồ Chí Minh', description: 'Đơn vị tham chiếu phục vụ quản lý hồ sơ tiếp nhận cai nghiện.', sort_order: 7 },
];

/* ============================== VAI TRÒ & QUYỀN ============================= */
const PERMISSIONS = [
    // Nội dung (CMS)
    ['content.view', 'Xem nội dung', 'content'],
    ['content.create', 'Tạo nội dung', 'content'],
    ['content.edit', 'Chỉnh sửa nội dung', 'content'],
    ['content.delete', 'Xóa nội dung', 'content'],
    ['content.submit', 'Gửi duyệt nội dung', 'content'],
    ['content.review', 'Kiểm duyệt nội dung', 'content'],
    ['content.publish', 'Xuất bản / thu hồi nội dung', 'content'],
    ['content.archive', 'Lưu trữ nội dung', 'content'],
    ['category.manage', 'Quản lý chuyên mục', 'content'],
    ['media.view', 'Xem thư viện tài nguyên', 'media'],
    ['media.upload', 'Tải tệp lên thư viện', 'media'],
    ['media.delete', 'Xóa tài nguyên', 'media'],
    ['banner.manage', 'Quản lý banner', 'media'],
    // Danh mục công khai (văn bản, cơ quan, sự kiện, thống kê, cơ sở hỗ trợ)
    ['catalog.view', 'Xem danh mục công khai', 'catalog'],
    ['catalog.manage', 'Quản lý danh mục công khai', 'catalog'],
    // Tiếp nhận
    ['submission.view', 'Xem yêu cầu tiếp nhận', 'submission'],
    ['submission.assign', 'Phân công xử lý yêu cầu', 'submission'],
    ['submission.respond', 'Phản hồi yêu cầu', 'submission'],
    ['submission.publish', 'Công khai kết quả phản hồi', 'submission'],
    ['submission.delete', 'Xóa yêu cầu tiếp nhận', 'submission'],
    // Workspace – nhiệm vụ
    ['task.view', 'Xem nhiệm vụ', 'task'],
    ['task.create', 'Tạo nhiệm vụ', 'task'],
    ['task.edit', 'Cập nhật nhiệm vụ', 'task'],
    ['task.assign', 'Phân công cán bộ', 'task'],
    ['task.delete', 'Xóa nhiệm vụ', 'task'],
    ['task.approve', 'Xác nhận / đóng nhiệm vụ', 'task'],
    // Workspace – báo cáo, tài liệu, lịch
    ['report.view', 'Xem báo cáo', 'report'],
    ['report.create', 'Tạo báo cáo', 'report'],
    ['report.edit', 'Chỉnh sửa báo cáo', 'report'],
    ['report.send', 'Gửi báo cáo', 'report'],
    ['report.approve', 'Duyệt báo cáo', 'report'],
    ['report.publish', 'Công khai số liệu báo cáo', 'report'],
    ['doc.view', 'Xem tài liệu', 'doc'],
    ['doc.manage', 'Quản lý tài liệu', 'doc'],
    ['calendar.view', 'Xem lịch công tác', 'calendar'],
    ['calendar.manage', 'Quản lý lịch công tác', 'calendar'],
    // Đề xuất nội dung & phối hợp
    ['proposal.view', 'Xem đề xuất nội dung', 'proposal'],
    ['proposal.create', 'Gửi đề xuất nội dung', 'proposal'],
    ['proposal.review', 'Xử lý đề xuất nội dung', 'proposal'],
    ['proposal.publish', 'Xuất bản đề xuất đã duyệt', 'proposal'],
    ['collaboration.view', 'Xem yêu cầu phối hợp', 'collaboration'],
    ['collaboration.create', 'Tạo yêu cầu phối hợp', 'collaboration'],
    ['collaboration.handle', 'Xử lý yêu cầu phối hợp', 'collaboration'],
    // Tổ chức, người dùng, hệ thống
    ['org.view', 'Xem đơn vị', 'org'],
    ['org.manage', 'Quản lý đơn vị', 'org'],
    ['user.view', 'Xem người dùng', 'system'],
    ['user.manage', 'Quản lý người dùng', 'system'],
    ['role.manage', 'Quản lý vai trò & quyền', 'system'],
    ['log.view', 'Xem nhật ký hoạt động', 'system'],
    ['settings.manage', 'Quản lý cấu hình hệ thống', 'system'],
    ['data.import', 'Nhập dữ liệu (CSV/JSON)', 'system'],
    ['data.export', 'Xuất dữ liệu', 'system'],
    ['notification.view', 'Xem thông báo', 'system'],
];

const CMS_PERMS = [
    'content.view', 'content.create', 'content.edit', 'content.delete', 'content.submit', 'content.review',
    'content.publish', 'content.archive', 'category.manage', 'media.view', 'media.upload', 'media.delete',
    'banner.manage', 'submission.view', 'submission.assign', 'submission.respond', 'submission.publish',
    'proposal.view', 'proposal.review', 'proposal.publish', 'collaboration.view', 'collaboration.create',
    'collaboration.handle', 'org.view', 'user.view', 'log.view', 'data.export', 'notification.view',
    'catalog.view', 'catalog.manage',
];

const ROLES = [
    {
        id: 'role-cms-admin', code: 'cms_admin', name: 'Quản trị viên CMS', system_key: 'cms', data_scope: 'all', is_system: 1,
        description: 'Toàn quyền quản trị Cổng thông tin: nội dung, chuyên mục, tài nguyên, tiếp nhận và cấu hình.',
        perms: [...CMS_PERMS, 'submission.delete', 'user.manage', 'role.manage', 'settings.manage', 'data.import'],
    },
    {
        id: 'role-cms-catalog', code: 'cms_catalog', name: 'Quản lý danh mục công khai', system_key: 'cms', data_scope: 'all', is_system: 0,
        description: 'Quản lý văn bản pháp luật, cơ quan - đơn vị, sự kiện, số liệu thống kê và cơ sở hỗ trợ.',
        perms: ['catalog.view', 'catalog.manage', 'media.view', 'notification.view'],
    },
    {
        id: 'role-cms-manager', code: 'cms_manager', name: 'Trưởng ban biên tập', system_key: 'cms', data_scope: 'all', is_system: 1,
        description: 'Duyệt, xuất bản nội dung, điều phối yêu cầu tiếp nhận và đề xuất từ Workspace.',
        perms: CMS_PERMS.filter((p) => p !== 'content.create' || true),
    },
    {
        id: 'role-cms-editor', code: 'cms_editor', name: 'Biên tập viên', system_key: 'cms', data_scope: 'all', is_system: 1,
        description: 'Soạn thảo, chỉnh sửa bài của mình và gửi duyệt; không được duyệt hoặc xuất bản.',
        perms: ['content.view', 'content.create', 'content.edit', 'content.submit', 'media.view', 'media.upload',
            'proposal.view', 'collaboration.view', 'org.view', 'notification.view'],
    },
    {
        id: 'role-cms-reviewer', code: 'cms_reviewer', name: 'Kiểm duyệt viên', system_key: 'cms', data_scope: 'all', is_system: 1,
        description: 'Kiểm duyệt nội dung, yêu cầu chỉnh sửa hoặc từ chối; xem nhật ký.',
        perms: ['content.view', 'content.edit', 'content.review', 'media.view', 'proposal.view', 'proposal.review',
            'submission.view', 'org.view', 'log.view', 'notification.view'],
    },
    {
        id: 'role-ws-admin', code: 'ws_admin', name: 'Quản trị Workspace', system_key: 'workspace', data_scope: 'all', is_system: 1,
        description: 'Toàn quyền cấu hình, phân quyền và xử lý dữ liệu nội bộ.',
        perms: PERMISSIONS.map((p) => p[0]),
    },
    {
        id: 'role-ws-manager', code: 'ws_manager', name: 'Lãnh đạo / Quản lý', system_key: 'workspace', data_scope: 'all', is_system: 1,
        description: 'Theo dõi toàn bộ hoạt động, phân công, duyệt báo cáo và xác nhận nhiệm vụ.',
        perms: ['task.view', 'task.create', 'task.edit', 'task.assign', 'task.approve', 'report.view', 'report.approve',
            'report.publish', 'doc.view', 'doc.manage', 'calendar.view', 'calendar.manage', 'proposal.view',
            'proposal.create', 'proposal.review', 'collaboration.view', 'collaboration.create', 'collaboration.handle',
            'org.view', 'user.view', 'log.view', 'data.export', 'notification.view'],
    },
    {
        id: 'role-ws-staff', code: 'ws_staff', name: 'Chuyên viên', system_key: 'workspace', data_scope: 'unit', is_system: 1,
        description: 'Thực hiện nhiệm vụ được giao, cập nhật tiến độ, gửi báo cáo và đề xuất nội dung.',
        perms: ['task.view', 'task.edit', 'report.view', 'report.create', 'report.edit', 'report.send', 'doc.view',
            'doc.manage', 'calendar.view', 'proposal.view', 'proposal.create', 'collaboration.view',
            'collaboration.handle', 'org.view', 'user.view', 'notification.view'],
    },
];

/* ============================== CHUYÊN MỤC ================================== */
const CATEGORIES = [
    { id: 'cat-01', name: 'Tin chỉ đạo', slug: 'tin-chi-dao', parent: null, group: 'news', order: 1, description: 'Chỉ đạo, điều hành của Thành ủy, UBND Thành phố và Ban Chỉ đạo 138 về công tác phòng, chống ma túy.' },
    { id: 'cat-02', name: 'Tuyên truyền - Giáo dục', slug: 'tuyen-truyen-giao-duc', parent: null, group: 'education', order: 2, description: 'Kiến thức, kỹ năng phòng ngừa và hoạt động truyền thông cộng đồng.' },
    { id: 'cat-03', name: 'Cảnh báo thủ đoạn mới', slug: 'canh-bao-thu-doan-moi', parent: 'cat-02', group: 'education', order: 1, description: 'Nhận diện ma túy núp bóng thực phẩm, đồ uống, thuốc lá điện tử.' },
    { id: 'cat-04', name: 'Học đường', slug: 'hoc-duong', parent: 'cat-02', group: 'education', order: 2, description: 'Hoạt động phòng, chống ma túy trong trường học.' },
    { id: 'cat-05', name: 'Pháp luật', slug: 'phap-luat', parent: null, group: 'law', order: 3, description: 'Văn bản pháp luật, hướng dẫn áp dụng và tuyên truyền pháp luật.' },
    { id: 'cat-06', name: 'Văn bản mới', slug: 'van-ban-moi', parent: 'cat-05', group: 'law', order: 1, description: 'Văn bản quy phạm pháp luật mới ban hành.' },
    { id: 'cat-07', name: 'Hoạt động - Sự kiện', slug: 'hoat-dong-su-kien', parent: null, group: 'event', order: 4, description: 'Hội nghị, chiến dịch, ngày hội truyền thông trên địa bàn Thành phố.' },
    { id: 'cat-08', name: 'Hỗ trợ cai nghiện', slug: 'ho-tro-cai-nghien', parent: null, group: 'support', order: 5, description: 'Cơ sở cai nghiện, tư vấn và chính sách hỗ trợ sau cai.' },
    { id: 'cat-09', name: 'Thống kê - Báo cáo', slug: 'thong-ke-bao-cao', parent: null, group: 'statistics', order: 6, description: 'Số liệu, báo cáo tình hình công tác phòng, chống ma túy.' },
    { id: 'cat-10', name: 'Cơ quan - Đơn vị', slug: 'co-quan-don-vi', parent: null, group: 'agency', order: 7, description: 'Thông tin cơ quan, đơn vị tham gia công tác phòng, chống ma túy.' },
];

/* ============================== BÀI VIẾT ==================================== */
const ARTICLES = [
    {
        id: 'art-0001', title: 'Triển khai Kế hoạch xây dựng Thành phố không ma túy giai đoạn 2026 - 2030',
        slug: 'tphcm-thanh-pho-khong-ma-tuy-2030', cat: 'cat-01', status: 'published', author: 'u-cms-01',
        excerpt: 'Kế hoạch tổng thể huy động toàn hệ thống chính trị, đoàn thể và cộng đồng cùng tham gia phòng, chống ma túy, hướng tới mục tiêu xây dựng Thành phố không ma túy vào năm 2030.',
        tags: ['Không ma túy', 'Ban Chỉ đạo 138', 'Kế hoạch 2026-2030'], source: 'Ban Chỉ đạo 138 Thành phố',
        createdAt: d(-30, 8, 15), submittedAt: d(-29, 16, 10), reviewedAt: d(-29, 17, 0), publishedAt: d(-29, 18, 0),
        views: 4821, thumb: 1,
        body: '<h2>Mục tiêu tổng quát</h2><p>Kế hoạch hướng tới kiểm soát chặt chẽ nguồn cung, giảm nhu cầu sử dụng trái phép chất ma túy và nâng cao năng lực điều trị, cai nghiện, hỗ trợ tái hòa nhập cộng đồng.</p><ul><li>Giảm số điểm phức tạp về ma túy trên địa bàn trọng điểm.</li><li>Mỗi phường, xã, thị trấn duy trì ít nhất một mô hình cộng đồng không ma túy.</li><li>Tăng tỷ lệ người nghiện được tiếp cận dịch vụ điều trị, cai nghiện.</li></ul><h2>Nhiệm vụ trọng tâm</h2><p>Các sở, ngành và địa phương rà soát, bổ sung kế hoạch hành động, bố trí nguồn lực và phân công cán bộ đầu mối theo dõi tiến độ.</p><blockquote>Mỗi cán bộ, đảng viên là một tuyên truyền viên tích cực trong gia đình và cộng đồng.</blockquote><h2>Tổ chức thực hiện</h2><p>Ban Chỉ đạo 138 Thành phố chủ trì theo dõi, đánh giá định kỳ 6 tháng và báo cáo kết quả về Thường trực UBND Thành phố.</p>',
    },
    {
        id: 'art-0002', title: 'Cảnh báo ma túy thế hệ mới núp bóng thực phẩm, đồ uống và thuốc lá điện tử',
        slug: 'thu-giu-thuoc-la-dien-tu-etomidate', cat: 'cat-03', status: 'published', author: 'u-cms-04',
        excerpt: 'Qua kiểm tra các điểm kinh doanh, lực lượng chức năng phát hiện nhiều sản phẩm thuốc lá điện tử không rõ nguồn gốc, có dấu hiệu pha trộn chất gây nghiện.',
        tags: ['Etomidate', 'Thuốc lá điện tử', 'PC04'], source: 'Phòng Cảnh sát điều tra tội phạm về ma túy',
        createdAt: d(-13, 14, 20), submittedAt: d(-12, 8, 0), reviewedAt: d(-12, 8, 20), publishedAt: d(-12, 8, 30),
        views: 7630, thumb: 2,
        body: '<p>Các đối tượng sử dụng vỏ bọc “pod chill”, “tinh dầu thơm” để đưa các chất như Etomidate, ADB-BUTINACA vào thị trường, nhắm tới khách hàng trẻ tuổi.</p><h2>Dấu hiệu nhận biết</h2><ul><li>Bao bì không nhãn mác, không công bố thành phần.</li><li>Hương vị trái cây, giá rẻ bất thường.</li><li>Bán kèm lời mời dùng thử tại cổng trường, khu vui chơi.</li></ul><h2>Khuyến cáo</h2><p>Người dân tuyệt đối không sử dụng, tàng trữ, mua bán thuốc lá điện tử không rõ nguồn gốc và kịp thời báo tin tới cơ quan công an gần nhất.</p>',
    },
    {
        id: 'art-0003', title: 'Tuyên truyền phòng, chống ma túy qua sân chơi tương tác tại trường THPT',
        slug: 'tuyen-truyen-thpt-vo-nguyen-giap', cat: 'cat-04', status: 'published', author: 'u-cms-03',
        excerpt: 'Chương trình trang bị kỹ năng nhận diện chất gây nghiện, cách ứng phó khi bị lôi kéo và trách nhiệm chung tay xây dựng học đường an toàn.',
        tags: ['Học đường', 'Kỹ năng phòng ngừa'], source: 'Ban Biên tập Cổng thông tin',
        createdAt: d(-9, 9, 10), submittedAt: d(-9, 16, 5), reviewedAt: d(-8, 10, 0), publishedAt: d(-8, 10, 30),
        views: 2410, thumb: 3,
        body: '<p>Chương trình phối hợp Đoàn Thanh niên tổ chức chuyên đề truyền thông tại trường học, thu hút gần 700 học sinh tham gia.</p><p>Học sinh được tham gia trò chơi tương tác, đặt câu hỏi với báo cáo viên và thực hành kỹ năng từ chối khéo léo.</p><h2>Kết quả</h2><p>Phát hành hơn 1.500 tờ gấp tuyên truyền và 50 cuốn cẩm nang kỹ năng phòng ngừa cho nhà trường.</p>',
    },
    {
        id: 'art-0004', title: 'Hướng dẫn áp dụng Nghị định 105/2021/NĐ-CP về quản lý người sử dụng trái phép chất ma túy',
        slug: 'huong-dan-ap-dung-nghi-dinh-105-2021', cat: 'cat-06', status: 'approved', author: 'u-cms-04',
        excerpt: 'Tài liệu tổng hợp các điểm cần lưu ý khi lập hồ sơ quản lý, xét nghiệm và áp dụng biện pháp cai nghiện theo quy định hiện hành.',
        tags: ['Nghị định 105', 'Quản lý sau cai'], source: 'Sở Y tế Thành phố',
        createdAt: d(-10, 10, 0), submittedAt: d(-9, 8, 30), reviewedAt: d(-6, 15, 20), publishedAt: null,
        views: 0, thumb: 4,
        body: '<h2>Phạm vi áp dụng</h2><p>Nghị định quy định việc xác định tình trạng nghiện, quản lý người sử dụng trái phép chất ma túy và các biện pháp hỗ trợ cai nghiện.</p><h3>Lưu ý khi lập hồ sơ</h3><ol><li>Xác minh thông tin nhân thân đầy đủ, chính xác.</li><li>Ghi nhận kết quả xét nghiệm bằng văn bản.</li><li>Thông báo cho gia đình, cơ quan theo đúng thẩm quyền.</li></ol>',
    },
    {
        id: 'art-0005', title: 'Chuỗi chương trình School Tour - Uni Tour tuyên truyền phòng, chống ma túy',
        slug: 'school-tour-uni-tour-thpt-hac-dich', cat: 'cat-04', status: 'rejected', author: 'u-cms-03',
        excerpt: 'Chuỗi hoạt động truyền thông lưu động tới các trường học trên địa bàn Thành phố.',
        tags: ['School Tour', 'Thanh niên'], source: 'Thành Đoàn',
        createdAt: d(-20, 11, 30), submittedAt: d(-19, 9, 0), reviewedAt: d(-18, 9, 15), publishedAt: null,
        views: 0, thumb: 5, reviewNote: 'Thiếu số liệu cụ thể về số trường và số lượt tham gia. Đề nghị bổ sung thông tin và hình ảnh trước khi duyệt.',
        body: '<p>Chương trình do Thành Đoàn phối hợp các đơn vị tổ chức, thu hút học sinh, sinh viên tham gia.</p>',
    },
    {
        id: 'art-0006', title: 'Các cơ sở cai nghiện tiếp nhận người cần hỗ trợ điều trị tại Thành phố Hồ Chí Minh',
        slug: 'co-so-cai-nghien-tiep-nhan-nguoi-can-ho-tro', cat: 'cat-08', status: 'draft', author: 'u-cms-01',
        excerpt: 'Danh sách cơ sở cai nghiện, đường dây nóng và quy trình tiếp nhận người cần hỗ trợ điều trị, cai nghiện.',
        tags: ['Cai nghiện', 'Đường dây nóng'], source: 'Sở Y tế Thành phố',
        createdAt: d(-6, 8, 45), submittedAt: null, reviewedAt: null, publishedAt: null,
        views: 0, thumb: 2,
        body: '<h2>Đường dây nóng</h2><p>Liên hệ tổng đài hỗ trợ để được tư vấn, bảo mật thông tin cá nhân.</p><h2>Quy trình tiếp nhận</h2><ol><li>Đăng ký thông tin qua tổng đài hoặc cơ sở y tế địa phương.</li><li>Đánh giá tình trạng sức khỏe và mức độ sử dụng.</li><li>Lập kế hoạch điều trị, cai nghiện phù hợp.</li></ol>',
    },
    {
        id: 'art-0007', title: 'Báo cáo kết quả công tác phòng, chống ma túy 10 tháng đầu năm 2026',
        slug: 'bao-cao-cong-tac-phong-chong-ma-tuy-10-thang-2026', cat: 'cat-09', status: 'published', author: 'u-cms-02',
        excerpt: 'Báo cáo tổng hợp số vụ việc, số đối tượng, kết quả cai nghiện và công tác tuyên truyền trên địa bàn Thành phố.',
        tags: ['Báo cáo', 'Số liệu'], source: 'Ban Chỉ đạo 138 Thành phố',
        createdAt: d(-16, 7, 30), submittedAt: d(-15, 8, 0), reviewedAt: d(-15, 10, 0), publishedAt: d(-15, 10, 30),
        views: 2150, thumb: 1,
        body: '<h2>Nội dung báo cáo</h2><p>Báo cáo tổng hợp tình hình, kết quả thực hiện các nhiệm vụ trọng tâm và kiến nghị phương hướng thời gian tới.</p><p>Số liệu chi tiết được công bố tại chuyên mục Thống kê khi được cơ quan có thẩm quyền phê duyệt.</p>',
    },
    {
        id: 'art-0008', title: 'Kế hoạch tăng cường đáp ứng y tế trong phòng, chống ma túy đến năm 2030',
        slug: 'ke-hoach-500-dap-ung-y-te', cat: 'cat-01', status: 'pending', author: 'u-cms-03',
        excerpt: 'Kế hoạch mở rộng dịch vụ điều trị, giảm tác hại và chăm sóc sức khỏe tâm thần cho người sử dụng chất.',
        tags: ['Sở Y tế', 'Điều trị'], source: 'Sở Y tế Thành phố',
        createdAt: d(-4, 10, 0), submittedAt: d(-3, 8, 0), reviewedAt: null, publishedAt: null,
        views: 0, thumb: 4,
        body: '<p>Kế hoạch đặt mục tiêu mở rộng mạng lưới điều trị thay thế, tăng cường nhân lực và nâng cao chất lượng dịch vụ tại tuyến cơ sở.</p><h2>Nội dung chính</h2><ul><li>Mở rộng cơ sở điều trị cấp huyện.</li><li>Đào tạo cán bộ y tế cơ sở.</li><li>Triển khai hồ sơ bệnh án điện tử.</li></ul>',
    },
    {
        id: 'art-0009', title: 'Triệt phá đường dây vận chuyển ma túy liên tỉnh, làm sạch nhiều địa bàn cơ sở',
        slug: 'triet-pha-duong-day-lien-tinh-lam-sach-dia-ban', cat: 'cat-07', status: 'published', author: 'u-cms-01',
        excerpt: 'Chuyên án lớn do Công an Thành phố phối hợp các đơn vị nghiệp vụ, làm sạch nhiều địa bàn cơ sở.',
        tags: ['Chuyên án', 'Liên tỉnh'], source: 'Phòng Cảnh sát điều tra tội phạm về ma túy',
        createdAt: d(-120, 9, 20), submittedAt: d(-119, 8, 0), reviewedAt: d(-119, 9, 0), publishedAt: d(-119, 15, 0),
        views: 12890, thumb: 3,
        body: '<p>Sau nhiều tháng theo dõi, lực lượng chức năng triệt phá đường dây vận chuyển, mua bán trái phép chất ma túy với quy mô lớn.</p><p>Người dân cung cấp thông tin tố giác tội phạm qua đường dây nóng hoặc biểu mẫu phản ánh trực tuyến trên Cổng thông tin.</p>',
    },
    {
        id: 'art-0010', title: 'Hội nghị tập huấn nghiệp vụ công tác cai nghiện và quản lý sau cai năm 2026',
        slug: 'hoi-nghi-tap-huan-nghiep-vu-cai-nghien-2026', cat: 'cat-07', status: 'draft', author: 'u-cms-04',
        excerpt: 'Hội nghị cập nhật quy định mới và kỹ năng tư vấn cho cán bộ làm công tác cai nghiện.',
        tags: ['Tập huấn', 'Cai nghiện'], source: 'Sở Y tế Thành phố',
        createdAt: d(-5, 13, 10), submittedAt: null, reviewedAt: null, publishedAt: null,
        views: 0, thumb: 5,
        body: '<p>Hội nghị có sự tham dự của đại diện các cơ sở cai nghiện và cán bộ đầu mối các quận, huyện.</p>',
    },
    {
        id: 'art-0011', title: 'Gia đình đồng hành giúp người sau cai nghiện ổn định cuộc sống',
        slug: 'gia-dinh-dong-hanh-nguoi-sau-cai-nghien', cat: 'cat-08', status: 'published', author: 'u-cms-04',
        excerpt: 'Các mô hình cộng đồng cho thấy vai trò của gia đình và tổ chức đoàn thể trong việc giảm nguy cơ tái nghiện.',
        tags: ['Tái hòa nhập', 'Gia đình'], source: 'Ban Biên tập Cổng thông tin',
        createdAt: d(-35, 11, 0), submittedAt: d(-34, 9, 0), reviewedAt: d(-34, 10, 0), publishedAt: d(-33, 9, 0),
        views: 3120, thumb: 2,
        body: '<p>Người sau cai nghiện đối mặt nhiều rào cản: định kiến, việc làm, sức khỏe. Gia đình là điểm tựa quan trọng nhất.</p><h2>Kỹ năng cần trang bị cho gia đình</h2><ul><li>Lắng nghe, không phán xét.</li><li>Phối hợp với cán bộ y tế và công an khu vực.</li><li>Theo dõi dấu hiệu tái sử dụng và can thiệp sớm.</li></ul>',
    },
    {
        id: 'art-0012', title: 'Nhân rộng mô hình đồng hành, hỗ trợ đào tạo nghề cho người sau cai tái hòa nhập',
        slug: 'triet-pha-duong-day-lien-tinh-140-doi-tuong', cat: 'cat-07', status: 'archived', author: 'u-cms-01',
        excerpt: 'Chung tay xây dựng môi trường sống an toàn, tạo điều kiện giúp người sau cai ổn định việc làm.',
        tags: ['An sinh', 'Cộng đồng'], source: 'Ban Chỉ đạo 138 Thành phố',
        createdAt: d(-180, 9, 0), submittedAt: d(-179, 9, 0), reviewedAt: d(-179, 10, 0), publishedAt: d(-178, 8, 0),
        archivedAt: d(-60, 17, 0), views: 5400, thumb: 1,
        body: '<p>Mô hình hỗ trợ đào tạo nghề và giới thiệu việc làm cho người sau cai nghiện được nhân rộng tại nhiều địa phương.</p>',
    },
    {
        id: 'art-0013', title: 'Nhận diện ma túy núp bóng đồ uống đóng gói, bánh kẹo và tinh dầu thuốc lá điện tử',
        slug: 'nhan-dien-ma-tuy-nup-bong-do-uong-banh-keo', cat: 'cat-03', status: 'published', author: 'u-cms-03',
        excerpt: 'Các dấu hiệu nhận biết sản phẩm bị pha trộn chất cấm và hướng dẫn xử lý khi phát hiện.',
        tags: ['Nhận diện', 'Cảnh báo'], source: 'Ban Biên tập Cổng thông tin',
        createdAt: d(-41, 10, 30), submittedAt: d(-41, 14, 0), reviewedAt: d(-40, 8, 0), publishedAt: d(-40, 9, 0),
        views: 8920, thumb: 4,
        body: '<p>Thủ đoạn phổ biến là pha chất cấm vào thực phẩm, đồ uống có bao bì bắt mắt để dụ dỗ người trẻ.</p><h2>Cách phòng tránh</h2><ul><li>Chỉ sử dụng sản phẩm có nhãn mác, nguồn gốc rõ ràng.</li><li>Không nhận đồ ăn, thức uống từ người lạ.</li><li>Báo ngay cho gia đình, nhà trường khi phát hiện dấu hiệu bất thường.</li></ul>',
    },
    {
        id: 'art-0014', title: 'Kiện toàn Ban Chỉ đạo 138 các quận, huyện và thành phố Thủ Đức',
        slug: 'kien-toan-ban-chi-dao-138-cac-quan-huyen', cat: 'cat-01', status: 'published', author: 'u-cms-02',
        excerpt: 'Quyết định kiện toàn nhân sự Ban Chỉ đạo phòng, chống tội phạm, tệ nạn xã hội và xây dựng phong trào toàn dân bảo vệ an ninh Tổ quốc.',
        tags: ['Ban Chỉ đạo 138', 'Nhân sự'], source: 'Ban Chỉ đạo 138 Thành phố',
        createdAt: d(-95, 8, 0), submittedAt: d(-95, 9, 0), reviewedAt: d(-95, 10, 0), publishedAt: d(-95, 11, 0),
        views: 1320, thumb: 1,
        body: '<p>Việc kiện toàn nhằm bảo đảm sự chỉ đạo thống nhất, sâu sát từ Thành phố tới cơ sở.</p>',
    },
    {
        id: 'art-0015', title: 'Thư viện số tài liệu tuyên truyền phòng, chống ma túy dành cho cơ sở',
        slug: 'thu-vien-so-tai-lieu-tuyen-truyen', cat: 'cat-02', status: 'published', author: 'u-cms-03',
        excerpt: 'Bộ tài liệu infographic, video và slide trình chiếu phục vụ công tác tuyên truyền tại địa bàn cơ sở.',
        tags: ['Tài liệu', 'Truyền thông'], source: 'Ban Biên tập Cổng thông tin',
        createdAt: d(-25, 9, 30), submittedAt: d(-25, 10, 0), reviewedAt: d(-22, 14, 0), publishedAt: d(-22, 15, 0),
        views: 1980, thumb: 5,
        body: '<p>Bộ tài liệu gồm 5 nhóm: nhận diện, kỹ năng, pháp luật, hỗ trợ cai nghiện và báo cáo.</p>',
    },
    {
        id: 'art-0016', title: 'Cảnh báo thủ đoạn lôi kéo học sinh, sinh viên tham gia vận chuyển chất cấm',
        slug: 'canh-bao-thu-doan-loi-keo-hoc-sinh-van-chuyen-chat-cam', cat: 'cat-03', status: 'published', author: 'u-cms-04',
        excerpt: 'Các đối tượng thường lợi dụng sự thiếu hiểu biết, ham việc làm thêm của người trẻ để lôi kéo vận chuyển hàng hóa không rõ nguồn gốc.',
        tags: ['Lừa đảo', 'Sinh viên'], source: 'Phòng Cảnh sát điều tra tội phạm về ma túy',
        createdAt: d(-2, 8, 20), submittedAt: d(-2, 11, 5), reviewedAt: d(-1, 9, 0), publishedAt: d(-1, 9, 30),
        views: 870, thumb: 2,
        body: '<p>Theo cơ quan chức năng, nhiều vụ việc xuất phát từ lời mời làm việc nhẹ, lương cao trên mạng xã hội.</p><h2>Dấu hiệu cần cảnh giác</h2><ul><li>Yêu cầu nhận, gửi hàng hóa không rõ nguồn gốc.</li><li>Trả thù lao cao bất thường.</li><li>Hướng dẫn tránh né kiểm tra, không khai báo nội dung hàng hóa.</li></ul>',
    },
    {
        id: 'art-0017', title: 'Hướng dẫn sử dụng Cổng thông tin điện tử cho cán bộ đầu mối tại cơ sở',
        slug: 'huong-dan-su-dung-cong-thong-tin-cho-can-bo-dau-moi', cat: 'cat-02', status: 'published', author: 'u-cms-01',
        excerpt: 'Tài liệu hướng dẫn tra cứu văn bản pháp luật, gửi tin bài và sử dụng thư viện tài liệu trên Cổng thông tin.',
        tags: ['Hướng dẫn', 'Cổng thông tin'], source: 'Ban Biên tập Cổng thông tin',
        createdAt: d(-55, 9, 0), submittedAt: d(-54, 9, 0), reviewedAt: d(-54, 10, 0), publishedAt: d(-54, 10, 30),
        views: 1560, thumb: 3,
        body: '<p>Tài liệu gồm hướng dẫn từng bước kèm hình ảnh minh họa, dành cho cán bộ đầu mối tại phường, xã, thị trấn.</p><p>Cơ quan, đơn vị đề xuất nội dung qua khu vực Workspace; nội dung được Ban Biên tập kiểm duyệt trước khi xuất bản.</p>',
    },
    {
        id: 'art-0018', title: 'Triển khai mô hình “Tổ dân phố không ma túy” tại các phường trọng điểm',
        slug: 'mo-hinh-to-dan-pho-khong-ma-tuy', cat: 'cat-07', status: 'published', author: 'u-cms-03',
        excerpt: 'Mô hình huy động tổ dân phố, đoàn thể và người có uy tín tham gia phát hiện, hỗ trợ người có nguy cơ cao.',
        tags: ['Tổ dân phố', 'Mô hình'], source: 'Ban Chỉ đạo 138 Thành phố',
        createdAt: d(-130, 9, 0), submittedAt: d(-130, 10, 0), reviewedAt: d(-130, 11, 0), publishedAt: d(-129, 10, 0),
        views: 3105, thumb: 4,
        body: '<p>Mô hình thí điểm ghi nhận nhiều kết quả tích cực trong việc phát hiện sớm và giảm số người sử dụng trái phép chất ma túy.</p>',
    },
    {
        id: 'art-0019', title: 'Mở rộng các điểm tư vấn, chăm sóc và hỗ trợ điều trị nghiện ma túy tự nguyện tại cơ sở',
        slug: 'mo-rong-diem-tu-van-dieu-tri-tu-nguyen', cat: 'cat-08', status: 'published', author: 'u-cms-02',
        excerpt: 'Tạo điều kiện thuận lợi, bảo mật thông tin giúp người sử dụng ma túy và gia đình chủ động tiếp cận dịch vụ tư vấn tâm lý, y tế và phục hồi.',
        tags: ['Điều trị', 'Tư vấn'], source: 'Sở Y tế Thành phố',
        createdAt: d(-7, 15, 0), submittedAt: d(-7, 16, 0), reviewedAt: d(-6, 9, 0), publishedAt: d(-6, 9, 30),
        views: 640, thumb: 4,
        body: '<p>Các điểm tư vấn cộng đồng được mở rộng nhằm giúp người cần hỗ trợ tiếp cận dịch vụ sớm, giảm kỳ thị và bảo đảm bảo mật thông tin cá nhân.</p>',
    },
    {
        id: 'art-0020', title: 'Cảnh giác với thủ đoạn mua bán, lôi kéo sử dụng chất cấm trên không gian mạng',
        slug: 'canh-giac-thu-doan-tren-khong-gian-mang', cat: 'cat-03', status: 'published', author: 'u-cms-04',
        excerpt: 'Trang bị kỹ năng nhận diện hội nhóm kín, giao dịch ngụy trang và chủ động phòng tránh nguy cơ xâm nhập của tệ nạn ma túy trên môi trường số.',
        tags: ['Không gian mạng', 'Phòng ngừa'], source: 'Ban Biên tập Cổng thông tin',
        createdAt: d(-3, 10, 0), submittedAt: d(-3, 10, 30), reviewedAt: d(-2, 8, 0), publishedAt: d(-2, 8, 30),
        views: 1120, thumb: 5,
        body: '<p>Các hội nhóm kín trên mạng xã hội thường sử dụng từ lóng, hình ảnh ngụy trang để mời chào, giao dịch chất cấm.</p><h2>Khuyến cáo</h2><ul><li>Không tham gia hội nhóm có dấu hiệu mua bán chất cấm.</li><li>Không chuyển tiền, không cung cấp thông tin cá nhân cho người lạ.</li><li>Phản ánh ngay qua biểu mẫu trực tuyến của Cổng thông tin.</li></ul>',
    },
];

/* ============================== TÀI NGUYÊN, BANNER ========================== */
const MEDIA = [
    { id: 'med-01', name: 'hoat-dong-tuyen-truyen-01.jpg', url: '../../assets/images/1.jpg', type: 'image', ext: 'jpg', size: 37452, folder: 'Hình ảnh hoạt động', alt: 'Hoạt động tuyên truyền phòng, chống ma túy' },
    { id: 'med-02', name: 'canh-bao-thuoc-la-dien-tu.jpg', url: '../../assets/images/2.jpg', type: 'image', ext: 'jpg', size: 37450, folder: 'Hình ảnh hoạt động', alt: 'Cảnh báo thuốc lá điện tử chứa chất cấm' },
    { id: 'med-03', name: 'hoc-sinh-tham-gia-chuyen-de.jpg', url: '../../assets/images/3.jpg', type: 'image', ext: 'jpg', size: 37452, folder: 'Hình ảnh hoạt động', alt: 'Học sinh tham gia chuyên đề phòng, chống ma túy' },
    { id: 'med-04', name: 'hoi-nghi-tap-huan-nghiep-vu.jpg', url: '../../assets/images/4.jpg', type: 'image', ext: 'jpg', size: 37451, folder: 'Hình ảnh hoạt động', alt: 'Hội nghị tập huấn nghiệp vụ' },
    { id: 'med-05', name: 'chuong-trinh-truyen-thong-luu-dong.jpg', url: '../../assets/images/5.jpg', type: 'image', ext: 'jpg', size: 37450, folder: 'Hình ảnh hoạt động', alt: 'Chương trình truyền thông lưu động tại trường học' },
    { id: 'med-06', name: 'bieu-trung-cong-thong-tin.jpg', url: '../../assets/icons/logo.jpg', type: 'image', ext: 'jpg', size: 398888, folder: 'Biểu trưng', alt: 'Biểu trưng Cổng thông tin điện tử' },
    { id: 'med-07', name: 'cam-nang-ky-nang-phong-ngua.pdf', url: 'media/cam-nang-ky-nang-phong-ngua.pdf', type: 'document', ext: 'pdf', size: 3125248, folder: 'Tài liệu tuyên truyền', alt: '' },
    { id: 'med-08', name: 'bo-an-pham-truyen-thong-co-so.pdf', url: 'media/bo-an-pham-truyen-thong-co-so.pdf', type: 'document', ext: 'pdf', size: 1820000, folder: 'Tài liệu tuyên truyền', alt: '' },
    { id: 'med-09', name: 'mau-bao-cao-cong-tac-thang.docx', url: 'media/mau-bao-cao-cong-tac-thang.docx', type: 'document', ext: 'docx', size: 245760, folder: 'Biểu mẫu', alt: '' },
    { id: 'med-10', name: 'so-lieu-thong-ke-thang.xlsx', url: 'media/so-lieu-thong-ke-thang.xlsx', type: 'document', ext: 'xlsx', size: 156672, folder: 'Biểu mẫu', alt: '' },
];

const BANNERS = [
    { id: 'ban-01', title: 'Chung tay phòng, chống ma túy vì một cộng đồng khỏe mạnh', image: '../../assets/images/1.jpg', link: '../../pages/public/education.html', position: 'home-top', order: 1 },
    { id: 'ban-02', title: 'Cảnh báo ma túy thế hệ mới núp bóng thực phẩm, đồ uống', image: '../../assets/images/2.jpg', link: '../../pages/public/news-detail.html?id=thu-giu-thuoc-la-dien-tu-etomidate', position: 'home-top', order: 2 },
    { id: 'ban-03', title: 'Hỗ trợ cai nghiện: tư vấn kín, bảo mật thông tin', image: '../../assets/images/4.jpg', link: '../../pages/public/support.html', position: 'home-top', order: 3 },
];

/* ============================== TÀI LIỆU NỘI BỘ ============================= */
const DOCUMENTS = [
    { id: 'doc-01', code: 'VB-2026-118', name: 'Kế hoạch giao ban công tác phòng, chống ma túy tháng 11', type: 'plan', org: 'org-01', uploader: 'u-ws-02', issuedAt: d(-4), format: 'PDF', size: 482000, access: 'internal', folder: 'Kế hoạch công tác', summary: 'Kế hoạch tổ chức giao ban và nội dung điều hành tháng 11.' },
    { id: 'doc-02', code: 'VB-2026-102', name: 'Chỉ thị tăng cường công tác phòng, chống ma túy trên địa bàn', type: 'directive', org: 'org-01', uploader: 'u-ws-01', issuedAt: d(-40), format: 'DOCX', size: 96000, access: 'internal', folder: 'Văn bản chỉ đạo', summary: 'Nhiệm vụ trọng tâm các đơn vị cần triển khai.' },
    { id: 'doc-03', code: 'TL-2026-051', name: 'Bộ ấn phẩm tuyên truyền phòng, chống ma túy cấp phường', type: 'propaganda', org: 'org-05', uploader: 'u-ws-05', issuedAt: d(-15), format: 'PDF', size: 1820000, access: 'public', folder: 'Tuyên truyền', summary: 'Bộ ấn phẩm truyền thông dùng tại địa bàn cơ sở.' },
    { id: 'doc-04', code: 'BC-2026-044', name: 'Dự thảo báo cáo công tác phòng, chống ma túy quý III/2026', type: 'report', org: 'org-01', uploader: 'u-ws-03', issuedAt: d(-1), format: 'DOCX', size: 254000, access: 'internal', folder: 'Báo cáo', summary: 'Dự thảo phục vụ góp ý trước khi trình duyệt.' },
    { id: 'doc-05', code: 'TL-2026-049', name: 'Tài liệu tập huấn nghiệp vụ công tác cai nghiện', type: 'training', org: 'org-03', uploader: 'u-ws-03', issuedAt: d(-22), format: 'PDF', size: 3450000, access: 'internal', folder: 'Tập huấn', summary: 'Tài liệu phục vụ lớp tập huấn cán bộ cơ sở.' },
    { id: 'doc-06', code: 'BB-2026-031', name: 'Biên bản họp giao ban tháng 10/2026', type: 'minutes', org: 'org-01', uploader: 'u-ws-03', issuedAt: d(-28), format: 'DOCX', size: 78000, access: 'internal', folder: 'Biên bản họp', summary: 'Kết luận và phân công tại cuộc họp giao ban.' },
    { id: 'doc-07', code: 'VB-2026-077', name: 'Văn bản hướng dẫn phân loại hồ sơ cai nghiện', type: 'professional', org: 'org-03', uploader: 'u-ws-02', issuedAt: d(-50), format: 'PDF', size: 640000, access: 'restricted', folder: 'Nghiệp vụ', summary: 'Hướng dẫn nghiệp vụ phân loại và lập hồ sơ.' },
    { id: 'doc-08', code: 'VB-2026-063', name: 'Kế hoạch kiểm tra liên ngành quý IV/2026', type: 'plan', org: 'org-02', uploader: 'u-ws-03', issuedAt: d(-9), format: 'PDF', size: 312000, access: 'internal', folder: 'Kế hoạch công tác', summary: 'Phân công lực lượng và lịch kiểm tra liên ngành.' },
    { id: 'doc-09', code: 'VB-2026-096', name: 'Kế hoạch tuyên truyền phòng, chống ma túy trong trường học', type: 'plan', org: 'org-04', uploader: 'u-ref-05', issuedAt: d(-13), format: 'PDF', size: 401000, access: 'public', folder: 'Kế hoạch công tác', summary: 'Kế hoạch phối hợp tuyên truyền trong trường học.' },
    { id: 'doc-10', code: 'TL-2026-058', name: 'Tài liệu nghiệp vụ quản lý người sau cai nghiện', type: 'professional', org: 'org-06', uploader: 'u-ws-04', issuedAt: d(-7), format: 'PDF', size: 512000, access: 'internal', folder: 'Nghiệp vụ', summary: 'Hướng dẫn quản lý, hỗ trợ người sau cai tại địa bàn.' },
];

/* ============================== NHIỆM VỤ ==================================== */
const TASKS = [
    { id: 'task-01', code: 'NV-2026-001', title: 'Tổng hợp báo cáo công tác phòng, chống ma túy quý III/2026', desc: 'Tổng hợp số liệu, kết quả thực hiện công tác phòng, chống ma túy của các đơn vị trong quý III; rà soát số liệu phát hiện, triển khai điểm phức tạp và công tác cai nghiện.', ownerOrg: 'org-01', partners: ['org-02', 'org-03'], assigner: 'u-ws-02', assignees: ['u-ws-03'], created: d(-24), start: d(-24), due: d(2), priority: 'urgent', status: 'review', progress: 90, docs: ['doc-04'] },
    { id: 'task-02', code: 'NV-2026-002', title: 'Kế hoạch kiểm tra liên ngành các cơ sở kinh doanh có điều kiện', desc: 'Xây dựng kế hoạch kiểm tra liên ngành đối với cơ sở kinh doanh có điều kiện về an ninh trật tự trên địa bàn trọng điểm.', ownerOrg: 'org-02', partners: ['org-06'], assigner: 'u-ws-01', assignees: ['u-ws-03', 'u-ws-04'], created: d(-18), start: d(-18), due: d(-3), priority: 'high', status: 'overdue', progress: 65, docs: ['doc-08'] },
    { id: 'task-03', code: 'NV-2026-003', title: 'Xây dựng chuyên trang tuyên truyền phòng, chống ma túy trong trường học', desc: 'Phối hợp Sở Giáo dục và Đào tạo xây dựng nội dung tuyên truyền, đề xuất nội dung gửi CMS để biên tập và xuất bản trên Cổng thông tin.', ownerOrg: 'org-04', partners: ['org-05', 'org-01'], assigner: 'u-ws-01', assignees: ['u-ws-05'], created: d(-14), start: d(-14), due: d(6), priority: 'normal', status: 'doing', progress: 45, docs: ['doc-09'] },
    { id: 'task-04', code: 'NV-2026-004', title: 'Rà soát danh sách người sau cai nghiện tại địa bàn phường', desc: 'Cập nhật danh sách quản lý, phân loại đối tượng và đề xuất biện pháp hỗ trợ tái hòa nhập cộng đồng.', ownerOrg: 'org-06', partners: ['org-02'], assigner: 'u-ws-02', assignees: ['u-ws-04'], created: d(-10), start: d(-10), due: d(4), priority: 'normal', status: 'doing', progress: 60, docs: ['doc-10'] },
    { id: 'task-05', code: 'NV-2026-005', title: 'Tổ chức tập huấn nghiệp vụ công tác cai nghiện cho cán bộ cơ sở', desc: 'Chuẩn bị nội dung, tài liệu và hậu cần cho lớp tập huấn; mời báo cáo viên và tổng hợp danh sách tham dự.', ownerOrg: 'org-03', partners: ['org-07'], assigner: 'u-ws-02', assignees: ['u-ws-04'], created: d(-30), start: d(-30), due: d(-12), priority: 'normal', status: 'done', progress: 100, docs: ['doc-05'], resultNote: 'Đã tổ chức 2 lớp tập huấn; 100% cán bộ tham gia đầy đủ. Tài liệu và biên bản đã được lưu trữ.' },
    { id: 'task-06', code: 'NV-2026-006', title: 'Kiểm tra tiến độ quản lý đối tượng tại địa bàn trọng điểm', desc: 'Kiểm tra thực tế công tác quản lý địa bàn, hồ sơ đối tượng và công tác phối hợp giữa các lực lượng.', ownerOrg: 'org-02', partners: ['org-06'], assigner: 'u-ws-01', assignees: ['u-ws-03'], created: d(-6), start: d(-6), due: d(10), priority: 'high', status: 'new', progress: 0, docs: [] },
    { id: 'task-07', code: 'NV-2026-007', title: 'Đề xuất nội dung tuyên truyền tháng 11/2026', desc: 'Tổng hợp đề xuất nội dung, ấn phẩm tuyên truyền phục vụ chiến dịch tháng 11 và gửi yêu cầu phối hợp sang CMS.', ownerOrg: 'org-05', partners: ['org-01'], assigner: 'u-ws-02', assignees: ['u-ws-05', 'u-ws-03'], created: d(-3), start: d(-3), due: d(12), priority: 'normal', status: 'doing', progress: 30, docs: ['doc-03'] },
    { id: 'task-08', code: 'NV-2026-008', title: 'Hoàn thiện hồ sơ tiếp nhận cai nghiện tự nguyện', desc: 'Bổ sung hồ sơ còn thiếu, số hóa và cập nhật tình trạng tiếp nhận trên hệ thống quản lý.', ownerOrg: 'org-07', partners: ['org-03'], assigner: 'u-ws-02', assignees: ['u-ws-04'], created: d(-40), start: d(-40), due: d(-20), priority: 'low', status: 'paused', progress: 35, docs: [] },
    { id: 'task-09', code: 'NV-2026-009', title: 'Phản hồi phản ánh của người dân về điểm bán thuốc lá điện tử', desc: 'Xác minh thông tin do người dân gửi qua Cổng thông tin, phối hợp kiểm tra và báo cáo kết quả xử lý.', ownerOrg: 'org-02', partners: ['org-06'], assigner: 'u-ws-01', assignees: ['u-ws-03'], created: d(-2), start: d(-2), due: d(5), priority: 'high', status: 'doing', progress: 40, docs: [] },
    { id: 'task-10', code: 'NV-2026-010', title: 'Cập nhật số liệu phục vụ báo cáo năm 2026', desc: 'Rà soát, đối chiếu số liệu giữa các đơn vị và cập nhật bảng biểu phục vụ dự thảo báo cáo năm.', ownerOrg: 'org-01', partners: ['org-02', 'org-03', 'org-06'], assigner: 'u-ws-02', assignees: ['u-ws-03', 'u-ws-04'], created: d(-2), start: d(-2), due: d(20), priority: 'high', status: 'doing', progress: 25, docs: [] },
];

const TASK_ITEMS = [
    { id: 'ti-01', task: 'task-01', title: 'Tổng hợp số liệu từ các quận, huyện', done: 1, assignee: 'u-ws-03', due: d(-2) },
    { id: 'ti-02', task: 'task-01', title: 'Rà soát, đối chiếu số liệu phát hiện, triển khai', done: 1, assignee: 'u-ws-03', due: d(0) },
    { id: 'ti-03', task: 'task-01', title: 'Hoàn thiện dự thảo báo cáo quý III', done: 0, assignee: 'u-ws-03', due: d(2) },
    { id: 'ti-04', task: 'task-02', title: 'Xây dựng dự thảo kế hoạch', done: 1, assignee: 'u-ws-03', due: d(-10) },
    { id: 'ti-05', task: 'task-02', title: 'Gửi xin ý kiến các đơn vị phối hợp', done: 0, assignee: 'u-ws-04', due: d(-3) },
    { id: 'ti-06', task: 'task-03', title: 'Soạn nội dung chuyên mục', done: 1, assignee: 'u-ws-05', due: d(1) },
    { id: 'ti-07', task: 'task-03', title: 'Gửi đề xuất nội dung sang CMS', done: 0, assignee: 'u-ws-05', due: d(5) },
    { id: 'ti-08', task: 'task-05', title: 'Tổ chức tập huấn', done: 1, assignee: 'u-ws-04', due: d(-12) },
    { id: 'ti-09', task: 'task-10', title: 'Đối chiếu số liệu quận, huyện', done: 0, assignee: 'u-ws-03', due: d(8) },
    { id: 'ti-10', task: 'task-10', title: 'Đối chiếu số liệu cai nghiện', done: 0, assignee: 'u-ws-04', due: d(12) },
];

const TASK_COMMENTS = [
    { id: 'tc-01', task: 'task-01', user: 'u-ws-03', body: 'Đã tổng hợp số liệu các quận, huyện. Còn 2 đơn vị gửi bổ sung.', at: d(-4, 9, 20) },
    { id: 'tc-02', task: 'task-01', user: 'u-ws-02', body: 'Đề nghị bổ sung phần đánh giá công tác cai nghiện trước khi trình duyệt.', at: d(-2, 15, 5) },
    { id: 'tc-03', task: 'task-02', user: 'u-ws-03', body: 'Dự thảo kế hoạch đã hoàn thiện, đang chờ ý kiến của UBND phường.', at: d(-5, 10, 40) },
    { id: 'tc-04', task: 'task-03', user: 'u-ws-05', body: 'Đã hoàn thành 4/8 nội dung chuyên mục, dự kiến gửi CMS trong tuần.', at: d(-1, 14, 15) },
];

/* ============================== LỊCH CÔNG TÁC =============================== */
const EVENTS = [
    { id: 'ev-01', title: 'Họp giao ban công tác phòng, chống ma túy tháng 11', type: 'meeting', start: d(1, 8, 30), end: d(1, 11, 0), location: 'Phòng họp A', org: 'org-01', owner: 'u-ws-02', participants: ['u-ws-01', 'u-ws-03', 'u-ref-01'], desc: 'Đánh giá kết quả tháng 10 và triển khai nhiệm vụ trọng tâm tháng 11.' },
    { id: 'ev-02', title: 'Kiểm tra liên ngành cơ sở kinh doanh có điều kiện', type: 'joint', start: d(3, 14, 0), end: d(3, 17, 30), location: 'Địa bàn phường', org: 'org-02', owner: 'u-ws-03', participants: ['u-ws-04'], desc: 'Kiểm tra thực tế theo kế hoạch liên ngành.' },
    { id: 'ev-03', title: 'Tập huấn nghiệp vụ công tác cai nghiện cho cán bộ cơ sở', type: 'training', start: d(5, 8, 0), end: d(6, 16, 30), location: 'Hội trường Sở Y tế', org: 'org-03', owner: 'u-ws-04', participants: ['u-ws-03'], desc: 'Tập huấn 2 ngày về quy trình tiếp nhận, quản lý hồ sơ cai nghiện.' },
    { id: 'ev-04', title: 'Hội thảo chuyên đề tuyên truyền trong trường học', type: 'workshop', start: d(-2, 8, 30), end: d(-2, 11, 30), location: 'Hội trường Sở GD&ĐT', org: 'org-04', owner: 'u-ref-05', participants: ['u-ws-05'], desc: 'Trao đổi phương pháp tuyên truyền phù hợp lứa tuổi học sinh.' },
    { id: 'ev-05', title: 'Họp triển khai chương trình phối hợp với Thành Đoàn', type: 'coordination', start: d(0, 15, 0), end: d(0, 16, 30), location: 'Trực tuyến', org: 'org-05', owner: 'u-ws-05', participants: ['u-ws-01', 'u-ws-05'], desc: 'Thống nhất nội dung phối hợp tuyên truyền trong thanh niên.' },
    { id: 'ev-06', title: 'Hội nghị sơ kết công tác phòng, chống ma túy 10 tháng', type: 'conference', start: d(8, 7, 30), end: d(8, 11, 30), location: 'Hội trường Thành phố', org: 'org-01', owner: 'u-ws-02', participants: ['u-ws-01', 'u-ws-03'], desc: 'Sơ kết kết quả 10 tháng và định hướng nhiệm vụ cuối năm.' },
    { id: 'ev-07', title: 'Truyền thông cộng đồng tại địa bàn phường', type: 'propaganda', start: d(9, 19, 0), end: d(9, 21, 0), location: 'Nhà văn hóa phường', org: 'org-06', owner: 'u-ws-04', participants: ['u-ws-04', 'u-ws-05'], desc: 'Truyền thông phòng ngừa ma túy trong cộng đồng dân cư.' },
    { id: 'ev-08', title: 'Họp chuẩn bị báo cáo năm 2026', type: 'meeting', start: d(12, 9, 0), end: d(12, 10, 30), location: 'Phòng họp B', org: 'org-01', owner: 'u-ws-02', participants: ['u-ws-03', 'u-ws-04'], desc: 'Rà soát số liệu phục vụ dự thảo báo cáo năm.' },
    { id: 'ev-09', title: 'Kiểm tra hồ sơ tiếp nhận cai nghiện tự nguyện', type: 'inspection', start: d(-6, 8, 0), end: d(-6, 11, 0), location: 'Cơ sở cai nghiện', org: 'org-07', owner: 'u-ws-04', participants: ['u-ws-02'], desc: 'Kiểm tra hồ sơ theo kế hoạch rà soát.' },
];

/* ============================== BÁO CÁO ===================================== */
const REPORTS = [
    { id: 'rep-01', code: 'BC-2026-Q3-01', name: 'Báo cáo công tác phòng, chống ma túy quý III/2026', type: 'quarterly', org: 'org-01', author: 'u-ws-03', period: 'Quý III/2026', created: d(-6), status: 'pending', task: 'task-01', docs: ['doc-04'], content: '<p>Quý III/2026, các đơn vị thành viên đã triển khai đồng bộ các nhiệm vụ trọng tâm theo kế hoạch.</p><p>Công tác tuyên truyền được đẩy mạnh tại địa bàn trọng điểm, phối hợp với các tổ chức đoàn thể.</p>', results: 'Hoàn thành 4/5 nhiệm vụ trọng tâm; công tác cai nghiện tiếp tục được duy trì.', issues: 'Một số đơn vị gửi số liệu chậm so với thời hạn.', proposals: 'Đề nghị Ban Chỉ đạo chỉ đạo các đơn vị gửi số liệu đúng tiến độ.' },
    { id: 'rep-02', code: 'BC-2026-M10-01', name: 'Báo cáo công tác tháng 10/2026', type: 'monthly', org: 'org-02', author: 'u-ws-03', period: 'Tháng 10/2026', created: d(-9), status: 'approved', task: 'task-02', docs: [], content: '<p>Tháng 10/2026, đơn vị triển khai kiểm tra địa bàn trọng điểm, tổng hợp kết quả phối hợp.</p>', results: 'Hoàn thành kế hoạch kiểm tra địa bàn, phối hợp quản lý đối tượng.', issues: 'Nhân lực mỏng trong giai đoạn cao điểm.', proposals: 'Tăng cường phối hợp lực lượng tại địa bàn phường.', publicSummary: 'Kết quả kiểm tra địa bàn tháng 10/2026: hoàn thành kế hoạch kiểm tra trọng điểm, phối hợp quản lý đối tượng tại địa bàn phường.', isPublic: 1 },
    { id: 'rep-03', code: 'BC-2026-CD-02', name: 'Báo cáo chuyên đề công tác tuyên truyền trong trường học', type: 'topic', org: 'org-04', author: 'u-ws-05', period: 'Năm 2026', created: d(-16), status: 'revision', task: 'task-03', docs: ['doc-09'], content: '<p>Báo cáo chuyên đề về kết quả tuyên truyền phòng, chống ma túy trong trường học.</p>', results: 'Triển khai tại 120 trường học trên địa bàn.', issues: 'Nội dung báo cáo chưa đủ số liệu đối chiếu.', proposals: 'Bổ sung phần phụ lục số liệu.' },
    { id: 'rep-04', code: 'BC-2026-DX-01', name: 'Báo cáo đột xuất kết quả kiểm tra liên ngành', type: 'urgent', org: 'org-02', author: 'u-ws-03', period: 'Tháng 10/2026', created: d(-3), status: 'pending', task: 'task-02', docs: [], content: '<p>Tổng hợp kết quả kiểm tra liên ngành cơ sở kinh doanh có điều kiện.</p>', results: 'Đã kiểm tra theo kế hoạch.', issues: '—', proposals: '—' },
    { id: 'rep-05', code: 'BC-2026-N-01', name: 'Báo cáo tổng kết công tác năm 2026 (dự thảo)', type: 'yearly', org: 'org-01', author: 'u-ws-02', period: 'Năm 2026', created: d(-1), status: 'draft', task: 'task-10', docs: [], content: '<p>Dự thảo báo cáo tổng kết công tác năm 2026.</p>', results: 'Đang tổng hợp số liệu.', issues: 'Đang cập nhật.', proposals: 'Đang cập nhật.' },
    { id: 'rep-06', code: 'BC-2026-TH-01', name: 'Báo cáo kết quả thực hiện nhiệm vụ NV-2026-005', type: 'task', org: 'org-03', author: 'u-ws-04', period: 'Tháng 10/2026', created: d(-13), status: 'approved', task: 'task-05', docs: ['doc-05'], content: '<p>Báo cáo kết quả tổ chức tập huấn nghiệp vụ công tác cai nghiện.</p>', results: 'Đã tổ chức 2 lớp tập huấn, 100% cán bộ tham gia đầy đủ.', issues: 'Thời gian tập huấn ngắn.', proposals: 'Đề nghị tổ chức thêm lớp chuyên sâu.' },
];

/* ============================== TIẾP NHẬN TỪ CÔNG DÂN ======================= */
const SUBMISSIONS = [
    {
        id: 'sub-01', ticket: 'PCMT-2026-1041', form: 'report', status: 'answered', priority: 'high',
        subject: 'Phản ánh điểm bán thuốc lá điện tử có dấu hiệu chứa chất cấm gần trường học',
        name: 'Người dân phường (ẩn danh)', anonymous: 1, email: '', phone: '',
        content: 'Tại khu vực gần cổng trường có điểm bán thuốc lá điện tử với nhiều loại pod không nhãn mác, bán cho học sinh. Đề nghị cơ quan chức năng kiểm tra.',
        org: 'org-02', task: 'task-09', created: d(-4, 19, 10),
        response: 'Đã tiếp nhận, chuyển Phòng Cảnh sát điều tra tội phạm về ma túy xác minh và phối hợp kiểm tra theo quy định.',
        publicResponse: 'Cảm ơn thông tin phản ánh của công dân. Cơ quan chức năng đã tiếp nhận và đang phối hợp kiểm tra, xử lý theo quy định; kết quả sẽ được thông tin tới công dân qua mã tiếp nhận.',
        isPublic: 1,
        events: [
            { action: 'created', to: 'new', note: 'Tiếp nhận phản ánh trực tuyến', user: null, at: d(-4, 19, 10) },
            { action: 'assigned', from: 'new', to: 'assigned', note: 'Chuyển Phòng Cảnh sát điều tra tội phạm về ma túy', user: 'u-cms-02', at: d(-4, 15, 0) },
            { action: 'task_created', from: 'assigned', to: 'in_progress', note: 'Tạo nhiệm vụ NV-2026-009 tại Workspace', user: 'u-cms-02', at: d(-2, 8, 30) },
            { action: 'answered', from: 'in_progress', to: 'answered', note: 'Đã phản hồi công dân', user: 'u-cms-02', at: d(-1, 9, 0) },
        ],
    },
    {
        id: 'sub-02', ticket: 'PCMT-2026-1042', form: 'support', status: 'in_progress', priority: 'normal',
        subject: 'Cần tư vấn hỗ trợ cai nghiện tự nguyện cho người thân',
        name: 'Công dân đăng ký hỗ trợ', anonymous: 0, email: 'congdan.lienhe@example.com', phone: '0900000042',
        content: 'Gia đình có người thân sử dụng chất kích thích, mong muốn được tư vấn quy trình cai nghiện tự nguyện, bảo mật thông tin và các cơ sở tiếp nhận.',
        org: 'org-03', task: null, created: d(-2, 9, 30),
        response: '', publicResponse: '', isPublic: 0,
        events: [
            { action: 'created', to: 'new', note: 'Tiếp nhận yêu cầu tư vấn', user: null, at: d(-2, 9, 30) },
            { action: 'assigned', from: 'new', to: 'assigned', note: 'Chuyển Sở Y tế', user: 'u-cms-05', at: d(-2, 10, 0) },
            { action: 'in_progress', from: 'assigned', to: 'in_progress', note: 'Cán bộ đầu mối đang liên hệ tư vấn', user: 'u-cms-05', at: d(-1, 8, 30) },
        ],
    },
    {
        id: 'sub-03', ticket: 'PCMT-2026-1043', form: 'feedback', status: 'closed', priority: 'low',
        subject: 'Góp ý bổ sung tài liệu tuyên truyền cho phụ huynh',
        name: 'Người dân gửi góp ý', anonymous: 0, email: 'gopy.phuhuynh@example.com', phone: '',
        content: 'Đề nghị bổ sung tài liệu dạng tờ gấp ngắn gọn để phụ huynh nhận diện con em có nguy cơ sử dụng chất cấm.',
        org: 'org-01', task: null, created: d(-16, 14, 0), closedAt: d(-10, 9, 0),
        response: 'Đã ghi nhận góp ý, bổ sung vào kế hoạch sản xuất tài liệu tuyên truyền quý sau.',
        publicResponse: '',
        isPublic: 0,
        events: [
            { action: 'created', to: 'new', note: 'Tiếp nhận góp ý', user: null, at: d(-16, 14, 0) },
            { action: 'answered', from: 'new', to: 'answered', note: 'Đã phản hồi ghi nhận góp ý', user: 'u-cms-01', at: d(-12, 10, 0) },
            { action: 'closed', from: 'answered', to: 'closed', note: 'Đóng hồ sơ', user: 'u-cms-01', at: d(-10, 9, 0) },
        ],
    },
    {
        id: 'sub-04', ticket: 'PCMT-2026-1044', form: 'report', status: 'in_progress', priority: 'high',
        subject: 'Phản ánh tụ điểm nghi vấn tàng trữ, sử dụng trái phép chất ma túy',
        name: 'Người dân phản ánh', anonymous: 1, email: '', phone: '',
        content: 'Tại khu nhà trọ có nhóm người thường tụ tập về đêm, có dấu hiệu tàng trữ, sử dụng trái phép chất ma túy. Đề nghị kiểm tra.',
        org: 'org-02', task: null, created: d(-1, 22, 15),
        response: '', publicResponse: '', isPublic: 0,
        events: [
            { action: 'created', to: 'new', note: 'Tiếp nhận phản ánh', user: null, at: d(-1, 22, 15) },
            { action: 'assigned', from: 'new', to: 'assigned', note: 'Chuyển đơn vị nghiệp vụ', user: 'u-cms-05', at: d(0, 8, 0) },
            { action: 'in_progress', from: 'assigned', to: 'in_progress', note: 'Đang xác minh thông tin', user: 'u-cms-05', at: d(0, 9, 30) },
        ],
    },
    {
        id: 'sub-05', ticket: 'PCMT-2026-1045', form: 'contact', status: 'new', priority: 'normal',
        subject: 'Đề nghị cung cấp thông tin về hoạt động tuyên truyền tại địa bàn',
        name: 'Công dân đề nghị thông tin', anonymous: 0, email: 'thongtin.diaban@example.com', phone: '0900000045',
        content: 'Đề nghị Cổng thông tin cung cấp lịch hoạt động tuyên truyền phòng, chống ma túy tại địa bàn trong tháng tới.',
        org: null, task: null, created: d(0, 9, 45),
        response: '', publicResponse: '', isPublic: 0,
        events: [{ action: 'created', to: 'new', note: 'Tiếp nhận liên hệ', user: null, at: d(0, 9, 45) }],
    },
];

/* ============================== ĐỀ XUẤT NỘI DUNG ============================ */
const PROPOSALS = [
    {
        id: 'prop-01', code: 'DX-2026-004', title: 'Truyền thông phòng, chống ma túy trong trường học năm học 2026 - 2027',
        summary: 'Bộ nội dung chuyên trang tuyên truyền dành cho học sinh, phụ huynh và giáo viên.',
        body: '<h2>Mục tiêu</h2><p>Nâng cao nhận thức của học sinh về tác hại của ma túy và kỹ năng phòng ngừa.</p><h2>Nội dung</h2><ul><li>Nhận diện ma túy núp bóng thực phẩm, đồ uống.</li><li>Kỹ năng từ chối khi bị lôi kéo.</li><li>Kênh hỗ trợ khi phát hiện dấu hiệu nghi vấn.</li></ul>',
        cat: 'cat-04', org: 'org-05', author: 'u-ws-05', task: 'task-07', status: 'in_review', created: d(-2, 10, 0),
    },
    {
        id: 'prop-02', code: 'DX-2026-005', title: 'Mô hình hỗ trợ đào tạo nghề cho người sau cai nghiện tại địa bàn phường',
        summary: 'Đề xuất bài viết giới thiệu mô hình hỗ trợ sinh kế, giảm nguy cơ tái nghiện.',
        body: '<p>Bài viết tổng hợp cách thức tổ chức, các nguồn lực phối hợp và kết quả bước đầu của mô hình hỗ trợ đào tạo nghề.</p>',
        cat: 'cat-08', org: 'org-06', author: 'u-ws-04', task: 'task-04', status: 'submitted', created: d(-1, 14, 20),
    },
    {
        id: 'prop-03', code: 'DX-2026-003', title: 'Cảnh báo thủ đoạn mời chào việc làm nhẹ, lương cao để lôi kéo vận chuyển hàng cấm',
        summary: 'Nội dung cảnh báo dành cho sinh viên, người lao động trẻ.',
        body: '<p>Nội dung mô tả thủ đoạn lợi dụng nhu cầu việc làm của người trẻ, kèm khuyến cáo ứng phó.</p>',
        cat: 'cat-03', org: 'org-02', author: 'u-ws-03', task: null, status: 'published', created: d(-6, 9, 0),
        reviewedBy: 'u-cms-02', reviewedAt: d(-3, 10, 0), articleId: 'art-0016', publishedAt: d(-1, 9, 30),
    },
    {
        id: 'prop-04', code: 'DX-2026-002', title: 'Bài truyền thông hỗ trợ cai nghiện tự nguyện, giữ kín thông tin',
        summary: 'Nội dung phổ biến quy trình tiếp cận dịch vụ tư vấn, cai nghiện tự nguyện.',
        body: '<p>Bài viết hướng dẫn các bước tiếp cận dịch vụ và các kênh hỗ trợ.</p>',
        cat: 'cat-08', org: 'org-03', author: 'u-ws-04', task: null, status: 'approved', created: d(-8, 8, 0),
        reviewedBy: 'u-cms-02', reviewedAt: d(-5, 11, 0), articleId: null, publishedAt: null,
    },
];

/* ============================== YÊU CẦU PHỐI HỢP =========================== */
const COLLABORATIONS = [
    { id: 'col-01', code: 'PH-2026-011', title: 'Đề nghị xác minh số liệu phục vụ bài viết tuyên truyền', desc: 'CMS gửi yêu cầu đơn vị xác minh số liệu trước khi xuất bản bài viết chuyên đề.', direction: 'cms-ws', refType: 'article', refId: 'art-0004', from: 'u-cms-02', org: 'org-03', status: 'processing', created: d(-2, 10, 20), task: 'task-05' },
    { id: 'col-02', code: 'PH-2026-012', title: 'Đề nghị cung cấp báo cáo đã duyệt phục vụ chuyên mục số liệu', desc: 'CMS đề nghị cung cấp báo cáo đã duyệt để công khai số liệu tổng hợp.', direction: 'cms-ws', refType: 'report', refId: 'rep-02', from: 'u-cms-02', org: 'org-01', status: 'completed', created: d(-10, 8, 40), task: null, completedAt: d(-7, 16, 0) },
    { id: 'col-03', code: 'PH-2026-013', title: 'Đề nghị đính chính thông tin về địa điểm tiếp nhận hồ sơ', desc: 'Đơn vị đề nghị CMS cập nhật thông tin địa điểm tiếp nhận hồ sơ trên Cổng thông tin.', direction: 'ws-cms', refType: 'article', refId: 'art-0006', from: 'u-ws-04', org: 'org-03', status: 'received', created: d(-1, 15, 10), task: null },
];

/* ============================== THÔNG BÁO ================================== */
const NOTIFICATIONS = [
    { id: 'notif-01', system: 'cms', type: 'warning', title: 'Có bài viết đang chờ duyệt', body: 'Có nội dung mới cần kiểm duyệt trước khi xuất bản.', href: 'publishing-workflow.html', at: d(-1, 11, 10) },
    { id: 'notif-02', system: 'cms', type: 'info', title: 'Đề xuất nội dung mới từ Workspace', body: 'Có đề xuất nội dung cần xử lý trước khi xuất bản.', href: 'publishing-workflow.html', at: d(-1, 14, 20) },
    { id: 'notif-03', system: 'workspace', type: 'task', title: 'Nhiệm vụ sắp đến hạn', body: 'NV-2026-001 còn 2 ngày tới hạn hoàn thành.', href: 'task-detail.html?id=task-01', at: d(0, 7, 15) },
    { id: 'notif-04', system: 'workspace', type: 'integration', title: 'Yêu cầu phối hợp từ CMS', body: 'CMS đề nghị xác minh thông tin phục vụ bài viết tuyên truyền.', href: 'tasks.html', at: d(-2, 10, 20) },
];

/* ============================== VĂN BẢN PHÁP LUẬT ========================== */
const LEGAL_DOCS = [
    { id: 'law-01', code: 'luat-phong-chong-ma-tuy-2021', title: 'Luật Phòng, chống ma túy', number: '73/2021/QH14', type: 'luat', issuedAt: '2021-06-30', effectiveAt: '2022-01-01', issuer: 'Quốc hội', summary: 'Quy định về phòng ngừa, phát hiện, xử lý hành vi vi phạm và công tác cai nghiện, quản lý người sử dụng trái phép chất ma túy.' },
    { id: 'law-02', code: 'nghi-dinh-105-2021', title: 'Nghị định quy định chi tiết thi hành Luật Phòng, chống ma túy về quản lý người sử dụng trái phép chất ma túy và cai nghiện ma túy', number: '105/2021/NĐ-CP', type: 'nghi-dinh', issuedAt: '2021-11-23', effectiveAt: '2022-01-01', issuer: 'Chính phủ', summary: 'Hướng dẫn lập hồ sơ quản lý người sử dụng trái phép chất ma túy và trình tự cai nghiện.' },
    { id: 'law-03', code: 'bo-luat-hinh-su-2015', title: 'Bộ luật Hình sự', number: '100/2015/QH13', type: 'bo-luat', issuedAt: '2015-11-27', effectiveAt: '2018-01-01', issuer: 'Quốc hội', summary: 'Quy định các tội phạm về ma túy tại Chương XX, Mục 1.' },
    { id: 'law-04', code: 'luat-xu-ly-vi-pham-hanh-chinh-2020', title: 'Luật Xử lý vi phạm hành chính', number: '15/2012/QH13', type: 'luat', issuedAt: '2012-06-20', effectiveAt: '2013-07-01', issuer: 'Quốc hội', summary: 'Quy định trình tự, thủ tục xử lý vi phạm hành chính, áp dụng biện pháp cai nghiện.' },
    { id: 'law-05', code: 'chi-thi-138-2026', title: 'Chỉ thị tăng cường công tác phòng, chống ma túy trên địa bàn', number: 'CT-2026/BCĐ', type: 'chi-thi', issuedAt: isoDate(-40), effectiveAt: isoDate(-40), issuer: 'Ban Chỉ đạo 138 Thành phố', summary: 'Nhiệm vụ trọng tâm các sở, ngành, địa phương cần triển khai trong năm.' },
];

/* ============================== CƠ QUAN CÔNG KHAI =========================== */
const PUBLIC_AGENCIES = [
    { id: 'ag-01', org: 'org-01', name: 'Ban Chỉ đạo phòng, chống tội phạm, tệ nạn xã hội và xây dựng phong trào toàn dân bảo vệ an ninh Tổ quốc Thành phố Hồ Chí Minh', short_name: 'Ban Chỉ đạo 138 Thành phố', role: 'coordination', phone: '028.0000.0001', email: 'bcd138@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', desc: 'Cơ quan chỉ đạo, điều hành công tác phòng, chống ma túy cấp Thành phố; chủ trì tổng hợp báo cáo và phối hợp liên ngành.', order: 1 },
    { id: 'ag-02', org: 'org-02', name: 'Phòng Cảnh sát điều tra tội phạm về ma túy', short_name: 'PC04', role: 'enforcement', phone: '028.0000.0002', email: 'pc04@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', desc: 'Đơn vị thường trực đấu tranh phòng, chống tội phạm ma túy; tiếp nhận tin báo, tố giác tội phạm.', order: 2 },
    { id: 'ag-03', org: 'org-03', name: 'Sở Y tế Thành phố Hồ Chí Minh', short_name: 'Sở Y tế', role: 'health', phone: '028.0000.0003', email: 'soyte@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', desc: 'Chủ trì công tác điều trị, cai nghiện, giảm tác hại và phục hồi chức năng cho người sử dụng chất.', order: 3 },
    { id: 'ag-04', org: 'org-04', name: 'Sở Giáo dục và Đào tạo Thành phố Hồ Chí Minh', short_name: 'Sở GD&ĐT', role: 'education', phone: '028.0000.0004', email: 'sgddt@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', desc: 'Chủ trì công tác tuyên truyền, giáo dục phòng, chống ma túy trong trường học.', order: 4 },
    { id: 'ag-05', org: 'org-05', name: 'Thành Đoàn Thanh niên Cộng sản Hồ Chí Minh', short_name: 'Thành Đoàn', role: 'association', phone: '028.0000.0005', email: 'thanhdoan@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', desc: 'Tổ chức hoạt động truyền thông, tình nguyện trong thanh thiếu niên.', order: 5 },
    { id: 'ag-06', org: 'org-06', name: 'Ủy ban nhân dân phường (đơn vị tham chiếu)', short_name: 'UBND phường', role: 'local', phone: '028.0000.0006', email: 'ubnd.phuong@example.gov.vn', address: 'Quận 1, Thành phố Hồ Chí Minh', desc: 'Địa bàn tham chiếu cho công tác quản lý người sau cai nghiện và phối hợp cộng đồng.', order: 6 },
];

const PUBLIC_EVENTS = [
    { id: 'pe-01', title: 'Chiến dịch truyền thông phòng, chống ma túy trong trường học', category: 'truyen-thong', start: d(6, 8, 0), end: d(6, 11, 30), location: 'Trường THPT trên địa bàn', organizer: 'Sở Giáo dục và Đào tạo', summary: 'Chuỗi hoạt động tuyên truyền, tọa đàm và sân chơi tương tác dành cho học sinh.', content: '<p>Chiến dịch tổ chức trong tháng với các hoạt động: tọa đàm với báo cáo viên, sân chơi tương tác và phát tài liệu tuyên truyền.</p>', status: 'upcoming', image: '../../assets/images/3.jpg' },
    { id: 'pe-02', title: 'Ngày hội cộng đồng “Chung tay xây dựng phường, xã không ma túy”', category: 'cong-dong', start: d(13, 7, 30), end: d(13, 16, 0), location: 'Nhà văn hóa phường', organizer: 'Ban Chỉ đạo 138 Thành phố', summary: 'Ngày hội tuyên truyền, tư vấn và kết nối dịch vụ hỗ trợ cộng đồng.', content: '<p>Ngày hội có các gian hàng tư vấn, kết nối dịch vụ hỗ trợ và hoạt động văn hóa, thể thao.</p>', status: 'upcoming', image: '../../assets/images/1.jpg' },
    { id: 'pe-03', title: 'Hội nghị tập huấn nghiệp vụ công tác cai nghiện', category: 'tap-huan', start: d(-12, 8, 0), end: d(-11, 16, 30), location: 'Hội trường Sở Y tế', organizer: 'Sở Y tế', summary: 'Tập huấn quy trình tiếp nhận, quản lý hồ sơ và hỗ trợ sau cai nghiện.', content: '<p>Hội nghị tập huấn cập nhật quy định mới và kỹ năng tư vấn cho cán bộ làm công tác cai nghiện.</p>', status: 'past', image: '../../assets/images/4.jpg' },
    { id: 'pe-04', title: 'Trao đổi kinh nghiệm mô hình hỗ trợ người sau cai tái hòa nhập', category: 'hoi-thao', start: d(20, 8, 0), end: d(20, 11, 0), location: 'Hội trường Ban Chỉ đạo 138', organizer: 'Ban Chỉ đạo 138 Thành phố', summary: 'Hội thảo chia sẻ kinh nghiệm tổ chức mô hình hỗ trợ sinh kế, tái hòa nhập cộng đồng.', content: '<p>Hội thảo trao đổi giữa các địa phương về cách tổ chức, nguồn lực và kết quả của mô hình.</p>', status: 'upcoming', image: '../../assets/images/2.jpg' },
];

/* Dữ liệu thống kê khởi tạo. Mỗi kỳ có source_type = 'seed' cho tới khi
   được thay bằng số liệu đã xác minh và phê duyệt (source_type = 'verified'). */
const STAT_PERIODS = [
    {
        id: 'stp-2026-10', key: '2026-10', label: '10 tháng đầu năm 2026', note: 'Số liệu tổng hợp theo báo cáo kỳ báo cáo.', items: [
            { key: 'cases', label: 'Số vụ phát hiện', value: 1284, unit: 'vụ' },
            { key: 'offenders', label: 'Số đối tượng xử lý', value: 2017, unit: 'đối tượng' },
            { key: 'rehab', label: 'Người được cai nghiện', value: 3462, unit: 'người' },
            { key: 'campaign', label: 'Hoạt động tuyên truyền', value: 412, unit: 'hoạt động' },
            { key: 'school', label: 'Trường học được tuyên truyền', value: 187, unit: 'trường' },
            { key: 'hotline', label: 'Cuộc gọi qua đường dây nóng', value: 964, unit: 'cuộc' },
        ]
    },
    {
        id: 'stp-2025-12', key: '2025-12', label: 'Năm 2025', note: 'Số liệu tổng hợp theo báo cáo năm.', items: [
            { key: 'cases', label: 'Số vụ phát hiện', value: 1602, unit: 'vụ' },
            { key: 'offenders', label: 'Số đối tượng xử lý', value: 2480, unit: 'đối tượng' },
            { key: 'rehab', label: 'Người được cai nghiện', value: 4105, unit: 'người' },
            { key: 'campaign', label: 'Hoạt động tuyên truyền', value: 486, unit: 'hoạt động' },
            { key: 'school', label: 'Trường học được tuyên truyền', value: 214, unit: 'trường' },
            { key: 'hotline', label: 'Cuộc gọi qua đường dây nóng', value: 1180, unit: 'cuộc' },
        ]
    },
];

const SUPPORT_FACILITIES = [
    { id: 'sf-01', name: 'Điểm tư vấn hỗ trợ cai nghiện tự nguyện (đơn vị tham chiếu)', type: 'tu-van', district: 'Quận 1', address: 'Quận 1, Thành phố Hồ Chí Minh', phone: '028.0000.0101', hours: '07:30 - 16:30, thứ Hai - thứ Sáu', desc: 'Tư vấn kín, đánh giá ban đầu và kết nối dịch vụ điều trị.' },
    { id: 'sf-02', name: 'Cơ sở điều trị, cai nghiện (đơn vị tham chiếu)', type: 'co-so', district: 'Huyện Củ Chi', address: 'Huyện Củ Chi, Thành phố Hồ Chí Minh', phone: '028.0000.0102', hours: 'Tiếp nhận theo lịch hẹn', desc: 'Tiếp nhận, điều trị và phục hồi chức năng theo quy định.' },
    { id: 'sf-03', name: 'Tổ tư vấn cộng đồng phường (đơn vị tham chiếu)', type: 'cong-dong', district: 'Quận 1', address: 'Ủy ban nhân dân phường, Quận 1', phone: '028.0000.0103', hours: '08:00 - 17:00, thứ Hai - thứ Sáu', desc: 'Hỗ trợ tư vấn, kết nối gia đình và theo dõi người sau cai tại cộng đồng.' },
    { id: 'sf-04', name: 'Đường dây nóng hỗ trợ (số tham chiếu)', type: 'duong-day-nong', district: 'Toàn Thành phố', address: 'Trực 24/7', phone: '028.0000.0100', hours: '24/7', desc: 'Tiếp nhận thông tin cần hỗ trợ khẩn cấp, bảo mật thông tin người liên hệ.' },
];

/* =============================================================================
   NẠP DỮ LIỆU
   ============================================================================= */
function insert(db, table, row) {
    const keys = Object.keys(row);
    const cols = keys.join(', ');
    const marks = keys.map(() => '?').join(', ');
    const values = keys.map((k) => (row[k] === undefined ? null : row[k]));
    db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${marks})`).run(...values);
}

function count(db, table) {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
    return r ? r.c : 0;
}

const TABLES_CLEAR_ORDER = [
    'statistics_items', 'statistics_periods', 'support_facilities', 'public_events', 'public_agencies',
    'legal_documents', 'notifications', 'activity_logs', 'collaboration_requests', 'proposals',
    'report_documents', 'reports', 'events', 'task_documents', 'task_history', 'task_comments',
    'task_items', 'tasks', 'doc_versions', 'documents', 'submission_events', 'submissions',
    'banners', 'media', 'article_revisions', 'articles', 'categories',
    'login_attempts', 'sessions', 'users', 'role_permissions', 'permissions', 'roles', 'organizations',
    'settings',
];

function resetDatabase(db) {
    TABLES_CLEAR_ORDER.forEach((t) => {
        try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) { /* bảng chưa tồn tại */ }
    });
}

function insertOrganizations(db) {
    ORGANIZATIONS.forEach((o) => {
        insert(db, 'organizations', {
            id: o.id, code: o.code, name: o.name, short_name: o.short_name, type: o.type,
            parent_id: o.parent_id, address: o.address, phone: o.phone, email: o.email, website: o.website || null,
            head_name: o.head_name || null, description: o.description, status: o.status || 'active',
            sort_order: o.sort_order || 0, data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(), created_by: 'system',
        });
    });
}

function insertPermissions(db) {
    PERMISSIONS.forEach(([code, name, group]) => {
        insert(db, 'permissions', { code, name, group_code: group });
    });
}

/** Bổ sung quyền mới vào bảng permissions (không xoá quyền đã có). */
function syncPermissions(db) {
    const existing = new Set(db.prepare('SELECT code FROM permissions').all().map((r) => r.code));
    PERMISSIONS.forEach(([code, name, group]) => {
        if (!existing.has(code)) insert(db, 'permissions', { code, name, group_code: group });
    });
}

/** Bổ sung vai trò + gán quyền còn thiếu (không ghi đè quyền đã cấu hình thủ công). */
function syncRoles(db) {
    ROLES.forEach((r) => {
        const row = db.prepare('SELECT id FROM roles WHERE id = ?').get(r.id);
        if (!row) {
            insert(db, 'roles', {
                id: r.id, code: r.code, name: r.name, system_key: r.system_key, description: r.description,
                data_scope: r.data_scope, is_system: r.is_system, data_source: 'seed', is_seed_data: 1,
                environment: ENV, created_at: now(), updated_at: now(),
            });
        }
        const granted = new Set(db.prepare('SELECT permission_code FROM role_permissions WHERE role_id = ?')
            .all(r.id).map((x) => x.permission_code));
        Array.from(new Set(r.perms)).forEach((p) => {
            if (!granted.has(p)) insert(db, 'role_permissions', { role_id: r.id, permission_code: p });
        });
    });
}

function insertRoles(db) {
    ROLES.forEach((r) => {
        insert(db, 'roles', {
            id: r.id, code: r.code, name: r.name, system_key: r.system_key, description: r.description,
            data_scope: r.data_scope, is_system: r.is_system, data_source: 'seed', is_seed_data: 1,
            environment: ENV, created_at: now(), updated_at: now(),
        });
        Array.from(new Set(r.perms)).forEach((p) => {
            insert(db, 'role_permissions', { role_id: r.id, permission_code: p });
        });
    });
}

/** Trả về { [username]: password } để in một lần khi seed ở môi trường phát triển */
function insertUsers(db, { forceResetPassword } = {}) {
    const credentials = {};
    const existing = db.prepare('SELECT username FROM users').all().map((u) => u.username);
    const existingSet = new Set(existing);

    ACCOUNTS.forEach((a, idx) => {
        const envPassword = process.env[a.envVar];
        const alreadyExists = existingSet.has(a.username) && !forceResetPassword;
        if (alreadyExists) return;

        const password = envPassword || randomPassword(a.pwdPrefix);
        credentials[a.username] = password;
        const role = ROLES.find((r) => r.code === a.role);
        insert(db, 'users', {
            id: a.id, code: `NS-${String(idx + 1).padStart(3, '0')}`, username: a.username,
            password_hash: hashPassword(password), password_algo: 'scrypt', full_name: a.name,
            email: a.email, phone: null, position: a.position, system_key: a.system,
            role_id: role ? role.id : null, org_id: a.org, status: 'active',
            must_change_password: 0, failed_attempts: 0, locked_until: null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(), created_by: 'system',
        });
    });

    return credentials;
}

function insertCategories(db) {
    CATEGORIES.forEach((c) => {
        insert(db, 'categories', {
            id: c.id, name: c.name, slug: c.slug, parent_id: c.parent, description: c.description,
            group_key: c.group, status: 'active', sort_order: c.order,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(), created_by: 'system',
        });
    });
}

function insertArticles(db) {
    ARTICLES.forEach((a) => {
        insert(db, 'articles', {
            id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body,
            thumbnail: `../../assets/images/${a.thumb}.jpg`, category_id: a.cat, status: a.status,
            author_id: a.author, author_name: (ACCOUNTS.find((u) => u.id === a.author) || {}).name || '',
            source: a.source, tags: JSON.stringify(a.tags || []),
            seo_title: a.title.slice(0, 110), seo_description: a.excerpt.slice(0, 200),
            views: a.views || 0, submitted_at: a.submittedAt || null, submitted_by: a.submittedAt ? a.author : null,
            reviewed_at: a.reviewedAt || null, reviewed_by: a.reviewedAt ? 'u-cms-02' : null,
            review_note: a.reviewNote || null, published_at: a.publishedAt || null, archived_at: a.archivedAt || null,
            origin: 'cms', origin_ref: null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: a.createdAt, updated_at: a.publishedAt || a.reviewedAt || a.createdAt, created_by: a.author,
        });
    });
}

function insertMedia(db) {
    MEDIA.forEach((m) => {
        const created = d(-20, 9, 0);
        insert(db, 'media', {
            id: m.id, name: m.name, url: m.url, type: m.type, ext: m.ext,
            mime: m.ext === 'pdf' ? 'application/pdf' : `image/${m.ext}`, size: m.size, folder: m.folder,
            alt: m.alt, stored_path: null, data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: created, updated_at: created, created_by: 'u-cms-01',
        });
    });
    BANNERS.forEach((b) => {
        insert(db, 'banners', {
            id: b.id, title: b.title, image_url: b.image, link_url: b.link, position: b.position,
            status: 'active', sort_order: b.order, starts_at: null, ends_at: null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(), created_by: 'u-cms-01',
        });
    });
}

function insertDocuments(db) {
    DOCUMENTS.forEach((x) => {
        insert(db, 'documents', {
            id: x.id, code: x.code, name: x.name, type: x.type, org_id: x.org, uploader_id: x.uploader,
            issued_at: x.issuedAt, format: x.format, size: x.size, access: x.access, folder: x.folder,
            summary: x.summary, file_url: null, status: 'active',
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: x.issuedAt, updated_at: x.issuedAt, created_by: x.uploader,
        });
        insert(db, 'doc_versions', {
            id: `dv-${x.id}`, doc_id: x.id, version: 'v1.0', note: 'Tạo lập hồ sơ ban đầu',
            user_id: x.uploader, created_at: x.issuedAt,
        });
    });
}

function insertTasks(db) {
    TASKS.forEach((t) => {
        insert(db, 'tasks', {
            id: t.id, code: t.code, title: t.title, description: t.desc, owner_org_id: t.ownerOrg,
            assigner_id: t.assigner, assignee_ids: JSON.stringify(t.assignees || []),
            partner_org_ids: JSON.stringify(t.partners || []), start_date: t.start, due_date: t.due,
            priority: t.priority, status: t.status, progress: t.progress,
            source_type: t.id === 'task-09' ? 'submission' : 'internal',
            source_id: t.id === 'task-09' ? 'sub-01' : null,
            result_note: t.resultNote || null, completed_at: t.status === 'done' ? d(-11, 16, 0) : null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: t.created, updated_at: d(-1, 16, 20), created_by: t.assigner,
        });
        (t.docs || []).forEach((docId) => {
            insert(db, 'task_documents', { task_id: t.id, doc_id: docId });
        });
        insert(db, 'task_history', {
            id: `th-${t.id}-c`, task_id: t.id, user_id: t.assigner,
            user_name: (ACCOUNTS.find((u) => u.id === t.assigner) || {}).name || '',
            action: 'Tạo nhiệm vụ', detail: 'Giao nhiệm vụ và phân công cán bộ thực hiện.', created_at: t.created,
        });
        if (t.progress > 0) {
            insert(db, 'task_history', {
                id: `th-${t.id}-p`, task_id: t.id, user_id: (t.assignees || [])[0] || t.assigner,
                user_name: (ACCOUNTS.find((u) => u.id === (t.assignees || [])[0]) || {}).name || '',
                action: 'Cập nhật tiến độ', detail: `Tiến độ hiện tại ${t.progress}%.`, created_at: d(-1, 16, 20),
            });
        }
    });
    TASK_ITEMS.forEach((i, idx) => {
        insert(db, 'task_items', {
            id: i.id, task_id: i.task, title: i.title, done: i.done, assignee_id: i.assignee,
            due_date: i.due, sort_order: idx + 1,
        });
    });
    TASK_COMMENTS.forEach((c) => {
        insert(db, 'task_comments', {
            id: c.id, task_id: c.task, user_id: c.user,
            user_name: (ACCOUNTS.find((u) => u.id === c.user) || {}).name || '',
            body: c.body, created_at: c.at,
        });
    });
}

function insertEvents(db) {
    EVENTS.forEach((e) => {
        insert(db, 'events', {
            id: e.id, title: e.title, type: e.type, start_at: e.start, end_at: e.end, location: e.location,
            org_id: e.org, owner_id: e.owner, participants: JSON.stringify(e.participants || []),
            description: e.desc, status: 'active',
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: d(-3, 8, 0), updated_at: d(-3, 8, 0), created_by: e.owner,
        });
    });
}

function insertReports(db) {
    REPORTS.forEach((r) => {
        insert(db, 'reports', {
            id: r.id, code: r.code, name: r.name, type: r.type, org_id: r.org, author_id: r.author,
            period: r.period, status: r.status, content: r.content, results: r.results, issues: r.issues,
            proposals: r.proposals, task_id: r.task || null, submitted_at: r.status === 'draft' ? null : r.created,
            reviewed_at: ['approved', 'revision', 'rejected'].includes(r.status) ? d(-4, 10, 0) : null,
            reviewed_by: ['approved', 'revision', 'rejected'].includes(r.status) ? 'u-ws-02' : null,
            review_note: r.status === 'revision' ? 'Đề nghị bổ sung phụ lục số liệu chi tiết.' : null,
            public_summary: r.publicSummary || null, is_public: r.isPublic ? 1 : 0,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: r.created, updated_at: d(-1, 10, 0), created_by: r.author,
        });
        (r.docs || []).forEach((docId) => {
            insert(db, 'report_documents', { report_id: r.id, doc_id: docId });
        });
    });
}

function insertSubmissions(db) {
    SUBMISSIONS.forEach((s) => {
        insert(db, 'submissions', {
            id: s.id, ticket_code: s.ticket, form_type: s.form, status: s.status, priority: s.priority,
            subject: s.subject, full_name: s.name, email: s.email || null, phone: s.phone || null,
            address: null, is_anonymous: s.anonymous ? 1 : 0, content: s.content, attachment_name: null,
            assigned_org_id: s.org, assigned_user_id: null, task_id: s.task,
            response: s.response || null, public_response: s.publicResponse || null,
            is_public_result: s.isPublic ? 1 : 0, ip: '127.0.0.1', user_agent: 'seed',
            dedupe_hash: null, data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: s.created, updated_at: s.created, created_by: 'public',
        });
        (s.events || []).forEach((e, idx) => {
            const actor = e.user ? ACCOUNTS.find((u) => u.id === e.user) : null;
            insert(db, 'submission_events', {
                submission_id: s.id, action: e.action, from_status: e.from || null,
                to_status: e.to || null, note: e.note || '', user_id: e.user || null,
                user_name: actor ? actor.name : (e.user ? 'Công dân' : 'Công dân'), created_at: e.at,
            });
        });
    });
}

function insertProposals(db) {
    PROPOSALS.forEach((p) => {
        insert(db, 'proposals', {
            id: p.id, code: p.code, title: p.title, summary: p.summary, body: p.body, category_id: p.cat,
            org_id: p.org, author_id: p.author, task_id: p.task || null, status: p.status,
            review_note: null, reviewed_by: p.reviewedBy || null, reviewed_at: p.reviewedAt || null,
            article_id: p.articleId || null, published_at: p.publishedAt || null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: p.created, updated_at: p.publishedAt || p.reviewedAt || p.created, created_by: p.author,
        });
    });
}

function insertCollaborations(db) {
    COLLABORATIONS.forEach((c) => {
        insert(db, 'collaboration_requests', {
            id: c.id, code: c.code, title: c.title, description: c.desc, direction: c.direction,
            ref_type: c.refType, ref_id: c.refId, from_user_id: c.from, to_org_id: c.org, status: c.status,
            due_date: null, task_id: c.task || null, completed_at: c.completedAt || null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: c.created, updated_at: c.created, created_by: c.from,
        });
    });
}

function insertNotifications(db) {
    NOTIFICATIONS.forEach((n) => {
        insert(db, 'notifications', {
            id: n.id, system_key: n.system, type: n.type, title: n.title, body: n.body, href: n.href,
            to_user_id: null, audience: 'all', is_read: 0, created_at: n.at,
        });
    });
}

function insertLegal(db) {
    LEGAL_DOCS.forEach((l) => {
        insert(db, 'legal_documents', {
            id: l.id, code: l.code, title: l.title, doc_number: l.number, doc_type: l.type,
            issued_at: l.issuedAt, effective_at: l.effectiveAt, issuer: l.issuer, summary: l.summary,
            content: `<p>${l.summary}</p><p>Toàn văn văn bản được đăng tải tại thư viện văn bản của Cổng thông tin khi có tệp đính kèm chính thức.</p>`,
            file_url: null, data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(), created_by: 'system',
        });
    });

    PUBLIC_AGENCIES.forEach((a) => {
        insert(db, 'public_agencies', {
            id: a.id, org_id: a.org, name: a.name, short_name: a.short_name, role_type: a.role,
            address: a.address, phone: a.phone, email: a.email, website: null, description: a.desc,
            sort_order: a.order, status: 'active', data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(),
        });
    });

    PUBLIC_EVENTS.forEach((e) => {
        insert(db, 'public_events', {
            id: e.id, title: e.title, category: e.category, start_at: e.start, end_at: e.end,
            location: e.location, organizer: e.organizer, summary: e.summary, content: e.content,
            image_url: e.image, status: e.status, data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(),
        });
    });

    STAT_PERIODS.forEach((p) => {
        insert(db, 'statistics_periods', {
            id: p.id, period_key: p.key, label: p.label, scope: 'Thành phố Hồ Chí Minh', note: p.note,
            source_type: 'seed', is_seed_data: 1, data_source: 'seed', environment: ENV,
            created_at: now(), updated_at: now(),
        });
        p.items.forEach((it, idx) => {
            insert(db, 'statistics_items', {
                id: `${p.id}-${it.key}`, period_id: p.id, metric_key: it.key, label: it.label,
                value: it.value, unit: it.unit, sort_order: idx + 1,
            });
        });
    });

    SUPPORT_FACILITIES.forEach((f) => {
        insert(db, 'support_facilities', {
            id: f.id, name: f.name, type: f.type, district: f.district, address: f.address,
            phone: f.phone, hours: f.hours, description: f.desc, status: 'active',
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(),
        });
    });
}

function seedAll({ reset = false, forceResetPassword = false, withDemo = false } = {}) {
    const db = getDb();
    let credentials = {};

    db.exec('BEGIN IMMEDIATE');
    try {
        if (reset) resetDatabase(db);

        /* ---- Phần hệ thống: bắt buộc, không phải nội dung hiển thị ---- */
        if (!count(db, 'organizations')) insertOrganizations(db);
        /*
         * Quyền & vai trò được đối chiếu lại mỗi lần chạy (idempotent) để bản nâng cấp
         * bổ sung quyền mới vẫn có hiệu lực mà không cần xoá dữ liệu.
         */
        syncPermissions(db);
        syncRoles(db);
        credentials = insertUsers(db, { forceResetPassword });
        if (!count(db, 'categories')) insertCategories(db);

        /*
         * ---- Nội dung mẫu: mặc định KHÔNG nạp ----
         * Chỉ nạp khi gọi rõ --with-demo (dùng cho môi trường thử nghiệm),
         * để dữ liệu hiển thị trên Cổng thông tin hoàn toàn đến từ CMS.
         */
        if (withDemo) {
            if (!count(db, 'categories')) insertCategories(db);
            if (!count(db, 'articles')) insertArticles(db);
            if (!count(db, 'media')) insertMedia(db);
            if (!count(db, 'documents')) insertDocuments(db);
            if (!count(db, 'tasks')) insertTasks(db);
            if (!count(db, 'events')) insertEvents(db);
            if (!count(db, 'reports')) insertReports(db);
            if (!count(db, 'submissions')) insertSubmissions(db);
            if (!count(db, 'proposals')) insertProposals(db);
            if (!count(db, 'collaboration_requests')) insertCollaborations(db);
            if (!count(db, 'notifications')) insertNotifications(db);
            if (!count(db, 'legal_documents')) insertLegal(db);
        }
        if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('site')) {
            insert(db, 'settings', {
                key: 'site',
                value: JSON.stringify({
                    name: 'Cổng thông tin điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh',
                    nameEn: 'HO CHI MINH CITY DRUG PREVENTION AND CONTROL PORTAL',
                    version: '1.1.0',
                    contactEmail: 'hcmcdpcp@gmail.com',
                    hotline: '028.0000.0100',
                }),
                updated_at: now(), updated_by: 'system',
            });
        }
        db.exec('COMMIT');
    } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    }

    return credentials;
}

module.exports = {
    BATCH, ENV, ACCOUNTS, seedAll, seedRequired: true,
    summary: (db) => ({
        organizations: count(db, 'organizations'),
        users: count(db, 'users'),
        articles: count(db, 'articles'),
        categories: count(db, 'categories'),
        tasks: count(db, 'tasks'),
        reports: count(db, 'reports'),
        submissions: count(db, 'submissions'),
        proposals: count(db, 'proposals'),
    }),
};

/* ------------------------------- CLI ---------------------------------------- */
if (require.main === module) {
    const args = new Set(process.argv.slice(2));
    const reset = args.has('--reset');
    const withDemo = args.has('--with-demo');
    if (reset && ENV === 'production' && !args.has('--force')) {
        console.error('[seed] Từ chối chạy --reset ở môi trường production (thêm --force nếu thực sự cần).');
        process.exit(1);
    }
    try {
        const started = Date.now();
        const creds = seedAll({ reset, forceResetPassword: args.has('--reset-password'), withDemo });
        const db = getDb();
        console.log('═══════════════════════════════');
        console.log('  NẠP DỮ LIỆU KHỞI TẠO HOÀN TẤT  (lô ' + BATCH + ', môi trường ' + ENV + ')');
        console.log('═══════════════════════════════');
        console.log(db.prepare("SELECT 'Tổ chức: ' || COUNT(*) AS s FROM organizations").get().s);
        console.log(db.prepare("SELECT 'Bài viết: ' || COUNT(*) AS s FROM articles").get().s);
        console.log(db.prepare("SELECT 'Nhiệm vụ: ' || COUNT(*) AS s FROM tasks").get().s);
        console.log(db.prepare("SELECT 'Tài khoản: ' || COUNT(*) AS s FROM users WHERE password_algo = 'scrypt'").get().s);
        if (Object.keys(creds).length) {
            // Lưu bàn giao vào tệp riêng, KHÔNG nằm trong repository công khai (.gitignore)
            const handoverDir = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(handoverDir)) fs.mkdirSync(handoverDir, { recursive: true });
            const handoverFile = path.join(handoverDir, 'credentials.local.txt');
            const lines = [
                'CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH',
                'Tệp bàn giao tài khoản khởi tạo – KHÔNG commit, KHÔNG chia sẻ công khai.',
                `Thời điểm tạo: ${new Date().toISOString()}`,
                `Môi trường: ${ENV}`, '',
                ...Object.entries(creds).map(([u, p]) => `${p} ${u}`),
                '',
                'Yêu cầu: đổi mật khẩu ngay sau lần đăng nhập đầu tiên tại mục Thông tin tài khoản.',
            ];
            fs.writeFileSync(handoverFile, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
            console.log('───────────────────────────────────────────────────────────────');
            console.log('  MẬT KHẨU KHỞI TẠO (đã ghi vào server/data/credentials.local.txt)');
            console.log('───────────────────────────────────────────────────────────────');
            Object.entries(creds).forEach(([u, p]) => console.log(`  ${u.padEnd(16)} ${p}`));
            console.log('───────────────────────────────────────────────────────────────');
        }
        console.log(`  Thời gian: ${Date.now() - started} ms`);
    } catch (err) {
        console.error('[seed] Lỗi:', err.message);
        process.exitCode = 1;
    }
}
