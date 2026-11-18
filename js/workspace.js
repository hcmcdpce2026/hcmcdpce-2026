/**
 * workspace.js - Khu vực làm việc nội bộ (Workspace)
 * Cổng thông tin điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 * --------------------------------------------------------------------------
 * 1  CONFIG / RBAC   – cấu hình, quyền, vai trò, phạm vi dữ liệu
 * 2  util            – tiện ích thuần
 * 3  SEED            – dữ liệu MÔ PHỎNG (gắn cờ demo)
 * 4  Store           – lớp dữ liệu dùng chung + ghi nhật ký
 * 5  ui              – component dùng chung
 * 6  PAGES           – danh mục trang (sidebar, breadcrumb, tiêu đề)
 * 7  Shell           – layout, guard phiên, sidebar, header
 * 8  Pages           – bộ điều khiển từng trang
 * 9  init            – khởi tạo theo trang hiện tại
 *
 * BẢO MẬT: bản demo chạy hoàn toàn trên trình duyệt. localStorage không phải
 * cơ chế xác thực/phân quyền. Xem README (mục Workspace).
 */
(function () {
    'use strict';

    if (window.Workspace) return;

    /* =========================================================================
       1. CẤU HÌNH
       ========================================================================= */

    const CONFIG = {
        version: '1.1.0',
        storageKey: 'hcm-workspace-state-v1',
        sessionKey: 'hcm-workspace-session',
        preferenceKey: 'hcm-workspace-prefs',
        loginFile: 'login.html',
        homeFile: 'dashboard.html',
        maxUpload: null
    };

    const PERMISSIONS = {
        'data.view': 'Xem dữ liệu',
        'doc.manage': 'Tạo dữ liệu',
        'task.edit': 'Chỉnh sửa dữ liệu',
        'doc.manage': 'Xóa dữ liệu',
        'task.assign': 'Phân công nhiệm vụ',
        'task.approve': 'Duyệt / xác nhận nhiệm vụ',
        'org.manage': 'Quản lý tổ chức',
        'user.manage': 'Quản lý người dùng',
        'report.create': 'Quản lý báo cáo',
        'report.approve': 'Duyệt báo cáo',
        'doc.manage': 'Quản lý tài liệu',
        'calendar.manage': 'Quản lý lịch công tác',
        'log.view': 'Xem nhật ký',
        'role.manage': 'Quản lý phân quyền',
        'calendar.manage': 'Quản lý thông báo'
    };

    const PERMISSION_GROUPS = [
        { id: 'data', label: 'Dữ liệu chung', perms: ['data.view', 'doc.manage', 'task.edit', 'doc.manage'] },
        { id: 'task', label: 'Nhiệm vụ', perms: ['task.assign', 'task.approve'] },
        { id: 'org', label: 'Tổ chức & người dùng', perms: ['org.manage', 'user.manage', 'role.manage'] },
        { id: 'report', label: 'Báo cáo & tài liệu', perms: ['report.create', 'report.approve', 'doc.manage'] },
        { id: 'system', label: 'Lịch & hệ thống', perms: ['calendar.manage', 'calendar.manage', 'log.view'] }
    ];

    const DATA_SCOPES = {
        own: 'Chỉ dữ liệu được giao',
        unit: 'Dữ liệu của đơn vị',
        all: 'Toàn bộ dữ liệu'
    };

    const ROLE_SEED = [
        {
            id: 'r-admin', name: 'Quản trị hệ thống', scope: 'all', system: true,
            desc: 'Toàn quyền cấu hình, phân quyền và xử lý dữ liệu',
            perms: Object.keys(PERMISSIONS)
        },
        {
            id: 'r-lead', name: 'Lãnh đạo', scope: 'all',
            desc: 'Theo dõi toàn bộ hoạt động, duyệt báo cáo và xác nhận nhiệm vụ',
            perms: ['data.view', 'task.assign', 'task.approve', 'report.approve', 'log.view']
        },
        {
            id: 'r-unit', name: 'Quản lý đơn vị', scope: 'unit',
            desc: 'Điều hành công việc trong phạm vi đơn vị mình',
            perms: ['data.view', 'doc.manage', 'task.edit', 'task.assign', 'task.approve',
                'report.create', 'doc.manage', 'calendar.manage', 'log.view']
        },
        {
            id: 'r-expert', name: 'Chuyên viên', scope: 'unit',
            desc: 'Thực hiện nhiệm vụ, cập nhật tiến độ và xử lý báo cáo',
            perms: ['data.view', 'doc.manage', 'task.edit', 'report.create', 'doc.manage', 'calendar.manage']
        },
        {
            id: 'r-staff', name: 'Cán bộ phụ trách', scope: 'own',
            desc: 'Cập nhật nhiệm vụ được giao, gửi báo cáo, quản lý tài liệu được cấp',
            perms: ['data.view', 'doc.manage', 'report.create', 'doc.manage']
        },
        {
            id: 'r-viewer', name: 'Người xem báo cáo', scope: 'unit',
            desc: 'Chỉ tra cứu báo cáo và số liệu, không sửa dữ liệu',
            perms: ['data.view']
        }
    ];

    /* Tài khoản CMS dùng riêng cho pages/cms (chặn nhầm phân hệ khi đăng nhập) */
    const CMS_ACCOUNTS = ['cms.nguyenvandat'];

    const LABELS = {
        taskStatus: {
            new: 'Chưa bắt đầu',
            doing: 'Đang thực hiện',
            review: 'Chờ xác nhận',
            done: 'Hoàn thành',
            overdue: 'Quá hạn',
            paused: 'Tạm dừng',
            cancelled: 'Đã hủy'
        },
        priority: { low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp' },
        reportStatus: {
            draft: 'Bản nháp',
            ready: 'Chờ gửi',
            sent: 'Đã gửi',
            pending: 'Chờ duyệt',
            approved: 'Đã duyệt',
            revision: 'Yêu cầu bổ sung',
            rejected: 'Từ chối'
        },
        reportType: {
            periodic: 'Báo cáo định kỳ',
            monthly: 'Báo cáo tháng',
            quarterly: 'Báo cáo quý',
            yearly: 'Báo cáo năm',
            topic: 'Báo cáo chuyên đề',
            urgent: 'Báo cáo đột xuất',
            task: 'Báo cáo kết quả thực hiện nhiệm vụ'
        },
        docType: {
            directive: 'Văn bản chỉ đạo',
            law: 'Văn bản pháp luật',
            plan: 'Kế hoạch công tác',
            report: 'Báo cáo',
            minutes: 'Biên bản họp',
            training: 'Tài liệu tập huấn',
            propaganda: 'Tài liệu tuyên truyền',
            professional: 'Tài liệu nghiệp vụ',
            other: 'Tài liệu khác'
        },
        docAccess: { internal: 'Nội bộ đơn vị', public: 'Được chia sẻ', restricted: 'Hạn chế' },
        eventType: {
            meeting: 'Họp',
            conference: 'Hội nghị',
            workshop: 'Hội thảo',
            training: 'Tập huấn',
            inspection: 'Kiểm tra',
            joint: 'Kiểm tra liên ngành',
            propaganda: 'Hoạt động tuyên truyền',
            coordination: 'Hoạt động phối hợp',
            other: 'Lịch công tác khác'
        },
        orgType: {
            state: 'Cơ quan nhà nước',
            unit: 'Đơn vị nghiệp vụ',
            ward: 'Ủy ban nhân dân cấp cơ sở',
            association: 'Tổ chức, hội, đoàn thể',
            partner: 'Đơn vị phối hợp'
        },
        orgStatus: { active: 'Đang hoạt động', paused: 'Tạm dừng', archived: 'Đã lưu trữ' },
        userStatus: { active: 'Đang hoạt động', locked: 'Đã khóa', pending: 'Chờ kích hoạt' },
        noticeType: {
            task_new: 'Giao nhiệm vụ mới',
            task_change: 'Thay đổi nhiệm vụ',
            task_due: 'Sắp đến hạn',
            task_overdue: 'Quá hạn',
            report_sent: 'Báo cáo được gửi',
            report_approved: 'Báo cáo được duyệt',
            report_revision: 'Báo cáo yêu cầu bổ sung',
            meeting: 'Lịch họp mới',
            calendar_change: 'Thay đổi lịch công tác',
            system: 'Thông báo hệ thống',
            integration: 'Yêu cầu phối hợp từ CMS'
        }
    };

    const ACTION_LABEL = {
        'auth.login': 'Đăng nhập',
        'auth.logout': 'Đăng xuất',
        'task.create': 'Tạo nhiệm vụ',
        'task.progress': 'Cập nhật tiến độ',
        'task.status': 'Thay đổi trạng thái nhiệm vụ',
        'task.update': 'Cập nhật nhiệm vụ',
        'task.delete': 'Xóa nhiệm vụ',
        'report.create': 'Tạo báo cáo',
        'report.update': 'Cập nhật báo cáo',
        'report.send': 'Gửi báo cáo',
        'report.approve': 'Duyệt báo cáo',
        'report.reject': 'Từ chối báo cáo',
        'report.revision': 'Yêu cầu bổ sung',
        'org.create': 'Thêm đơn vị',
        'org.update': 'Cập nhật đơn vị',
        'org.delete': 'Xóa đơn vị',
        'user.create': 'Tạo người dùng',
        'user.update': 'Cập nhật người dùng',
        'user.lock': 'Khóa tài khoản',
        'user.activate': 'Kích hoạt tài khoản',
        'user.role': 'Gán vai trò',
        'perm.create': 'Tạo vai trò',
        'perm.update': 'Thay đổi phân quyền',
        'perm.delete': 'Xóa vai trò',
        'doc.upload': 'Tải lên tài liệu',
        'doc.download': 'Tải xuống tài liệu',
        'doc.update': 'Cập nhật tài liệu',
        'doc.delete': 'Xóa tài liệu',
        'doc.version': 'Tạo phiên bản tài liệu',
        'doc.share': 'Chia sẻ tài liệu',
        'calendar.create': 'Tạo sự kiện',
        'calendar.update': 'Cập nhật sự kiện',
        'calendar.delete': 'Xóa sự kiện',
        'integration.update': 'Xử lý phối hợp'
    };

    const ACTION_ICON = {
        'auth.login': 'fa-right-to-bracket',
        'auth.logout': 'fa-right-from-bracket',
        'task.create': 'fa-plus',
        'task.progress': 'fa-chart-line',
        'task.status': 'fa-arrows-rotate',
        'task.delete': 'fa-trash',
        'report.create': 'fa-file-circle-plus',
        'report.approve': 'fa-circle-check',
        'report.reject': 'fa-xmark',
        'org.update': 'fa-building',
        'user.create': 'fa-user-plus',
        'user.lock': 'fa-lock',
        'perm.update': 'fa-shield-halved',
        'doc.upload': 'fa-upload',
        'doc.download': 'fa-download',
        'calendar.create': 'fa-calendar-plus'
    };

    /* =========================================================================
       2. TIỆN ÍCH THUẦN
       ========================================================================= */

    const util = (function () {
        const pad = (n) => String(n).padStart(2, '0');

        const normalize = (text) => String(text == null ? '' : text)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();

        const escape = (value) => String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const stripTags = (html) => String(html || '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const parseDate = (value) => {
            if (value instanceof Date) return isNaN(value) ? null : value;
            if (!value) return null;
            const s = String(value);
            let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
            m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
            const d = new Date(s);
            return isNaN(d) ? null : d;
        };

        const formatDate = (value) => {
            const d = parseDate(value);
            return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
        };

        const formatDateTime = (value) => {
            const d = parseDate(value);
            return d ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
        };

        const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        const today = () => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const addDays = (date, days) => {
            const d = new Date(date.getTime());
            d.setDate(d.getDate() + days);
            return d;
        };

        const timeAgo = (value) => {
            const d = parseDate(value);
            if (!d) return '—';
            const diff = Date.now() - d.getTime();
            const min = Math.round(diff / 60000);
            if (min < 1) return 'Vừa xong';
            if (min < 60) return `${min} phút trước`;
            const hours = Math.round(min / 60);
            if (hours < 24) return `${hours} giờ trước`;
            const days = Math.round(hours / 24);
            if (days < 30) return `${days} ngày trước`;
            return formatDate(d);
        };

        const daysLeft = (value) => {
            const d = parseDate(value);
            if (!d) return null;
            d.setHours(0, 0, 0, 0);
            return Math.round((d.getTime() - today().getTime()) / 86400000);
        };

        const debounce = (fn, wait) => {
            let timer = null;
            return function () {
                const args = arguments;
                const ctx = this;
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(ctx, args), wait || 220);
            };
        };

        const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

        const initials = (name) => String(name || '?')
            .trim()
            .split(/\s+/)
            .slice(-2)
            .map((w) => w.charAt(0).toUpperCase())
            .join('');

        const fileSize = (bytes) => {
            const n = Number(bytes) || 0;
            if (n < 1024) return `${n} B`;
            if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
            return `${(n / 1048576).toFixed(1)} MB`;
        };

        const countWords = (html) => {
            const text = stripTags(html);
            return text ? text.split(/\s+/).length : 0;
        };

        const matchText = (haystack, needle) => {
            if (!needle) return true;
            const n = normalize(needle);
            if (!n) return true;
            return Array.isArray(haystack)
                ? haystack.some((h) => normalize(h).indexOf(n) !== -1)
                : normalize(haystack).indexOf(n) !== -1;
        };

        const isDateKey = (key) => /(At|date|Date)$/.test(key);

        const sortBy = (list, key, dir) => {
            const factor = dir === 'asc' ? 1 : -1;
            const value = (item) => {
                const v = item[key];
                if (isDateKey(key)) {
                    const d = parseDate(v);
                    return d ? d.getTime() : 0;
                }
                if (typeof v === 'number') return v;
                return normalize(v);
            };
            return list.slice().sort((a, b) => {
                const va = value(a);
                const vb = value(b);
                if (va === vb) return 0;
                return va > vb ? factor : -factor;
            });
        };

        return {
            pad, normalize, escape, stripTags, parseDate, formatDate, formatDateTime, isoDate,
            today, addDays, timeAgo, daysLeft, debounce, uid, initials, fileSize, countWords,
            matchText, sortBy
        };
    })();

    /* =========================================================================
       3. DỮ LIỆU MÔ PHỎNG (SEED)
       Toàn bộ dữ liệu dưới đây là MINH HỌA cho môi trường demo: tên riêng,
       email (*.local), số điện thoại (09xx.xxx.xxx) đều là dữ liệu mẫu.
       ========================================================================= */


/* =========================================================================
   4. STORE – LỚP DỮ LIỆU KẾT NỐI API MÁY CHỦ
   Dữ liệu được nạp từ REST API rồi giữ trong bộ nhớ để các hàm đọc giữ nguyên
   chữ ký đồng bộ (tasks(), organizations(), reports()...).
   Mọi thao tác ghi gọi API; máy chủ kiểm tra quyền, phạm vi dữ liệu và ghi log.
   ========================================================================= */

const Store = (function () {
    const api = window.PortalAPI;

    const cache = {
        tasks: [],
        organizations: [],
        users: [],
        roles: [],
        permissions: [],
        events: [],
        documents: [],
        reports: [],
        notifications: [],
        logs: [],
        proposals: [],
        collaborations: [],
        stats: null,
        loaded: false,
    };

    let session = null;
    let prefs = {};

    /* ---------- tiện ích ---------- */

    const fetchAll = async () => {
        const jobs = [
            ['tasks', '/api/workspace/tasks'],
            ['organizations', '/api/shared/organizations'],
            ['users', '/api/workspace/users'],
            ['roles', '/api/workspace/roles'],
            ['permissions', '/api/workspace/permissions'],
            ['events', '/api/workspace/events'],
            ['documents', '/api/workspace/documents'],
            ['reports', '/api/workspace/reports'],
            ['notifications', '/api/shared/notifications'],
            ['logs', '/api/workspace/logs?limit=200'],
            ['proposals', '/api/workspace/proposals'],
            ['collaborations', '/api/workspace/collaborations'],
            ['stats', '/api/workspace/stats'],
        ];
        const results = await Promise.all(jobs.map(([, url]) =>
            api.get(url).catch(() => (url.includes('logs') || url.includes('roles') || url.includes('permissions') ? [] : null))));

        jobs.forEach(([key], i) => {
            const value = results[i];
            cache[key] = Array.isArray(value) ? value : (value || (typeof cache[key] === 'object' && !Array.isArray(cache[key]) ? cache[key] : []));
            if (key === 'tasks' && !Array.isArray(value)) cache.tasks = [];
        });
        cache.loaded = true;
        return cache;
    };

    const load = async () => fetchAll();

    /* ---------- phiên ---------- */

    const loadSession = async () => {
        session = await api.auth.me();
        return session;
    };

    const getSession = () => (session && session.user ? { userId: session.user.id, username: session.user.username } : null);
    const currentUser = () => {
        const u = session && session.user;
        if (!u) return null;
        const org = u.org || {};
        return {
            id: u.id,
            code: u.code,
            name: u.name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            position: u.position,
            orgId: u.orgId,
            orgName: u.orgName,
            roleId: u.roleId,
            roleCode: u.roleCode,
            roleName: u.roleName,
            permissions: u.permissions || [],
            mustChangePassword: !!u.mustChangePassword,
        };
    };

    /** Đăng nhập thật tại máy chủ */
    const login = async (username, password) => {
        try {
            await api.auth.login(String(username || '').trim(), password, 'workspace');
            await loadSession();
            return { ok: true, user: currentUser() };
        } catch (err) {
            if (err.isForbidden) {
                return { ok: false, message: err.message };
            }
            return { ok: false, message: err.message || 'Đăng nhập không thành công.' };
        }
    };

    const logout = async () => {
        try { await api.auth.logout(); } catch (e) { /* bỏ qua */ }
        session = null;
        cache.loaded = false;
    };

    /* ---------- quyền & phạm vi ---------- */

    const can = (perm) => {
        const u = currentUser();
        return !!u && (u.permissions || []).indexOf(perm) !== -1;
    };

    const scopeOf = () => (session && session.user ? session.user.dataScope : 'own');

    const inScope = (record, ownerField) => {
        const u = currentUser();
        if (!u || !record) return false;
        const scope = scopeOf();
        if (scope === 'all') return true;
        const owner = record[ownerField || 'orgId'] || record.ownerOrgId;
        if (scope === 'unit') return owner === u.orgId;
        if (Array.isArray(record.assigneeIds) && record.assigneeIds.indexOf(u.id) !== -1) return true;
        if (record.authorId === u.id || record.uploaderId === u.id) return true;
        return owner === u.orgId;
    };

    /* ---------- truy vấn ---------- */

    const all = () => cache;
    const tasks = () => cache.tasks.slice();
    const organizations = () => cache.organizations.slice();
    const users = () => cache.users.slice();
    const roles = () => cache.roles.slice();
    const permissions = () => cache.permissions.slice();
    const events = () => cache.events.slice();
    const documents = () => cache.documents.slice();
    const reports = () => cache.reports.slice();
    const notifications = () => cache.notifications.slice();
    const logs = () => cache.logs.slice();
    const proposals = () => cache.proposals.slice();
    const collaborations = () => cache.collaborations.slice();
    const integrations = () => cache.collaborations.slice();
    const stats = () => cache.stats || {};

    const taskById = (id) => cache.tasks.find((t) => t.id === id) || null;
    const orgById = (id) => cache.organizations.find((o) => o.id === id) || null;
    const userById = (id) => cache.users.find((u) => u.id === id) || null;
    const docById = (id) => cache.documents.find((d) => d.id === id) || null;
    const reportById = (id) => cache.reports.find((r) => r.id === id) || null;
    const eventById = (id) => cache.events.find((e) => e.id === id) || null;
    const roleById = (id) => cache.roles.find((r) => r.id === id) || null;

    const orgName = (id) => (orgById(id) || {}).name || '—';
    const userName = (id) => (userById(id) || {}).name || '—';
    const roleOf = () => (session ? roleById(session.user.roleId) : null);

    /* ---------- ghi: nhiệm vụ ---------- */

    const refreshTasks = async () => { cache.tasks = await api.get('/api/workspace/tasks'); return cache.tasks; };

    const saveTask = async (payload) => {
        let saved;
        if (payload.id) saved = await api.put(`/api/workspace/tasks/${encodeURIComponent(payload.id)}`, payload);
        else saved = await api.post('/api/workspace/tasks', payload);
        await refreshTasks();
        await refreshStats();
        return saved;
    };

    const deleteTask = async (id) => {
        // Không xóa vĩnh viễn: chuyển nhiệm vụ sang trạng thái hủy để giữ lịch sử
        await api.post(`/api/workspace/tasks/${encodeURIComponent(id)}/cancel`, { note: 'Hủy nhiệm vụ' });
        await refreshTasks();
        return true;
    };

    const setTaskProgress = async (id, progress, note) => {
        const saved = await api.post(`/api/workspace/tasks/${encodeURIComponent(id)}/progress`, { progress, note });
        await refreshTasks();
        return saved;
    };

    const setTaskStatus = async (id, status, detail) => {
        const actionMap = {
            done: 'complete', review: 'submit', doing: 'resume', new: 'resume',
            paused: 'pause', cancelled: 'cancel',
        };
        const action = actionMap[status] || 'resume';
        const saved = await api.post(`/api/workspace/tasks/${encodeURIComponent(id)}/${action}`, { note: detail, resultNote: detail });
        await refreshTasks();
        await refreshStats();
        return saved;
    };

    const addTaskItem = async (taskId, payload) => {
        const saved = await api.post(`/api/workspace/tasks/${encodeURIComponent(taskId)}/items`, payload);
        await refreshTasks();
        return saved;
    };

    const setTaskItems = async (taskId, items) => {
        await api.put(`/api/workspace/tasks/${encodeURIComponent(taskId)}/items`, { items });
        await refreshTasks();
        return items;
    };

    const addTaskComment = async (taskId, body) => {
        const saved = await api.post(`/api/workspace/tasks/${encodeURIComponent(taskId)}/comments`, { body });
        return saved;
    };

    const addTaskAttachment = async () => {
        throw new Error('Vui lòng đính kèm tài liệu từ thư viện tài liệu của nhiệm vụ.');
    };

    /* ---------- ghi: đơn vị ---------- */

    const refreshOrgs = async () => { cache.organizations = await api.get('/api/shared/organizations'); return cache.organizations; };

    const saveOrganization = async (payload) => {
        const saved = payload.id
            ? await api.put(`/api/workspace/organizations/${encodeURIComponent(payload.id)}`, payload)
            : await api.post('/api/workspace/organizations', payload);
        await refreshOrgs();
        return saved;
    };

    const deleteOrganization = async (id) => {
        try {
            await api.del(`/api/workspace/organizations/${encodeURIComponent(id)}`);
            await refreshOrgs();
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    /* ---------- ghi: người dùng & vai trò ---------- */

    const refreshUsers = async () => { cache.users = await api.get('/api/workspace/users'); return cache.users; };

    const saveUser = async (payload) => {
        try {
            if (payload.id) await api.put(`/api/workspace/users/${encodeURIComponent(payload.id)}`, payload);
            else await api.post('/api/workspace/users', payload);
            await refreshUsers();
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    const setUserStatus = async (id, status) => {
        try {
            await api.put(`/api/workspace/users/${encodeURIComponent(id)}`, { status });
            await refreshUsers();
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    const resetUserPassword = async (id, password) => {
        try {
            await api.post(`/api/workspace/users/${encodeURIComponent(id)}/reset-password`, { password });
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    const refreshRoles = async () => { cache.roles = await api.get('/api/workspace/roles'); return cache.roles; };

    const saveRole = async (payload) => {
        try {
            if (payload.id) await api.put(`/api/workspace/roles/${encodeURIComponent(payload.id)}`, payload);
            else await api.post('/api/workspace/roles', payload);
            await refreshRoles();
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    const deleteRole = async (id) => {
        try {
            await api.del(`/api/workspace/roles/${encodeURIComponent(id)}`);
            await refreshRoles();
            return { ok: true };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    /* ---------- ghi: lịch công tác ---------- */

    const refreshEvents = async () => { cache.events = await api.get('/api/workspace/events'); return cache.events; };

    const saveEvent = async (payload) => {
        const saved = payload.id
            ? await api.put(`/api/workspace/events/${encodeURIComponent(payload.id)}`, payload)
            : await api.post('/api/workspace/events', payload);
        await refreshEvents();
        return saved;
    };

    const deleteEvent = async (id) => {
        await api.del(`/api/workspace/events/${encodeURIComponent(id)}`);
        await refreshEvents();
        return true;
    };

    /* ---------- ghi: tài liệu ---------- */

    const refreshDocs = async () => { cache.documents = await api.get('/api/workspace/documents'); return cache.documents; };

    const saveDocument = async (payload) => {
        const saved = payload.id
            ? await api.put(`/api/workspace/documents/${encodeURIComponent(payload.id)}`, payload)
            : await api.post('/api/workspace/documents', payload);
        await refreshDocs();
        return saved;
    };

    const addDocVersion = async () => {
        throw new Error('Phiên bản tài liệu được ghi nhận khi cập nhật nội dung tài liệu.');
    };

    const setDocAccess = async (docId, access) => {
        const saved = await api.put(`/api/workspace/documents/${encodeURIComponent(docId)}`, { access });
        await refreshDocs();
        return saved;
    };

    const docVersions = () => [];
    const taskItems = (taskId) => (taskById(taskId) || {}).items || [];
    const taskComments = (taskId) => (taskById(taskId) || {}).comments || [];
    const taskHistory = (taskId) => (taskById(taskId) || {}).history || [];

    const deleteDocument = async (id) => {
        await api.del(`/api/workspace/documents/${encodeURIComponent(id)}`);
        await refreshDocs();
        return true;
    };

    /* ---------- ghi: báo cáo ---------- */

    const refreshReports = async () => { cache.reports = await api.get('/api/workspace/reports'); return cache.reports; };

    const saveReport = async (payload) => {
        let saved;
        if (payload.id) saved = await api.put(`/api/workspace/reports/${encodeURIComponent(payload.id)}`, payload);
        else saved = await api.post('/api/workspace/reports', payload);
        await refreshReports();
        return saved;
    };

    const setReportStatus = async (id, status, detail) => {
        const actionMap = { pending: 'send', sent: 'send', approved: 'approve', revision: 'revision', rejected: 'reject' };
        const action = actionMap[status] || 'send';
        const saved = await api.post(`/api/workspace/reports/${encodeURIComponent(id)}/${action}`, { note: detail });
        await refreshReports();
        await refreshStats();
        return saved;
    };

    const publishReport = async (id, publicSummary) => {
        const saved = await api.post(`/api/workspace/reports/${encodeURIComponent(id)}/publish`, { publicSummary });
        await refreshReports();
        return saved;
    };

    /* ---------- ghi: đề xuất & phối hợp ---------- */

    const refreshProposals = async () => { cache.proposals = await api.get('/api/workspace/proposals'); return cache.proposals; };

    const createProposal = async (payload) => {
        const saved = await api.post('/api/workspace/proposals', payload);
        await refreshProposals();
        return saved;
    };

    const refreshCollaborations = async () => { cache.collaborations = await api.get('/api/workspace/collaborations'); return cache.collaborations; };

    const setIntegrationStatus = async (id, status, detail) => {
        const saved = await api.put(`/api/workspace/collaborations/${encodeURIComponent(id)}`, { status, taskId: detail });
        await refreshCollaborations();
        return saved;
    };

    /* ---------- thông báo & log ---------- */

    const refreshNotifications = async () => { cache.notifications = await api.get('/api/shared/notifications'); return cache.notifications; };

    const visibleNotifications = () => cache.notifications.slice();
    const unreadCount = () => cache.notifications.filter((n) => !n.read).length;

    const setNotificationRead = async (id) => {
        await api.post(`/api/workspace/notifications/${encodeURIComponent(id)}/read`, {});
        await refreshNotifications();
        return true;
    };

    const markAllRead = async () => {
        await api.post('/api/shared/notifications/read', {});
        await refreshNotifications();
    };

    const deleteNotification = async () => {
        throw new Error('Thông báo hệ thống không thể xóa; hãy đánh dấu đã đọc.');
    };

    const pushNotification = () => {
        // Thông báo được tạo tại máy chủ theo nghiệp vụ; không tạo phía trình duyệt
    };

    const addLog = () => null;

    /* ---------- thống kê ---------- */

    const refreshStats = async () => { cache.stats = await api.get('/api/workspace/stats'); return cache.stats; };

    const taskStats = () => {
        const s = cache.stats && cache.stats.tasks ? cache.stats.tasks : {};
        const list = cache.tasks;
        const by = (k) => (s[k] != null ? s[k] : list.filter((t) => t.status === k).length);
        const now = new Date();
        const overdue = list.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && new Date(t.dueDate) < now).length;
        return {
            total: s.total != null ? s.total : list.length,
            doing: by('doing'), new: by('new'), review: by('review'),
            done: by('done'), overdue, paused: by('paused'), cancelled: by('cancelled'),
        };
    };

    const recomputeTaskStatus = (task) => task;
    const nextCode = (prefix) => `${prefix}-${new Date().getFullYear()}-###`;

    /* ---------- tùy chọn giao diện ---------- */

    const loadPrefs = () => {
        try { return JSON.parse(window.localStorage.getItem(CONFIG.preferenceKey) || '{}'); } catch (e) { return {}; }
    };

    const savePrefs = (patch) => {
        prefs = Object.assign(loadPrefs(), patch);
        try { window.localStorage.setItem(CONFIG.preferenceKey, JSON.stringify(prefs)); } catch (e) { /* bỏ qua */ }
        return prefs;
    };

    return {
        load, loadSession, getSession, currentUser, login, logout, can, scopeOf, inScope,
        all, tasks, organizations, users, roles, permissions, events, documents, reports,
        notifications, logs, proposals, collaborations, integrations, stats, taskStats,
        taskById, orgById, userById, docById, reportById, eventById, roleById, roleOf,
        orgName, userName, taskItems, taskComments, taskHistory, docVersions,
        saveTask, deleteTask, setTaskProgress, setTaskStatus,
        addTaskItem, setTaskItems, addTaskComment, addTaskAttachment,
        saveOrganization, deleteOrganization,
        saveUser, setUserStatus, resetUserPassword,
        saveRole, deleteRole,
        saveEvent, deleteEvent,
        saveDocument, setDocAccess, deleteDocument, addDocVersion,
        saveReport, setReportStatus, publishReport,
        createProposal, setIntegrationStatus,
        visibleNotifications, unreadCount, setNotificationRead, markAllRead, deleteNotification,
        pushNotification, addLog,
        refreshTasks, refreshReports, refreshNotifications, refreshProposals, refreshCollaborations,
        refreshStats, loadPrefs, savePrefs, recomputeTaskStatus, nextCode,
    };
})();

    /* =========================================================================
       5. THÀNH PHẦN GIAO DIỆN DÙNG CHUNG
       ========================================================================= */

    const ui = (function () {
        const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

        /* ---------- Toast ---------- */

        const toastHost = () => {
            let host = document.getElementById('ws-toast-host');
            if (!host) {
                host = document.createElement('div');
                host.id = 'ws-toast-host';
                host.className = 'ws-toast-host';
                host.setAttribute('aria-live', 'polite');
                document.body.appendChild(host);
            }
            return host;
        };

        const toast = (message, tone, action) => {
            const type = tone || 'info';
            const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
            const el = document.createElement('div');
            el.className = 'ws-toast ws-toast--' + type;
            el.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '" aria-hidden="true"></i>' +
                '<span class="ws-toast__text">' + util.escape(message) + '</span>' +
                (action && action.label ? '<button type="button" class="ws-toast__action">' + util.escape(action.label) + '</button>' : '') +
                '<button type="button" class="ws-toast__close" aria-label="Đóng thông báo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
            toastHost().appendChild(el);
            const remove = () => {
                el.classList.add('is-leaving');
                window.setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
            };
            el.querySelector('.ws-toast__close').addEventListener('click', remove);
            const actionBtn = el.querySelector('.ws-toast__action');
            if (actionBtn) {
                actionBtn.addEventListener('click', () => {
                    remove();
                    if (typeof action.onClick === 'function') action.onClick();
                });
            }
            window.setTimeout(remove, action ? 7000 : 4200);
            return el;
        };

        /* ---------- Modal ---------- */

        const stack = [];

        const closeEntry = (entry) => {
            if (!entry || entry.closed) return;
            entry.closed = true;
            entry.root.classList.remove('is-open');
            if (stack.length <= 1) document.body.style.overflow = '';
            window.setTimeout(() => {
                if (entry.root.parentNode) entry.root.parentNode.removeChild(entry.root);
                const index = stack.indexOf(entry);
                if (index !== -1) stack.splice(index, 1);
                if (entry.resolve) entry.resolve(entry.result);
                if (typeof entry.onClose === 'function') entry.onClose(entry.result);
            }, 160);
        };

        const trapFocus = (entry, e) => {
            if (e.key === 'Tab') {
                const items = Array.prototype.slice.call(entry.root.querySelectorAll(FOCUSABLE))
                    .filter((node) => node.offsetParent !== null);
                if (!items.length) return;
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };

        const mountKeyHandler = () => {
            if (mountKeyHandler.done) return;
            mountKeyHandler.done = true;
            document.addEventListener('keydown', (e) => {
                const entry = stack[stack.length - 1];
                if (!entry || entry.closed) return;
                if (e.key === 'Escape') { e.preventDefault(); closeEntry(entry); return; }
                trapFocus(entry, e);
            });
        };

        const openModal = (options) => {
            const opt = Object.assign({ size: 'md', tone: 'primary', cancelText: 'Đóng' }, options);
            const root = document.createElement('div');
            root.className = 'ws-modal';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', opt.title || 'Hộp thoại');
            root.innerHTML =
                '<div class="ws-modal__backdrop" data-modal-backdrop></div>' +
                '<div class="ws-modal__panel ws-modal__panel--' + opt.size + ' ws-modal__panel--' + opt.tone + '" tabindex="-1">' +
                '<header class="ws-modal__head"><div>' +
                '<h2 class="ws-modal__title">' + util.escape(opt.title || '') + '</h2>' +
                (opt.subtitle ? '<p class="ws-modal__subtitle">' + util.escape(opt.subtitle) + '</p>' : '') +
                '</div><button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-modal-close aria-label="Đóng">' +
                '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>' +
                '<div class="ws-modal__body">' + (opt.content || '') + '</div>' +
                '<footer class="ws-modal__foot">' +
                (opt.footer === false ? '' :
                    '<button type="button" class="ws-btn" data-modal-close>' + util.escape(opt.cancelText) + '</button>' +
                    (opt.confirmText ? '<button type="button" class="ws-btn ws-btn--' + opt.tone + '" data-modal-confirm>' +
                        (opt.confirmIcon ? '<i class="fa-solid ' + opt.confirmIcon + '" aria-hidden="true"></i>' : '') +
                        util.escape(opt.confirmText) + '</button>' : '')) +
                '</footer></div>';
            document.body.appendChild(root);
            document.body.style.overflow = 'hidden';

            let resolveFn = null;
            const promise = new Promise((resolve) => { resolveFn = resolve; });
            const entry = { root: root, resolve: resolveFn, result: null, onClose: opt.onClose, closed: false };
            stack.push(entry);
            mountKeyHandler();
            window.requestAnimationFrame(() => root.classList.add('is-open'));

            root.addEventListener('click', (e) => {
                if (e.target.closest('[data-modal-close]') || e.target.hasAttribute('data-modal-backdrop')) {
                    closeEntry(entry);
                    return;
                }
                if (e.target.closest('[data-modal-confirm]')) {
                    if (typeof opt.onConfirm === 'function') {
                        const keep = opt.onConfirm(root, () => closeEntry(entry));
                        if (keep === false) return;
                    }
                    closeEntry(entry);
                }
            });

            const panel = root.querySelector('.ws-modal__panel');
            window.setTimeout(() => {
                const target = panel.querySelector('[autofocus], input:not([type="hidden"]), select, textarea, button[data-modal-confirm]') || panel;
                target.focus();
            }, 60);
            return promise;
        };

        /** Hộp thoại xác nhận – trả về Promise<boolean> */
        const confirm = (options) => {
            const opt = Object.assign({ tone: 'danger', confirmText: 'Xác nhận', heading: 'Xác nhận thao tác', message: '' }, options);
            return new Promise((resolve) => {
                let answered = false;
                openModal({
                    title: opt.heading,
                    size: 'sm',
                    tone: opt.tone,
                    content: '<div class="ws-confirm"><span class="ws-confirm__icon ws-confirm__icon--' + opt.tone + '">' +
                        '<i class="fa-solid ' + (opt.tone === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-question') + '" aria-hidden="true"></i>' +
                        '</span><div class="ws-confirm__text">' + util.escape(opt.message) + '</div></div>',
                    cancelText: opt.cancelText || 'Hủy',
                    confirmText: opt.confirmText,
                    onConfirm: (root, close) => { answered = true; resolve(true); close(); },
                    onClose: () => { if (!answered) resolve(false); }
                });
            });
        };

        /* ---------- Dropdown (event delegation) ---------- */

        const closeDropdowns = (except) => {
            document.querySelectorAll('[data-dropdown].is-open').forEach((dd) => {
                if (except && dd === except) return;
                dd.classList.remove('is-open');
                const trigger = dd.querySelector('[data-dropdown-trigger]');
                if (trigger) trigger.setAttribute('aria-expanded', 'false');
            });
        };

        const initDropdowns = () => {
            if (initDropdowns.done) return;
            initDropdowns.done = true;
            document.addEventListener('click', (e) => {
                const trigger = e.target.closest('[data-dropdown-trigger]');
                if (trigger) {
                    e.preventDefault();
                    const dd = trigger.closest('[data-dropdown]');
                    const willOpen = !dd.classList.contains('is-open');
                    closeDropdowns(dd);
                    dd.classList.toggle('is-open', willOpen);
                    trigger.setAttribute('aria-expanded', String(willOpen));
                    return;
                }
                if (!e.target.closest('[data-dropdown]')) closeDropdowns();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeDropdowns();
            });
        };

        /* ---------- Tabs ---------- */

        const initTabs = (scope) => {
            (scope || document).querySelectorAll('[data-tabs]').forEach((tabs) => {
                if (tabs.dataset.tabsReady) return;
                tabs.dataset.tabsReady = '1';
                const buttons = Array.prototype.slice.call(tabs.querySelectorAll('[data-tab]'));
                const group = tabs.dataset.tabs;
                const activate = (name, focus) => {
                    buttons.forEach((btn) => {
                        const active = btn.dataset.tab === name;
                        btn.classList.toggle('is-active', active);
                        btn.setAttribute('aria-selected', String(active));
                        btn.tabIndex = active ? 0 : -1;
                        if (active && focus) btn.focus();
                    });
                    document.querySelectorAll('[data-tab-panel="' + group + '"]').forEach((panel) => {
                        panel.hidden = panel.dataset.tabName !== name;
                    });
                };
                tabs.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-tab]');
                    if (btn) activate(btn.dataset.tab, false);
                });
                tabs.addEventListener('keydown', (e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    const index = buttons.findIndex((b) => b.classList.contains('is-active'));
                    if (index === -1) return;
                    const next = e.key === 'ArrowRight' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
                    activate(buttons[next].dataset.tab, true);
                });
                const wanted = tabs.dataset.tabDefault;
                if (wanted && buttons.some((b) => b.dataset.tab === wanted)) activate(wanted, false);
                else if (buttons[0]) activate(buttons[0].dataset.tab, false);
            });
        };

        /* ---------- Bộ lọc thu gọn trên mobile ---------- */

        const initFilterToggles = () => {
            document.querySelectorAll('[data-filters-toggle]').forEach((btn) => {
                const panel = btn.closest('.ws-filters');
                if (!panel || btn.dataset.bound) return;
                btn.dataset.bound = '1';
                const sync = () => {
                    if (!window.matchMedia('(max-width: 768px)').matches) {
                        panel.classList.add('is-open');
                        btn.setAttribute('aria-expanded', 'true');
                        return;
                    }
                    if (panel.dataset.userToggled) return;
                    panel.classList.remove('is-open');
                    btn.setAttribute('aria-expanded', 'false');
                };
                sync();
                btn.addEventListener('click', () => {
                    const open = !panel.classList.contains('is-open');
                    panel.classList.toggle('is-open', open);
                    panel.dataset.userToggled = '1';
                    btn.setAttribute('aria-expanded', String(open));
                });
                window.addEventListener('resize', sync);
            });
        };

        /* ---------- Hàm dựng HTML dùng chung ---------- */

        const badge = (text, tone) => '<span class="ws-badge ws-badge--' + (tone || 'neutral') + '">' + util.escape(text) + '</span>';

        const TONE = {
            new: 'neutral', doing: 'info', review: 'warning', done: 'success', overdue: 'danger',
            paused: 'muted', cancelled: 'muted',
            draft: 'muted', ready: 'info', sent: 'info', pending: 'warning', approved: 'success',
            revision: 'warning', rejected: 'danger',
            active: 'success', locked: 'danger', archived: 'muted'
        };

        const statusBadge = (status, kind) => {
            const map = kind === 'report' ? LABELS.reportStatus
                : kind === 'user' ? LABELS.userStatus
                    : kind === 'org' ? LABELS.orgStatus
                        : LABELS.taskStatus;
            return badge(map[status] || status || '—', TONE[status] || 'neutral');
        };

        const priorityBadge = (priority) => {
            const tone = { low: 'muted', normal: 'info', high: 'warning', urgent: 'danger' }[priority] || 'neutral';
            const icon = { urgent: 'fa-fire', high: 'fa-arrow-up', low: 'fa-arrow-down' }[priority] || '';
            return '<span class="ws-badge ws-badge--' + tone + '">' +
                (icon ? '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>' : '') +
                util.escape(LABELS.priority[priority] || priority) + '</span>';
        };

        const avatar = (user, size) => '<span class="ws-avatar ws-avatar--' + (size || 'md') + '" aria-hidden="true" title="' +
            util.escape(user ? user.name : '') + '">' + util.escape(user ? util.initials(user.name) : '?') + '</span>';

        const userCell = (userId) => {
            const user = Store.userById(userId);
            const org = user ? Store.orgById(user.orgId) : null;
            return '<span class="ws-user-cell">' + avatar(user, 'sm') +
                '<span class="ws-user-cell__text"><span class="ws-user-cell__name">' + util.escape(user ? user.name : '—') +
                '</span><span class="ws-user-cell__meta">' + util.escape(org ? org.code : '') + '</span></span></span>';
        };

        const progress = (value, label) => {
            const v = Math.max(0, Math.min(100, Number(value) || 0));
            const tone = v >= 100 ? 'success' : v >= 40 ? 'primary' : 'warning';
            return '<div class="ws-progress" role="progressbar" aria-valuenow="' + v + '" aria-valuemin="0" aria-valuemax="100" aria-label="' +
                util.escape(label || 'Tiến độ') + '"><div class="ws-progress__bar ws-progress__bar--' + tone + '" style="width:' + v + '%"></div>' +
                '<span class="ws-progress__value">' + v + '%</span></div>';
        };

        const emptyState = (options) => {
            const opt = Object.assign({ icon: 'fa-inbox', title: 'Không có dữ liệu', message: 'Chưa có bản ghi nào phù hợp.' }, options);
            return '<div class="ws-empty"><span class="ws-empty__icon"><i class="fa-solid ' + opt.icon + '" aria-hidden="true"></i></span>' +
                '<p class="ws-empty__title">' + util.escape(opt.title) + '</p>' +
                '<p class="ws-empty__text">' + util.escape(opt.message) + '</p>' +
                (opt.action ? '<div class="ws-empty__action">' + opt.action + '</div>' : '') + '</div>';
        };

        const pagination = (options) => {
            const page = options.page || 1;
            const size = options.pageSize || 10;
            const total = options.total || 0;
            if (!total) return '';
            const pages = Math.max(1, Math.ceil(total / size));
            const from = (page - 1) * size + 1;
            const to = Math.min(total, page * size);
            const start = Math.max(1, Math.min(page - 2, pages - 4));
            const end = Math.min(pages, start + 4);
            let numbers = '';
            for (let i = start; i <= end; i += 1) {
                numbers += '<button type="button" class="ws-page-btn' + (i === page ? ' is-active' : '') + '" data-page="' + i + '"' +
                    (i === page ? ' aria-current="page"' : '') + '>' + i + '</button>';
            }
            return '<nav class="ws-pagination" aria-label="Phân trang">' +
                '<p class="ws-pagination__info">Hiển thị <strong>' + from + '–' + to + '</strong> / <strong>' + total + '</strong> ' +
                util.escape(options.label || 'bản ghi') + '</p><div class="ws-pagination__controls">' +
                '<button type="button" class="ws-page-btn" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Trang trước"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
                numbers +
                '<button type="button" class="ws-page-btn" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Trang sau"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>' +
                '</div></nav>';
        };

        const field = (opts) => {
            const id = opts.id;
            const required = opts.required ? ' required aria-required="true"' : '';
            const help = opts.help ? '<span class="ws-help" id="' + id + '-help">' + util.escape(opts.help) + '</span>' : '';
            const attrs = 'id="' + id + '" name="' + (opts.name || id) + '"' + required + ' ' + (opts.attrs || '') +
                (opts.help ? ' aria-describedby="' + id + '-help"' : '');
            if (opts.type === 'checkbox') {
                return '<label class="ws-check"><input type="checkbox" ' + attrs + (opts.checked ? ' checked' : '') + '><span>' +
                    util.escape(opts.label) + '</span></label>';
            }
            let control;
            if (opts.type === 'select') {
                control = '<select class="ws-select" ' + attrs + '>' + opts.options.map((o) =>
                    '<option value="' + util.escape(o.value) + '"' + (String(o.value) === String(opts.value == null ? '' : opts.value) ? ' selected' : '') + '>' +
                    util.escape(o.label) + '</option>').join('') + '</select>';
            } else if (opts.type === 'textarea') {
                control = '<textarea class="ws-textarea" ' + attrs + ' rows="' + (opts.rows || 4) + '" placeholder="' +
                    util.escape(opts.placeholder || '') + '">' + util.escape(opts.value || '') + '</textarea>';
            } else {
                control = '<input type="' + (opts.type || 'text') + '" class="ws-input" ' + attrs + ' value="' +
                    util.escape(opts.value == null ? '' : opts.value) + '" placeholder="' + util.escape(opts.placeholder || '') + '">';
            }
            return '<div class="ws-field' + (opts.wide ? ' ws-field--wide' : '') + '">' +
                '<label class="ws-label" for="' + id + '">' + util.escape(opts.label) +
                (opts.required ? '<span class="ws-label__req">*</span>' : '') + '</label>' + control + help + '</div>';
        };

        const validateForm = (form) => {
            let firstInvalid = null;
            form.querySelectorAll('[required]').forEach((input) => {
                const wrap = input.closest('.ws-field');
                const old = wrap ? wrap.querySelector('.ws-error-text') : null;
                if (old) old.parentNode.removeChild(old);
                input.classList.remove('is-invalid');
                const value = String(input.value || '').trim();
                let message = '';
                if (!value) message = 'Trường này không được để trống.';
                else if (input.dataset.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = 'Email không hợp lệ.';
                else if (input.dataset.type === 'phone' && !/^[0-9.\s+()-]{8,15}$/.test(value)) message = 'Số điện thoại không hợp lệ.';
                else if (input.dataset.min && value.length < Number(input.dataset.min)) message = 'Tối thiểu ' + input.dataset.min + ' ký tự.';
                if (!message) return;
                input.classList.add('is-invalid');
                input.setAttribute('aria-invalid', 'true');
                if (wrap) {
                    const err = document.createElement('span');
                    err.className = 'ws-error-text';
                    err.textContent = message;
                    wrap.appendChild(err);
                }
                if (!firstInvalid) firstInvalid = input;
            });

            const start = form.querySelector('[data-validate="start"]');
            const end = form.querySelector('[data-validate="end"]');
            if (start && end && start.value && end.value) {
                const s = util.parseDate(start.value);
                const e = util.parseDate(end.value);
                if (s && e && e < s) {
                    const wrap = end.closest('.ws-field');
                    end.classList.add('is-invalid');
                    if (wrap && !wrap.querySelector('.ws-error-text')) {
                        const err = document.createElement('span');
                        err.className = 'ws-error-text';
                        err.textContent = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
                        wrap.appendChild(err);
                    }
                    if (!firstInvalid) firstInvalid = end;
                }
            }

            if (firstInvalid) { firstInvalid.focus(); return false; }
            return true;
        };

        const formData = (form) => {
            const data = {};
            form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
                if (el.type === 'checkbox') data[el.name] = el.checked;
                else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
                else if (el.multiple) data[el.name] = Array.prototype.map.call(el.selectedOptions, (o) => o.value);
                else data[el.name] = String(el.value || '').trim();
            });
            return data;
        };

        const checkedValues = (container, selector) => {
            if (!container) return [];
            return Array.prototype.map.call(container.querySelectorAll(selector || 'input[type="checkbox"]:checked'), (c) => c.value);
        };

        const optionsFrom = (list, valueKey, labelKey, allLabel) => {
            const options = list.map((item) => ({ value: item[valueKey], label: item[labelKey] }));
            if (allLabel) options.unshift({ value: '', label: allLabel });
            return options;
        };

        /* ---------- Tải tệp ---------- */

        const saveBlob = (blob, filename) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        };

        const exportCsv = (filename, headers, rows) => {
            const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
            const lines = [headers.map(cell).join(',')];
            rows.forEach((row) => lines.push(row.map(cell).join(',')));
            /* BOM để Excel nhận đúng UTF-8 tiếng Việt */
            saveBlob(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
        };

        const downloadDocStub = (doc) => {
            const content = [
                'Cổng thông tin điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh',
                'KHU VỰC WORKSPACE NỘI BỘ',
                '',
                'Mã tài liệu : ' + doc.code,
                'Tên tài liệu: ' + doc.name,
                'Loại        : ' + (LABELS.docType[doc.type] || doc.type),
                'Đơn vị      : ' + Store.orgName(doc.orgId),
                'Ban hành    : ' + util.formatDate(doc.issuedAt),
                '',
                'Tệp đính kèm được lưu trữ và kiểm soát quyền bởi máy chủ.',
                'Nội dung tệp gốc do bộ phận quản trị hệ thống lưu trữ theo quy định.'
            ].join('\r\n');
            saveBlob(new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' }),
                doc.code + '_' + util.normalize(doc.name).replace(/\s+/g, '-') + '.txt');
        };

        const openDocPreview = (doc) => {
            if (!doc) return;
            const org = Store.orgById(doc.orgId);
            const uploader = Store.userById(doc.uploaderId);
            const versions = Store.docVersions(doc.id);
            openModal({
                title: doc.name,
                subtitle: doc.code + ' · ' + (LABELS.docType[doc.type] || doc.type),
                size: 'md',
                footer: false,
                content: '<div class="ws-doc-preview">' +
                    '<div class="ws-doc-preview__thumb" aria-hidden="true"><i class="fa-solid fa-file-' +
                    (doc.format === 'PDF' ? 'pdf' : doc.format === 'XLSX' ? 'excel' : 'word') + '"></i><span>' + util.escape(doc.format) + '</span></div>' +
                    '<dl class="ws-detail-list">' +
                    '<dt>Mã tài liệu</dt><dd>' + util.escape(doc.code) + '</dd>' +
                    '<dt>Loại tài liệu</dt><dd>' + util.escape(LABELS.docType[doc.type] || doc.type) + '</dd>' +
                    '<dt>Đơn vị ban hành</dt><dd>' + util.escape(org ? org.name : '—') + '</dd>' +
                    '<dt>Người tải lên</dt><dd>' + util.escape(uploader ? uploader.name : '—') + '</dd>' +
                    '<dt>Ngày ban hành</dt><dd>' + util.formatDate(doc.issuedAt) + '</dd>' +
                    '<dt>Ngày tải lên</dt><dd>' + util.formatDateTime(doc.uploadedAt) + '</dd>' +
                    '<dt>Định dạng / dung lượng</dt><dd>' + util.escape(doc.format) + ' · ' + util.fileSize(doc.size) + '</dd>' +
                    '<dt>Phạm vi truy cập</dt><dd>' + util.escape(LABELS.docAccess[doc.access]) + '</dd></dl>' +
                    (versions.length ? '<div class="ws-subhead">Phiên bản</div><ul class="ws-mini-list">' +
                        versions.slice().reverse().map((v) => '<li><span class="ws-mini-list__badge">' + util.escape(v.version) + '</span>' +
                            '<span>' + util.escape(v.note) + '</span><span class="ws-mini-list__meta">' + util.formatDate(v.createdAt) + '</span></li>').join('') +
                        '</ul>' : '') +
                    '<div class="ws-note ws-note--muted"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Việc tải lên và tải xuống tài liệu được kiểm tra quyền tại máy chủ theo phạm vi truy cập của tài liệu.</div></div>'
            });
        };

        /* ---------- Điều hướng ---------- */

        const go = (file, params) => {
            let url = file;
            if (params) {
                const qs = Object.keys(params)
                    .filter((k) => params[k] !== '' && params[k] != null)
                    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
                if (qs) url += '?' + qs;
            }
            window.location.href = url;
        };

        const query = (key) => new URLSearchParams(window.location.search).get(key);

        const init = () => {
            initDropdowns();
            initTabs(document);
            initFilterToggles();
            document.querySelectorAll('.ws-year').forEach((el) => { el.textContent = new Date().getFullYear(); });
            document.querySelectorAll('.ws-version').forEach((el) => { el.textContent = 'v' + CONFIG.version; });
        };

        return {
            toast: toast, openModal: openModal, confirm: confirm, closeDropdowns: closeDropdowns,
            initDropdowns: initDropdowns, initTabs: initTabs, initFilterToggles: initFilterToggles, init: init,
            badge: badge, statusBadge: statusBadge, priorityBadge: priorityBadge, avatar: avatar, userCell: userCell,
            progress: progress, emptyState: emptyState, pagination: pagination, field: field,
            validateForm: validateForm, formData: formData, checkedValues: checkedValues, optionsFrom: optionsFrom,
            exportCsv: exportCsv, saveBlob: saveBlob, downloadDocStub: downloadDocStub, openDocPreview: openDocPreview,
            go: go, query: query
        };
    })();

    /* =========================================================================
       6. DANH MỤC TRANG – nguồn duy nhất cho sidebar, breadcrumb, tiêu đề
       ========================================================================= */

    const PAGES = {
        'dashboard.html': { title: 'Bảng điều hành', icon: 'fa-gauge-high', group: 'main', crumb: 'Bảng điều hành', desc: 'Tổng hợp tình hình nhiệm vụ, lịch công tác và hoạt động điều hành nội bộ.' },
        'tasks.html': { title: 'Nhiệm vụ', icon: 'fa-list-check', group: 'work', crumb: 'Quản lý nhiệm vụ', desc: 'Giao việc, theo dõi tiến độ và kiểm soát thời hạn nhiệm vụ.', perm: 'data.view' },
        'task-detail.html': { title: 'Chi tiết nhiệm vụ', icon: 'fa-list-check', group: 'work', crumb: 'Chi tiết nhiệm vụ', desc: 'Theo dõi nội dung, tiến độ, trao đổi và lịch sử cập nhật nhiệm vụ.', perm: 'data.view' },
        'calendar.html': { title: 'Lịch công tác', icon: 'fa-calendar-days', group: 'work', crumb: 'Lịch công tác', desc: 'Quản lý họp, hội nghị, tập huấn và các hoạt động phối hợp.', perm: 'data.view' },
        'organizations.html': { title: 'Tổ chức', icon: 'fa-building-columns', group: 'catalog', crumb: 'Cơ quan, đơn vị', desc: 'Quản lý cơ quan, đơn vị và tổ chức tham gia công tác phòng, chống ma túy.', perm: 'data.view' },
        'organization-detail.html': { title: 'Chi tiết tổ chức', icon: 'fa-building-columns', group: 'catalog', crumb: 'Chi tiết tổ chức', desc: 'Thông tin đơn vị, nhân sự, nhiệm vụ, báo cáo và lịch hoạt động.', perm: 'data.view' },
        'users.html': { title: 'Người dùng', icon: 'fa-users', group: 'catalog', crumb: 'Quản lý người dùng', desc: 'Quản lý tài khoản, vai trò và trạng thái truy cập của cán bộ.', perm: 'data.view' },
        'permissions.html': { title: 'Phân quyền', icon: 'fa-shield-halved', group: 'system', crumb: 'Vai trò & phân quyền', desc: 'Thiết lập vai trò, quyền hạn và phạm vi dữ liệu (RBAC + Data Scope).', perm: 'role.manage' },
        'documents.html': { title: 'Tài liệu', icon: 'fa-folder-open', group: 'docs', crumb: 'Kho tài liệu', desc: 'Lưu trữ, phân loại, chia sẻ và kiểm soát truy cập tài liệu nội bộ.', perm: 'data.view' },
        'reports.html': { title: 'Báo cáo', icon: 'fa-file-lines', group: 'docs', crumb: 'Quản lý báo cáo', desc: 'Theo dõi báo cáo định kỳ, chuyên đề và quy trình duyệt.', perm: 'data.view' },
        'report-editor.html': { title: 'Biên tập báo cáo', icon: 'fa-pen-to-square', group: 'docs', crumb: 'Biên tập báo cáo', desc: 'Soạn thảo, xem trước, gửi và duyệt báo cáo theo quy trình.', perm: 'data.view' },
        'notifications.html': { title: 'Thông báo', icon: 'fa-bell', group: 'system', crumb: 'Thông báo', desc: 'Thông báo giao việc, thời hạn, báo cáo và lịch công tác.', perm: 'data.view' },
        'activity-log.html': { title: 'Nhật ký hoạt động', icon: 'fa-clock-rotate-left', group: 'system', crumb: 'Nhật ký hoạt động', desc: 'Tra cứu lịch sử thao tác của người dùng trong Workspace.', perm: 'log.view' },
        'login.html': { title: 'Đăng nhập Workspace', icon: 'fa-right-to-bracket', group: 'hidden', crumb: 'Đăng nhập', desc: '' }
    };

    const NAV_GROUPS = [
        { id: 'main', label: 'Điều hành' },
        { id: 'work', label: 'Công việc' },
        { id: 'catalog', label: 'Danh mục' },
        { id: 'docs', label: 'Văn bản & báo cáo' },
        { id: 'system', label: 'Hệ thống' }
    ];

    const NAV_ITEMS = [
        { group: 'main', file: 'dashboard.html' },
        { group: 'work', file: 'tasks.html', label: 'Nhiệm vụ' },
        { group: 'work', file: 'calendar.html' },
        { group: 'catalog', file: 'organizations.html', label: 'Cơ quan, đơn vị' },
        { group: 'catalog', file: 'users.html' },
        { group: 'docs', file: 'documents.html' },
        { group: 'docs', file: 'reports.html' },
        { group: 'system', file: 'notifications.html' },
        { group: 'system', file: 'permissions.html' },
        { group: 'system', file: 'activity-log.html' }
    ];

    /* =========================================================================
       7. SHELL – layout, guard phiên, sidebar, header
       ========================================================================= */

    const Shell = (function () {
        const currentFile = () => {
            const parts = window.location.pathname.split('/');
            const file = parts[parts.length - 1] || '';
            return file.indexOf('.html') === -1 ? CONFIG.homeFile : file;
        };

        const isLogin = () => currentFile() === 'login.html';

        /** Phiên được xác định sau khi gọi /api/auth/me (bất đồng bộ) trong boot();
            việc chặn truy cập thật do máy chủ bảo đảm. */
        const guard = () => true;

        const applyPermissions = () => {
            document.querySelectorAll('[data-perm]').forEach((el) => {
                const allowed = el.dataset.perm.split('|').some((p) => Store.can(p.trim()));
                if (!allowed && el.parentNode) el.parentNode.removeChild(el);
            });
        };

        const renderSidebar = () => {
            const host = document.getElementById('ws-sidebar');
            if (!host) return;
            const user = Store.currentUser();
            const role = Store.roleOf(user);
            const stats = Store.taskStats();
            const unread = Store.unreadCount(user);
            const active = currentFile();

            const badgeFor = (file) => {
                const pending = stats.overdue + stats.review;
                if (file === 'tasks.html' && pending) return '<span class="ws-nav-link__badge" title="Cần xử lý">' + pending + '</span>';
                if (file === 'notifications.html' && unread) return '<span class="ws-nav-link__badge">' + unread + '</span>';
                return '';
            };

            const groups = NAV_GROUPS.map((group) => {
                const links = NAV_ITEMS.filter((item) => {
                    const page = PAGES[item.file];
                    return item.group === group.id && page && (!page.perm || Store.can(page.perm));
                }).map((item) => {
                    const page = PAGES[item.file];
                    const label = item.label || page.title;
                    let isActive = active === item.file;
                    if (item.file === 'tasks.html' && active === 'task-detail.html') isActive = true;
                    if (item.file === 'organizations.html' && active === 'organization-detail.html') isActive = true;
                    if (item.file === 'reports.html' && active === 'report-editor.html') isActive = true;
                    return '<li><a class="ws-nav-link' + (isActive ? ' is-active' : '') + '" href="' + item.file + '" data-tooltip="' +
                        util.escape(label) + '"' + (isActive ? ' aria-current="page"' : '') + '>' +
                        '<span class="ws-nav-link__icon"><i class="fa-solid ' + page.icon + '" aria-hidden="true"></i></span>' +
                        '<span class="ws-nav-link__text">' + util.escape(label) + '</span>' + badgeFor(item.file) + '</a></li>';
                }).join('');
                if (!links) return '';
                return '<div class="ws-nav-group"><p class="ws-nav-group__label">' + util.escape(group.label) + '</p>' +
                    '<ul class="ws-nav-list">' + links + '</ul></div>';
            }).join('');

            host.innerHTML =
                '<div class="ws-sidebar__brand">' +
                '<a href="' + CONFIG.homeFile + '" class="ws-sidebar__logo" aria-label="Về bảng điều hành Workspace">' +
                '<img src="../../assets/icons/logo.jpg" alt="Biểu trưng Cổng thông tin"></a>' +
                '<div class="ws-sidebar__brand-text"><span class="ws-sidebar__brand-title">WORKSPACE</span>' +
                '<span class="ws-sidebar__brand-sub">Điều hành nội bộ</span></div></div>' +
                '<button type="button" class="ws-sidebar__collapse" id="ws-sidebar-collapse" aria-label="Thu gọn thanh điều hướng" title="Thu gọn / mở rộng">' +
                '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
                '<nav class="ws-sidebar__nav" aria-label="Điều hướng Workspace">' + groups + '</nav>' +
                '<div class="ws-sidebar__user">' + ui.avatar(user, 'sm') +
                '<div class="ws-sidebar__user-info"><span class="ws-sidebar__user-name">' + util.escape(user ? user.name : 'Chưa đăng nhập') + '</span>' +
                '<span class="ws-sidebar__user-role">' + util.escape(role ? role.name : 'Khách') + '</span></div>' +
                '<button type="button" class="ws-sidebar__logout" data-user-action="logout" aria-label="Đăng xuất" title="Đăng xuất">' +
                '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i></button></div>';

            const collapseBtn = document.getElementById('ws-sidebar-collapse');
            const prefs = Store.loadPrefs();
            const setCollapsed = (value) => {
                host.classList.toggle('is-collapsed', value);
                const icon = collapseBtn.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-left', !value);
                    icon.classList.toggle('fa-chevron-right', value);
                }
                collapseBtn.setAttribute('aria-label', value ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng');
            };
            /* Chỉ tự thu gọn trên tablet (≤ 1180px) để giữ chỗ cho nội dung.
               Từ 1181px trở lên, giữ nhãn menu đầy đủ cho dễ đọc. */
            const compact = window.innerWidth > 1024 && window.innerWidth <= 1180;
            setCollapsed(compact || (!!prefs.collapsed && window.innerWidth > 1180));
            collapseBtn.addEventListener('click', () => {
                const next = !host.classList.contains('is-collapsed');
                setCollapsed(next);
                Store.savePrefs({ collapsed: next });
            });
        };

        const initDrawer = () => {
            const sidebar = document.getElementById('ws-sidebar');
            const toggle = document.getElementById('ws-menu-toggle');
            if (!sidebar || !toggle) return;
            let overlay = document.querySelector('.ws-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'ws-overlay';
                document.body.appendChild(overlay);
            }
            const close = () => {
                sidebar.classList.remove('is-open');
                overlay.classList.remove('is-active');
                toggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            };
            toggle.addEventListener('click', () => {
                if (sidebar.classList.contains('is-open')) { close(); return; }
                sidebar.classList.add('is-open');
                overlay.classList.add('is-active');
                toggle.setAttribute('aria-expanded', 'true');
                document.body.style.overflow = 'hidden';
            });
            overlay.addEventListener('click', close);
            sidebar.addEventListener('click', (e) => {
                if (e.target.closest('.ws-nav-link')) close();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && sidebar.classList.contains('is-open')) close();
            });
            window.addEventListener('resize', () => {
                if (window.innerWidth > 1024 && sidebar.classList.contains('is-open')) close();
            });
        };

        const renderHeader = () => {
            const file = currentFile();
            const page = PAGES[file] || PAGES[CONFIG.homeFile];
            const user = Store.currentUser();
            const role = Store.roleOf(user);

            const titleEl = document.getElementById('ws-page-title');
            if (titleEl) titleEl.textContent = page.title;
            document.title = (page.title + ' | ' + 'CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase();

            const crumbEl = document.getElementById('ws-breadcrumb');
            if (crumbEl) {
                const crumbs = ['<li><a href="' + CONFIG.homeFile + '"><i class="fa-solid fa-house" aria-hidden="true"></i> Workspace</a></li>'];
                if (file === 'task-detail.html') crumbs.push('<li><a href="tasks.html">Nhiệm vụ</a></li>');
                else if (file === 'organization-detail.html') crumbs.push('<li><a href="organizations.html">Cơ quan, đơn vị</a></li>');
                else if (file === 'report-editor.html') crumbs.push('<li><a href="reports.html">Báo cáo</a></li>');
                crumbs.push(file === CONFIG.homeFile
                    ? '<li aria-current="page">Bảng điều hành</li>'
                    : '<li aria-current="page">' + util.escape(page.crumb) + '</li>');
                crumbEl.innerHTML = crumbs.join('');
            }

            const search = document.getElementById('ws-search');
            if (search) {
                search.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const input = search.querySelector('input');
                    const q = String(input ? input.value : '').trim();
                    ui.go('tasks.html', q ? { q: q } : null);
                });
            }

            const noticeHost = document.getElementById('ws-notifications');
            if (noticeHost) {
                const list = Store.visibleNotifications(user);
                const unread = list.filter((n) => !n.read).length;
                const icons = {
                    task_new: 'fa-list-check', task_change: 'fa-pen', task_due: 'fa-clock', task_overdue: 'fa-triangle-exclamation',
                    report_sent: 'fa-paper-plane', report_approved: 'fa-circle-check', report_revision: 'fa-rotate-left',
                    meeting: 'fa-calendar-days', calendar_change: 'fa-calendar', system: 'fa-gear', integration: 'fa-arrows-rotate'
                };
                noticeHost.innerHTML =
                    '<div class="ws-dropdown" data-dropdown>' +
                    '<button type="button" class="ws-icon-btn" data-dropdown-trigger aria-expanded="false" aria-label="Thông báo (' + unread + ' chưa đọc)">' +
                    '<i class="fa-regular fa-bell" aria-hidden="true"></i>' +
                    (unread ? '<span class="ws-icon-btn__dot">' + (unread > 9 ? '9+' : unread) + '</span>' : '') + '</button>' +
                    '<div class="ws-dropdown__menu ws-dropdown__menu--wide">' +
                    '<div class="ws-dropdown__header"><span>Thông báo gần đây</span><span class="ws-dropdown__count">' + unread + ' chưa đọc</span></div>' +
                    '<div class="ws-notice-list">' +
                    (list.slice(0, 5).map((n) => '<a class="ws-notice-item' + (n.read ? '' : ' is-unread') + '" href="' + n.href + '">' +
                        '<span class="ws-notice-item__icon"><i class="fa-solid ' + (icons[n.type] || 'fa-bell') + '" aria-hidden="true"></i></span>' +
                        '<span class="ws-notice-item__body"><span class="ws-notice-item__title">' + util.escape(n.title) + '</span>' +
                        '<span class="ws-notice-item__text">' + util.escape(n.body) + '</span>' +
                        '<span class="ws-notice-item__time">' + util.escape(util.timeAgo(n.createdAt)) + '</span></span></a>').join('') ||
                        '<p class="ws-notice-empty">Không có thông báo.</p>') +
                    '</div><div class="ws-dropdown__divider" role="separator"></div>' +
                    '<button type="button" class="ws-dropdown__item" data-mark-read><i class="fa-solid fa-check-double" aria-hidden="true"></i>Đánh dấu tất cả đã đọc</button>' +
                    '<a class="ws-dropdown__item" href="notifications.html"><i class="fa-solid fa-list" aria-hidden="true"></i>Xem tất cả thông báo</a>' +
                    '</div></div>';
                const markBtn = noticeHost.querySelector('[data-mark-read]');
                if (markBtn) {
                    markBtn.addEventListener('click', () => {
                        Store.markAllRead();
                        const dot = noticeHost.querySelector('.ws-icon-btn__dot');
                        if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
                        noticeHost.querySelectorAll('.ws-notice-item.is-unread').forEach((item) => item.classList.remove('is-unread'));
                        ui.toast('Đã đánh dấu tất cả thông báo là đã đọc.', 'success');
                    });
                }
            }

            const userHost = document.getElementById('ws-user-host');
            if (userHost && user) {
                userHost.innerHTML =
                    '<div class="ws-dropdown" data-dropdown>' +
                    '<button type="button" class="ws-user" data-dropdown-trigger aria-expanded="false" aria-label="Mở menu tài khoản">' +
                    ui.avatar(user, 'sm') + '<span class="ws-user__meta"><span class="ws-user__name">' + util.escape(user.name) + '</span>' +
                    '<span class="ws-user__role">' + util.escape(role ? role.name : '') + '</span></span>' +
                    '<i class="fa-solid fa-chevron-down ws-user__chevron" aria-hidden="true"></i></button>' +
                    '<ul class="ws-dropdown__menu">' +
                    '<li class="ws-dropdown__header">' + util.escape(role ? role.name : '') + '</li>' +
                    '<li><span class="ws-dropdown__item ws-u-static"><i class="fa-solid fa-id-badge" aria-hidden="true"></i>' + util.escape(user.username) + '</span></li>' +
                    '<li class="ws-dropdown__divider" role="separator"></li>' +
                    '<li><button type="button" class="ws-dropdown__item" data-user-action="profile"><i class="fa-solid fa-user-pen" aria-hidden="true"></i>Thông tin tài khoản</button></li>' +
                    '<li><button type="button" class="ws-dropdown__item" data-user-action="permissions"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Quyền hạn của tôi</button></li>' +
                    '<li><button type="button" class="ws-dropdown__item" data-user-action="cms"><i class="fa-solid fa-newspaper" aria-hidden="true"></i>Mở CMS quản trị</button></li>' +
                    '<li class="ws-dropdown__divider" role="separator"></li>' +
                    '<li><button type="button" class="ws-dropdown__item ws-dropdown__item--danger" data-user-action="logout">' +
                    '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>Đăng xuất</button></li></ul></div>';
            }
        };

        const initUserActions = () => {
            if (initUserActions.done) return;
            initUserActions.done = true;
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-user-action]');
                if (!btn) return;
                const action = btn.dataset.userAction;
                const user = Store.currentUser();
                const role = Store.roleOf(user);

                if (action === 'logout') {
                    ui.confirm({
                        tone: 'warning',
                        heading: 'Đăng xuất khỏi Workspace?',
                        message: 'Phiên làm việc sẽ kết thúc trên thiết bị này.',
                        confirmText: 'Đăng xuất'
                    }).then(async (ok) => {
                        if (!ok) return;
                        await Store.logout();
                        window.location.href = CONFIG.loginFile;
                    });
                    return;
                }

                if (action === 'permissions') {
                    ui.openModal({
                        title: 'Quyền hạn của tôi',
                        subtitle: role ? role.name + ' — ' + DATA_SCOPES[role.scope] : '',
                        footer: false,
                        content: '<div class="ws-note ws-note--warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
                            '<span>Mọi thao tác quan trọng được kiểm tra quyền tại máy chủ theo vai trò và phạm vi dữ liệu.</span></div>' +
                            '<ul class="ws-perm-list ws-u-mt">' + Object.keys(PERMISSIONS).map((p) =>
                                '<li><i class="fa-solid ' + (Store.can(p, user) ? 'fa-circle-check' : 'fa-circle-xmark') + '" aria-hidden="true"></i>' +
                                util.escape(PERMISSIONS[p]) + '</li>').join('') + '</ul>'
                    });
                    return;
                }

                if (action === 'profile') {
                    const org = user ? Store.orgById(user.orgId) : null;
                    ui.openModal({
                        title: 'Thông tin tài khoản',
                        subtitle: 'Thông tin tài khoản đang đăng nhập',
                        footer: false,
                        content: '<dl class="ws-detail-list">' +
                            '<dt>Họ và tên</dt><dd>' + util.escape(user ? user.name : '—') + '</dd>' +
                            '<dt>Tên đăng nhập</dt><dd>' + util.escape(user ? user.username : '—') + '</dd>' +
                            '<dt>Email công vụ</dt><dd>' + util.escape(user ? user.email : '—') + '</dd>' +
                            '<dt>Đơn vị</dt><dd>' + util.escape(org ? org.name : '—') + '</dd>' +
                            '<dt>Chức vụ</dt><dd>' + util.escape(user ? user.position : '—') + '</dd>' +
                            '<dt>Vai trò</dt><dd>' + util.escape(role ? role.name : '—') + '</dd>' +
                            '<dt>Phạm vi dữ liệu</dt><dd>' + util.escape(DATA_SCOPES[role ? role.scope : 'own']) + '</dd></dl>'
                    });
                    return;
                }

                if (action === 'cms') {
                    ui.confirm({
                        tone: 'primary',
                        heading: 'Mở khu vực quản trị nội dung?',
                        message: 'CMS là hệ thống riêng, dùng tài khoản CMS để đăng nhập. Tài khoản Workspace không dùng chung với CMS.',
                        confirmText: 'Mở CMS'
                    }).then((ok) => {
                        if (ok) window.open('../cms/login.html', '_blank', 'noopener');
                    });
                }
            });
        };

        const requirePerm = (perm, message) => {
            if (Store.can(perm)) return true;
            ui.toast(message || 'Vai trò của bạn không có quyền thực hiện thao tác này.', 'error');
            return false;
        };

        const init = () => {
            if (!document.querySelector('.ws-app')) return;
            if (!guard()) return;
            renderSidebar();
            renderHeader();
            initDrawer();
            initUserActions();
            ui.initDropdowns();
            ui.initFilterToggles();
            applyPermissions();
            document.querySelectorAll('.ws-year').forEach((el) => { el.textContent = new Date().getFullYear(); });
            document.querySelectorAll('.ws-version').forEach((el) => { el.textContent = 'v' + CONFIG.version; });
        };

        return {
            init: init, currentFile: currentFile, isLogin: isLogin, guard: guard,
            applyPermissions: applyPermissions, requirePerm: requirePerm,
            renderHeader: renderHeader, renderSidebar: renderSidebar, PAGES: PAGES
        };
    })();

    /* =========================================================================
       8. BỘ ĐIỀU KHIỂN TRANG (mỗi module chỉ chạy khi trang có phần tử gốc)
       ========================================================================= */

    /* 8.1 Đăng nhập ------------------------------------------------------- */

    const LoginPage = (function () {
        const init = () => {
            const form = document.getElementById('ws-login-form');
            if (!form) return;

            const errorBox = document.getElementById('ws-login-error');
            const errorText = document.getElementById('ws-login-error-text');
            const submit = document.getElementById('ws-login-submit');
            const toggle = document.getElementById('ws-login-toggle');
            const password = document.getElementById('ws-login-password');
            const remember = document.getElementById('ws-login-remember');
            const lastUserKey = 'hcm-ws-last-user';

            try {
                const savedUser = window.localStorage.getItem(lastUserKey);
                if (savedUser) {
                    form.querySelector('[name="username"]').value = savedUser;
                    if (remember) remember.checked = true;
                }
            } catch (e) { /* bỏ qua */ }

            /* Đã có phiên hợp lệ: chuyển thẳng tới trang đích */
            window.PortalAPI.auth.me().then((me) => {
                if (me && me.user && me.user.system === 'workspace') {
                    const next = ui.query('next');
                    const safe = next && /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next) ? next : CONFIG.homeFile;
                    window.location.replace(safe);
                }
            }).catch(() => { /* chưa đăng nhập */ });

            const showError = (message) => {
                if (!errorBox) return;
                errorText.textContent = message;
                errorBox.classList.add('is-visible');
            };
            const hideError = () => { if (errorBox) errorBox.classList.remove('is-visible'); };

            if (toggle && password) {
                toggle.addEventListener('click', () => {
                    const show = password.type === 'password';
                    password.type = show ? 'text' : 'password';
                    toggle.setAttribute('aria-pressed', String(show));
                    toggle.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
                    const icon = toggle.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('fa-eye', !show);
                        icon.classList.toggle('fa-eye-slash', show);
                    }
                    password.focus();
                });
            }

            form.addEventListener('input', () => {
                hideError();
                password.classList.remove('is-invalid');
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideError();
                if (!ui.validateForm(form)) return;
                const data = ui.formData(form);
                submit.disabled = true;
                submit.classList.add('is-loading');
                const label = submit.querySelector('span');
                if (label) label.textContent = 'Đang xác thực…';

                const result = await Store.login(data.username, data.password);

                submit.disabled = false;
                submit.classList.remove('is-loading');
                if (label) label.textContent = 'Đăng nhập';
                if (!result.ok) {
                    showError(result.message);
                    password.classList.add('is-invalid');
                    password.focus();
                    return;
                }
                try {
                    if (remember && remember.checked) window.localStorage.setItem(lastUserKey, data.username);
                    else window.localStorage.removeItem(lastUserKey);
                } catch (err) { /* bỏ qua */ }

                const next = ui.query('next');
                const safe = next && /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next) ? next : CONFIG.homeFile;
                window.location.href = safe;
            });

            document.querySelectorAll('.ws-year').forEach((el) => { el.textContent = new Date().getFullYear(); });
            document.querySelectorAll('.ws-version').forEach((el) => { el.textContent = 'v' + CONFIG.version; });
        };
        return { init: init };
    })();

    /* 8.2 Bảng điều hành -------------------------------------------------- */

    const DashboardPage = (function () {
        let range = '30';

        const init = () => {
            const root = document.getElementById('ws-dash');
            if (!root) return;
            const select = document.getElementById('ws-dash-range');
            if (select) {
                range = select.value || '30';
                select.addEventListener('change', () => {
                    range = select.value;
                    render();
                });
            }
            const reset = document.getElementById('ws-dash-reset');
            if (reset) {
                reset.addEventListener('click', async () => {
                    try {
                        await Store.load();
                        ui.toast('Đã làm mới dữ liệu điều hành.', 'success');
                        DashboardPage.init();
                    } catch (err) {
                        ui.toast(err.message || 'Không làm mới được dữ liệu.', 'error');
                    }
                });
                reset.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Làm mới';
            }
            render();
        };

        const statCard = (o) => '<a class="ws-stat ws-stat--' + (o.tone || 'primary') + '" href="' + o.href + '">' +
            '<span class="ws-stat__top"><span class="ws-stat__label">' + util.escape(o.label) + '</span>' +
            '<span class="ws-stat__icon"><i class="fa-solid ' + o.icon + '" aria-hidden="true"></i></span></span>' +
            '<span class="ws-stat__value">' + o.value + '</span>' +
            '<span class="ws-stat__foot">' + util.escape(o.foot) + '</span></a>';

        const render = () => {
            const user = Store.currentUser();
            const stats = Store.taskStats();
            const tasks = Store.tasks().map(Store.recomputeTaskStatus);
            const orgs = Store.organizations();
            const users = Store.users();
            const reports = Store.reports();

            const statsHost = document.getElementById('ws-dash-stats');
            if (statsHost) {
                statsHost.innerHTML = [
                    statCard({ label: 'Tổng số nhiệm vụ', icon: 'fa-list-check', value: stats.total, tone: 'primary', href: 'tasks.html', foot: stats.new + ' nhiệm vụ chưa bắt đầu' }),
                    statCard({ label: 'Đang thực hiện', icon: 'fa-person-running', value: stats.doing, tone: 'info', href: 'tasks.html?status=doing', foot: 'Đang theo dõi tiến độ' }),
                    statCard({ label: 'Chờ xác nhận', icon: 'fa-clock', value: stats.review, tone: 'warning', href: 'tasks.html?status=review', foot: 'Cần xác nhận hoàn thành' }),
                    statCard({ label: 'Đã hoàn thành', icon: 'fa-circle-check', value: stats.done, tone: 'success', href: 'tasks.html?status=done', foot: (stats.total ? Math.round(stats.done * 100 / stats.total) : 0) + '% tổng nhiệm vụ' }),
                    statCard({ label: 'Quá hạn', icon: 'fa-triangle-exclamation', value: stats.overdue, tone: 'danger', href: 'tasks.html?status=overdue', foot: 'Cần xử lý ngay' }),
                    statCard({ label: 'Đơn vị tham gia', icon: 'fa-building-columns', value: orgs.filter((o) => o.status !== 'archived').length, tone: 'teal', href: 'organizations.html', foot: orgs.filter((o) => o.parentId).length + ' đơn vị trực thuộc' }),
                    statCard({ label: 'Người dùng', icon: 'fa-users', value: users.length, tone: 'indigo', href: 'users.html', foot: users.filter((u) => u.status === 'active').length + ' tài khoản hoạt động' }),
                    statCard({ label: 'Tổng số báo cáo', icon: 'fa-file-lines', value: reports.length, tone: 'muted', href: 'reports.html', foot: reports.filter((r) => r.status === 'pending').length + ' chờ duyệt' })
                ].join('');
            }

            /* Biểu đồ 1: nhiệm vụ giao mới vs hoàn thành theo thời gian */
            const timeline = document.getElementById('ws-chart-timeline');
            if (timeline) {
                const days = Number(range) || 30;
                const count = 6;
                const span = Math.max(3, Math.round(days / count));
                const buckets = [];
                for (let i = count - 1; i >= 0; i -= 1) {
                    const end = util.addDays(util.today(), -i * span);
                    const start = util.addDays(end, -(span - 1));
                    buckets.push({
                        label: util.pad(start.getDate()) + '/' + util.pad(start.getMonth() + 1),
                        created: tasks.filter((t) => { const d = util.parseDate(t.createdAt); return d && d >= start && d <= end; }).length,
                        done: tasks.filter((t) => { const d = util.parseDate(t.updatedAt || t.createdAt); return t.status === 'done' && d && d >= start && d <= end; }).length
                    });
                }
                timeline.innerHTML = columnChart(buckets);
            }

            const rangeLabel = document.getElementById('ws-dash-range-label');
            if (rangeLabel) rangeLabel.textContent = 'Từ ' + util.formatDate(util.addDays(util.today(), -(Number(range) || 30))) + ' đến ' + util.formatDate(new Date());

            /* Biểu đồ 2: tỷ lệ theo trạng thái */
            const statusHost = document.getElementById('ws-chart-status');
            if (statusHost) {
                statusHost.innerHTML = barChart([
                    { label: LABELS.taskStatus.new, value: stats.new, tone: 'muted' },
                    { label: LABELS.taskStatus.doing, value: stats.doing, tone: 'info' },
                    { label: LABELS.taskStatus.review, value: stats.review, tone: 'warning' },
                    { label: LABELS.taskStatus.done, value: stats.done, tone: 'success' },
                    { label: LABELS.taskStatus.overdue, value: stats.overdue, tone: 'danger' },
                    { label: LABELS.taskStatus.paused, value: stats.paused, tone: 'neutral' },
                    { label: LABELS.taskStatus.cancelled, value: stats.cancelled, tone: 'neutral' }
                ].filter((r) => r.value > 0), stats.total);
            }

            /* Biểu đồ 3: khối lượng theo đơn vị */
            const orgHost = document.getElementById('ws-chart-orgs');
            if (orgHost) {
                const rows = Store.organizations().map((org) => ({
                    label: org.code,
                    name: org.name,
                    value: tasks.filter((t) => t.ownerOrgId === org.id).length
                })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 7);
                const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));
                orgHost.innerHTML = rows.length
                    ? '<div class="ws-bars">' + rows.map((r) => '<div class="ws-bars__row">' +
                        '<span class="ws-bars__label" title="' + util.escape(r.name) + '">' + util.escape(r.label) + '</span>' +
                        '<span class="ws-bars__track"><span class="ws-bars__fill ws-bars__fill--indigo" style="width:' + Math.round(r.value * 100 / max) + '%"></span></span>' +
                        '<span class="ws-bars__value">' + r.value + '</span></div>').join('') + '</div>' +
                    '<p class="ws-chart__legend"><i class="fa-solid fa-chart-bar" aria-hidden="true"></i> Số nhiệm vụ theo đơn vị chủ trì</p>'
                    : ui.emptyState({ icon: 'fa-chart-bar', title: 'Chưa có dữ liệu', message: 'Chưa có nhiệm vụ nào được giao cho đơn vị.' });
            }

            /* Biểu đồ 4: tỷ lệ hoàn thành */
            const doneHost = document.getElementById('ws-chart-done');
            if (doneHost) {
                doneHost.innerHTML = donutChart([
                    { label: 'Hoàn thành', value: stats.done, tone: 'success' },
                    { label: 'Đang thực hiện', value: stats.doing + stats.review, tone: 'primary' },
                    { label: 'Quá hạn', value: stats.overdue, tone: 'danger' },
                    { label: 'Chưa bắt đầu', value: stats.new + stats.paused + stats.cancelled, tone: 'muted' }
                ], stats.total);
            }

            /* Nhiệm vụ ưu tiên */
            const priorityHost = document.getElementById('ws-dash-priority');
            if (priorityHost) {
                const urgent = tasks.filter((t) => (t.priority === 'urgent' || t.priority === 'high') && t.status !== 'done' && t.status !== 'cancelled')
                    .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1));
                priorityHost.innerHTML = urgent.length ? urgent.slice(0, 4).map((t) =>
                    '<a class="ws-priority-item" href="task-detail.html?id=' + t.id + '">' +
                    '<span class="ws-priority-item__top">' + ui.priorityBadge(t.priority) +
                    '<span class="ws-priority-item__code">' + util.escape(t.code) + '</span></span>' +
                    '<span class="ws-priority-item__title">' + util.escape(t.title) + '</span>' +
                    '<span class="ws-priority-item__meta"><i class="fa-regular fa-building" aria-hidden="true"></i> ' +
                    util.escape(Store.orgName(t.ownerOrgId)) + '<span class="ws-dot" aria-hidden="true">•</span>' +
                    '<i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + util.formatDate(t.dueDate) + '</span>' +
                    ui.progress(t.progress, 'Tiến độ ' + t.code) + '</a>').join('')
                    : ui.emptyState({ icon: 'fa-flag', title: 'Không có nhiệm vụ ưu tiên', message: 'Chưa có nhiệm vụ mức ưu tiên cao hoặc khẩn cấp.' });
            }

            /* Sắp đến hạn */
            const dueHost = document.getElementById('ws-dash-due');
            if (dueHost) {
                const due = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
                    .map((t) => ({ task: t, days: util.daysLeft(t.dueDate) }))
                    .filter((x) => x.days !== null && x.days <= 7)
                    .sort((a, b) => a.days - b.days);
                dueHost.innerHTML = due.length ? due.slice(0, 5).map((x) =>
                    '<a class="ws-due-item" href="task-detail.html?id=' + x.task.id + '">' +
                    '<span class="ws-due-item__badge' + (x.days < 0 ? ' is-late' : x.days <= 2 ? ' is-near' : '') + '">' +
                    (x.days < 0 ? 'Quá ' + Math.abs(x.days) + ' ngày' : x.days === 0 ? 'Hôm nay' : 'Còn ' + x.days + ' ngày') + '</span>' +
                    '<span class="ws-due-item__body"><span class="ws-due-item__title">' + util.escape(x.task.title) + '</span>' +
                    '<span class="ws-due-item__meta">' + util.escape(x.task.code) + ' · ' + util.escape(Store.orgName(x.task.ownerOrgId)) + '</span></span></a>').join('')
                    : ui.emptyState({ icon: 'fa-mug-hot', title: 'Không có việc gấp', message: 'Không có nhiệm vụ đến hạn trong 7 ngày tới.' });
            }

            /* Lịch công tác */
            const calHost = document.getElementById('ws-dash-calendar');
            if (calHost) {
                const upcoming = Store.events().filter((e) => util.parseDate(e.start) >= util.today())
                    .sort((a, b) => util.parseDate(a.start) - util.parseDate(b.start)).slice(0, 4);
                calHost.innerHTML = upcoming.length ? upcoming.map((e) => {
                    const start = util.parseDate(e.start);
                    return '<div class="ws-agenda-item"><span class="ws-agenda-item__date">' +
                        '<span class="ws-agenda-item__day">' + util.pad(start.getDate()) + '</span>' +
                        '<span class="ws-agenda-item__month">Th' + (start.getMonth() + 1) + '</span></span>' +
                        '<span class="ws-agenda-item__body"><span class="ws-agenda-item__title">' + util.escape(e.title) + '</span>' +
                        '<span class="ws-agenda-item__meta"><i class="fa-regular fa-clock" aria-hidden="true"></i> ' +
                        util.pad(start.getHours()) + ':' + util.pad(start.getMinutes()) + ' · ' + util.escape(e.location) + '</span></span>' +
                        '<span class="ws-badge ws-badge--info">' + util.escape(LABELS.eventType[e.type] || e.type) + '</span></div>';
                }).join('') : ui.emptyState({ icon: 'fa-calendar-xmark', title: 'Chưa có lịch', message: 'Không có sự kiện sắp tới.' });
            }

            /* Thông báo */
            const noticeHost = document.getElementById('ws-dash-notices');
            if (noticeHost) {
                const list = Store.visibleNotifications(user).slice(0, 4);
                noticeHost.innerHTML = list.length ? list.map((n) =>
                    '<a class="ws-feed-item' + (n.read ? '' : ' is-unread') + '" href="' + n.href + '">' +
                    '<span class="ws-feed-item__dot" aria-hidden="true"></span><span class="ws-feed-item__body">' +
                    '<span class="ws-feed-item__title">' + util.escape(n.title) + '</span>' +
                    '<span class="ws-feed-item__text">' + util.escape(n.body) + '</span>' +
                    '<span class="ws-feed-item__time">' + util.timeAgo(n.createdAt) + '</span></span></a>').join('')
                    : ui.emptyState({ icon: 'fa-bell-slash', title: 'Không có thông báo', message: 'Bạn đã xem hết thông báo.' });
            }

            /* Báo cáo mới */
            const reportHost = document.getElementById('ws-dash-reports');
            if (reportHost) {
                const recent = reports.slice().sort((a, b) => util.parseDate(b.createdDate) - util.parseDate(a.createdDate)).slice(0, 4);
                reportHost.innerHTML = recent.length ? recent.map((r) =>
                    '<a class="ws-due-item" href="report-editor.html?id=' + r.id + '">' +
                    '<span class="ws-due-item__badge ws-due-item__badge--plain">' + util.escape(r.code) + '</span>' +
                    '<span class="ws-due-item__body"><span class="ws-due-item__title">' + util.escape(r.name) + '</span>' +
                    '<span class="ws-due-item__meta">' + util.escape(Store.orgName(r.orgId)) + ' · ' + util.formatDate(r.createdDate) + '</span></span>' +
                    ui.statusBadge(r.status, 'report') + '</a>').join('')
                    : ui.emptyState({ icon: 'fa-file-circle-xmark', title: 'Chưa có báo cáo', message: 'Chưa có báo cáo nào được tạo.' });
            }

            /* Hoạt động gần đây */
            const activityHost = document.getElementById('ws-dash-activity');
            if (activityHost) {
                const logs = Store.logs().slice(0, 6);
                activityHost.innerHTML = logs.length ? '<ul class="ws-timeline">' + logs.map((l) =>
                    '<li class="ws-timeline__item"><span class="ws-timeline__marker"><i class="fa-solid ' +
                    (ACTION_ICON[l.action] || 'fa-circle') + '" aria-hidden="true"></i></span><span class="ws-timeline__body">' +
                    '<span class="ws-timeline__title"><strong>' + util.escape(Store.userName(l.userId)) + '</strong> — ' +
                    util.escape(ACTION_LABEL[l.action] || l.action) + '</span>' +
                    '<span class="ws-timeline__text">' + util.escape(l.targetType) + ': ' + util.escape(l.targetName) + '</span>' +
                    '<span class="ws-timeline__time">' + util.timeAgo(l.createdAt) + '</span></span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-clock-rotate-left', title: 'Chưa có hoạt động', message: 'Nhật ký hoạt động đang trống.' });
            }

            /* Đơn vị tham gia */
            const orgTable = document.getElementById('ws-dash-org-table');
            if (orgTable) {
                orgTable.innerHTML = Store.organizations().filter((o) => o.status !== 'archived').slice(0, 5).map((o) =>
                    '<tr><td data-label="Đơn vị"><a class="ws-link" href="organization-detail.html?id=' + o.id + '">' +
                    util.escape(o.name) + '</a></td>' +
                    '<td data-label="Loại hình">' + util.escape(LABELS.orgType[o.type] || o.type) + '</td>' +
                    '<td data-label="Nhiệm vụ">' + tasks.filter((t) => t.ownerOrgId === o.id).length + '</td>' +
                    '<td data-label="Trạng thái">' + ui.statusBadge(o.status, 'org') + '</td></tr>').join('');
            }
        };

        /* Biểu đồ cột (SVG) kèm chú giải và bảng dữ liệu dự phòng */
        const columnChart = (buckets) => {
            const width = 640;
            const height = 220;
            const padL = 34;
            const padB = 30;
            const padT = 12;
            const innerW = width - padL - 12;
            const innerH = height - padB - padT;
            const max = Math.max.apply(null, buckets.map((b) => Math.max(b.created, b.done)).concat([1]));
            const groupW = innerW / buckets.length;
            const barW = Math.min(20, Math.max(6, groupW / 3));
            let grid = '';
            /* Chia trục tung thành bậc nguyên để không lặp nhãn (1, 2, 2, 1…) khi dữ liệu nhỏ */
            const step = Math.max(1, Math.ceil(max / 4));
            const top = step * 4;
            [0, 1, 2, 3, 4].forEach((i) => {
                const y = padT + innerH * (1 - i / 4);
                grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (width - 12) + '" y2="' + y + '" class="ws-chart__grid"/>' +
                    '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" class="ws-chart__axis" text-anchor="end">' + (step * i) + '</text>';
            });
            let bars = '';
            buckets.forEach((b, i) => {
                const cx = padL + groupW * i + groupW / 2;
                const h1 = innerH * (b.created / top);
                const h2 = innerH * (b.done / top);
                bars += '<g><rect class="ws-chart__bar ws-chart__bar--primary" x="' + (cx - barW - 2) + '" y="' + (padT + innerH - h1) +
                    '" width="' + barW + '" height="' + Math.max(0, h1) + '" rx="3"><title>' + b.label + ': ' + b.created + ' nhiệm vụ giao</title></rect>' +
                    '<rect class="ws-chart__bar ws-chart__bar--success" x="' + (cx + 2) + '" y="' + (padT + innerH - h2) +
                    '" width="' + barW + '" height="' + Math.max(0, h2) + '" rx="3"><title>' + b.label + ': ' + b.done + ' nhiệm vụ hoàn thành</title></rect>' +
                    '<text x="' + cx + '" y="' + (height - 10) + '" class="ws-chart__axis" text-anchor="middle">' + b.label + '</text></g>';
            });
            return '<div class="ws-chart"><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Tiến độ nhiệm vụ theo thời gian">' +
                grid + bars + '</svg><ul class="ws-chart__legend">' +
                '<li><span class="ws-chart__swatch ws-chart__swatch--primary"></span>Nhiệm vụ giao mới</li>' +
                '<li><span class="ws-chart__swatch ws-chart__swatch--success"></span>Nhiệm vụ hoàn thành</li></ul>' +
                '<details class="ws-chart__data"><summary>Xem bảng dữ liệu</summary>' +
                '<table class="ws-table ws-table--compact"><thead><tr><th scope="col">Thời điểm</th><th scope="col">Giao mới</th><th scope="col">Hoàn thành</th></tr></thead><tbody>' +
                buckets.map((b) => '<tr><td>' + b.label + '</td><td>' + b.created + '</td><td>' + b.done + '</td></tr>').join('') +
                '</tbody></table></details></div>';
        };

        const barChart = (rows, total) => {
            if (!total) return ui.emptyState({ icon: 'fa-chart-simple', title: 'Chưa có dữ liệu', message: 'Chưa có nhiệm vụ để thống kê theo trạng thái.' });
            const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));
            return '<div class="ws-bars">' + rows.map((r) => '<div class="ws-bars__row">' +
                '<span class="ws-bars__label">' + util.escape(r.label) + '</span>' +
                '<span class="ws-bars__track"><span class="ws-bars__fill ws-bars__fill--' + r.tone + '" style="width:' +
                Math.round(r.value * 100 / max) + '%"></span></span>' +
                '<span class="ws-bars__value">' + r.value + '<span class="ws-bars__pct">' + Math.round(r.value * 100 / total) + '%</span></span>' +
                '</div>').join('') + '</div>' +
                '<p class="ws-chart__legend"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Tổng ' + total + ' nhiệm vụ; tỷ lệ tính trên toàn bộ nhiệm vụ.</p>';
        };

        const donutChart = (slices, total) => {
            if (!total) return ui.emptyState({ icon: 'fa-chart-pie', title: 'Chưa có dữ liệu', message: 'Chưa có nhiệm vụ để tính tỷ lệ hoàn thành.' });
            const data = slices.filter((s) => s.value > 0);
            if (!data.length) return ui.emptyState({ icon: 'fa-chart-pie', title: 'Chưa có dữ liệu', message: 'Chưa có nhiệm vụ để tính tỷ lệ hoàn thành.' });
            const radius = 54;
            const cx = 70;
            const cy = 70;
            const stroke = 20;
            const circumference = 2 * Math.PI * radius;
            let offset = 0;
            const arcs = data.map((s) => {
                const dash = (s.value / total) * circumference;
                const arc = '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke-width="' + stroke +
                    '" class="ws-donut__seg ws-donut__seg--' + s.tone + '" stroke-dasharray="' + dash + ' ' + (circumference - dash) +
                    '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + s.label + ': ' + s.value + '</title></circle>';
                offset += dash;
                return arc;
            }).join('');
            const percent = Math.round(slices[0].value * 100 / total);
            return '<div class="ws-donut"><svg viewBox="0 0 140 140" role="img" aria-label="Tỷ lệ hoàn thành nhiệm vụ: ' + percent + '%">' +
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke-width="' + stroke + '" class="ws-donut__track"/>' +
                arcs + '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="ws-donut__value">' + percent + '%</text>' +
                '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="ws-donut__caption">hoàn thành</text></svg>' +
                '<ul class="ws-chart__legend ws-chart__legend--stack">' + slices.map((s) =>
                    '<li><span class="ws-chart__swatch ws-chart__swatch--' + s.tone + '"></span>' + util.escape(s.label) +
                    ' <strong>' + s.value + '</strong></li>').join('') + '</ul></div>';
        };

        return { init: init, columnChart: columnChart, barChart: barChart, donutChart: donutChart };
    })();

    /* 8.3 Nhiệm vụ ------------------------------------------------------- */

    const TasksPage = (function () {
        const state = { q: '', org: '', assignee: '', status: '', priority: '', due: '', sort: 'dueDate', dir: 'asc', page: 1, pageSize: 10, view: 'table' };

        const init = () => {
            const root = document.getElementById('ws-tasks');
            if (!root) return;

            state.q = ui.query('q') || '';
            state.status = ui.query('status') || '';
            state.priority = ui.query('priority') || '';
            state.due = ui.query('due') || '';
            state.view = Store.loadPrefs().taskView || 'table';

            const fill = (id, options) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = options;
            };
            fill('ws-tasks-org', '<option value="">Tất cả đơn vị</option>' + Store.organizations()
                .map((o) => '<option value="' + o.id + '">' + util.escape(o.name) + '</option>').join(''));
            fill('ws-tasks-assignee', '<option value="">Tất cả người phụ trách</option>' + Store.users()
                .filter((u) => u.status === 'active')
                .map((u) => '<option value="' + u.id + '">' + util.escape(u.name) + '</option>').join(''));
            fill('ws-tasks-status', '<option value="">Tất cả trạng thái</option>' + Object.keys(LABELS.taskStatus)
                .map((k) => '<option value="' + k + '">' + util.escape(LABELS.taskStatus[k]) + '</option>').join(''));
            fill('ws-tasks-priority', '<option value="">Mọi mức ưu tiên</option>' + Object.keys(LABELS.priority)
                .map((k) => '<option value="' + k + '">' + util.escape(LABELS.priority[k]) + '</option>').join(''));

            const sync = () => {
                [['ws-tasks-search', state.q], ['ws-tasks-org', state.org], ['ws-tasks-assignee', state.assignee],
                ['ws-tasks-status', state.status], ['ws-tasks-priority', state.priority], ['ws-tasks-due', state.due]]
                    .forEach((pair) => {
                        const el = document.getElementById(pair[0]);
                        if (el) el.value = pair[1];
                    });
                root.querySelectorAll('[data-view]').forEach((btn) => {
                    btn.classList.toggle('is-active', btn.dataset.view === state.view);
                    btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view));
                });
            };

            const search = document.getElementById('ws-tasks-search');
            if (search) search.addEventListener('input', util.debounce(() => {
                state.q = search.value.trim();
                state.page = 1;
                render();
            }, 200));
            ['ws-tasks-org', 'ws-tasks-assignee', 'ws-tasks-status', 'ws-tasks-priority', 'ws-tasks-due'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', () => {
                    state[id.replace('ws-tasks-', '')] = el.value;
                    state.page = 1;
                    render();
                });
            });
            const size = document.getElementById('ws-tasks-page-size');
            if (size) size.addEventListener('change', () => {
                state.pageSize = Number(size.value) || 10;
                state.page = 1;
                render();
            });
            const reset = document.getElementById('ws-tasks-reset');
            if (reset) reset.addEventListener('click', () => {
                Object.assign(state, { q: '', org: '', assignee: '', status: '', priority: '', due: '', page: 1 });
                sync();
                render();
                ui.toast('Đã xóa bộ lọc.', 'info');
            });
            document.querySelectorAll('[data-task-create]').forEach((btn) => btn.addEventListener('click', () => openForm(null)));
            const exportBtn = document.getElementById('ws-tasks-export');
            if (exportBtn) exportBtn.addEventListener('click', exportList);

            root.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-chip]');
                if (chip) {
                    state.status = chip.dataset.chip;
                    state.page = 1;
                    const sel = document.getElementById('ws-tasks-status');
                    if (sel) sel.value = state.status;
                    render();
                    return;
                }
                const viewBtn = e.target.closest('[data-view]');
                if (viewBtn) {
                    state.view = viewBtn.dataset.view;
                    state.page = 1;
                    Store.savePrefs({ taskView: state.view });
                    sync();
                    render();
                    return;
                }
                const th = e.target.closest('[data-sort]');
                if (th) {
                    const key = th.dataset.sort;
                    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    else { state.sort = key; state.dir = key === 'title' ? 'asc' : 'desc'; }
                    render();
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); return; }

                const editBtn = e.target.closest('[data-task-edit]');
                if (editBtn) { openForm(Store.taskById(editBtn.dataset.taskEdit)); return; }

                const delBtn = e.target.closest('[data-task-delete]');
                if (delBtn) {
                    if (!Shell.requirePerm('doc.manage', 'Vai trò của bạn không có quyền xóa nhiệm vụ.')) return;
                    const task = Store.taskById(delBtn.dataset.taskDelete);
                    if (!task) return;
                    ui.confirm({
                        heading: 'Xóa nhiệm vụ?',
                        message: 'Nhiệm vụ ' + task.code + ' sẽ được chuyển sang trạng thái đã hủy; lịch sử xử lý vẫn được lưu lại.',
                        confirmText: 'Xóa nhiệm vụ'
                    }).then((ok) => {
                        if (!ok) return;
                        Store.deleteTask(task.id);
                        ui.toast('Đã xóa nhiệm vụ ' + task.code + '.', 'success');
                        render();
                        Shell.renderSidebar();
                    });
                }
            });

            sync();
            render();
            if (window.location.hash === '#create') openForm(null);
        };

        const filtered = () => {
            const user = Store.currentUser();
            let list = Store.tasks().map(Store.recomputeTaskStatus);
            if (!Store.can('task.assign')) {
                list = list.filter((t) => (t.assigneeIds || []).indexOf(user.id) !== -1 || t.assignerId === user.id);
            }
            return list.filter((t) => {
                if (state.q && !util.matchText([t.code, t.title, t.desc, Store.orgName(t.ownerOrgId),
                (t.assigneeIds || []).map(Store.userName)], state.q)) return false;
                if (state.org && t.ownerOrgId !== state.org) return false;
                if (state.assignee && (t.assigneeIds || []).indexOf(state.assignee) === -1) return false;
                if (state.status && t.status !== state.status) return false;
                if (state.priority && t.priority !== state.priority) return false;
                if (state.due) {
                    const days = util.daysLeft(t.dueDate);
                    if (days === null) return false;
                    if (state.due === 'late' && days >= 0) return false;
                    if (state.due === 'today' && days !== 0) return false;
                    if (state.due === 'week' && (days < 0 || days > 7)) return false;
                    if (state.due === 'month' && (days < 0 || days > 30)) return false;
                }
                return true;
            });
        };

        const render = () => {
            const all = filtered();
            const total = all.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const start = (state.page - 1) * state.pageSize;
            const rows = util.sortBy(all, state.sort, state.dir).slice(start, start + state.pageSize);

            const stats = Store.taskStats();
            const chips = document.getElementById('ws-tasks-chips');
            if (chips) {
                chips.innerHTML = [
                    ['', 'Tất cả', stats.total],
                    ['new', LABELS.taskStatus.new, stats.new],
                    ['doing', LABELS.taskStatus.doing, stats.doing],
                    ['review', LABELS.taskStatus.review, stats.review],
                    ['done', LABELS.taskStatus.done, stats.done],
                    ['overdue', LABELS.taskStatus.overdue, stats.overdue]
                ].map((c) => '<button type="button" class="ws-chip' + (state.status === c[0] ? ' is-active' : '') +
                    '" data-chip="' + c[0] + '">' + util.escape(c[1]) + '<span class="ws-chip__count">' + c[2] + '</span></button>').join('');
            }

            const tableWrap = document.getElementById('ws-tasks-table-wrap');
            const cardsHost = document.getElementById('ws-tasks-cards');
            const kanban = document.getElementById('ws-tasks-kanban');
            if (tableWrap) tableWrap.hidden = state.view !== 'table';
            if (cardsHost) cardsHost.hidden = state.view !== 'list';
            if (kanban) kanban.hidden = state.view !== 'kanban';

            const body = document.getElementById('ws-tasks-body');
            if (body && state.view === 'table') {
                body.innerHTML = rows.map((t) => {
                    const assignees = (t.assigneeIds || []).map(Store.userById).filter(Boolean);
                    const left = util.daysLeft(t.dueDate);
                    return '<tr><td data-label="Nhiệm vụ"><a class="ws-table__title" href="task-detail.html?id=' + t.id + '">' +
                        util.escape(t.title) + '</a><span class="ws-table__sub">' + util.escape(t.code) + '</span></td>' +
                        '<td data-label="Đơn vị chủ trì">' + util.escape(Store.orgName(t.ownerOrgId)) + '</td>' +
                        '<td data-label="Người phụ trách"><span class="ws-avatar-group">' +
                        assignees.map((u) => ui.avatar(u, 'xs')).join('') +
                        '<span class="ws-avatar-group__label">' + util.escape(assignees.map((u) => u.name).join(', ') || '—') + '</span></span></td>' +
                        '<td data-label="Thời hạn"><span class="ws-date' + (left !== null && left < 0 && t.status !== 'done' && t.status !== 'cancelled' ? ' is-late' : '') + '">' +
                        util.formatDate(t.dueDate) + '</span><span class="ws-table__sub">' +
                        (left === null ? '' : t.status === 'done' ? 'Đã hoàn thành' : t.status === 'cancelled' ? 'Đã hủy' :
                            left < 0 ? 'Quá ' + Math.abs(left) + ' ngày' : 'Còn ' + left + ' ngày') + '</span></td>' +
                        '<td data-label="Ưu tiên">' + ui.priorityBadge(t.priority) + '</td>' +
                        '<td data-label="Trạng thái">' + ui.statusBadge(t.status) + '</td>' +
                        '<td data-label="Tiến độ">' + ui.progress(t.progress, 'Tiến độ ' + t.code) + '</td>' +
                        '<td data-label="Thao tác"><div class="ws-row-actions">' +
                        '<a class="ws-btn ws-btn--icon ws-btn--ghost" href="task-detail.html?id=' + t.id + '" title="Xem chi tiết" aria-label="Xem chi tiết ' + util.escape(t.code) + '"><i class="fa-solid fa-eye" aria-hidden="true"></i></a>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-task-edit="' + t.id + '" data-perm="data.edit" title="Chỉnh sửa" aria-label="Chỉnh sửa ' + util.escape(t.code) + '"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost ws-btn--danger" data-task-delete="' + t.id + '" data-perm="data.delete" title="Xóa" aria-label="Xóa ' + util.escape(t.code) + '"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
                        '</div></td></tr>';
                }).join('') || '<tr><td colspan="8">' + ui.emptyState({ icon: 'fa-list-check', title: 'Không có nhiệm vụ', message: 'Không có nhiệm vụ phù hợp với bộ lọc hiện tại.' }) + '</td></tr>';
            }

            if (cardsHost && state.view === 'list') {
                cardsHost.innerHTML = rows.map((t) => '<article class="ws-task-card"><div class="ws-task-card__head">' +
                    '<span class="ws-task-card__code">' + util.escape(t.code) + '</span><span class="ws-task-card__badges">' +
                    ui.priorityBadge(t.priority) + ui.statusBadge(t.status) + '</span></div>' +
                    '<a class="ws-task-card__title" href="task-detail.html?id=' + t.id + '">' + util.escape(t.title) + '</a>' +
                    '<p class="ws-task-card__meta"><i class="fa-regular fa-building" aria-hidden="true"></i> ' +
                    util.escape(Store.orgName(t.ownerOrgId)) + '<span class="ws-dot" aria-hidden="true">•</span>' +
                    '<i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + util.formatDate(t.dueDate) + '</p>' +
                    ui.progress(t.progress, 'Tiến độ ' + t.code) + '</article>').join('') ||
                    ui.emptyState({ icon: 'fa-list-check', title: 'Không có nhiệm vụ', message: 'Không có nhiệm vụ phù hợp với bộ lọc hiện tại.' });
            }

            if (kanban && state.view === 'kanban') {
                kanban.innerHTML = ['new', 'doing', 'review', 'done', 'overdue'].map((key) => {
                    const items = all.filter((t) => t.status === key);
                    return '<section class="ws-kanban__col"><h3 class="ws-kanban__title">' + util.escape(LABELS.taskStatus[key]) +
                        '<span class="ws-kanban__count">' + items.length + '</span></h3><div class="ws-kanban__list">' +
                        (items.map((t) => '<a class="ws-kanban__card" href="task-detail.html?id=' + t.id + '">' +
                            '<span class="ws-kanban__code">' + util.escape(t.code) + '</span>' +
                            '<span class="ws-kanban__card-title">' + util.escape(t.title) + '</span>' +
                            '<span class="ws-kanban__meta">' + util.escape(Store.orgName(t.ownerOrgId)) + '</span>' +
                            '<span class="ws-kanban__foot">' + ui.priorityBadge(t.priority) +
                            '<span class="ws-kanban__due">' + util.formatDate(t.dueDate) + '</span></span></a>').join('') ||
                            '<p class="ws-kanban__empty">Không có nhiệm vụ</p>') + '</div></section>';
                }).join('');
            }

            const pg = document.getElementById('ws-tasks-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'nhiệm vụ' });
            const count = document.getElementById('ws-tasks-count');
            if (count) count.textContent = total + ' nhiệm vụ';
            Shell.applyPermissions();
        };

        const openForm = (task) => {
            const isEdit = !!task;
            if (!Shell.requirePerm(isEdit ? 'task.edit' : 'doc.manage')) return;
            if (!isEdit && !Shell.requirePerm('task.assign')) return;
            const data = task || {};
            ui.openModal({
                title: isEdit ? 'Chỉnh sửa nhiệm vụ ' + data.code : 'Tạo nhiệm vụ mới',
                subtitle: 'Mọi thay đổi được ghi nhận trong lịch sử nhiệm vụ và nhật ký hoạt động.',
                size: 'lg',
                tone: 'primary',
                confirmText: isEdit ? 'Lưu thay đổi' : 'Tạo nhiệm vụ',
                confirmIcon: isEdit ? 'fa-floppy-disk' : 'fa-plus',
                content: '<form class="ws-form" id="ws-task-form" novalidate>' +
                    ui.field({ id: 'tf-title', label: 'Tên nhiệm vụ', required: true, wide: true, value: data.title || '', placeholder: 'Ví dụ: Tổng hợp báo cáo công tác quý IV/2026' }) +
                    ui.field({ id: 'tf-desc', label: 'Nội dung công việc', type: 'textarea', wide: true, rows: 4, value: data.desc || '', placeholder: 'Mô tả yêu cầu, phạm vi và kết quả cần đạt' }) +
                    ui.field({ id: 'tf-owner', label: 'Đơn vị chủ trì', type: 'select', required: true, options: ui.optionsFrom(Store.organizations().filter((o) => o.status === 'active'), 'id', 'name'), value: data.ownerOrgId || '' }) +
                    '<div class="ws-field"><span class="ws-label">Đơn vị phối hợp</span><div class="ws-checklist" id="tf-partners">' +
                    Store.organizations().filter((o) => o.status === 'active').map((o) => '<label class="ws-check ws-check--compact">' +
                        '<input type="checkbox" name="partner" value="' + o.id + '"' + ((data.partnerOrgIds || []).indexOf(o.id) !== -1 ? ' checked' : '') + '>' +
                        '<span>' + util.escape(o.code) + '</span></label>').join('') + '</div></div>' +
                    ui.field({ id: 'tf-assigner', label: 'Người giao nhiệm vụ', type: 'select', options: Store.users().filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name })), value: data.assignerId || (Store.currentUser() || {}).id }) +
                    ui.field({ id: 'tf-due', label: 'Thời hạn hoàn thành', type: 'date', required: true, value: data.dueDate || util.isoDate(util.addDays(util.today(), 7)) }) +
                    ui.field({ id: 'tf-priority', label: 'Mức độ ưu tiên', type: 'select', required: true, options: Object.keys(LABELS.priority).map((k) => ({ value: k, label: LABELS.priority[k] })), value: data.priority || 'normal' }) +
                    ui.field({ id: 'tf-progress', label: 'Tiến độ (%)', type: 'number', value: data.progress == null ? 0 : data.progress, attrs: 'min="0" max="100" step="5"' }) +
                    '<div class="ws-field ws-field--wide"><span class="ws-label">Người phụ trách</span><div class="ws-checklist ws-checklist--grid" id="tf-assignees">' +
                    Store.users().filter((u) => u.status === 'active').map((u) => '<label class="ws-check ws-check--compact">' +
                        '<input type="checkbox" name="assignee" value="' + u.id + '"' + ((data.assigneeIds || []).indexOf(u.id) !== -1 ? ' checked' : '') + '>' +
                        '<span>' + util.escape(u.name) + ' <em>' + util.escape((Store.orgById(u.orgId) || {}).code || '') + '</em></span></label>').join('') +
                    '</div><span class="ws-help">Chọn ít nhất một người phụ trách để theo dõi tiến độ.</span></div></form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-task-form');
                    if (!ui.validateForm(form)) return false;
                    const values = ui.formData(form);
                    const assignees = ui.checkedValues(form.querySelector('#tf-assignees'), 'input[name="assignee"]:checked');
                    if (!assignees.length) { ui.toast('Vui lòng chọn ít nhất một người phụ trách.', 'error'); return false; }
                    const payload = {
                        title: values['tf-title'], desc: values['tf-desc'], ownerOrgId: values['tf-owner'],
                        partnerOrgIds: ui.checkedValues(form.querySelector('#tf-partners'), 'input[name="partner"]:checked'),
                        assignerId: values['tf-assigner'], dueDate: values['tf-due'], priority: values['tf-priority'],
                        progress: Number(values['tf-progress']) || 0, assigneeIds: assignees
                    };
                    if (isEdit) payload.id = task.id;
                    const saved = Store.saveTask(payload);
                    ui.toast(isEdit ? 'Đã cập nhật nhiệm vụ ' + saved.code + '.' : 'Đã tạo nhiệm vụ ' + saved.code + ' và thông báo tới người phụ trách.', 'success');
                    render();
                    Shell.renderSidebar();
                    return true;
                }
            });
        };

        const exportList = () => {
            const rows = util.sortBy(filtered(), state.sort, state.dir);
            ui.exportCsv('nhiem-vu-' + util.isoDate(new Date()) + '.csv',
                ['Mã', 'Tên nhiệm vụ', 'Đơn vị chủ trì', 'Người phụ trách', 'Ngày giao', 'Thời hạn', 'Ưu tiên', 'Trạng thái', 'Tiến độ'],
                rows.map((t) => [t.code, t.title, Store.orgName(t.ownerOrgId), (t.assigneeIds || []).map(Store.userName).join('; '),
                util.formatDate(t.assignDate), util.formatDate(t.dueDate), LABELS.priority[t.priority],
                LABELS.taskStatus[t.status], t.progress + '%']));
            ui.toast('Đã xuất danh sách nhiệm vụ theo bộ lọc hiện tại (CSV).', 'success');
        };

        return { init: init, openForm: openForm };
    })();

    /* 8.4 Chi tiết nhiệm vụ ---------------------------------------------- */

    const TaskDetailPage = (function () {
        let taskId = '';
        let task = null;

        const init = () => {
            const root = document.getElementById('ws-task-detail');
            if (!root) return;
            task = Store.taskById(ui.query('id')) || Store.tasks()[0];
            if (!task) {
                root.innerHTML = ui.emptyState({
                    icon: 'fa-list-check', title: 'Không tìm thấy nhiệm vụ',
                    message: 'Nhiệm vụ không tồn tại hoặc đã bị xóa.',
                    action: '<a class="ws-btn ws-btn--primary" href="tasks.html">Về danh sách nhiệm vụ</a>'
                });
                return;
            }
            taskId = task.id;
            Store.recomputeTaskStatus(task);
            render();
            ui.initTabs(document);
        };

        const render = () => {
            task = Store.taskById(taskId);
            if (!task) { window.location.replace('tasks.html'); return; }
            renderHead();
            renderOverview();
            renderItems();
            renderAttachments();
            renderComments();
            renderHistory();
            ui.initTabs(document);
            Shell.applyPermissions();
        };

        const renderHead = () => {
            const host = document.getElementById('ws-task-head');
            if (!host) return;
            const deletable = Store.can('doc.manage');
            host.innerHTML = '<div class="ws-page-head__text"><div class="ws-page-head__badges">' +
                '<span class="ws-code">' + util.escape(task.code) + '</span>' + ui.statusBadge(task.status) + ui.priorityBadge(task.priority) +
                '</div><h1 class="ws-page-head__title">' + util.escape(task.title) + '</h1>' +
                '<p class="ws-page-head__desc">' + util.escape(Store.orgName(task.ownerOrgId)) + ' · Giao ngày ' +
                util.formatDate(task.assignDate) + ' · Thời hạn ' + util.formatDate(task.dueDate) + '</p></div>' +
                '<div class="ws-page-head__actions"><a class="ws-btn" href="tasks.html"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Danh sách</a>' +
                '<button type="button" class="ws-btn" id="ws-task-edit-btn" data-perm="data.edit"><i class="fa-solid fa-pen" aria-hidden="true"></i> Chỉnh sửa</button>' +
                '<button type="button" class="ws-btn ws-btn--primary" id="ws-task-progress-btn" data-perm="data.edit"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Cập nhật tiến độ</button>' +
                '<button type="button" class="ws-btn ws-btn--success" id="ws-task-submit-btn" data-perm="data.edit"' +
                (task.status === 'review' || task.status === 'done' ? ' disabled' : '') +
                '><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Đề xuất hoàn thành</button>' +
                '<button type="button" class="ws-btn ws-btn--success" id="ws-task-confirm-btn" data-perm="task.approve"' +
                (task.status === 'review' ? '' : ' hidden') + '><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Xác nhận hoàn thành</button>' +
                (deletable ? '<button type="button" class="ws-btn ws-btn--danger" id="ws-task-delete-btn"><i class="fa-solid fa-trash" aria-hidden="true"></i> Xóa</button>' : '') +
                '</div>';

            bind('ws-task-edit-btn', () => TasksPage.openForm(task));
            bind('ws-task-progress-btn', openProgress);
            bind('ws-task-submit-btn', () => {
                if (!Shell.requirePerm('task.edit')) return;
                ui.confirm({
                    tone: 'primary', heading: 'Đề xuất hoàn thành nhiệm vụ?',
                    message: 'Nhiệm vụ chuyển sang trạng thái “Chờ xác nhận” để người có thẩm quyền kiểm tra và xác nhận.',
                    confirmText: 'Gửi đề xuất'
                }).then((ok) => {
                    if (!ok) return;
                    Store.setTaskProgress(task.id, 100, 'Đề xuất hoàn thành nhiệm vụ');
                    Store.setTaskStatus(task.id, 'review', 'Đề xuất hoàn thành nhiệm vụ');
                    ui.toast('Đã gửi đề xuất hoàn thành nhiệm vụ.', 'success');
                    render();
                    Shell.renderSidebar();
                });
            });
            bind('ws-task-confirm-btn', () => {
                if (!Shell.requirePerm('task.approve', 'Chỉ người có quyền duyệt nhiệm vụ mới được xác nhận hoàn thành.')) return;
                ui.confirm({
                    tone: 'primary', heading: 'Xác nhận hoàn thành nhiệm vụ?',
                    message: 'Trạng thái nhiệm vụ được ghi nhận “Hoàn thành” và lưu vào lịch sử.',
                    confirmText: 'Xác nhận'
                }).then((ok) => {
                    if (!ok) return;
                    Store.setTaskStatus(task.id, 'done', 'Xác nhận hoàn thành nhiệm vụ');
                    ui.toast('Đã xác nhận hoàn thành nhiệm vụ.', 'success');
                    render();
                    Shell.renderSidebar();
                });
            });
            bind('ws-task-delete-btn', () => {
                if (!Shell.requirePerm('doc.manage')) return;
                ui.confirm({
                    heading: 'Xóa nhiệm vụ?', message: 'Nhiệm vụ ' + task.code + ' cùng toàn bộ trao đổi, lịch sử sẽ bị xóa.',
                    confirmText: 'Xóa nhiệm vụ'
                }).then((ok) => {
                    if (!ok) return;
                    Store.deleteTask(task.id);
                    ui.toast('Đã xóa nhiệm vụ.', 'success');
                    window.location.href = 'tasks.html';
                });
            });
        };

        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        };

        const renderOverview = () => {
            const host = document.getElementById('ws-task-overview');
            if (!host) return;
            const assignees = (task.assigneeIds || []).map(Store.userById).filter(Boolean);
            const partners = (task.partnerOrgIds || []).map(Store.orgById).filter(Boolean);
            const left = util.daysLeft(task.dueDate);
            host.innerHTML = '<div class="ws-detail-grid"><div class="ws-detail-grid__main">' +
                '<h3 class="ws-subhead">Mô tả nhiệm vụ</h3><div class="ws-rich-text"><p>' + util.escape(task.desc || 'Chưa có mô tả chi tiết.') + '</p></div>' +
                '<h3 class="ws-subhead">Tiến độ thực hiện</h3>' + ui.progress(task.progress, 'Tiến độ nhiệm vụ') +
                '<p class="ws-help">Cập nhật lần cuối: ' + util.formatDateTime(task.updatedAt || task.createdAt) + '</p>' +
                (task.pausedReason ? '<div class="ws-note ws-note--muted"><i class="fa-solid fa-pause" aria-hidden="true"></i> Tạm dừng: ' + util.escape(task.pausedReason) + '</div>' : '') +
                (task.cancelReason ? '<div class="ws-note ws-note--muted"><i class="fa-solid fa-ban" aria-hidden="true"></i> Đã hủy: ' + util.escape(task.cancelReason) + '</div>' : '') +
                '</div><aside class="ws-detail-grid__aside"><dl class="ws-detail-list">' +
                '<dt>Đơn vị chủ trì</dt><dd>' + util.escape(Store.orgName(task.ownerOrgId)) + '</dd>' +
                '<dt>Đơn vị phối hợp</dt><dd>' + (partners.length ? partners.map((o) => util.escape(o.name)).join('<br>') : '—') + '</dd>' +
                '<dt>Người giao nhiệm vụ</dt><dd>' + util.escape(Store.userName(task.assignerId)) + '</dd>' +
                '<dt>Người phụ trách</dt><dd>' + (assignees.length ? assignees.map((u) => util.escape(u.name)).join('<br>') : '—') + '</dd>' +
                '<dt>Ngày giao</dt><dd>' + util.formatDate(task.assignDate) + '</dd>' +
                '<dt>Thời hạn</dt><dd>' + util.formatDate(task.dueDate) + (left === null ? '' :
                    ' <span class="ws-badge ws-badge--' + (left < 0 ? 'danger' : left <= 2 ? 'warning' : 'muted') + '">' +
                    (left < 0 ? 'Quá ' + Math.abs(left) + ' ngày' : 'Còn ' + left + ' ngày') + '</span>') + '</dd>' +
                '<dt>Trạng thái</dt><dd>' + ui.statusBadge(task.status) + '</dd>' +
                '<dt>Ưu tiên</dt><dd>' + ui.priorityBadge(task.priority) + '</dd></dl></aside></div>';
        };

        const renderItems = () => {
            const host = document.getElementById('ws-task-items');
            if (!host) return;
            const items = Store.taskItems(task.id);
            const done = items.filter((i) => i.done).length;
            host.innerHTML = '<div class="ws-section-head"><div><p class="ws-card__subtitle">' + done + '/' + items.length + ' hạng mục hoàn thành</p></div>' +
                '<button type="button" class="ws-btn ws-btn--sm" id="ws-add-item" data-perm="data.edit"><i class="fa-solid fa-plus" aria-hidden="true"></i> Thêm hạng mục</button></div>' +
                (items.length ? '<ul class="ws-checklist-list">' + items.map((i) => '<li class="ws-checklist-row' + (i.done ? ' is-done' : '') + '">' +
                    '<label class="ws-check"><input type="checkbox" data-item-toggle="' + i.id + '"' + (i.done ? ' checked' : '') + '>' +
                    '<span>' + util.escape(i.title) + '</span></label><span class="ws-checklist-row__meta">' +
                    ui.avatar(Store.userById(i.assigneeId), 'xs') + '<span class="ws-date">' + util.formatDate(i.dueDate) + '</span></span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-list', title: 'Chưa có hạng mục', message: 'Chưa có công việc thành phần nào.' }));

            host.querySelectorAll('[data-item-toggle]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    if (!Shell.requirePerm('task.edit')) { cb.checked = !cb.checked; return; }
                    Store.setTaskItems(task.id, [{ id: cb.dataset.itemToggle, done: cb.checked }]);
                    ui.toast(cb.checked ? 'Đã đánh dấu hoàn thành hạng mục.' : 'Đã mở lại hạng mục.', 'success');
                    render();
                });
            });

            bind('ws-add-item', () => {
                if (!Shell.requirePerm('task.edit')) return;
                ui.openModal({
                    title: 'Thêm công việc thành phần', size: 'sm', tone: 'primary', confirmText: 'Thêm hạng mục',
                    content: '<form class="ws-form" id="ws-item-form" novalidate>' +
                        ui.field({ id: 'if-title', label: 'Tên hạng mục', required: true, wide: true }) +
                        ui.field({ id: 'if-assignee', label: 'Người thực hiện', type: 'select', options: Store.users().filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name })), value: (Store.currentUser() || {}).id }) +
                        ui.field({ id: 'if-due', label: 'Thời hạn', type: 'date', value: task.dueDate }) + '</form>',
                    onConfirm: (modal) => {
                        const form = modal.querySelector('#ws-item-form');
                        if (!ui.validateForm(form)) return false;
                        const values = ui.formData(form);
                        Store.addTaskItem(task.id, { title: values['if-title'], assigneeId: values['if-assignee'], dueDate: values['if-due'] });
                        ui.toast('Đã thêm hạng mục công việc.', 'success');
                        render();
                        return true;
                    }
                });
            });
        };

        const renderAttachments = () => {
            const host = document.getElementById('ws-task-attachments');
            if (!host) return;
            const docs = (task.attachments || []).map(Store.docById).filter(Boolean);
            host.innerHTML = '<div class="ws-section-head"><p class="ws-card__subtitle">' + docs.length + ' tài liệu đính kèm</p>' +
                '<button type="button" class="ws-btn ws-btn--sm" id="ws-attach-doc" data-perm="data.edit"><i class="fa-solid fa-link" aria-hidden="true"></i> Đính kèm từ kho</button></div>' +
                (docs.length ? '<ul class="ws-file-list">' + docs.map((d) => '<li class="ws-file-item">' +
                    '<span class="ws-file-item__icon"><i class="fa-solid fa-file-' + (d.format === 'PDF' ? 'pdf' : 'word') + '" aria-hidden="true"></i></span>' +
                    '<span class="ws-file-item__body"><span class="ws-file-item__name">' + util.escape(d.name) + '</span>' +
                    '<span class="ws-file-item__meta">' + util.escape(d.code) + ' · ' + util.fileSize(d.size) + ' · ' + util.formatDate(d.issuedAt) + '</span></span>' +
                    '<button type="button" class="ws-btn ws-btn--sm ws-btn--ghost" data-doc-preview="' + d.id + '">Xem</button></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-paperclip', title: 'Chưa có tài liệu', message: 'Nhiệm vụ chưa có tài liệu đính kèm.' }));

            host.querySelectorAll('[data-doc-preview]').forEach((btn) => {
                btn.addEventListener('click', () => ui.openDocPreview(Store.docById(btn.dataset.docPreview)));
            });
            bind('ws-attach-doc', () => {
                if (!Shell.requirePerm('task.edit')) return;
                ui.openModal({
                    title: 'Đính kèm tài liệu từ kho', tone: 'primary', confirmText: 'Đính kèm',
                    content: '<form class="ws-form" id="ws-attach-form">' +
                        ui.field({ id: 'af-doc', label: 'Chọn tài liệu', type: 'select', required: true, wide: true, options: Store.documents().map((d) => ({ value: d.id, label: d.code + ' — ' + d.name })) }) + '</form>',
                    onConfirm: (modal) => {
                        const form = modal.querySelector('#ws-attach-form');
                        if (!ui.validateForm(form)) return false;
                        Store.addTaskAttachment(task.id, ui.formData(form)['af-doc']);
                        ui.toast('Đã đính kèm tài liệu.', 'success');
                        render();
                        return true;
                    }
                });
            });
        };

        const renderComments = () => {
            const host = document.getElementById('ws-task-comments');
            if (!host) return;
            const comments = Store.taskComments(task.id).sort((a, b) => util.parseDate(a.createdAt) - util.parseDate(b.createdAt));
            host.innerHTML = '<div class="ws-section-head"><div><p class="ws-card__subtitle">' + comments.length + ' nội dung trao đổi</p></div></div>' +
                '<ul class="ws-comment-list">' + (comments.map((c) => {
                    const user = Store.userById(c.userId);
                    return '<li class="ws-comment">' + ui.avatar(user, 'sm') + '<div class="ws-comment__body"><div class="ws-comment__head">' +
                        '<strong>' + util.escape(user ? user.name : 'Người dùng') + '</strong><span>' + util.formatDateTime(c.createdAt) + '</span></div>' +
                        '<p>' + util.escape(c.body) + '</p></div></li>';
                }).join('') || '<li class="ws-comment-empty">Chưa có trao đổi nào cho nhiệm vụ này.</li>') + '</ul>' +
                '<form class="ws-comment-form" id="ws-comment-form" novalidate>' +
                '<label class="ws-u-sr" for="ws-comment-input">Nội dung trao đổi</label>' +
                '<textarea class="ws-textarea" id="ws-comment-input" rows="3" placeholder="Nhập nội dung trao đổi với người phụ trách…" required></textarea>' +
                '<div class="ws-comment-form__foot"><span class="ws-help">Nội dung trao đổi được lưu cùng nhiệm vụ.</span>' +
                '<button type="submit" class="ws-btn ws-btn--primary ws-btn--sm"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Gửi trao đổi</button></div></form>';

            const form = document.getElementById('ws-comment-form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const input = form.querySelector('#ws-comment-input');
                    if (!input.value.trim()) { input.classList.add('is-invalid'); input.focus(); return; }
                    Store.addTaskComment(task.id, input.value);
                    ui.toast('Đã gửi nội dung trao đổi.', 'success');
                    render();
                });
            }
        };

        const renderHistory = () => {
            const host = document.getElementById('ws-task-history');
            if (!host) return;
            const history = Store.taskHistory(task.id).sort((a, b) => util.parseDate(b.createdAt) - util.parseDate(a.createdAt));
            host.innerHTML = (history.length ? '<ul class="ws-timeline">' + history.map((h) => '<li class="ws-timeline__item">' +
                '<span class="ws-timeline__marker"><i class="fa-solid fa-circle" aria-hidden="true"></i></span><span class="ws-timeline__body">' +
                '<span class="ws-timeline__title"><strong>' + util.escape(h.action) + '</strong> — ' + util.escape(Store.userName(h.userId)) + '</span>' +
                '<span class="ws-timeline__text">' + util.escape(h.detail) + '</span>' +
                '<span class="ws-timeline__time">' + util.formatDateTime(h.createdAt) + '</span></span></li>').join('') + '</ul>'
                : ui.emptyState({ icon: 'fa-clock-rotate-left', title: 'Chưa có lịch sử', message: 'Chưa có thay đổi nào được ghi nhận.' }));
        };

        const openProgress = () => {
            if (!Shell.requirePerm('task.edit')) return;
            ui.openModal({
                title: 'Cập nhật tiến độ nhiệm vụ', subtitle: task.code + ' — ' + task.title,
                size: 'sm', tone: 'primary', confirmText: 'Lưu tiến độ',
                content: '<form class="ws-form" id="ws-progress-form" novalidate>' +
                    ui.field({ id: 'pf-progress', label: 'Tiến độ hoàn thành (%)', type: 'number', required: true, value: task.progress, attrs: 'min="0" max="100" step="5"' }) +
                    ui.field({ id: 'pf-note', label: 'Ghi chú cập nhật', type: 'textarea', rows: 3, placeholder: 'Mô tả kết quả đã thực hiện' }) + '</form>' +
                    '<div class="ws-note ws-note--muted"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Đạt 100% nhiệm vụ chuyển sang “Chờ xác nhận”. Thay đổi được ghi vào lịch sử.</div>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-progress-form');
                    if (!ui.validateForm(form)) return false;
                    const values = ui.formData(form);
                    const value = Number(values['pf-progress']);
                    if (isNaN(value) || value < 0 || value > 100) { ui.toast('Tiến độ phải trong khoảng 0–100%.', 'error'); return false; }
                    Store.setTaskProgress(task.id, value, values['pf-note']);
                    ui.toast('Đã cập nhật tiến độ nhiệm vụ.', 'success');
                    render();
                    Shell.renderSidebar();
                    return true;
                }
            });
        };

        return { init: init };
    })();

    /* 8.5 Lịch công tác --------------------------------------------------- */

    const CalendarPage = (function () {
        const state = { view: 'month', cursor: new Date(), org: '', type: '' };

        const init = () => {
            const root = document.getElementById('ws-calendar');
            if (!root) return;

            const orgSelect = document.getElementById('ws-cal-org');
            if (orgSelect) {
                orgSelect.innerHTML = '<option value="">Tất cả đơn vị</option>' + Store.organizations()
                    .map((o) => '<option value="' + o.id + '">' + util.escape(o.name) + '</option>').join('');
                orgSelect.addEventListener('change', () => { state.org = orgSelect.value; render(); });
            }
            const typeSelect = document.getElementById('ws-cal-type');
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="">Tất cả loại sự kiện</option>' + Object.keys(LABELS.eventType)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.eventType[k]) + '</option>').join('');
                typeSelect.addEventListener('change', () => { state.type = typeSelect.value; render(); });
            }

            root.querySelectorAll('[data-cal-view]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    state.view = btn.dataset.calView;
                    root.querySelectorAll('[data-cal-view]').forEach((b) => {
                        b.classList.toggle('is-active', b === btn);
                        b.setAttribute('aria-pressed', String(b === btn));
                    });
                    render();
                });
            });

            const shift = (step) => {
                const c = state.cursor;
                if (state.view === 'month') state.cursor = new Date(c.getFullYear(), c.getMonth() + step, 1);
                else if (state.view === 'week') state.cursor = util.addDays(c, step * 7);
                else state.cursor = util.addDays(c, step);
                render();
            };
            const prev = document.getElementById('ws-cal-prev');
            const next = document.getElementById('ws-cal-next');
            const today = document.getElementById('ws-cal-today');
            if (prev) prev.addEventListener('click', () => shift(-1));
            if (next) next.addEventListener('click', () => shift(1));
            if (today) today.addEventListener('click', () => { state.cursor = new Date(); render(); });

            document.querySelectorAll('[data-event-create]').forEach((btn) => {
                btn.addEventListener('click', () => openForm(null, util.isoDate(state.cursor)));
            });

            root.addEventListener('click', (e) => {
                const item = e.target.closest('[data-event-id]');
                if (!item) return;
                const ev = Store.eventById(item.dataset.eventId);
                if (ev) openDetail(ev);
            });

            render();
        };

        const filtered = () => Store.events().filter((e) => (!state.org || e.orgId === state.org) && (!state.type || e.type === state.type));

        const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

        const render = () => {
            const host = document.getElementById('ws-cal-grid');
            if (!host) return;
            const list = filtered();
            const label = document.getElementById('ws-cal-label');

            if (state.view === 'month') {
                if (label) label.textContent = 'Tháng ' + (state.cursor.getMonth() + 1) + '/' + state.cursor.getFullYear();
                host.className = 'ws-cal ws-cal--month';
                host.innerHTML = monthView(list);
            } else if (state.view === 'week') {
                const monday = util.addDays(state.cursor, -((state.cursor.getDay() + 6) % 7));
                if (label) label.textContent = 'Tuần ' + util.formatDate(monday) + ' – ' + util.formatDate(util.addDays(monday, 6));
                host.className = 'ws-cal ws-cal--week';
                host.innerHTML = weekView(list, monday);
            } else {
                if (label) label.textContent = util.formatDate(state.cursor);
                host.className = 'ws-cal ws-cal--day';
                host.innerHTML = dayView(list, state.cursor);
            }

            const side = document.getElementById('ws-cal-upcoming');
            if (side) {
                const upcoming = list.filter((e) => util.parseDate(e.start) >= util.today())
                    .sort((a, b) => util.parseDate(a.start) - util.parseDate(b.start)).slice(0, 5);
                side.innerHTML = upcoming.length ? upcoming.map((e) => {
                    const start = util.parseDate(e.start);
                    return '<button type="button" class="ws-agenda-item ws-agenda-item--button" data-event-id="' + e.id + '">' +
                        '<span class="ws-agenda-item__date"><span class="ws-agenda-item__day">' + util.pad(start.getDate()) + '</span>' +
                        '<span class="ws-agenda-item__month">Th' + (start.getMonth() + 1) + '</span></span>' +
                        '<span class="ws-agenda-item__body"><span class="ws-agenda-item__title">' + util.escape(e.title) + '</span>' +
                        '<span class="ws-agenda-item__meta">' + util.pad(start.getHours()) + ':' + util.pad(start.getMinutes()) + ' · ' +
                        util.escape(e.location) + '</span></span></button>';
                }).join('') : ui.emptyState({ icon: 'fa-calendar-xmark', title: 'Trống', message: 'Không có sự kiện sắp tới.' });
            }
        };

        const eventPill = (e) => {
            const start = util.parseDate(e.start);
            return '<button type="button" class="ws-cal__event ws-cal__event--' + e.type + '" data-event-id="' + e.id + '" title="' + util.escape(e.title) + '">' +
                '<span class="ws-cal__event-time">' + util.pad(start.getHours()) + ':' + util.pad(start.getMinutes()) + '</span>' +
                '<span class="ws-cal__event-title">' + util.escape(e.title) + '</span></button>';
        };

        const monthView = (list) => {
            const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
            const offset = (first.getDay() + 6) % 7;
            const start = util.addDays(first, -offset);
            const now = util.today();
            let cells = '';
            for (let i = 0; i < 42; i += 1) {
                const day = util.addDays(start, i);
                const inMonth = day.getMonth() === first.getMonth();
                const dayEvents = list.filter((e) => sameDay(util.parseDate(e.start), day));
                cells += '<div class="ws-cal__cell' + (inMonth ? '' : ' is-outside') + (sameDay(day, now) ? ' is-today' : '') + '">' +
                    '<span class="ws-cal__date">' + day.getDate() + '</span><div class="ws-cal__events">' +
                    dayEvents.slice(0, 3).map(eventPill).join('') +
                    (dayEvents.length > 3 ? '<span class="ws-cal__more">+' + (dayEvents.length - 3) + ' sự kiện</span>' : '') +
                    '</div></div>';
            }
            return '<div class="ws-cal__weekdays">' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => '<span>' + d + '</span>').join('') +
                '</div><div class="ws-cal__grid">' + cells + '</div>';
        };

        const weekView = (list, monday) => {
            const now = util.today();
            const names = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
            let html = '<div class="ws-cal-week">';
            for (let i = 0; i < 7; i += 1) {
                const day = util.addDays(monday, i);
                const dayEvents = list.filter((e) => sameDay(util.parseDate(e.start), day))
                    .sort((a, b) => util.parseDate(a.start) - util.parseDate(b.start));
                html += '<div class="ws-cal-week__col' + (sameDay(day, now) ? ' is-today' : '') + '">' +
                    '<h3 class="ws-cal-week__head">' + names[i] + '<span>' + util.pad(day.getDate()) + '/' + util.pad(day.getMonth() + 1) + '</span></h3>' +
                    '<div class="ws-cal-week__body">' + (dayEvents.map((e) => {
                        const s = util.parseDate(e.start);
                        const end = util.parseDate(e.end);
                        return '<button type="button" class="ws-cal__event ws-cal__event--' + e.type + ' is-block" data-event-id="' + e.id + '">' +
                            '<span class="ws-cal__event-time">' + util.pad(s.getHours()) + ':' + util.pad(s.getMinutes()) + ' – ' +
                            util.pad(end.getHours()) + ':' + util.pad(end.getMinutes()) + '</span>' +
                            '<span class="ws-cal__event-title">' + util.escape(e.title) + '</span>' +
                            '<span class="ws-cal__event-loc">' + util.escape(e.location) + '</span></button>';
                    }).join('') || '<p class="ws-cal-week__empty">—</p>') + '</div></div>';
            }
            return html + '</div>';
        };

        const dayView = (list, day) => {
            const dayEvents = list.filter((e) => sameDay(util.parseDate(e.start), day))
                .sort((a, b) => util.parseDate(a.start) - util.parseDate(b.start));
            if (!dayEvents.length) return ui.emptyState({ icon: 'fa-calendar-day', title: 'Không có lịch công tác', message: 'Chưa có sự kiện nào trong ngày này.' });
            return '<ul class="ws-day-list">' + dayEvents.map((e) => {
                const s = util.parseDate(e.start);
                const end = util.parseDate(e.end);
                return '<li class="ws-day-item"><span class="ws-day-item__time">' + util.pad(s.getHours()) + ':' + util.pad(s.getMinutes()) +
                    '<br><small>' + util.pad(end.getHours()) + ':' + util.pad(end.getMinutes()) + '</small></span>' +
                    '<button type="button" class="ws-day-item__body" data-event-id="' + e.id + '">' +
                    '<span class="ws-day-item__title">' + util.escape(e.title) + '</span>' +
                    '<span class="ws-day-item__meta">' + util.escape(LABELS.eventType[e.type]) + ' · ' + util.escape(e.location) +
                    ' · ' + util.escape(Store.orgName(e.orgId)) + '</span></button></li>';
            }).join('') + '</ul>';
        };

        const openDetail = (ev) => {
            const org = Store.orgById(ev.orgId);
            const owner = Store.userById(ev.ownerId);
            const participants = (ev.participants || []).map(Store.userById).filter(Boolean);
            const docs = (ev.docIds || []).map(Store.docById).filter(Boolean);
            const canManage = Store.can('calendar.manage');

            ui.openModal({
                title: ev.title,
                subtitle: LABELS.eventType[ev.type] + ' · ' + util.formatDate(ev.start),
                size: 'md',
                footer: false,
                content: '<dl class="ws-detail-list">' +
                    '<dt>Thời gian</dt><dd>' + util.formatDateTime(ev.start) + ' – ' + util.formatDateTime(ev.end) + '</dd>' +
                    '<dt>Địa điểm</dt><dd>' + util.escape(ev.location) + '</dd>' +
                    '<dt>Đơn vị tổ chức</dt><dd>' + util.escape(org ? org.name : '—') + '</dd>' +
                    '<dt>Người phụ trách</dt><dd>' + util.escape(owner ? owner.name : '—') + '</dd>' +
                    '<dt>Thành phần tham dự</dt><dd>' + (participants.length ? participants.map((u) => util.escape(u.name)).join(', ') : '—') + '</dd>' +
                    '<dt>Nội dung</dt><dd>' + util.escape(ev.desc || '—') + '</dd>' +
                    '<dt>Tài liệu liên quan</dt><dd>' + (docs.length ? docs.map((d) => util.escape(d.code + ' — ' + d.name)).join('<br>') : '—') + '</dd></dl>' +
                    (canManage ? '<div class="ws-modal__actions-inline">' +
                        '<button type="button" class="ws-btn ws-btn--sm" data-ev-edit="' + ev.id + '"><i class="fa-solid fa-pen" aria-hidden="true"></i> Chỉnh sửa</button>' +
                        '<button type="button" class="ws-btn ws-btn--sm ws-btn--danger" data-ev-delete="' + ev.id + '"><i class="fa-solid fa-trash" aria-hidden="true"></i> Xóa sự kiện</button></div>' : '') +
                    '<div class="ws-note ws-note--muted" style="margin-top:.9rem"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' +
                    'Sự kiện muốn công khai trên Cổng thông tin phải gửi đề xuất sang CMS để biên tập, kiểm duyệt.</div>'
            });

            window.setTimeout(() => {
                const modal = document.querySelector('.ws-modal.is-open');
                if (!modal) return;
                const close = () => {
                    const btn = modal.querySelector('.ws-modal__head [data-modal-close]');
                    if (btn) btn.click();
                };
                const edit = modal.querySelector('[data-ev-edit]');
                if (edit) edit.addEventListener('click', () => { close(); window.setTimeout(() => openForm(ev), 220); });
                const remove = modal.querySelector('[data-ev-delete]');
                if (remove) remove.addEventListener('click', () => {
                    close();
                    window.setTimeout(() => {
                        ui.confirm({
                            heading: 'Xóa sự kiện?',
                            message: 'Sự kiện “' + ev.title + '” sẽ được hủy và ẩn khỏi lịch công tác.',
                            confirmText: 'Xóa sự kiện'
                        }).then((ok) => {
                            if (!ok) return;
                            Store.deleteEvent(ev.id);
                            ui.toast('Đã xóa sự kiện.', 'success');
                            render();
                        });
                    }, 220);
                });
            }, 120);
        };

        const openForm = (ev, presetDate) => {
            if (!Shell.requirePerm('calendar.manage', 'Vai trò của bạn không có quyền quản lý lịch công tác.')) return;
            const isEdit = !!ev;
            const data = ev || {};
            const date = presetDate || util.isoDate(new Date());
            const day = () => (data.start || (date + 'T08:00')).slice(0, 16);
            const endDay = () => (data.end || (date + 'T09:30')).slice(0, 16);
            ui.openModal({
                title: isEdit ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện mới',
                size: 'lg', tone: 'primary',
                confirmText: isEdit ? 'Lưu thay đổi' : 'Tạo sự kiện',
                content: '<form class="ws-form" id="ws-event-form" novalidate>' +
                    ui.field({ id: 'ef-title', label: 'Tên sự kiện', required: true, wide: true, value: data.title || '' }) +
                    ui.field({ id: 'ef-type', label: 'Loại sự kiện', type: 'select', required: true, options: Object.keys(LABELS.eventType).map((k) => ({ value: k, label: LABELS.eventType[k] })), value: data.type || 'meeting' }) +
                    ui.field({ id: 'ef-org', label: 'Đơn vị tổ chức', type: 'select', required: true, options: Store.organizations().filter((o) => o.status === 'active').map((o) => ({ value: o.id, label: o.name })), value: data.orgId || (Store.currentUser() || {}).orgId }) +
                    ui.field({ id: 'ef-start', label: 'Bắt đầu', type: 'datetime-local', required: true, value: day(), attrs: 'data-validate="start"' }) +
                    ui.field({ id: 'ef-end', label: 'Kết thúc', type: 'datetime-local', required: true, value: endDay(), attrs: 'data-validate="end"' }) +
                    ui.field({ id: 'ef-location', label: 'Địa điểm', required: true, wide: true, value: data.location || '' }) +
                    ui.field({ id: 'ef-owner', label: 'Người phụ trách', type: 'select', options: Store.users().filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name })), value: data.ownerId || (Store.currentUser() || {}).id }) +
                    '<div class="ws-field ws-field--wide"><span class="ws-label">Thành phần tham dự</span><div class="ws-checklist ws-checklist--grid">' +
                    Store.users().filter((u) => u.status === 'active').map((u) => '<label class="ws-check ws-check--compact">' +
                        '<input type="checkbox" name="participant" value="' + u.id + '"' + ((data.participants || []).indexOf(u.id) !== -1 ? ' checked' : '') + '>' +
                        '<span>' + util.escape(u.name) + '</span></label>').join('') + '</div></div>' +
                    ui.field({ id: 'ef-desc', label: 'Nội dung', type: 'textarea', rows: 3, wide: true, value: data.desc || '' }) +
                    '</form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-event-form');
                    if (!ui.validateForm(form)) return false;
                    const values = ui.formData(form);
                    const payload = {
                        title: values['ef-title'], type: values['ef-type'], orgId: values['ef-org'],
                        start: values['ef-start'], end: values['ef-end'], location: values['ef-location'],
                        ownerId: values['ef-owner'], participants: ui.checkedValues(form, 'input[name="participant"]:checked'),
                        desc: values['ef-desc'], docIds: data.docIds || []
                    };
                    if (isEdit) payload.id = ev.id;
                    Store.saveEvent(payload);
                    ui.toast(isEdit ? 'Đã cập nhật sự kiện.' : 'Đã tạo sự kiện và thông báo tới thành phần tham dự.', 'success');
                    render();
                    Shell.renderHeader();
                    return true;
                }
            });
        };

        return { init: init };
    })();

    /* 8.6 Tổ chức -------------------------------------------------------- */

    const OrganizationsPage = (function () {
        const state = { q: '', type: '', status: '', page: 1, pageSize: 10, sort: 'name', dir: 'asc' };

        const init = () => {
            const root = document.getElementById('ws-organizations');
            if (!root) return;

            const typeSelect = document.getElementById('ws-org-type');
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="">Mọi loại hình</option>' + Object.keys(LABELS.orgType)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.orgType[k]) + '</option>').join('');
                typeSelect.addEventListener('change', () => { state.type = typeSelect.value; state.page = 1; render(); });
            }
            const statusSelect = document.getElementById('ws-org-status');
            if (statusSelect) {
                statusSelect.innerHTML = '<option value="">Mọi trạng thái</option>' + Object.keys(LABELS.orgStatus)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.orgStatus[k]) + '</option>').join('');
                statusSelect.addEventListener('change', () => { state.status = statusSelect.value; state.page = 1; render(); });
            }
            const search = document.getElementById('ws-org-search');
            if (search) search.addEventListener('input', util.debounce(() => {
                state.q = search.value.trim();
                state.page = 1;
                render();
            }, 200));
            const size = document.getElementById('ws-org-page-size');
            if (size) size.addEventListener('change', () => {
                state.pageSize = Number(size.value) || 10;
                state.page = 1;
                render();
            });
            const reset = document.getElementById('ws-org-reset');
            if (reset) reset.addEventListener('click', () => {
                Object.assign(state, { q: '', type: '', status: '', page: 1 });
                if (search) search.value = '';
                if (typeSelect) typeSelect.value = '';
                if (statusSelect) statusSelect.value = '';
                render();
            });

            document.querySelectorAll('[data-org-create]').forEach((btn) => btn.addEventListener('click', () => openForm(null)));

            root.addEventListener('click', (e) => {
                const edit = e.target.closest('[data-org-edit]');
                if (edit) { openForm(Store.orgById(edit.dataset.orgEdit)); return; }
                const del = e.target.closest('[data-org-delete]');
                if (del) {
                    if (!Shell.requirePerm('doc.manage', 'Vai trò của bạn không có quyền xóa đơn vị.')) return;
                    const org = Store.orgById(del.dataset.orgDelete);
                    ui.confirm({
                        heading: 'Xóa đơn vị?',
                        message: 'Đơn vị “' + org.name + '” sẽ bị xóa khỏi danh mục. Đơn vị còn người dùng hoặc đơn vị trực thuộc sẽ không thể xóa.',
                        confirmText: 'Xóa đơn vị'
                    }).then((ok) => {
                        if (!ok) return;
                        const result = Store.deleteOrganization(org.id);
                        if (!result.ok) { ui.toast(result.message, 'error'); return; }
                        ui.toast('Đã xóa đơn vị.', 'success');
                        render();
                    });
                    return;
                }
                const th = e.target.closest('[data-sort]');
                if (th) {
                    const key = th.dataset.sort;
                    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    else { state.sort = key; state.dir = 'asc'; }
                    render();
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); }
            });

            render();
        };

        const filtered = () => Store.organizations().filter((o) => {
            if (state.q && !util.matchText([o.code, o.name, o.address, o.head, o.email], state.q)) return false;
            if (state.type && o.type !== state.type) return false;
            if (state.status && o.status !== state.status) return false;
            return true;
        });

        const render = () => {
            const list = util.sortBy(filtered(), state.sort, state.dir);
            const total = list.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

            const body = document.getElementById('ws-org-body');
            if (body) {
                body.innerHTML = rows.map((o) => {
                    const parent = o.parentId ? Store.orgById(o.parentId) : null;
                    const staff = Store.users().filter((u) => u.orgId === o.id).length;
                    const taskCount = Store.tasks().filter((t) => t.ownerOrgId === o.id).length;
                    return '<tr><td data-label="Mã"><span class="ws-code ws-code--sm">' + util.escape(o.code) + '</span></td>' +
                        '<td data-label="Tên đơn vị"><a class="ws-table__title" href="organization-detail.html?id=' + o.id + '">' + util.escape(o.name) + '</a>' +
                        '<span class="ws-table__sub">' + util.escape(parent ? 'Trực thuộc ' + parent.name : 'Đơn vị độc lập') + '</span></td>' +
                        '<td data-label="Loại hình">' + util.escape(LABELS.orgType[o.type] || o.type) + '</td>' +
                        '<td data-label="Người đại diện">' + util.escape(o.head || '—') + '</td>' +
                        '<td data-label="Liên hệ"><span class="ws-table__stack">' + util.escape(o.phone || '—') +
                        '<span class="ws-table__sub">' + util.escape(o.email || '') + '</span></span></td>' +
                        '<td data-label="Nhân sự / nhiệm vụ"><span class="ws-table__stack">' + staff + ' người dùng' +
                        '<span class="ws-table__sub">' + taskCount + ' nhiệm vụ chủ trì</span></span></td>' +
                        '<td data-label="Trạng thái">' + ui.statusBadge(o.status, 'org') + '</td>' +
                        '<td data-label="Thao tác"><div class="ws-row-actions">' +
                        '<a class="ws-btn ws-btn--icon ws-btn--ghost" href="organization-detail.html?id=' + o.id + '" title="Xem chi tiết" aria-label="Xem ' + util.escape(o.name) + '"><i class="fa-solid fa-eye" aria-hidden="true"></i></a>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-org-edit="' + o.id + '" data-perm="data.edit" title="Chỉnh sửa" aria-label="Sửa ' + util.escape(o.name) + '"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost ws-btn--danger" data-org-delete="' + o.id + '" data-perm="data.delete" title="Xóa" aria-label="Xóa ' + util.escape(o.name) + '"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
                        '</div></td></tr>';
                }).join('') || '<tr><td colspan="8">' + ui.emptyState({ icon: 'fa-building-circle-xmark', title: 'Không tìm thấy đơn vị', message: 'Không có đơn vị phù hợp với bộ lọc hiện tại.' }) + '</td></tr>';
            }

            const pg = document.getElementById('ws-org-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'đơn vị' });

            const stats = document.getElementById('ws-org-stats');
            if (stats) {
                const orgs = Store.organizations();
                stats.innerHTML = [
                    ['fa-building-columns', 'Tổng số đơn vị', orgs.length, 'primary'],
                    ['fa-circle-check', 'Đang hoạt động', orgs.filter((o) => o.status === 'active').length, 'success'],
                    ['fa-sitemap', 'Đơn vị trực thuộc', orgs.filter((o) => o.parentId).length, 'info'],
                    ['fa-handshake', 'Đơn vị phối hợp', orgs.filter((o) => (o.partnerIds || []).length).length, 'indigo']
                ].map((s) => '<div class="ws-mini-stat ws-mini-stat--' + s[3] + '"><i class="fa-solid ' + s[0] + '" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + s[2] + '</span><span class="ws-mini-stat__label">' + s[1] + '</span></div>').join('');
            }
            Shell.applyPermissions();
        };

        const openForm = (org) => {
            const isEdit = !!org;
            if (!Shell.requirePerm(isEdit ? 'task.edit' : 'doc.manage')) return;
            const data = org || {};
            const parents = [{ value: '', label: '— Không trực thuộc —' }].concat(
                Store.organizations().filter((o) => !org || o.id !== org.id).map((o) => ({ value: o.id, label: o.name }))
            );
            ui.openModal({
                title: isEdit ? 'Chỉnh sửa đơn vị' : 'Thêm đơn vị mới',
                subtitle: 'Thông tin đơn vị được dùng chung cho CMS và Workspace.',
                size: 'lg', tone: 'primary',
                confirmText: isEdit ? 'Lưu thay đổi' : 'Thêm đơn vị',
                content: '<form class="ws-form" id="ws-org-form" novalidate>' +
                    ui.field({ id: 'of-code', label: 'Mã đơn vị', required: true, value: data.code || '', placeholder: 'Ví dụ: PC04-CATP' }) +
                    ui.field({ id: 'of-name', label: 'Tên cơ quan / tổ chức', required: true, wide: true, value: data.name || '' }) +
                    ui.field({ id: 'of-type', label: 'Loại hình', type: 'select', required: true, options: Object.keys(LABELS.orgType).map((k) => ({ value: k, label: LABELS.orgType[k] })), value: data.type || 'state' }) +
                    ui.field({ id: 'of-parent', label: 'Cơ quan chủ quản', type: 'select', options: parents, value: data.parentId || '' }) +
                    ui.field({ id: 'of-head', label: 'Người đại diện', value: data.head || '' }) +
                    ui.field({ id: 'of-phone', label: 'Số điện thoại', value: data.phone || '', attrs: 'data-type="phone"' }) +
                    ui.field({ id: 'of-email', label: 'Email', type: 'email', value: data.email || '', attrs: 'data-type="email"' }) +
                    ui.field({ id: 'of-status', label: 'Trạng thái', type: 'select', options: Object.keys(LABELS.orgStatus).map((k) => ({ value: k, label: LABELS.orgStatus[k] })), value: data.status || 'active' }) +
                    ui.field({ id: 'of-address', label: 'Địa chỉ', required: true, wide: true, value: data.address || '' }) +
                    ui.field({ id: 'of-note', label: 'Ghi chú', type: 'textarea', rows: 2, wide: true, value: data.note || '' }) +
                    '</form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-org-form');
                    if (!ui.validateForm(form)) return false;
                    const values = ui.formData(form);
                    const payload = {
                        code: values['of-code'], name: values['of-name'], type: values['of-type'], parentId: values['of-parent'],
                        head: values['of-head'], phone: values['of-phone'], email: values['of-email'],
                        status: values['of-status'], address: values['of-address'], note: values['of-note']
                    };
                    if (isEdit) payload.id = org.id;
                    Store.saveOrganization(payload);
                    ui.toast(isEdit ? 'Đã cập nhật thông tin đơn vị.' : 'Đã thêm đơn vị mới.', 'success');
                    render();
                    return true;
                }
            });
        };

        return { init: init };
    })();

    /* 8.7 Chi tiết tổ chức ----------------------------------------------- */

    const OrganizationDetailPage = (function () {
        let orgId = '';

        const init = () => {
            const root = document.getElementById('ws-org-detail');
            if (!root) return;
            const org = Store.orgById(ui.query('id')) || Store.organizations()[0];
            if (!org) {
                root.innerHTML = ui.emptyState({
                    icon: 'fa-building-circle-xmark', title: 'Không tìm thấy đơn vị',
                    message: 'Đơn vị không tồn tại hoặc đã bị xóa.',
                    action: '<a class="ws-btn ws-btn--primary" href="organizations.html">Về danh sách đơn vị</a>'
                });
                return;
            }
            orgId = org.id;
            render();
            ui.initTabs(document);
        };

        const render = () => {
            const org = Store.orgById(orgId);
            if (!org) { window.location.replace('organizations.html'); return; }
            const head = document.getElementById('ws-org-head');
            const users = Store.users().filter((u) => u.orgId === org.id);
            const tasks = Store.tasks().filter((t) => t.ownerOrgId === org.id || (t.partnerOrgIds || []).indexOf(org.id) !== -1).map(Store.recomputeTaskStatus);
            const reports = Store.reports().filter((r) => r.orgId === org.id);
            const docs = Store.documents().filter((d) => d.orgId === org.id);
            const events = Store.events().filter((e) => e.orgId === org.id);
            const logs = Store.logs().filter((l) => (Store.userById(l.userId) || {}).orgId === org.id).slice(0, 8);
            const parent = org.parentId ? Store.orgById(org.parentId) : null;
            const children = Store.organizations().filter((o) => o.parentId === org.id);
            const partners = (org.partnerIds || []).map(Store.orgById).filter(Boolean);

            if (head) {
                head.innerHTML = '<div class="ws-page-head__text"><div class="ws-page-head__badges">' +
                    '<span class="ws-code">' + util.escape(org.code) + '</span>' + ui.statusBadge(org.status, 'org') +
                    '<span class="ws-badge ws-badge--info">' + util.escape(LABELS.orgType[org.type] || org.type) + '</span></div>' +
                    '<h1 class="ws-page-head__title">' + util.escape(org.name) + '</h1>' +
                    '<p class="ws-page-head__desc">' + util.escape(org.note || '') + '</p></div>' +
                    '<div class="ws-page-head__actions"><a class="ws-btn" href="organizations.html"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Danh sách</a>' +
                    '<button type="button" class="ws-btn ws-btn--primary" id="ws-org-edit"><i class="fa-solid fa-pen" aria-hidden="true"></i> Chỉnh sửa thông tin</button></div>';
                const edit = document.getElementById('ws-org-edit');
                if (edit) {
                    if (!Store.can('task.edit')) edit.parentNode.removeChild(edit);
                    else edit.addEventListener('click', () => {
                        ui.openModal({
                            title: 'Chỉnh sửa thông tin đơn vị', size: 'lg', tone: 'primary', confirmText: 'Lưu thay đổi',
                            content: '<form class="ws-form" id="ws-orgd-form" novalidate>' +
                                ui.field({ id: 'od-head', label: 'Người đại diện', value: org.head || '' }) +
                                ui.field({ id: 'od-status', label: 'Trạng thái', type: 'select', options: Object.keys(LABELS.orgStatus).map((k) => ({ value: k, label: LABELS.orgStatus[k] })), value: org.status }) +
                                ui.field({ id: 'od-phone', label: 'Số điện thoại', value: org.phone || '', attrs: 'data-type="phone"' }) +
                                ui.field({ id: 'od-email', label: 'Email', type: 'email', value: org.email || '', attrs: 'data-type="email"' }) +
                                ui.field({ id: 'od-address', label: 'Địa chỉ', required: true, wide: true, value: org.address || '' }) +
                                ui.field({ id: 'od-note', label: 'Ghi chú', type: 'textarea', rows: 2, wide: true, value: org.note || '' }) +
                                '</form>',
                            onConfirm: (modal) => {
                                const form = modal.querySelector('#ws-orgd-form');
                                if (!ui.validateForm(form)) return false;
                                const v = ui.formData(form);
                                Store.saveOrganization({
                                    id: org.id, head: v['od-head'], status: v['od-status'], phone: v['od-phone'],
                                    email: v['od-email'], address: v['od-address'], note: v['od-note']
                                });
                                ui.toast('Đã cập nhật thông tin đơn vị.', 'success');
                                render();
                                return true;
                            }
                        });
                    });
                }
            }

            const overview = document.getElementById('ws-org-overview');
            if (overview) {
                overview.innerHTML = '<div class="ws-detail-grid"><div class="ws-detail-grid__main">' +
                    '<h3 class="ws-subhead">Thông tin đơn vị</h3><dl class="ws-detail-list">' +
                    '<dt>Mã đơn vị</dt><dd>' + util.escape(org.code) + '</dd>' +
                    '<dt>Loại hình</dt><dd>' + util.escape(LABELS.orgType[org.type] || org.type) + '</dd>' +
                    '<dt>Cơ quan chủ quản</dt><dd>' + util.escape(parent ? parent.name : '—') + '</dd>' +
                    '<dt>Người đại diện</dt><dd>' + util.escape(org.head || '—') + '</dd>' +
                    '<dt>Địa chỉ</dt><dd>' + util.escape(org.address || '—') + '</dd>' +
                    '<dt>Số điện thoại</dt><dd>' + util.escape(org.phone || '—') + '</dd>' +
                    '<dt>Email</dt><dd>' + util.escape(org.email || '—') + '</dd>' +
                    '<dt>Trạng thái</dt><dd>' + ui.statusBadge(org.status, 'org') + '</dd>' +
                    '<dt>Cập nhật lần cuối</dt><dd>' + util.formatDateTime(org.updatedAt) + '</dd></dl>' +
                    '<h3 class="ws-subhead">Đơn vị trực thuộc &amp; phối hợp</h3><div class="ws-org-links">' +
                    (children.map((c) => '<a class="ws-org-link" href="organization-detail.html?id=' + c.id + '">' +
                        '<i class="fa-solid fa-sitemap" aria-hidden="true"></i><span>' + util.escape(c.name) + '</span></a>').join('') +
                        partners.map((p) => '<a class="ws-org-link ws-org-link--partner" href="organization-detail.html?id=' + p.id + '">' +
                            '<i class="fa-solid fa-handshake" aria-hidden="true"></i><span>' + util.escape(p.name) + '</span></a>').join('') ||
                        '<p class="ws-help">Chưa có đơn vị trực thuộc hoặc đơn vị phối hợp.</p>') +
                    '</div></div><aside class="ws-detail-grid__aside">' +
                    '<div class="ws-mini-stat ws-mini-stat--primary"><i class="fa-solid fa-users" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + users.length + '</span><span class="ws-mini-stat__label">Người dùng</span></div>' +
                    '<div class="ws-mini-stat ws-mini-stat--info"><i class="fa-solid fa-list-check" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + tasks.length + '</span><span class="ws-mini-stat__label">Nhiệm vụ liên quan</span></div>' +
                    '<div class="ws-mini-stat ws-mini-stat--warning"><i class="fa-solid fa-file-lines" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + reports.length + '</span><span class="ws-mini-stat__label">Báo cáo</span></div>' +
                    '<div class="ws-mini-stat ws-mini-stat--teal"><i class="fa-solid fa-folder-open" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + docs.length + '</span><span class="ws-mini-stat__label">Tài liệu</span></div>' +
                    '</aside></div>';
            }

            const staff = document.getElementById('ws-org-staff');
            if (staff) {
                staff.innerHTML = users.length ? '<div class="ws-table-wrap"><table class="ws-table ws-table--stack">' +
                    '<thead><tr><th scope="col">Họ và tên</th><th scope="col">Chức vụ</th><th scope="col">Vai trò</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>' +
                    users.map((u) => '<tr><td data-label="Họ và tên"><span class="ws-user-cell">' + ui.avatar(u, 'xs') +
                        '<span class="ws-user-cell__text"><span class="ws-user-cell__name">' + util.escape(u.name) + '</span>' +
                        '<span class="ws-user-cell__meta">' + util.escape(u.email) + '</span></span></span></td>' +
                        '<td data-label="Chức vụ">' + util.escape(u.position || '—') + '</td>' +
                        '<td data-label="Vai trò">' + util.escape((Store.roleById(u.roleId) || {}).name || '—') + '</td>' +
                        '<td data-label="Trạng thái">' + ui.statusBadge(u.status, 'user') + '</td>' +
                        '<td data-label="Thao tác"><a class="ws-btn ws-btn--sm ws-btn--ghost" href="users.html?q=' + encodeURIComponent(u.username) + '">Xem</a></td></tr>').join('') +
                    '</tbody></table></div>'
                    : ui.emptyState({ icon: 'fa-user-slash', title: 'Chưa có nhân sự', message: 'Đơn vị chưa có người dùng nào.' });
            }

            const taskHost = document.getElementById('ws-org-tasks');
            if (taskHost) {
                taskHost.innerHTML = tasks.length ? '<div class="ws-table-wrap"><table class="ws-table ws-table--stack">' +
                    '<thead><tr><th scope="col">Mã</th><th scope="col">Nhiệm vụ</th><th scope="col">Thời hạn</th><th scope="col">Trạng thái</th><th scope="col">Tiến độ</th></tr></thead><tbody>' +
                    tasks.map((t) => '<tr><td data-label="Mã">' + util.escape(t.code) + '</td>' +
                        '<td data-label="Nhiệm vụ"><a class="ws-link" href="task-detail.html?id=' + t.id + '">' + util.escape(t.title) + '</a></td>' +
                        '<td data-label="Thời hạn">' + util.formatDate(t.dueDate) + '</td>' +
                        '<td data-label="Trạng thái">' + ui.statusBadge(t.status) + '</td>' +
                        '<td data-label="Tiến độ">' + ui.progress(t.progress) + '</td></tr>').join('') + '</tbody></table></div>'
                    : ui.emptyState({ icon: 'fa-list-check', title: 'Chưa có nhiệm vụ', message: 'Đơn vị chưa được giao nhiệm vụ nào.' });
            }

            const reportHost = document.getElementById('ws-org-reports');
            if (reportHost) {
                reportHost.innerHTML = reports.length ? '<ul class="ws-mini-list">' + reports.map((r) =>
                    '<li><a class="ws-link" href="report-editor.html?id=' + r.id + '">' + util.escape(r.name) + '</a>' +
                    '<span class="ws-mini-list__meta">' + ui.statusBadge(r.status, 'report') + ' ' + util.formatDate(r.createdDate) + '</span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-file-circle-xmark', title: 'Chưa có báo cáo', message: 'Đơn vị chưa gửi báo cáo nào.' });
            }

            const docHost = document.getElementById('ws-org-docs');
            if (docHost) {
                docHost.innerHTML = docs.length ? '<ul class="ws-mini-list">' + docs.map((d) =>
                    '<li><button type="button" class="ws-link ws-link--button" data-doc-preview="' + d.id + '">' + util.escape(d.name) + '</button>' +
                    '<span class="ws-mini-list__meta">' + util.escape(d.code) + ' · ' + util.fileSize(d.size) + '</span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-folder-open', title: 'Chưa có tài liệu', message: 'Đơn vị chưa tải lên tài liệu nào.' });
                docHost.querySelectorAll('[data-doc-preview]').forEach((btn) => {
                    btn.addEventListener('click', () => ui.openDocPreview(Store.docById(btn.dataset.docPreview)));
                });
            }

            const eventHost = document.getElementById('ws-org-events');
            if (eventHost) {
                eventHost.innerHTML = events.length ? '<ul class="ws-mini-list">' +
                    events.slice().sort((a, b) => util.parseDate(b.start) - util.parseDate(a.start)).map((e) =>
                        '<li><span class="ws-mini-list__badge">' + util.formatDate(e.start) + '</span>' +
                        '<span>' + util.escape(e.title) + '</span>' +
                        '<span class="ws-mini-list__meta">' + util.escape(LABELS.eventType[e.type]) + '</span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-calendar-xmark', title: 'Chưa có lịch', message: 'Đơn vị chưa có sự kiện nào.' });
            }

            const historyHost = document.getElementById('ws-org-history');
            if (historyHost) {
                historyHost.innerHTML = logs.length ? '<ul class="ws-timeline">' + logs.map((l) =>
                    '<li class="ws-timeline__item"><span class="ws-timeline__marker"><i class="fa-solid ' + (ACTION_ICON[l.action] || 'fa-circle') + '" aria-hidden="true"></i></span>' +
                    '<span class="ws-timeline__body"><span class="ws-timeline__title"><strong>' + util.escape(Store.userName(l.userId)) + '</strong> — ' +
                    util.escape(ACTION_LABEL[l.action] || l.action) + '</span>' +
                    '<span class="ws-timeline__text">' + util.escape(l.targetType) + ': ' + util.escape(l.targetName) + '</span>' +
                    '<span class="ws-timeline__time">' + util.formatDateTime(l.createdAt) + '</span></span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-clock-rotate-left', title: 'Chưa có hoạt động', message: 'Chưa ghi nhận hoạt động nào của đơn vị.' });
            }
            Shell.applyPermissions();
        };

        return { init: init };
    })();

    /* 8.8 Người dùng ------------------------------------------------------ */

    const UsersPage = (function () {
        const state = { q: '', org: '', role: '', status: '', page: 1, pageSize: 10, sort: 'name', dir: 'asc' };

        const init = () => {
            const root = document.getElementById('ws-users');
            if (!root) return;

            state.q = ui.query('q') || '';

            const orgSelect = document.getElementById('ws-users-org');
            if (orgSelect) {
                orgSelect.innerHTML = '<option value="">Tất cả đơn vị</option>' + Store.organizations()
                    .map((o) => '<option value="' + o.id + '">' + util.escape(o.name) + '</option>').join('');
                orgSelect.addEventListener('change', () => { state.org = orgSelect.value; state.page = 1; render(); });
            }
            const roleSelect = document.getElementById('ws-users-role');
            if (roleSelect) {
                roleSelect.innerHTML = '<option value="">Tất cả vai trò</option>' + Store.roles()
                    .map((r) => '<option value="' + r.id + '">' + util.escape(r.name) + '</option>').join('');
                roleSelect.addEventListener('change', () => { state.role = roleSelect.value; state.page = 1; render(); });
            }
            const statusSelect = document.getElementById('ws-users-status');
            if (statusSelect) {
                statusSelect.innerHTML = '<option value="">Mọi trạng thái</option>' + Object.keys(LABELS.userStatus)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.userStatus[k]) + '</option>').join('');
                statusSelect.addEventListener('change', () => { state.status = statusSelect.value; state.page = 1; render(); });
            }
            const search = document.getElementById('ws-users-search');
            if (search) {
                search.value = state.q;
                search.addEventListener('input', util.debounce(() => {
                    state.q = search.value.trim();
                    state.page = 1;
                    render();
                }, 200));
            }
            const size = document.getElementById('ws-users-page-size');
            if (size) size.addEventListener('change', () => {
                state.pageSize = Number(size.value) || 10;
                state.page = 1;
                render();
            });
            const reset = document.getElementById('ws-users-reset');
            if (reset) reset.addEventListener('click', () => {
                Object.assign(state, { q: '', org: '', role: '', status: '', page: 1 });
                if (search) search.value = '';
                if (orgSelect) orgSelect.value = '';
                if (roleSelect) roleSelect.value = '';
                if (statusSelect) statusSelect.value = '';
                render();
            });

            document.querySelectorAll('[data-user-create]').forEach((btn) => btn.addEventListener('click', () => openForm(null)));

            root.addEventListener('click', (e) => {
                const edit = e.target.closest('[data-user-edit]');
                if (edit) { openForm(Store.userById(edit.dataset.userEdit)); return; }

                const toggle = e.target.closest('[data-user-toggle]');
                if (toggle) {
                    if (!Shell.requirePerm('user.manage', 'Vai trò của bạn không có quyền quản lý tài khoản.')) return;
                    const user = Store.userById(toggle.dataset.userToggle);
                    if (!user) return;
                    if (user.id === (Store.currentUser() || {}).id) { ui.toast('Không thể tự khóa tài khoản đang đăng nhập.', 'error'); return; }
                    const locking = user.status === 'active';
                    ui.confirm({
                        tone: locking ? 'danger' : 'primary',
                        heading: locking ? 'Khóa tài khoản?' : 'Kích hoạt tài khoản?',
                        message: locking
                            ? 'Tài khoản “' + user.username + '” sẽ không thể đăng nhập cho đến khi được kích hoạt lại.'
                            : 'Tài khoản “' + user.username + '” sẽ có thể đăng nhập Workspace.',
                        confirmText: locking ? 'Khóa tài khoản' : 'Kích hoạt'
                    }).then((ok) => {
                        if (!ok) return;
                        Store.setUserStatus(user.id, locking ? 'locked' : 'active');
                        ui.toast(locking ? 'Đã khóa tài khoản.' : 'Đã kích hoạt tài khoản.', 'success');
                        render();
                    });
                    return;
                }

                const th = e.target.closest('[data-sort]');
                if (th) {
                    const key = th.dataset.sort;
                    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    else { state.sort = key; state.dir = 'asc'; }
                    render();
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); }
            });

            render();
        };

        const filtered = () => Store.users().filter((u) => {
            if (state.q && !util.matchText([u.name, u.username, u.email, u.phone, u.code, Store.orgName(u.orgId)], state.q)) return false;
            if (state.org && u.orgId !== state.org) return false;
            if (state.role && u.roleId !== state.role) return false;
            if (state.status && u.status !== state.status) return false;
            return true;
        });

        const render = () => {
            const list = util.sortBy(filtered(), state.sort, state.dir);
            const total = list.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
            const me = Store.currentUser();

            const body = document.getElementById('ws-users-body');
            if (body) {
                body.innerHTML = rows.map((u) => '<tr>' +
                    '<td data-label="Người dùng"><span class="ws-user-cell">' + ui.avatar(u, 'sm') +
                    '<span class="ws-user-cell__text"><span class="ws-user-cell__name">' + util.escape(u.name) + '</span>' +
                    '<span class="ws-user-cell__meta">' + util.escape(u.code) + ' · ' + util.escape(u.username) + '</span></span></span></td>' +
                    '<td data-label="Đơn vị">' + util.escape(Store.orgName(u.orgId)) + '<span class="ws-table__sub">' + util.escape(u.position || '') + '</span></td>' +
                    '<td data-label="Email công vụ"><span class="ws-table__stack">' + util.escape(u.email) +
                    '<span class="ws-table__sub">' + util.escape(u.phone || '') + '</span></span></td>' +
                    '<td data-label="Vai trò"><span class="ws-badge ws-badge--indigo">' + util.escape((Store.roleById(u.roleId) || {}).name || '—') + '</span></td>' +
                    '<td data-label="Trạng thái">' + ui.statusBadge(u.status, 'user') + '</td>' +
                    '<td data-label="Đăng nhập gần nhất"><span class="ws-table__stack">' +
                    (u.lastLogin ? util.formatDateTime(u.lastLogin) : 'Chưa đăng nhập') +
                    '<span class="ws-table__sub">Tạo ' + util.formatDate(u.createdAt) + '</span></span></td>' +
                    '<td data-label="Thao tác"><div class="ws-row-actions">' +
                    '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-user-edit="' + u.id + '" data-perm="user.manage" title="Chỉnh sửa" aria-label="Sửa ' + util.escape(u.name) + '"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
                    '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost' + (u.status === 'active' ? ' ws-btn--danger' : '') + '" data-user-toggle="' + u.id + '" data-perm="user.manage"' +
                    (u.id === me.id ? ' disabled' : '') + ' title="' + (u.status === 'active' ? 'Khóa tài khoản' : 'Kích hoạt') + '" aria-label="' +
                    (u.status === 'active' ? 'Khóa ' : 'Kích hoạt ') + util.escape(u.name) + '"><i class="fa-solid ' +
                    (u.status === 'active' ? 'fa-lock' : 'fa-lock-open') + '" aria-hidden="true"></i></button>' +
                    '</div></td></tr>').join('') ||
                    '<tr><td colspan="7">' + ui.emptyState({ icon: 'fa-user-slash', title: 'Không tìm thấy người dùng', message: 'Không có tài khoản phù hợp với bộ lọc hiện tại.' }) + '</td></tr>';
            }

            const pg = document.getElementById('ws-users-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'người dùng' });

            const stats = document.getElementById('ws-users-stats');
            if (stats) {
                const users = Store.users();
                stats.innerHTML = [
                    ['fa-users', 'Tổng tài khoản', users.length, 'primary'],
                    ['fa-user-check', 'Đang hoạt động', users.filter((u) => u.status === 'active').length, 'success'],
                    ['fa-user-lock', 'Đã khóa', users.filter((u) => u.status === 'locked').length, 'danger'],
                    ['fa-user-clock', 'Chờ kích hoạt', users.filter((u) => u.status === 'pending').length, 'warning']
                ].map((s) => '<div class="ws-mini-stat ws-mini-stat--' + s[3] + '"><i class="fa-solid ' + s[0] + '" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + s[2] + '</span><span class="ws-mini-stat__label">' + s[1] + '</span></div>').join('');
            }
            Shell.applyPermissions();
        };

        const openForm = (user) => {
            const isEdit = !!user;
            if (!Shell.requirePerm('user.manage', 'Vai trò của bạn không có quyền quản lý người dùng.')) return;
            const data = user || {};
            ui.openModal({
                title: isEdit ? 'Chỉnh sửa tài khoản ' + data.username : 'Tạo tài khoản người dùng',
                subtitle: 'Mật khẩu được băm (scrypt) và xác thực tại máy chủ; người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.',
                size: 'lg', tone: 'primary',
                confirmText: isEdit ? 'Lưu thay đổi' : 'Tạo tài khoản',
                content: '<form class="ws-form" id="ws-user-form" novalidate>' +
                    ui.field({ id: 'uf-name', label: 'Họ và tên', required: true, value: data.name || '' }) +
                    ui.field({ id: 'uf-username', label: 'Tên đăng nhập', required: true, value: data.username || '', attrs: 'autocomplete="off" data-min="3"' }) +
                    ui.field({ id: 'uf-email', label: 'Email công vụ', type: 'email', required: true, value: data.email || '', attrs: 'data-type="email"' }) +
                    ui.field({ id: 'uf-phone', label: 'Số điện thoại', value: data.phone || '', attrs: 'data-type="phone"' }) +
                    ui.field({ id: 'uf-org', label: 'Đơn vị', type: 'select', required: true, options: ui.optionsFrom(Store.organizations(), 'id', 'name'), value: data.orgId || (Store.currentUser() || {}).orgId }) +
                    ui.field({ id: 'uf-position', label: 'Chức vụ', value: data.position || '' }) +
                    ui.field({ id: 'uf-role', label: 'Vai trò', type: 'select', required: true, options: Store.roles().map((r) => ({ value: r.id, label: r.name + ' (' + DATA_SCOPES[r.scope] + ')' })), value: data.roleId || 'r-staff' }) +
                    ui.field({ id: 'uf-status', label: 'Trạng thái', type: 'select', options: Object.keys(LABELS.userStatus).map((k) => ({ value: k, label: LABELS.userStatus[k] })), value: data.status || 'pending' }) +
                    '</form><div class="ws-note ws-note--muted" style="margin-top:.9rem"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ' +
                    'Không chia sẻ mật khẩu qua kênh không bảo mật. Mật khẩu khởi tạo cần được bàn giao riêng và đổi ngay khi đăng nhập.</div>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-user-form');
                    if (!ui.validateForm(form)) return false;
                    const v = ui.formData(form);
                    const payload = {
                        name: v['uf-name'], username: v['uf-username'].toLowerCase(), email: v['uf-email'],
                        phone: v['uf-phone'], orgId: v['uf-org'], position: v['uf-position'],
                        roleId: v['uf-role'], status: v['uf-status']
                    };
                    if (isEdit) payload.id = user.id;
                    const result = Store.saveUser(payload);
                    if (!result.ok) { ui.toast(result.message, 'error'); return false; }
                    ui.toast(isEdit ? 'Đã cập nhật tài khoản người dùng.' : 'Đã tạo tài khoản mới.', 'success');
                    render();
                    return true;
                }
            });
        };

        return { init: init };
    })();

    /* 8.9 Phân quyền ------------------------------------------------------ */

    const PermissionsPage = (function () {
        let selected = '';

        const init = () => {
            const root = document.getElementById('ws-permissions');
            if (!root) return;
            if (!Store.can('role.manage')) {
                root.innerHTML = ui.emptyState({
                    icon: 'fa-shield-halved', title: 'Không có quyền truy cập',
                    message: 'Trang phân quyền chỉ dành cho vai trò quản trị hệ thống.',
                    action: '<a class="ws-btn ws-btn--primary" href="dashboard.html">Về bảng điều hành</a>'
                });
                return;
            }
            selected = Store.roles()[0].id;

            document.querySelectorAll('[data-role-create]').forEach((btn) => btn.addEventListener('click', () => openForm(null)));

            root.addEventListener('click', (e) => {
                const edit = e.target.closest('[data-role-edit]');
                if (edit) { openForm(Store.roleById(edit.dataset.roleEdit)); return; }
                const del = e.target.closest('[data-role-delete]');
                if (del) {
                    const role = Store.roleById(del.dataset.roleDelete);
                    ui.confirm({
                        heading: 'Xóa vai trò?',
                        message: 'Vai trò “' + role.name + '” sẽ bị xóa nếu không còn người dùng nào được gán.',
                        confirmText: 'Xóa vai trò'
                    }).then((ok) => {
                        if (!ok) return;
                        const result = Store.deleteRole(role.id);
                        if (!result.ok) { ui.toast(result.message, 'error'); return; }
                        ui.toast('Đã xóa vai trò.', 'success');
                        selected = Store.roles()[0].id;
                        render();
                    });
                    return;
                }
                const card = e.target.closest('[data-role-select]');
                if (card) { selected = card.dataset.roleSelect; render(); }
            });

            render();
        };

        const render = () => {
            const root = document.getElementById('ws-permissions');
            if (!root) return;
            const roles = Store.roles();
            const users = Store.users();
            const role = Store.roleById(selected) || roles[0];
            selected = role.id;

            const list = document.getElementById('ws-role-list');
            if (list) {
                list.innerHTML = roles.map((r) => '<button type="button" class="ws-role-card' + (r.id === selected ? ' is-active' : '') +
                    '" data-role-select="' + r.id + '" aria-pressed="' + (r.id === selected) + '">' +
                    '<span class="ws-role-card__head"><span class="ws-role-card__name">' + util.escape(r.name) + '</span>' +
                    (r.system ? '<span class="ws-badge ws-badge--indigo">Hệ thống</span>' : '') + '</span>' +
                    '<span class="ws-role-card__desc">' + util.escape(r.desc || '') + '</span>' +
                    '<span class="ws-role-card__foot"><span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ' + r.perms.length + ' quyền</span>' +
                    '<span><i class="fa-solid fa-users" aria-hidden="true"></i> ' + users.filter((u) => u.roleId === r.id).length + ' người dùng</span>' +
                    '<span class="ws-badge ws-badge--muted">' + util.escape(DATA_SCOPES[r.scope]) + '</span></span></button>').join('');
            }

            renderMatrix(role);
            Shell.applyPermissions();
        };

        const renderMatrix = (role) => {
            const host = document.getElementById('ws-permission-matrix');
            if (!host) return;
            const members = Store.users().filter((u) => u.roleId === role.id);
            const editable = !role.system;

            host.innerHTML = '<div class="ws-card__head"><div><h2 class="ws-card__title">' +
                '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ' + util.escape(role.name) + '</h2>' +
                '<p class="ws-card__subtitle">' + util.escape(role.desc || '') + '</p></div><div class="ws-card__tools">' +
                '<button type="button" class="ws-btn ws-btn--sm" data-role-edit="' + role.id + '"' + (editable ? '' : ' disabled') + '>' +
                '<i class="fa-solid fa-pen" aria-hidden="true"></i> Chỉnh sửa vai trò</button>' +
                '<button type="button" class="ws-btn ws-btn--sm ws-btn--danger" data-role-delete="' + role.id + '"' + (role.system ? ' disabled' : '') + '>' +
                '<i class="fa-solid fa-trash" aria-hidden="true"></i> Xóa</button></div></div>' +
                '<div class="ws-card__body"><div class="ws-scope-row"><span class="ws-label">Phạm vi dữ liệu</span>' +
                '<span class="ws-badge ws-badge--info">' + util.escape(DATA_SCOPES[role.scope]) + '</span>' +
                '<span class="ws-help">Phạm vi dữ liệu được máy chủ áp dụng khi truy vấn dữ liệu trả về.</span></div>' +
                '<form id="ws-perm-form">' +
                PERMISSION_GROUPS.map((group) => '<fieldset class="ws-perm-group"><legend class="ws-perm-group__title">' +
                    util.escape(group.label) + '</legend><div class="ws-perm-group__grid">' +
                    group.perms.map((perm) => '<label class="ws-switch"><input type="checkbox" name="perm" value="' + perm + '"' +
                        (role.perms.indexOf(perm) !== -1 ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
                        '<span class="ws-switch__track" aria-hidden="true"></span><span class="ws-switch__label">' +
                        util.escape(PERMISSIONS[perm]) + '</span></label>').join('') + '</div></fieldset>').join('') +
                (editable
                    ? '<div class="ws-form__actions"><button type="button" class="ws-btn" id="ws-perm-reset">Đặt lại thay đổi</button>' +
                    '<button type="submit" class="ws-btn ws-btn--primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Lưu quyền</button></div>'
                    : '<div class="ws-note ws-note--warning"><i class="fa-solid fa-lock" aria-hidden="true"></i> Vai trò hệ thống được bảo vệ, không thể chỉnh sửa hoặc xóa.</div>') +
                '</form><h3 class="ws-subhead">Người dùng thuộc vai trò</h3>' +
                (members.length ? '<ul class="ws-user-chips">' + members.map((u) => '<li class="ws-user-chip">' + ui.avatar(u, 'xs') +
                    '<span>' + util.escape(u.name) + '</span><span class="ws-user-chip__org">' + util.escape(Store.orgName(u.orgId)) + '</span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-user-slash', title: 'Chưa có người dùng', message: 'Chưa có tài khoản nào được gán vai trò này.' })) +
                '</div>';

            const form = document.getElementById('ws-perm-form');
            if (form && editable) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const perms = ui.checkedValues(form, 'input[name="perm"]:checked');
                    if (!perms.length) { ui.toast('Vai trò cần có ít nhất một quyền.', 'error'); return; }
                    Store.saveRole({ id: role.id, name: role.name, desc: role.desc, scope: role.scope, perms: perms });
                    ui.toast('Đã lưu quyền cho vai trò.', 'success');
                    render();
                });
                const reset = document.getElementById('ws-perm-reset');
                if (reset) reset.addEventListener('click', () => renderMatrix(role));
            }
        };

        const openForm = (role) => {
            const isEdit = !!role;
            const data = role || { scope: 'unit' };
            ui.openModal({
                title: isEdit ? 'Chỉnh sửa vai trò' : 'Tạo vai trò mới', tone: 'primary',
                confirmText: isEdit ? 'Lưu thay đổi' : 'Tạo vai trò',
                content: '<form class="ws-form" id="ws-role-form" novalidate>' +
                    ui.field({ id: 'rf-name', label: 'Tên vai trò', required: true, wide: true, value: data.name || '' }) +
                    ui.field({ id: 'rf-desc', label: 'Mô tả', type: 'textarea', rows: 2, wide: true, value: data.desc || '' }) +
                    ui.field({ id: 'rf-scope', label: 'Phạm vi dữ liệu', type: 'select', required: true, options: Object.keys(DATA_SCOPES).map((k) => ({ value: k, label: DATA_SCOPES[k] })), value: data.scope }) +
                    '</form>' +
                    (isEdit ? '' : '<div class="ws-note ws-note--muted" style="margin-top:.9rem"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' +
                        'Vai trò mới được tạo với quyền “Xem dữ liệu”; gán thêm quyền ở bảng bên dưới.</div>'),
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-role-form');
                    if (!ui.validateForm(form)) return false;
                    const v = ui.formData(form);
                    const payload = { name: v['rf-name'], desc: v['rf-desc'], scope: v['rf-scope'] };
                    if (isEdit) payload.id = role.id;
                    const result = Store.saveRole(payload);
                    if (!result.ok) { ui.toast(result.message, 'error'); return false; }
                    selected = result.role.id;
                    ui.toast(isEdit ? 'Đã cập nhật vai trò.' : 'Đã tạo vai trò mới.', 'success');
                    render();
                    return true;
                }
            });
        };

        return { init: init };
    })();

    /* 8.10 Tài liệu ------------------------------------------------------ */

    const DocumentsPage = (function () {
        const state = { q: '', type: '', org: '', access: '', folder: '', from: '', to: '', page: 1, pageSize: 10, sort: 'uploadedAt', dir: 'desc' };

        const init = () => {
            const root = document.getElementById('ws-documents');
            if (!root) return;

            const typeSelect = document.getElementById('ws-doc-type');
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="">Mọi loại tài liệu</option>' + Object.keys(LABELS.docType)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.docType[k]) + '</option>').join('');
                typeSelect.addEventListener('change', () => { state.type = typeSelect.value; state.page = 1; render(); });
            }
            const orgSelect = document.getElementById('ws-doc-org');
            if (orgSelect) {
                orgSelect.innerHTML = '<option value="">Tất cả đơn vị</option>' + Store.organizations()
                    .map((o) => '<option value="' + o.id + '">' + util.escape(o.name) + '</option>').join('');
                orgSelect.addEventListener('change', () => { state.org = orgSelect.value; state.page = 1; render(); });
            }
            const accessSelect = document.getElementById('ws-doc-access');
            if (accessSelect) {
                accessSelect.innerHTML = '<option value="">Mọi phạm vi</option>' + Object.keys(LABELS.docAccess)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.docAccess[k]) + '</option>').join('');
                accessSelect.addEventListener('change', () => { state.access = accessSelect.value; state.page = 1; render(); });
            }
            const search = document.getElementById('ws-doc-search');
            if (search) search.addEventListener('input', util.debounce(() => {
                state.q = search.value.trim();
                state.page = 1;
                render();
            }, 200));
            ['ws-doc-from', 'ws-doc-to'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', () => {
                    state[id === 'ws-doc-from' ? 'from' : 'to'] = el.value;
                    state.page = 1;
                    render();
                });
            });
            const size = document.getElementById('ws-doc-page-size');
            if (size) size.addEventListener('change', () => {
                state.pageSize = Number(size.value) || 10;
                state.page = 1;
                render();
            });
            const reset = document.getElementById('ws-doc-reset');
            if (reset) reset.addEventListener('click', () => {
                Object.assign(state, { q: '', type: '', org: '', access: '', folder: '', from: '', to: '', page: 1 });
                ['ws-doc-search', 'ws-doc-type', 'ws-doc-org', 'ws-doc-access', 'ws-doc-from', 'ws-doc-to'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                render();
            });

            document.querySelectorAll('[data-doc-upload]').forEach((btn) => btn.addEventListener('click', openUpload));

            root.addEventListener('click', (e) => {
                const folder = e.target.closest('[data-folder]');
                if (folder) { state.folder = folder.dataset.folder; state.page = 1; render(); return; }

                const preview = e.target.closest('[data-doc-preview]');
                if (preview) { ui.openDocPreview(Store.docById(preview.dataset.docPreview)); return; }

                const download = e.target.closest('[data-doc-download]');
                if (download) { downloadDoc(download.dataset.docDownload); return; }

                const share = e.target.closest('[data-doc-share]');
                if (share) { openShare(Store.docById(share.dataset.docShare)); return; }

                const version = e.target.closest('[data-doc-version]');
                if (version) { openVersion(Store.docById(version.dataset.docVersion)); return; }

                const del = e.target.closest('[data-doc-delete]');
                if (del) {
                    if (!Shell.requirePerm('doc.manage', 'Vai trò của bạn không có quyền xóa tài liệu.')) return;
                    const doc = Store.docById(del.dataset.docDelete);
                    ui.confirm({
                        heading: 'Xóa tài liệu?',
                        message: 'Tài liệu “' + doc.name + '” cùng lịch sử phiên bản sẽ bị xóa và được gỡ khỏi nhiệm vụ liên quan.',
                        confirmText: 'Xóa tài liệu'
                    }).then((ok) => {
                        if (!ok) return;
                        Store.deleteDocument(doc.id);
                        ui.toast('Đã xóa tài liệu.', 'success');
                        render();
                    });
                    return;
                }
                const th = e.target.closest('[data-sort]');
                if (th) {
                    const key = th.dataset.sort;
                    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    else { state.sort = key; state.dir = 'desc'; }
                    render();
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); }
            });

            render();
        };

        const canAccess = (doc) => {
            const user = Store.currentUser();
            if (doc.access !== 'restricted') return true;
            return Store.can('doc.manage') || doc.orgId === (user || {}).orgId;
        };

        const filtered = () => Store.documents().filter((d) => {
            if (!canAccess(d)) return false;
            if (state.q && !util.matchText([d.code, d.name, Store.orgName(d.orgId), Store.userName(d.uploaderId)], state.q)) return false;
            if (state.type && d.type !== state.type) return false;
            if (state.org && d.orgId !== state.org) return false;
            if (state.access && d.access !== state.access) return false;
            if (state.folder && d.folder !== state.folder) return false;
            if (state.from) {
                const from = util.parseDate(state.from);
                const uploaded = util.parseDate(d.uploadedAt);
                if (from && uploaded && uploaded < from) return false;
            }
            if (state.to) {
                const to = util.parseDate(state.to);
                const uploaded = util.parseDate(d.uploadedAt);
                if (to && uploaded) {
                    to.setHours(23, 59, 59);
                    if (uploaded > to) return false;
                }
            }
            return true;
        });

        const render = () => {
            const list = util.sortBy(filtered(), state.sort, state.dir);
            const total = list.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

            const folders = document.getElementById('ws-doc-folders');
            if (folders) {
                const counts = Store.documents().filter(canAccess).reduce((acc, d) => {
                    acc[d.folder] = (acc[d.folder] || 0) + 1;
                    return acc;
                }, {});
                folders.innerHTML = '<button type="button" class="ws-folder' + (state.folder === '' ? ' is-active' : '') + '" data-folder="">' +
                    '<i class="fa-solid fa-inbox" aria-hidden="true"></i><span>Tất cả</span><em>' + Store.documents().filter(canAccess).length + '</em></button>' +
                    Object.keys(counts).map((f) => '<button type="button" class="ws-folder' + (state.folder === f ? ' is-active' : '') +
                        '" data-folder="' + util.escape(f) + '"><i class="fa-regular fa-folder" aria-hidden="true"></i><span>' +
                        util.escape(f) + '</span><em>' + counts[f] + '</em></button>').join('');
            }

            const body = document.getElementById('ws-doc-body');
            if (body) {
                body.innerHTML = rows.map((d) => {
                    const kind = d.format === 'PDF' ? 'pdf' : d.format === 'XLSX' ? 'xls' : 'doc';
                    const icon = d.format === 'PDF' ? 'pdf' : d.format === 'XLSX' ? 'excel' : 'word';
                    return '<tr><td data-label="Tài liệu"><span class="ws-doc-name">' +
                        '<span class="ws-doc-name__icon ws-doc-name__icon--' + kind + '"><i class="fa-solid fa-file-' + icon + '" aria-hidden="true"></i></span>' +
                        '<span class="ws-doc-name__text"><button type="button" class="ws-table__title ws-link--button" data-doc-preview="' + d.id + '">' +
                        util.escape(d.name) + '</button><span class="ws-table__sub">' + util.escape(d.code) + ' · ' + util.escape(d.folder) + '</span></span></span></td>' +
                        '<td data-label="Loại">' + util.escape(LABELS.docType[d.type] || d.type) + '</td>' +
                        '<td data-label="Đơn vị">' + util.escape(Store.orgName(d.orgId)) + '</td>' +
                        '<td data-label="Người tải lên">' + util.escape(Store.userName(d.uploaderId)) + '</td>' +
                        '<td data-label="Ban hành / tải lên"><span class="ws-table__stack">' + util.formatDate(d.issuedAt) +
                        '<span class="ws-table__sub">Tải lên ' + util.formatDate(d.uploadedAt) + '</span></span></td>' +
                        '<td data-label="Định dạng">' + util.escape(d.format) + '<span class="ws-table__sub">' + util.fileSize(d.size) + '</span></td>' +
                        '<td data-label="Truy cập"><span class="ws-badge ws-badge--' +
                        (d.access === 'public' ? 'success' : d.access === 'restricted' ? 'danger' : 'muted') + '">' +
                        util.escape(LABELS.docAccess[d.access]) + '</span></td>' +
                        '<td data-label="Thao tác"><div class="ws-row-actions">' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-doc-download="' + d.id + '" title="Tải xuống" aria-label="Tải xuống ' + util.escape(d.code) + '"><i class="fa-solid fa-download" aria-hidden="true"></i></button>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-doc-version="' + d.id + '" data-perm="doc.manage" title="Phiên bản mới" aria-label="Tạo phiên bản"><i class="fa-solid fa-code-branch" aria-hidden="true"></i></button>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-doc-share="' + d.id + '" data-perm="doc.manage" title="Chia sẻ" aria-label="Chia sẻ tài liệu"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i></button>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost ws-btn--danger" data-doc-delete="' + d.id + '" data-perm="doc.manage" title="Xóa" aria-label="Xóa tài liệu"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
                        '</div></td></tr>';
                }).join('') || '<tr><td colspan="8">' + ui.emptyState({ icon: 'fa-folder-open', title: 'Không có tài liệu', message: 'Không có tài liệu phù hợp với bộ lọc hiện tại.' }) + '</td></tr>';
            }

            const pg = document.getElementById('ws-doc-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'tài liệu' });

            const summary = document.getElementById('ws-doc-summary');
            if (summary) {
                const docs = Store.documents().filter(canAccess);
                summary.innerHTML = [
                    ['fa-folder-open', 'Tổng tài liệu', docs.length, 'primary'],
                    ['fa-share-nodes', 'Được chia sẻ', docs.filter((d) => d.access === 'public').length, 'success'],
                    ['fa-lock', 'Hạn chế', docs.filter((d) => d.access === 'restricted').length, 'danger'],
                    ['fa-code-branch', 'Phiên bản', Store.documents().filter((d) => d.issuedAt).length, 'indigo']
                ].map((s) => '<div class="ws-mini-stat ws-mini-stat--' + s[3] + '"><i class="fa-solid ' + s[0] + '" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + s[2] + '</span><span class="ws-mini-stat__label">' + s[1] + '</span></div>').join('');
            }
            Shell.applyPermissions();
        };

        /** Kiểm tra quyền truy cập trước khi tải xuống (mô phỏng phía client) */
        const downloadDoc = (id) => {
            const doc = Store.docById(id);
            if (!doc) return;
            if (!canAccess(doc)) {
                Store.addLog({
                    action: 'doc.download', targetType: 'Tài liệu', targetId: id, targetName: doc.name,
                    detail: 'Bị từ chối: tài liệu hạn chế', result: 'denied'
                });
                Store.persist();
                render();
                ui.toast('Tài liệu hạn chế: bạn không đủ quyền truy cập tài liệu này.', 'error');
                return;
            }
            Store.addLog({ action: 'doc.download', targetType: 'Tài liệu', targetId: id, targetName: doc.name, detail: 'Tải xuống tài liệu' });
            Store.persist();
            ui.downloadDocStub(doc);
            ui.toast('Đang tải tài liệu xuống máy của bạn…', 'info');
        };

        const openShare = (doc) => {
            if (!Shell.requirePerm('doc.manage')) return;
            ui.openModal({
                title: 'Chia sẻ tài liệu', subtitle: doc.code + ' — ' + doc.name, size: 'sm', tone: 'primary',
                confirmText: 'Lưu phạm vi',
                content: '<form class="ws-form" id="ws-share-form">' +
                    ui.field({ id: 'sf-access', label: 'Phạm vi truy cập', type: 'select', required: true, wide: true, options: Object.keys(LABELS.docAccess).map((k) => ({ value: k, label: LABELS.docAccess[k] })), value: doc.access }) +
                    '</form><div class="ws-note ws-note--muted" style="margin-top:.9rem"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' +
                    '“Được chia sẻ” chỉ có nghĩa trong phạm vi Workspace. Muốn công khai trên Cổng thông tin, tài liệu phải được gửi sang CMS và được duyệt xuất bản.</div>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-share-form');
                    if (!ui.validateForm(form)) return false;
                    Store.setDocAccess(doc.id, ui.formData(form)['sf-access']);
                    ui.toast('Đã cập nhật phạm vi truy cập tài liệu.', 'success');
                    render();
                    return true;
                }
            });
        };

        const openVersion = (doc) => {
            if (!Shell.requirePerm('doc.manage')) return;
            ui.openModal({
                title: 'Tạo phiên bản mới', subtitle: doc.code + ' — ' + doc.name, tone: 'primary',
                confirmText: 'Tạo phiên bản',
                content: '<form class="ws-form" id="ws-doc-version-form">' +
                    ui.field({ id: 'dvf-note', label: 'Ghi chú thay đổi', required: true, wide: true, placeholder: 'Ví dụ: Bổ sung số liệu tháng 10' }) +
                    '</form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-doc-version-form');
                    if (!ui.validateForm(form)) return false;
                    const version = Store.addDocVersion(doc.id, ui.formData(form)['dvf-note']);
                    ui.toast('Đã tạo phiên bản ' + version.version + '.', 'success');
                    render();
                    return true;
                }
            });
        };

        const openUpload = () => {
            if (!Shell.requirePerm('doc.manage', 'Vai trò của bạn không có quyền tải lên tài liệu.')) return;
            const me = Store.currentUser();
            ui.openModal({
                title: 'Tải lên tài liệu',
                subtitle: 'Tệp được kiểm tra định dạng và dung lượng trước khi ghi nhận vào thư viện tài liệu.',
                tone: 'primary', confirmText: 'Tải lên',
                content: '<form class="ws-form" id="ws-doc-form" novalidate>' +
                    ui.field({ id: 'df-name', label: 'Tên tài liệu', required: true, wide: true }) +
                    ui.field({ id: 'df-type', label: 'Loại tài liệu', type: 'select', required: true, options: Object.keys(LABELS.docType).map((k) => ({ value: k, label: LABELS.docType[k] })), value: 'directive' }) +
                    ui.field({ id: 'df-org', label: 'Đơn vị ban hành', type: 'select', required: true, options: Store.organizations().map((o) => ({ value: o.id, label: o.name })), value: me ? me.orgId : '' }) +
                    ui.field({ id: 'df-issued', label: 'Ngày ban hành', type: 'date', required: true, value: util.isoDate(new Date()) }) +
                    ui.field({ id: 'df-folder', label: 'Thư mục', required: true, value: 'Văn bản chỉ đạo' }) +
                    ui.field({ id: 'df-access', label: 'Phạm vi truy cập', type: 'select', options: Object.keys(LABELS.docAccess).map((k) => ({ value: k, label: LABELS.docAccess[k] })), value: 'internal' }) +
                    '<div class="ws-field ws-field--wide"><label class="ws-label" for="df-file">Tệp đính kèm</label>' +
                    '<label class="ws-dropzone"><input type="file" id="df-file" class="ws-dropzone__input">' +
                    '<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span class="ws-dropzone__title">Chọn tệp hoặc kéo vào đây</span>' +
                    '<span class="ws-dropzone__hint">Hình ảnh, video và mọi loại tệp · không giới hạn dung lượng</span>' +
                    '<span class="ws-dropzone__file" id="df-file-name"></span></label></div></form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-doc-form');
                    if (!ui.validateForm(form)) return false;
                    const input = form.querySelector('#df-file');
                    const file = input.files && input.files[0];
                    if (!file) { ui.toast('Vui lòng chọn tệp đính kèm.', 'error'); return false; }
                    if (file.size === 0) { ui.toast('Tệp rỗng hoặc không đọc được.', 'error'); return false; }
                    const ext = String(file.name.split('.').pop() || 'FILE').toUpperCase();
                    const v = ui.formData(form);
                    Store.saveDocument({
                        name: v['df-name'], type: v['df-type'], orgId: v['df-org'], issuedAt: v['df-issued'],
                        folder: v['df-folder'], access: v['df-access'], format: ext, size: file.size
                    });
                    ui.toast('Đã thêm tài liệu vào kho.', 'success');
                    render();
                    return true;
                }
            });
            window.setTimeout(() => {
                const input = document.getElementById('df-file');
                const label = document.getElementById('df-file-name');
                if (!input || !label) return;
                input.addEventListener('change', () => {
                    const file = input.files && input.files[0];
                    label.textContent = file ? file.name + ' · ' + util.fileSize(file.size) : '';
                });
            }, 80);
        };

        return { init: init };
    })();

    /* 8.11 Báo cáo -------------------------------------------------------- */

    const ReportsPage = (function () {
        const state = { q: '', type: '', status: '', org: '', page: 1, pageSize: 10, sort: 'createdDate', dir: 'desc' };

        const init = () => {
            const root = document.getElementById('ws-reports');
            if (!root) return;

            const typeSelect = document.getElementById('ws-report-type');
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="">Mọi loại báo cáo</option>' + Object.keys(LABELS.reportType)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.reportType[k]) + '</option>').join('');
                typeSelect.addEventListener('change', () => { state.type = typeSelect.value; state.page = 1; render(); });
            }
            const orgSelect = document.getElementById('ws-report-org');
            if (orgSelect) {
                orgSelect.innerHTML = '<option value="">Tất cả đơn vị</option>' + Store.organizations()
                    .map((o) => '<option value="' + o.id + '">' + util.escape(o.name) + '</option>').join('');
                orgSelect.addEventListener('change', () => { state.org = orgSelect.value; state.page = 1; render(); });
            }
            const statusSelect = document.getElementById('ws-report-status');
            if (statusSelect) {
                statusSelect.addEventListener('change', () => { state.status = statusSelect.value; state.page = 1; render(); });
            }
            const search = document.getElementById('ws-report-search');
            if (search) search.addEventListener('input', util.debounce(() => {
                state.q = search.value.trim();
                state.page = 1;
                render();
            }, 200));
            const size = document.getElementById('ws-report-page-size');
            if (size) size.addEventListener('change', () => {
                state.pageSize = Number(size.value) || 10;
                state.page = 1;
                render();
            });
            const reset = document.getElementById('ws-report-reset');
            if (reset) reset.addEventListener('click', () => {
                Object.assign(state, { q: '', type: '', status: '', org: '', page: 1 });
                ['ws-report-search', 'ws-report-type', 'ws-report-status', 'ws-report-org'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                render();
            });

            root.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-status-chip]');
                if (chip) {
                    state.status = chip.dataset.statusChip;
                    state.page = 1;
                    const sel = document.getElementById('ws-report-status');
                    if (sel) sel.value = state.status;
                    render();
                    return;
                }

                const send = e.target.closest('[data-report-send]');
                if (send) {
                    if (!Shell.requirePerm('report.create', 'Bạn không có quyền gửi báo cáo.')) return;
                    const report = Store.reportById(send.dataset.reportSend);
                    ui.confirm({
                        tone: 'primary', heading: 'Gửi báo cáo?',
                        message: 'Báo cáo “' + report.name + '” sẽ được gửi và chuyển sang trạng thái “Chờ duyệt”.',
                        confirmText: 'Gửi báo cáo'
                    }).then((ok) => {
                        if (!ok) return;
                        Store.setReportStatus(report.id, 'pending', 'Gửi báo cáo để duyệt');
                        ui.toast('Đã gửi báo cáo.', 'success');
                        render();
                        Shell.renderHeader();
                    });
                    return;
                }

                const approve = e.target.closest('[data-report-approve]');
                if (approve) {
                    if (!Shell.requirePerm('report.approve', 'Chỉ người có quyền duyệt báo cáo mới được phê duyệt.')) return;
                    const report = Store.reportById(approve.dataset.reportApprove);
                    ui.confirm({
                        tone: 'primary', heading: 'Duyệt báo cáo?',
                        message: 'Báo cáo “' + report.name + '” sẽ được phê duyệt; người lập nhận thông báo.',
                        confirmText: 'Duyệt báo cáo'
                    }).then((ok) => {
                        if (!ok) return;
                        Store.setReportStatus(report.id, 'approved', 'Phê duyệt báo cáo');
                        ui.toast('Đã duyệt báo cáo.', 'success');
                        render();
                        Shell.renderHeader();
                    });
                    return;
                }

                const reject = e.target.closest('[data-report-reject]');
                if (reject) {
                    if (!Shell.requirePerm('report.approve')) return;
                    const report = Store.reportById(reject.dataset.reportReject);
                    ui.openModal({
                        title: 'Yêu cầu bổ sung / từ chối', subtitle: report.code, size: 'sm', tone: 'warning',
                        confirmText: 'Gửi yêu cầu',
                        content: '<form class="ws-form" id="ws-reject-form">' +
                            ui.field({ id: 'rj-reason', label: 'Nội dung yêu cầu', type: 'textarea', required: true, rows: 3, wide: true, placeholder: 'Nêu rõ phần cần bổ sung hoặc lý do từ chối' }) +
                            '</form>',
                        onConfirm: (modal) => {
                            const form = modal.querySelector('#ws-reject-form');
                            if (!ui.validateForm(form)) return false;
                            Store.setReportStatus(report.id, 'revision', ui.formData(form)['rj-reason']);
                            ui.toast('Đã gửi yêu cầu bổ sung tới người lập báo cáo.', 'success');
                            render();
                            Shell.renderHeader();
                            return true;
                        }
                    });
                    return;
                }

                const exportBtn = e.target.closest('[data-report-export]');
                if (exportBtn) {
                    const report = Store.reportById(exportBtn.dataset.reportExport);
                    ui.exportCsv(report.code + '.csv', ['Trường', 'Nội dung'], [
                        ['Mã báo cáo', report.code], ['Tên báo cáo', report.name],
                        ['Loại', LABELS.reportType[report.type]], ['Đơn vị', Store.orgName(report.orgId)],
                        ['Người lập', Store.userName(report.authorId)], ['Kỳ báo cáo', report.period],
                        ['Trạng thái', LABELS.reportStatus[report.status]]
                    ]);
                    ui.toast('Đã xuất thông tin báo cáo (CSV).', 'info');
                    return;
                }

                const th = e.target.closest('[data-sort]');
                if (th) {
                    const key = th.dataset.sort;
                    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    else { state.sort = key; state.dir = 'desc'; }
                    render();
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); }
            });

            render();
        };

        const filtered = () => {
            const user = Store.currentUser();
            let list = Store.reports();
            if (!Store.can('report.approve') && !Store.can('doc.manage')) {
                list = list.filter((r) => Store.inScope(r, 'orgId', user));
            }
            return list.filter((r) => {
                if (state.q && !util.matchText([r.code, r.name, r.period, Store.orgName(r.orgId), Store.userName(r.authorId)], state.q)) return false;
                if (state.type && r.type !== state.type) return false;
                if (state.status && r.status !== state.status) return false;
                if (state.org && r.orgId !== state.org) return false;
                return true;
            });
        };

        const render = () => {
            const list = util.sortBy(filtered(), state.sort, state.dir);
            const total = list.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
            const all = Store.reports();

            const chips = document.getElementById('ws-report-chips');
            if (chips) {
                chips.innerHTML = [
                    ['', 'Tất cả', all.length],
                    ['draft', LABELS.reportStatus.draft, all.filter((r) => r.status === 'draft').length],
                    ['ready', LABELS.reportStatus.ready, all.filter((r) => r.status === 'ready').length],
                    ['pending', LABELS.reportStatus.pending, all.filter((r) => r.status === 'pending').length],
                    ['approved', LABELS.reportStatus.approved, all.filter((r) => r.status === 'approved').length],
                    ['revision', LABELS.reportStatus.revision, all.filter((r) => r.status === 'revision').length]
                ].map((c) => '<button type="button" class="ws-chip' + (state.status === c[0] ? ' is-active' : '') + '" data-status-chip="' + c[0] + '">' +
                    util.escape(c[1]) + '<span class="ws-chip__count">' + c[2] + '</span></button>').join('');
            }

            const body = document.getElementById('ws-report-body');
            if (body) {
                body.innerHTML = rows.map((r) => '<tr>' +
                    '<td data-label="Mã"><span class="ws-code ws-code--sm">' + util.escape(r.code) + '</span></td>' +
                    '<td data-label="Báo cáo"><a class="ws-table__title" href="report-editor.html?id=' + r.id + '">' + util.escape(r.name) + '</a>' +
                    '<span class="ws-table__sub">' + util.escape(LABELS.reportType[r.type]) + ' · ' + util.escape(r.period) + '</span></td>' +
                    '<td data-label="Đơn vị">' + util.escape(Store.orgName(r.orgId)) + '</td>' +
                    '<td data-label="Người lập">' + util.escape(Store.userName(r.authorId)) + '</td>' +
                    '<td data-label="Ngày lập">' + util.formatDate(r.createdDate) + '</td>' +
                    '<td data-label="Trạng thái">' + ui.statusBadge(r.status, 'report') + '</td>' +
                    '<td data-label="Thao tác"><div class="ws-row-actions">' +
                    '<a class="ws-btn ws-btn--icon ws-btn--ghost" href="report-editor.html?id=' + r.id + '" title="Mở / biên tập" aria-label="Mở báo cáo"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></a>' +
                    (['draft', 'ready'].indexOf(r.status) !== -1
                        ? '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-report-send="' + r.id + '" title="Gửi báo cáo" aria-label="Gửi báo cáo"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>' : '') +
                    (r.status === 'pending'
                        ? '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-report-approve="' + r.id + '" data-perm="report.approve" title="Duyệt" aria-label="Duyệt báo cáo"><i class="fa-solid fa-check" aria-hidden="true"></i></button>' +
                        '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost ws-btn--danger" data-report-reject="' + r.id + '" data-perm="report.approve" title="Yêu cầu bổ sung" aria-label="Yêu cầu bổ sung"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>' : '') +
                    '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-report-export="' + r.id + '" title="Xuất CSV" aria-label="Xuất thông tin báo cáo"><i class="fa-solid fa-file-csv" aria-hidden="true"></i></button>' +
                    '</div></td></tr>').join('') ||
                    '<tr><td colspan="7">' + ui.emptyState({ icon: 'fa-file-circle-xmark', title: 'Không có báo cáo', message: 'Không có báo cáo phù hợp với bộ lọc hiện tại.' }) + '</td></tr>';
            }

            const pg = document.getElementById('ws-report-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'báo cáo' });
            Shell.applyPermissions();
        };

        return { init: init };
    })();

    /* 8.12 Biên tập báo cáo ---------------------------------------------- */

    const ReportEditorPage = (function () {
        let report = null;
        let meta = {};

        const el = (id) => document.getElementById(id);

        const init = () => {
            const root = document.getElementById('ws-report-editor');
            if (!root) return;

            const id = ui.query('id');
            report = id ? Store.reportById(id) : null;
            if (id && !report) {
                root.innerHTML = ui.emptyState({
                    icon: 'fa-file-circle-xmark', title: 'Không tìm thấy báo cáo',
                    message: 'Báo cáo không tồn tại hoặc đã bị xóa.',
                    action: '<a class="ws-btn ws-btn--primary" href="reports.html">Về danh sách báo cáo</a>'
                });
                return;
            }

            const me = Store.currentUser();
            const now = new Date();
            const draft = report || {
                code: Store.nextCode('BC', Store.reports(), 'code'), name: '', type: 'monthly',
                orgId: me.orgId, authorId: me.id, period: 'Tháng ' + (now.getMonth() + 1) + '/' + now.getFullYear(),
                createdDate: util.isoDate(now), status: 'draft', content: '<p></p>',
                results: '', issues: '', proposals: '', attachments: [], taskId: ''
            };
            meta = { authorId: draft.authorId, taskId: draft.taskId, attachments: (draft.attachments || []).slice(), status: draft.status };

            const codeEl = el('ws-report-code');
            if (codeEl) codeEl.textContent = draft.code;

            const typeSelect = el('ws-report-type-sel');
            if (typeSelect) {
                typeSelect.innerHTML = Object.keys(LABELS.reportType)
                    .map((k) => '<option value="' + k + '"' + (draft.type === k ? ' selected' : '') + '>' + util.escape(LABELS.reportType[k]) + '</option>').join('');
            }
            const orgSelect = el('ws-report-org-sel');
            if (orgSelect) {
                orgSelect.innerHTML = Store.organizations()
                    .map((o) => '<option value="' + o.id + '"' + (draft.orgId === o.id ? ' selected' : '') + '>' + util.escape(o.name) + '</option>').join('');
            }
            if (el('ws-report-name')) el('ws-report-name').value = draft.name;
            if (el('ws-report-period')) el('ws-report-period').value = draft.period;
            if (el('ws-report-date')) el('ws-report-date').value = String(draft.createdDate).slice(0, 10);
            if (el('ws-report-content')) el('ws-report-content').innerHTML = draft.content || '<p></p>';
            if (el('ws-report-results')) el('ws-report-results').value = draft.results || '';
            if (el('ws-report-issues')) el('ws-report-issues').value = draft.issues || '';
            if (el('ws-report-proposals')) el('ws-report-proposals').value = draft.proposals || '';

            /* Thanh định dạng: execCommand chỉ mang tính minh họa phía trình duyệt */
            root.querySelectorAll('[data-cmd]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const area = el('ws-report-content');
                    if (!area) return;
                    area.focus();
                    try {
                        document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
                    } catch (err) {
                        ui.toast('Trình duyệt không hỗ trợ lệnh định dạng này.', 'error');
                    }
                    updateCounter();
                });
            });
            const area = el('ws-report-content');
            if (area) {
                area.addEventListener('input', updateCounter);
                area.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); }
                });
            }

            bind('ws-report-save', save);
            bind('ws-report-preview', preview);
            bind('ws-report-send', send);
            bind('ws-report-approve', approve);
            bind('ws-report-revision', requestRevision);
            bind('ws-report-export', exportFile);
            bind('ws-report-attach', attach);
            bind('ws-report-history', history);

            const approveBtn = el('ws-report-approve');
            const revisionBtn = el('ws-report-revision');
            if (!Store.can('report.approve')) {
                if (approveBtn) approveBtn.parentNode.removeChild(approveBtn);
                if (revisionBtn) revisionBtn.parentNode.removeChild(revisionBtn);
            }

            renderMeta();
            updateCounter();
            Shell.applyPermissions();
        };

        const bind = (id, handler) => {
            const node = el(id);
            if (node) node.addEventListener('click', handler);
        };

        const updateCounter = () => {
            const area = el('ws-report-content');
            const counter = el('ws-report-counter');
            if (!area || !counter) return;
            counter.textContent = util.countWords(area.innerHTML) + ' từ · ' + (area.innerText || '').length + ' ký tự';
        };

        const collect = () => ({
            name: String(el('ws-report-name').value || '').trim(),
            type: el('ws-report-type-sel').value,
            orgId: el('ws-report-org-sel').value,
            period: el('ws-report-period').value.trim(),
            createdDate: el('ws-report-date').value || util.isoDate(new Date()),
            content: el('ws-report-content').innerHTML,
            results: el('ws-report-results').value,
            issues: el('ws-report-issues').value,
            proposals: el('ws-report-proposals').value,
            attachments: meta.attachments.slice(),
            taskId: meta.taskId || '',
            authorId: meta.authorId
        });

        const validate = () => {
            const nameInput = el('ws-report-name');
            if (!nameInput.value.trim()) {
                nameInput.classList.add('is-invalid');
                nameInput.focus();
                ui.toast('Vui lòng nhập tên báo cáo.', 'error');
                return false;
            }
            nameInput.classList.remove('is-invalid');
            if (!el('ws-report-period').value.trim()) {
                el('ws-report-period').classList.add('is-invalid');
                el('ws-report-period').focus();
                ui.toast('Vui lòng nhập kỳ báo cáo.', 'error');
                return false;
            }
            el('ws-report-period').classList.remove('is-invalid');
            if (util.countWords(el('ws-report-content').innerHTML) < 10) {
                ui.toast('Nội dung báo cáo quá ngắn (tối thiểu 10 từ).', 'error');
                return false;
            }
            return true;
        };

        const persist = (message) => {
            if (!validate()) return null;
            const payload = collect();
            if (report) payload.id = report.id;
            const saved = Store.saveReport(payload);
            if (!saved) { ui.toast('Không lưu được báo cáo.', 'error'); return null; }
            report = saved;
            meta.authorId = saved.authorId;
            meta.taskId = saved.taskId;
            meta.attachments = (saved.attachments || []).slice();
            if (el('ws-report-code')) el('ws-report-code').textContent = saved.code;
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('id', saved.id);
                window.history.replaceState({}, '', url);
            } catch (err) { /* bỏ qua */ }
            renderMeta();
            if (message) ui.toast(message, 'success');
            Shell.renderSidebar();
            return saved;
        };

        const save = () => persist('Đã lưu báo cáo.');

        const preview = () => {
            if (!validate()) return;
            const values = collect();
            const paragraphs = (text) => util.escape(text || '—').replace(/\n/g, '<br>');
            ui.openModal({
                title: 'Xem trước báo cáo',
                subtitle: (report ? report.code : el('ws-report-code').textContent) + ' · ' + LABELS.reportType[values.type],
                size: 'lg', footer: false,
                content: '<article class="ws-doc-page">' +
                    '<p class="ws-doc-page__org">' + util.escape(Store.orgName(values.orgId)) + '</p>' +
                    '<p class="ws-doc-page__code">Số: ' + util.escape(report ? report.code : el('ws-report-code').textContent) + '</p>' +
                    '<h2 class="ws-doc-page__title">' + util.escape(values.name) + '</h2>' +
                    '<p class="ws-doc-page__period">Kỳ báo cáo: ' + util.escape(values.period) + '</p>' +
                    '<h3>I. Nội dung</h3><div class="ws-rich-text">' + values.content + '</div>' +
                    '<h3>II. Kết quả thực hiện</h3><div class="ws-rich-text"><p>' + paragraphs(values.results) + '</p></div>' +
                    '<h3>III. Khó khăn, vướng mắc</h3><div class="ws-rich-text"><p>' + paragraphs(values.issues) + '</p></div>' +
                    '<h3>IV. Kiến nghị, đề xuất</h3><div class="ws-rich-text"><p>' + paragraphs(values.proposals) + '</p></div>' +
                    '<div class="ws-doc-page__sign"><p><strong>Nơi nhận:</strong><br>— Như trên;<br>— Lưu: VT.</p>' +
                    '<p><strong>' + util.escape(Store.orgName(values.orgId)) + '</strong><br><em>Người lập báo cáo</em><br>' +
                    util.escape(Store.userName(meta.authorId)) + '</p></div></article>'
            });
        };

        const send = () => {
            if (!Shell.requirePerm('report.create', 'Bạn không có quyền gửi báo cáo.')) return;
            if (!validate()) return;
            ui.confirm({
                tone: 'primary', heading: 'Gửi báo cáo?',
                message: 'Sau khi gửi, báo cáo chuyển sang “Chờ duyệt” và người có thẩm quyền nhận thông báo.',
                confirmText: 'Gửi báo cáo'
            }).then((ok) => {
                if (!ok) return;
                const saved = persist();
                if (!saved) return;
                Store.setReportStatus(saved.id, 'pending', 'Gửi báo cáo để duyệt');
                ui.toast('Đã gửi báo cáo để duyệt.', 'success');
                renderMeta();
                Shell.renderHeader();
                Shell.renderSidebar();
            });
        };

        const approve = () => {
            if (!Shell.requirePerm('report.approve')) return;
            if (!report) { ui.toast('Vui lòng lưu báo cáo trước khi duyệt.', 'error'); return; }
            ui.confirm({
                tone: 'primary', heading: 'Duyệt báo cáo?',
                message: 'Báo cáo được ghi nhận đã duyệt và thông báo tới người lập.',
                confirmText: 'Duyệt'
            }).then((ok) => {
                if (!ok) return;
                Store.setReportStatus(report.id, 'approved', 'Phê duyệt báo cáo');
                ui.toast('Đã duyệt báo cáo.', 'success');
                renderMeta();
                Shell.renderHeader();
            });
        };

        const requestRevision = () => {
            if (!Shell.requirePerm('report.approve')) return;
            if (!report) { ui.toast('Vui lòng lưu báo cáo trước khi gửi yêu cầu.', 'error'); return; }
            ui.openModal({
                title: 'Yêu cầu bổ sung', size: 'sm', tone: 'warning', confirmText: 'Gửi yêu cầu',
                content: '<form class="ws-form" id="ws-rev-form">' +
                    ui.field({ id: 'rev-note', label: 'Nội dung cần bổ sung', type: 'textarea', required: true, rows: 3, wide: true }) +
                    '</form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-rev-form');
                    if (!ui.validateForm(form)) return false;
                    Store.setReportStatus(report.id, 'revision', ui.formData(form)['rev-note']);
                    ui.toast('Đã gửi yêu cầu bổ sung.', 'success');
                    renderMeta();
                    Shell.renderHeader();
                    return true;
                }
            });
        };

        const exportFile = () => {
            const values = collect();
            const code = report ? report.code : el('ws-report-code').textContent;
            const paragraphs = (text) => util.escape(text || '—').replace(/\n/g, '<br>');
            const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>' + util.escape(values.name) + '</title>' +
                '<style>body{font-family:"Times New Roman",serif;max-width:800px;margin:40px auto;line-height:1.6}' +
                'h2{text-align:center}h3{margin-bottom:.4rem}table{border-collapse:collapse}td,th{border:1px solid #444;padding:6px}</style></head><body>' +
                '<p>' + util.escape(Store.orgName(values.orgId)) + '</p><p>Số: ' + util.escape(code) + '</p>' +
                '<h2>' + util.escape(values.name) + '</h2><p><em>Kỳ báo cáo: ' + util.escape(values.period) + '</em></p>' +
                '<h3>I. Nội dung</h3>' + values.content +
                '<h3>II. Kết quả thực hiện</h3><p>' + paragraphs(values.results) + '</p>' +
                '<h3>III. Khó khăn, vướng mắc</h3><p>' + paragraphs(values.issues) + '</p>' +
                '<h3>IV. Kiến nghị, đề xuất</h3><p>' + paragraphs(values.proposals) + '</p>' +
                '</body></html>';
            ui.saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), code + '.html');
            ui.toast('Đã xuất tệp báo cáo (HTML).', 'info');
        };

        const attach = () => {
            if (!Shell.requirePerm('doc.manage')) return;
            ui.openModal({
                title: 'Đính kèm tài liệu', tone: 'primary', confirmText: 'Đính kèm',
                content: '<form class="ws-form" id="ws-rep-attach-form">' +
                    ui.field({ id: 'ra-doc', label: 'Tài liệu', type: 'select', required: true, wide: true, options: Store.documents().map((d) => ({ value: d.id, label: d.code + ' — ' + d.name })) }) +
                    '</form>',
                onConfirm: (modal) => {
                    const form = modal.querySelector('#ws-rep-attach-form');
                    if (!ui.validateForm(form)) return false;
                    const docId = ui.formData(form)['ra-doc'];
                    if (meta.attachments.indexOf(docId) === -1) meta.attachments.push(docId);
                    persist('Đã đính kèm tài liệu.');
                    return true;
                }
            });
        };

        const history = () => {
            const logs = report ? Store.logs().filter((log) => log.targetId === report.id) : [];
            ui.openModal({
                title: 'Lịch sử xử lý báo cáo', size: 'md', footer: false,
                content: logs.length ? '<ul class="ws-timeline">' + logs.map((log) => '<li class="ws-timeline__item">' +
                    '<span class="ws-timeline__marker"><i class="fa-solid ' + (ACTION_ICON[log.action] || 'fa-circle') + '" aria-hidden="true"></i></span>' +
                    '<span class="ws-timeline__body"><span class="ws-timeline__title"><strong>' +
                    util.escape(ACTION_LABEL[log.action] || log.action) + '</strong> — ' + util.escape(Store.userName(log.userId)) + '</span>' +
                    '<span class="ws-timeline__text">' + util.escape(log.detail) + '</span>' +
                    '<span class="ws-timeline__time">' + util.formatDateTime(log.createdAt) + '</span></span></li>').join('') + '</ul>'
                    : ui.emptyState({ icon: 'fa-clock-rotate-left', title: 'Chưa có lịch sử', message: 'Báo cáo chưa được lưu hoặc xử lý.' })
            });
        };

        const renderMeta = () => {
            const host = el('ws-report-meta');
            if (!host) return;
            const current = report || { code: el('ws-report-code').textContent, status: 'draft', period: el('ws-report-period').value, createdDate: el('ws-report-date').value };
            const attached = meta.attachments.map(Store.docById).filter(Boolean);
            host.innerHTML = '<dl class="ws-detail-list">' +
                '<dt>Mã báo cáo</dt><dd>' + util.escape(current.code) + '</dd>' +
                '<dt>Người lập</dt><dd>' + util.escape(Store.userName(meta.authorId)) + '</dd>' +
                '<dt>Đơn vị báo cáo</dt><dd>' + util.escape(Store.orgName(el('ws-report-org-sel').value)) + '</dd>' +
                '<dt>Kỳ báo cáo</dt><dd>' + util.escape(el('ws-report-period').value) + '</dd>' +
                '<dt>Ngày lập</dt><dd>' + util.formatDate(el('ws-report-date').value) + '</dd>' +
                '<dt>Trạng thái</dt><dd id="ws-report-status-badge">' + ui.statusBadge(current.status, 'report') + '</dd>' +
                '<dt>Nhiệm vụ liên quan</dt><dd>' + (meta.taskId
                    ? '<a class="ws-link" href="task-detail.html?id=' + meta.taskId + '">' + util.escape((Store.taskById(meta.taskId) || {}).code || '') + '</a>'
                    : '—') + '</dd></dl>' +
                '<h3 class="ws-subhead">Tài liệu đính kèm</h3>' +
                (attached.length ? '<ul class="ws-file-list">' + attached.map((d) => '<li class="ws-file-item">' +
                    '<span class="ws-file-item__icon"><i class="fa-solid fa-file-' + (d.format === 'PDF' ? 'pdf' : 'word') + '" aria-hidden="true"></i></span>' +
                    '<span class="ws-file-item__body"><span class="ws-file-item__name">' + util.escape(d.name) + '</span>' +
                    '<span class="ws-file-item__meta">' + util.escape(d.code) + '</span></span>' +
                    '<button type="button" class="ws-btn ws-btn--sm ws-btn--ghost" data-doc-preview="' + d.id + '">Xem</button></li>').join('') + '</ul>'
                    : '<p class="ws-help">Chưa có tài liệu đính kèm.</p>') +
                '<div class="ws-note ws-note--warning" style="margin-top:.8rem"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' +
                'Nội dung báo cáo được lưu tại máy chủ và ghi nhận người tạo, thời điểm; quy trình duyệt và công khai số liệu do người có thẩm quyền thực hiện.</div>';

            host.querySelectorAll('[data-doc-preview]').forEach((btn) => {
                btn.addEventListener('click', () => ui.openDocPreview(Store.docById(btn.dataset.docPreview)));
            });
        };

        return { init: init };
    })();

    /* 8.13 Thông báo ------------------------------------------------------ */

    const NotificationsPage = (function () {
        const state = { type: '', read: '', range: '', page: 1, pageSize: 10 };

        const init = () => {
            const root = document.getElementById('ws-notifications-page');
            if (!root) return;

            const typeSelect = document.getElementById('ws-notice-type');
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="">Mọi loại thông báo</option>' + Object.keys(LABELS.noticeType)
                    .map((k) => '<option value="' + k + '">' + util.escape(LABELS.noticeType[k]) + '</option>').join('');
                typeSelect.addEventListener('change', () => { state.type = typeSelect.value; state.page = 1; render(); });
            }
            const readSelect = document.getElementById('ws-notice-read');
            if (readSelect) readSelect.addEventListener('change', () => { state.read = readSelect.value; state.page = 1; render(); });
            const rangeSelect = document.getElementById('ws-notice-range');
            if (rangeSelect) rangeSelect.addEventListener('change', () => { state.range = rangeSelect.value; state.page = 1; render(); });

            const markAll = document.getElementById('ws-notice-mark-all');
            if (markAll) markAll.addEventListener('click', () => {
                Store.markAllRead();
                ui.toast('Đã đánh dấu tất cả thông báo là đã đọc.', 'success');
                render();
                Shell.renderHeader();
            });

            root.addEventListener('click', (e) => {
                const toggle = e.target.closest('[data-notice-toggle]');
                if (toggle) {
                    const item = Store.all().notifications.find((n) => n.id === toggle.dataset.noticeToggle);
                    if (item) Store.setNotificationRead(item.id, !item.read);
                    render();
                    Shell.renderHeader();
                    return;
                }
                const del = e.target.closest('[data-notice-delete]');
                if (del) {
                    if (!Shell.requirePerm('calendar.manage', 'Bạn không có quyền xóa thông báo.')) return;
                    ui.confirm({
                        heading: 'Xóa thông báo?', message: 'Thông báo sẽ bị xóa khỏi danh sách của bạn.',
                        confirmText: 'Xóa'
                    }).then((ok) => {
                        if (!ok) return;
                        Store.deleteNotification(del.dataset.noticeDelete);
                        ui.toast('Đã xóa thông báo.', 'success');
                        render();
                        Shell.renderHeader();
                    });
                    return;
                }
                const open = e.target.closest('[data-notice-open]');
                if (open) {
                    Store.setNotificationRead(open.dataset.noticeOpen, true);
                    Shell.renderHeader();
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); }
            });

            render();
        };

        const iconFor = (type) => ({
            task_new: 'fa-list-check', task_change: 'fa-pen', task_due: 'fa-clock', task_overdue: 'fa-triangle-exclamation',
            report_sent: 'fa-paper-plane', report_approved: 'fa-circle-check', report_revision: 'fa-rotate-left',
            meeting: 'fa-calendar-days', calendar_change: 'fa-calendar', system: 'fa-gear', integration: 'fa-arrows-rotate'
        }[type] || 'fa-bell');

        const filtered = () => {
            const now = Date.now();
            return Store.visibleNotifications().filter((n) => {
                if (state.type && n.type !== state.type) return false;
                if (state.read === 'read' && !n.read) return false;
                if (state.read === 'unread' && n.read) return false;
                if (state.range) {
                    const created = util.parseDate(n.createdAt);
                    if (created && now - created.getTime() > Number(state.range) * 3600000) return false;
                }
                return true;
            });
        };

        const render = () => {
            const list = filtered().sort((a, b) => util.parseDate(b.createdAt) - util.parseDate(a.createdAt));
            const total = list.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

            const host = document.getElementById('ws-notice-list');
            if (host) {
                host.innerHTML = rows.map((n) => '<li class="ws-notice' + (n.read ? '' : ' is-unread') + '" data-type="' + n.type + '">' +
                    '<span class="ws-notice__icon ws-notice__icon--' + n.type + '"><i class="fa-solid ' + iconFor(n.type) + '" aria-hidden="true"></i></span>' +
                    '<div class="ws-notice__body"><div class="ws-notice__head">' +
                    '<a class="ws-notice__title" href="' + n.href + '" data-notice-open="' + n.id + '">' + util.escape(n.title) + '</a>' +
                    '<span class="ws-badge ws-badge--muted">' + util.escape(LABELS.noticeType[n.type] || n.type) + '</span></div>' +
                    '<p class="ws-notice__text">' + util.escape(n.body) + '</p><div class="ws-notice__foot">' +
                    '<span class="ws-notice__time"><i class="fa-regular fa-clock" aria-hidden="true"></i> ' +
                    util.formatDateTime(n.createdAt) + ' · ' + util.timeAgo(n.createdAt) + '</span>' +
                    '<a class="ws-link" href="' + n.href + '">Mở nội dung liên quan <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div>' +
                    '<div class="ws-notice__actions">' +
                    '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-notice-toggle="' + n.id + '" title="' +
                    (n.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc') + '" aria-label="' + (n.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc') + '">' +
                    '<i class="fa-solid ' + (n.read ? 'fa-envelope' : 'fa-envelope-open') + '" aria-hidden="true"></i></button>' +
                    '<button type="button" class="ws-btn ws-btn--icon ws-btn--ghost ws-btn--danger" data-notice-delete="' + n.id + '" data-perm="notice.manage" title="Xóa thông báo" aria-label="Xóa thông báo">' +
                    '<i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></li>').join('') ||
                    '<li>' + ui.emptyState({ icon: 'fa-bell-slash', title: 'Không có thông báo', message: 'Không có thông báo phù hợp với bộ lọc hiện tại.' }) + '</li>';
            }

            const pg = document.getElementById('ws-notice-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'thông báo' });

            const stats = document.getElementById('ws-notice-stats');
            if (stats) {
                const all = Store.visibleNotifications();
                stats.innerHTML = [
                    ['fa-bell', 'Tổng thông báo', all.length, 'primary'],
                    ['fa-envelope', 'Chưa đọc', all.filter((n) => !n.read).length, 'warning'],
                    ['fa-envelope-open', 'Đã đọc', all.filter((n) => n.read).length, 'success']
                ].map((s) => '<div class="ws-mini-stat ws-mini-stat--' + s[3] + '"><i class="fa-solid ' + s[0] + '" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + s[2] + '</span><span class="ws-mini-stat__label">' + s[1] + '</span></div>').join('');
            }
            Shell.applyPermissions();
        };

        return { init: init };
    })();

    /* 8.14 Nhật ký hoạt động --------------------------------------------- */

    const ActivityLogPage = (function () {
        const state = { q: '', user: '', action: '', result: '', from: '', to: '', page: 1, pageSize: 15 };

        const init = () => {
            const root = document.getElementById('ws-activity');
            if (!root) return;

            if (!Store.can('log.view')) {
                root.innerHTML = ui.emptyState({
                    icon: 'fa-lock', title: 'Không có quyền xem nhật ký',
                    message: 'Nhật ký hệ thống chỉ dành cho vai trò được cấp quyền “Xem nhật ký”.',
                    action: '<a class="ws-btn ws-btn--primary" href="dashboard.html">Về bảng điều hành</a>'
                });
                return;
            }

            const userSelect = document.getElementById('ws-log-user');
            if (userSelect) {
                userSelect.innerHTML = '<option value="">Tất cả người dùng</option>' + Store.users()
                    .map((u) => '<option value="' + u.id + '">' + util.escape(u.name) + '</option>').join('');
                userSelect.addEventListener('change', () => { state.user = userSelect.value; state.page = 1; render(); });
            }
            const actionSelect = document.getElementById('ws-log-action');
            if (actionSelect) {
                actionSelect.innerHTML = '<option value="">Mọi hành động</option>' + Object.keys(ACTION_LABEL)
                    .map((k) => '<option value="' + k + '">' + util.escape(ACTION_LABEL[k]) + '</option>').join('');
                actionSelect.addEventListener('change', () => { state.action = actionSelect.value; state.page = 1; render(); });
            }
            const resultSelect = document.getElementById('ws-log-result');
            if (resultSelect) {
                resultSelect.addEventListener('change', () => { state.result = resultSelect.value; state.page = 1; render(); });
            }
            const search = document.getElementById('ws-log-search');
            if (search) search.addEventListener('input', util.debounce(() => {
                state.q = search.value.trim();
                state.page = 1;
                render();
            }, 200));
            ['ws-log-from', 'ws-log-to'].forEach((id) => {
                const node = document.getElementById(id);
                if (node) node.addEventListener('change', () => {
                    state[id === 'ws-log-from' ? 'from' : 'to'] = node.value;
                    state.page = 1;
                    render();
                });
            });
            const reset = document.getElementById('ws-log-reset');
            if (reset) reset.addEventListener('click', () => {
                Object.assign(state, { q: '', user: '', action: '', result: '', from: '', to: '', page: 1 });
                ['ws-log-search', 'ws-log-user', 'ws-log-action', 'ws-log-result', 'ws-log-from', 'ws-log-to'].forEach((id) => {
                    const node = document.getElementById(id);
                    if (node) node.value = '';
                });
                render();
            });
            const exportBtn = document.getElementById('ws-log-export');
            if (exportBtn) exportBtn.addEventListener('click', () => {
                ui.exportCsv('nhat-ky-' + util.isoDate(new Date()) + '.csv',
                    ['Thời gian', 'Người thực hiện', 'Đơn vị', 'Hành động', 'Đối tượng', 'Chi tiết', 'Kết quả'],
                    filtered().map((l) => [util.formatDateTime(l.createdAt), Store.userName(l.userId),
                    Store.orgName((Store.userById(l.userId) || {}).orgId), ACTION_LABEL[l.action] || l.action,
                    l.targetType + ': ' + l.targetName, l.detail, l.result === 'denied' ? 'Từ chối' : 'Thành công']));
                ui.toast('Đã xuất nhật ký (CSV).', 'success');
            });

            root.addEventListener('click', (e) => {
                const detail = e.target.closest('[data-log-detail]');
                if (detail) {
                    const log = Store.logs().find((l) => l.id === detail.dataset.logDetail);
                    if (!log) return;
                    ui.openModal({
                        title: 'Chi tiết nhật ký', subtitle: util.formatDateTime(log.createdAt), size: 'md', footer: false,
                        content: '<dl class="ws-detail-list">' +
                            '<dt>Người thực hiện</dt><dd>' + util.escape(Store.userName(log.userId)) + '</dd>' +
                            '<dt>Đơn vị</dt><dd>' + util.escape(Store.orgName((Store.userById(log.userId) || {}).orgId)) + '</dd>' +
                            '<dt>Hành động</dt><dd>' + util.escape(ACTION_LABEL[log.action] || log.action) + '</dd>' +
                            '<dt>Đối tượng</dt><dd>' + util.escape(log.targetType) + ' — ' + util.escape(log.targetName) + '</dd>' +
                            '<dt>Chi tiết</dt><dd>' + util.escape(log.detail || '—') + '</dd>' +
                            '<dt>Kết quả</dt><dd>' + (log.result === 'denied' ? ui.badge('Từ chối', 'danger') : ui.badge('Thành công', 'success')) + '</dd>' +
                            '<dt>Địa chỉ IP</dt><dd>' + util.escape(log.ip || '—') + '</dd>' +
                            '<dt>Thời gian</dt><dd>' + util.formatDateTime(log.createdAt) + '</dd></dl>' +
                            '<div class="ws-note ws-note--muted" style="margin-top:.8rem"><i class="fa-solid fa-lock" aria-hidden="true"></i> ' +
                            'Nhật ký chỉ được ghi thêm, không có chức năng sửa hoặc xóa từ giao diện. Hệ thống chính thức phải lưu log bất biến ở máy chủ.</div>'
                    });
                    return;
                }
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && !pageBtn.disabled) { state.page = Number(pageBtn.dataset.page); render(); }
            });

            render();
        };

        const filtered = () => Store.logs().filter((l) => {
            if (state.q && !util.matchText([Store.userName(l.userId), l.targetName, l.targetType,
            ACTION_LABEL[l.action] || l.action, l.detail], state.q)) return false;
            if (state.user && l.userId !== state.user) return false;
            if (state.action && l.action !== state.action) return false;
            if (state.result && (l.result || 'success') !== state.result) return false;
            if (state.from || state.to) {
                const created = util.parseDate(l.createdAt);
                if (created) {
                    if (state.from && created < util.parseDate(state.from)) return false;
                    if (state.to) {
                        const to = util.parseDate(state.to);
                        to.setHours(23, 59, 59);
                        if (created > to) return false;
                    }
                }
            }
            return true;
        });

        const render = () => {
            const list = filtered();
            const total = list.length;
            const pages = Math.max(1, Math.ceil(total / state.pageSize));
            if (state.page > pages) state.page = pages;
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

            const body = document.getElementById('ws-log-body');
            if (body) {
                body.innerHTML = rows.map((l) => {
                    const user = Store.userById(l.userId);
                    return '<tr><td data-label="Thời gian"><span class="ws-table__stack">' + util.formatDateTime(l.createdAt) +
                        '<span class="ws-table__sub">' + util.timeAgo(l.createdAt) + '</span></span></td>' +
                        '<td data-label="Người thực hiện"><span class="ws-user-cell">' + ui.avatar(user, 'xs') +
                        '<span class="ws-user-cell__text"><span class="ws-user-cell__name">' + util.escape(user ? user.name : 'Hệ thống') + '</span>' +
                        '<span class="ws-user-cell__meta">' + util.escape(Store.orgName(user ? user.orgId : '')) + '</span></span></span></td>' +
                        '<td data-label="Hành động"><span class="ws-log-action"><i class="fa-solid ' + (ACTION_ICON[l.action] || 'fa-circle') +
                        '" aria-hidden="true"></i> ' + util.escape(ACTION_LABEL[l.action] || l.action) + '</span></td>' +
                        '<td data-label="Đối tượng"><span class="ws-table__stack">' + util.escape(l.targetType) +
                        '<span class="ws-table__sub">' + util.escape(l.targetName) + '</span></span></td>' +
                        '<td data-label="Kết quả">' + (l.result === 'denied' ? ui.badge('Từ chối', 'danger') : ui.badge('Thành công', 'success')) + '</td>' +
                        '<td data-label="Chi tiết"><span class="ws-table__sub">' + util.escape(l.detail || '—') + '</span></td>' +
                        '<td data-label="Thao tác"><button type="button" class="ws-btn ws-btn--icon ws-btn--ghost" data-log-detail="' + l.id +
                        '" title="Chi tiết" aria-label="Xem chi tiết nhật ký"><i class="fa-solid fa-eye" aria-hidden="true"></i></button></td></tr>';
                }).join('') || '<tr><td colspan="7">' + ui.emptyState({ icon: 'fa-clock-rotate-left', title: 'Không có bản ghi', message: 'Không có nhật ký phù hợp với bộ lọc hiện tại.' }) + '</td></tr>';
            }

            const pg = document.getElementById('ws-log-pagination');
            if (pg) pg.innerHTML = ui.pagination({ page: state.page, pageSize: state.pageSize, total: total, label: 'bản ghi' });

            const summary = document.getElementById('ws-log-summary');
            if (summary) {
                const logs = Store.logs();
                summary.innerHTML = [
                    ['fa-scroll', 'Tổng bản ghi', logs.length, 'primary'],
                    ['fa-right-to-bracket', 'Đăng nhập', logs.filter((l) => l.action === 'auth.login').length, 'info'],
                    ['fa-list-check', 'Thao tác nhiệm vụ', logs.filter((l) => l.action.indexOf('task.') === 0).length, 'indigo'],
                    ['fa-ban', 'Bị từ chối', logs.filter((l) => l.result === 'denied').length, 'danger']
                ].map((s) => '<div class="ws-mini-stat ws-mini-stat--' + s[3] + '"><i class="fa-solid ' + s[0] + '" aria-hidden="true"></i>' +
                    '<span class="ws-mini-stat__value">' + s[2] + '</span><span class="ws-mini-stat__label">' + s[1] + '</span></div>').join('');
            }
        };

        return { init: init };
    })();

    /* =========================================================================
       9. KHỞI TẠO
       ========================================================================= */

    const init = () => {
        if (!document.querySelector('.ws-app')) {
            LoginPage.init();
            ui.init();
            return;
        }
        bootApp();
    };

    /** Màn hình chờ trong lúc nạp dữ liệu từ máy chủ */
    const showLoading = () => {
        const main = document.querySelector('.ws-main');
        if (!main || document.getElementById('ws-boot')) return;
        const host = document.createElement('div');
        host.id = 'ws-boot';
        host.className = 'ws-boot';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.innerHTML = '<span class="ws-spinner" aria-hidden="true"></span><span>Đang tải dữ liệu…</span>';
        main.prepend(host);
    };

    const hideLoading = () => {
        const host = document.getElementById('ws-boot');
        if (host) host.remove();
    };

    const bootApp = async () => {
        const here = Shell.currentFile();
        Shell.init();
        ui.init();
        showLoading();

        try {
            const session = await Store.loadSession();
            if (!session || !session.user) {
                window.location.replace(CONFIG.loginFile + '?next=' + encodeURIComponent(here + (window.location.search || '')));
                return;
            }
            const user = Store.currentUser();
            if (user && user.system && user.system !== 'workspace') {
                await Store.logout();
                window.location.replace(CONFIG.loginFile);
                return;
            }
            if (user && user.mustChangePassword) {
                ui.toast('Vui lòng đổi mật khẩu khởi tạo trước khi tiếp tục sử dụng hệ thống.', 'warning');
            }

            await Store.load();
            hideLoading();
            Shell.renderSidebar();
            Shell.renderHeader();
            Shell.applyPermissions();

            const pages = [
                ['ws-dash', DashboardPage],
                ['ws-tasks', TasksPage],
                ['ws-task-detail', TaskDetailPage],
                ['ws-calendar', CalendarPage],
                ['ws-organizations', OrganizationsPage],
                ['ws-org-detail', OrganizationDetailPage],
                ['ws-users', UsersPage],
                ['ws-permissions', PermissionsPage],
                ['ws-documents', DocumentsPage],
                ['ws-reports', ReportsPage],
                ['ws-report-editor', ReportEditorPage],
                ['ws-notifications-page', NotificationsPage],
                ['ws-activity', ActivityLogPage]
            ];

        pages.forEach((entry) => {
            if (!document.getElementById(entry[0])) return;
            try {
                entry[1].init();
            } catch (err) {
                const host = document.getElementById(entry[0]);
                if (host) {
                    host.innerHTML = ui.emptyState({
                        icon: 'fa-triangle-exclamation',
                        title: 'Không tải được nội dung',
                        message: 'Đã xảy ra lỗi khi hiển thị trang này. Vui lòng tải lại trang.'
                    });
                }
                if (window.console && console.error) console.error('[Workspace]', err);
            }
        });
        } catch (err) {
            hideLoading();
            if (err && err.isAuth) {
                window.location.replace(CONFIG.loginFile + '?next=' + encodeURIComponent(here));
                return;
            }
            const main = document.querySelector('.ws-main__inner') || document.querySelector('.ws-main');
            if (main) {
                main.innerHTML = ui.emptyState({
                    icon: 'fa-triangle-exclamation',
                    title: 'Không tải được dữ liệu',
                    message: err && err.isNetwork
                        ? 'Không kết nối được máy chủ. Vui lòng kiểm tra đường truyền và thử lại.'
                        : (err && err.message) || 'Máy chủ gặp sự cố. Vui lòng thử lại sau.'
                });
            }
        }
    };

    /* Phiên hết hạn -> quay về trang đăng nhập */
    window.addEventListener('api:unauthorized', () => {
        if (!document.querySelector('.ws-app')) return;
        const here = Shell.currentFile();
        window.location.replace(CONFIG.loginFile + '?next=' + encodeURIComponent(here));
    });

    /* API công khai tối thiểu (gỡ lỗi, tích hợp) */
    window.Workspace = {
        version: CONFIG.version,
        util: util,
        store: Store,
        ui: ui,
        pages: PAGES,
        permissions: PERMISSIONS,
        labels: LABELS,
        reload: () => Store.load()
    };

    /* Tệp được nạp bằng defer: trình duyệt có thể vẫn báo readyState = 'loading'
       khi main.js (cũng defer) đang tải, và DOMContentLoaded có thể đã bắn xong.
       Vì vậy kiểm tra lại bằng 'load' làm lưới an toàn và chốt chặn chống chạy hai lần. */
    let booted = false;
    const boot = () => {
        if (booted) return;
        booted = true;
        init();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
        window.addEventListener('load', boot);
    } else {
        boot();
    }
})();
