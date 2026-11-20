/**
 * seed.js - Khởi tạo tài khoản và cấu hình hệ thống tối thiểu.
 *
 * Chạy: node server/db/seed.js [--reset] [--force]
 *   --reset : xoá dữ liệu database rồi tạo lại quyền, vai trò, tài khoản và cấu hình.
 *             Chỉ dùng ở development/staging; production cần thêm --force.
 *
 * Mặc định chỉ bổ sung quyền, vai trò, tài khoản và cấu hình còn thiếu.
 * Dữ liệu demo được quản lý riêng bởi server/db/content-types.js.
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
    { id: 'u-cms-01', code: 'NS-001', username: 'cms.nguyenvandat', name: 'Nguyễn Văn Đạt', role: 'cms_admin', system: 'cms', org: 'org-01', position: 'Quản trị viên CMS', email: 'cms.nguyenvandat@example.gov.vn', envVar: 'SEED_PASSWORD_CMS_ADMIN', pwdPrefix: 'Cms' },
    { id: 'u-ws-01', code: 'NS-006', username: 'ws.nguyenvandat', name: 'Nguyễn Văn Đạt', role: 'ws_admin', system: 'workspace', org: 'org-01', position: 'Quản trị viên Workspace', email: 'ws.nguyenvandat@example.gov.vn', envVar: 'SEED_PASSWORD_WS_ADMIN', pwdPrefix: 'Ws' },
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
        perms: [...CMS_PERMS],
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

function insertUsers(db, { forceResetPassword } = {}) {
    const credentials = {};
    const existing = db.prepare('SELECT username FROM users').all().map((u) => u.username);
    const existingSet = new Set(existing);

    ACCOUNTS.forEach((a) => {
        const envPassword = process.env[a.envVar];
        const alreadyExists = existingSet.has(a.username) && !forceResetPassword;
        if (alreadyExists) return;

        const password = envPassword || randomPassword(a.pwdPrefix);
        credentials[a.username] = password;
        const role = ROLES.find((r) => r.code === a.role);
        insert(db, 'users', {
            id: a.id, code: a.code, username: a.username,
            password_hash: hashPassword(password), password_algo: 'scrypt', full_name: a.name,
            email: a.email, phone: null, position: a.position, system_key: a.system,
            role_id: role ? role.id : null,
            org_id: db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(a.org) ? a.org : null,
            status: 'active',
            must_change_password: 0, failed_attempts: 0, locked_until: null,
            data_source: 'seed', is_seed_data: 1, environment: ENV,
            created_at: now(), updated_at: now(), created_by: 'system',
        });
    });

    return credentials;
}

function seedAll({ reset = false, forceResetPassword = false } = {}) {
    const db = getDb();
    let credentials = {};

    db.exec('BEGIN IMMEDIATE');
    try {
        if (reset) resetDatabase(db);

        /* ---- Phần hệ thống: bắt buộc, không phải nội dung hiển thị ---- */
        /*
         * Quyền & vai trò được đối chiếu lại mỗi lần chạy (idempotent) để bản nâng cấp
         * bổ sung quyền mới vẫn có hiệu lực mà không cần xoá dữ liệu.
         */
        syncPermissions(db);
        syncRoles(db);
        credentials = insertUsers(db, { forceResetPassword });
        if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('site')) {
            insert(db, 'settings', {
                key: 'site',
                value: JSON.stringify({
                    name: 'Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh',
                    nameEn: 'HO CHI MINH CITY DRUG PREVENTION AND CONTROL E-PORTAL',
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
    if (args.has('--with-demo')) {
        console.error('[seed] --with-demo đã bị gỡ bỏ; dùng npm run demo:seed để nạp dữ liệu thử nghiệm.');
        process.exit(1);
    }
    const reset = args.has('--reset');
    if (reset && ENV === 'production' && !args.has('--force')) {
        console.error('[seed] Từ chối chạy --reset ở môi trường production (thêm --force nếu thực sự cần).');
        process.exit(1);
    }
    try {
        const started = Date.now();
        const creds = seedAll({ reset, forceResetPassword: args.has('--reset-password') });
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
                'CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH',
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
