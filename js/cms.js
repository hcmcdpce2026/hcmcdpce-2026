(function () {
    'use strict';

    /* Chống khởi tạo trùng nếu tệp được nạp hai lần */
    if (window.CMS) return;

    /* ==========================================================================
       1. CẤU HÌNH
       ========================================================================== */

    const CONFIG = {
        appKey: 'hcm-cms',
        version: '1.1.0',
        storageKey: 'hcm-cms-state-v1',
        sessionKey: 'hcm-cms-session',
        preferenceKey: 'hcm-cms-prefs',
        /* Chính sách tải tệp phải khớp server/lib/upload.js (máy chủ là nơi quyết định
           cuối cùng; danh sách ở đây chỉ để giao diện báo lỗi sớm).
           `maxSize: 0` nghĩa là không chặn dung lượng ở trình duyệt; máy chủ vẫn áp
           dụng trần của nó (MAX_UPLOAD_MB). */
        upload: {
            maxSize: 200 * 1024 * 1024,
            text: 'JPG, PNG, WEBP, GIF · PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX · MP4, WEBM · MP3, WAV · tối đa 200 MB/tệp',
            ext: [
                'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'ico',
                'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'zip',
                'mp4', 'webm', 'm4v', 'ogv', 'mp3', 'wav', 'ogg'
            ],
            imageExt: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'ico'],
            videoExt: ['mp4', 'webm', 'm4v', 'ogv'],
            audioExt: ['mp3', 'wav', 'ogg'],
            accept: '.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.ico,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.mp4,.webm,.m4v,.ogv,.mp3,.wav,.ogg'
        },
        labels: {
            category: 'Chuyên mục',
            pagePermission: 'Bạn không có quyền thực hiện thao tác này.'
        }
    };

    /* Trạng thái nội dung – một nguồn duy nhất cho badge, bộ lọc, bảng */
    const STATUS = {
        draft: { label: 'Bản nháp', tone: 'draft', step: 0 },
        pending: { label: 'Chờ duyệt', tone: 'pending', step: 2 },
        approved: { label: 'Đã duyệt', tone: 'approved', step: 3 },
        published: { label: 'Đã xuất bản', tone: 'published', step: 4 },
        rejected: { label: 'Từ chối', tone: 'rejected', step: 2 },
        revision: { label: 'Cần chỉnh sửa', tone: 'revision', step: 3 },
        archived: { label: 'Đã lưu trữ', tone: 'archived', step: 5 }
    };

    /* Vai trò & quyền (mô phỏng — phân quyền thật phải ở máy chủ) */
    const ROLES = {
        admin: {
            label: 'Quản trị hệ thống',
            desc: 'Toàn quyền cấu hình, phân quyền và xử lý mọi loại nội dung',
            perms: ['content.create', 'content.edit', 'content.edit.own', 'content.delete',
                'content.submit', 'content.review', 'content.publish', 'content.archive',
                'category.manage', 'media.upload', 'media.delete', 'log.view', 'system.manage']
        },
        editor: {
            label: 'Biên tập viên',
            desc: 'Tạo, sửa bài của mình và gửi duyệt; không được duyệt hoặc xuất bản',
            perms: ['content.create', 'content.edit.own', 'content.submit', 'media.upload']
        },
        reviewer: {
            label: 'Kiểm duyệt viên',
            desc: 'Xem xét nội dung chờ duyệt, chấp thuận hoặc yêu cầu chỉnh sửa',
            perms: ['content.edit', 'content.review', 'media.upload', 'log.view']
        },
        publisher: {
            label: 'Người xuất bản',
            desc: 'Duyệt và phát hành nội dung đã được kiểm duyệt',
            perms: ['content.edit', 'content.review', 'content.publish', 'content.archive', 'media.upload', 'log.view']
        }
    };

    /* Tài khoản demo. Lưu ý: mật khẩu KHÔNG được kiểm tra ở phía trình duyệt
       như một cơ chế xác thực thật; chỉ mô phỏng luồng đăng nhập. */

    /* ==========================================================================
       2. TIỆN ÍCH THUẦN
       ========================================================================== */

    const util = (function () {
        /** Loại bỏ dấu tiếng Việt để so sánh/ tìm kiếm không phân biệt dấu */
        const normalize = (text) => String(text == null ? '' : text)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();

        /** Escape HTML trước khi chèn vào innerHTML */
        const escape = (value) => String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        /** Bỏ thẻ HTML (dùng để đếm từ, tạo mô tả) */
        const stripTags = (html) => String(html || '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const pad = (n) => String(n).padStart(2, '0');

        /** Định dạng ngày ISO (yyyy-mm-dd hoặc ISO string) -> dd/mm/yyyy */
        const formatDate = (iso) => {
            if (!iso) return '—';
            const d = parseDate(iso);
            if (!d) return '—';
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
        };

        const formatDateTime = (iso) => {
            if (!iso) return '—';
            const d = parseDate(iso);
            if (!d) return '—';
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        /** dd/mm/yyyy hoặc yyyy-mm-dd -> Date */
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

        /** Chuyển Date -> yyyy-mm-dd (cho input[type=date]) */
        const toISODate = (d) => {
            const x = d instanceof Date ? d : parseDate(d);
            if (!x) return '';
            return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
        };

        /** "3 giờ trước", "2 ngày trước"… */
        const timeAgo = (iso) => {
            const d = parseDate(iso);
            if (!d) return '—';
            const diff = (Date.now() - d.getTime()) / 1000;
            if (diff < 60) return 'Vừa xong';
            if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
            if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
            if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
            return formatDate(d);
        };

        /** Tạo slug từ tiếng Việt */
        const slugify = (text) => normalize(text)
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 90);

        const formatNumber = (n) => Number(n || 0).toLocaleString('vi-VN');

        const formatBytes = (bytes) => {
            const b = Number(bytes) || 0;
            if (b < 1024) return `${b} B`;
            if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
            if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
            return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };

        const initials = (name) => {
            const parts = String(name || '').trim().split(/\s+/);
            if (parts.length === 0 || !parts[0]) return '?';
            if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        };

        /** So sánh chuỗi tiếng Việt hoa thường đúng thứ tự */
        const compare = (a, b) => String(a || '').localeCompare(String(b || ''), 'vi', { sensitivity: 'base' });

        const debounce = (fn, wait) => {
            let t = null;
            return function () {
                const args = arguments;
                const ctx = this;
                clearTimeout(t);
                t = setTimeout(() => fn.apply(ctx, args), wait || 250);
            };
        };

        /** Ghép class có điều kiện */
        const classNames = (...args) => args.filter(Boolean).join(' ');

        const uniqueId = (prefix) => `${prefix || 'id'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

        /** Khoảng ngày: n ngày trước -> now (ISO) */
        const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

        const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

        const truncate = (text, max) => {
            const s = String(text || '');
            return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
        };

        return {
            normalize, escape, stripTags, formatDate, formatDateTime, parseDate, toISODate,
            timeAgo, slugify, formatNumber, formatBytes, initials, compare, debounce,
            classNames, uniqueId, daysAgo, clamp, truncate
        };
    })();

    /* ==========================================================================
   Dữ liệu được nạp một lần từ REST API rồi giữ trong bộ nhớ để các hàm
   đọc (contents(), categories(), stats()...) vẫn đồng bộ như trước.
   Mọi thao tác ghi đều gọi API và làm mới bộ nhớ đệm sau khi thành công.
   Phân quyền thực tế do máy chủ kiểm tra; Store.can() chỉ dùng để ẩn/hiện UI.
   ====================================================================== */

const Store = (function () {
    const api = window.PortalAPI;

    const cache = {
        articles: [],
        categories: [],
        media: [],
        logs: [],
        notifications: [],
        stats: null,
        users: [],
        workflow: null,
        loaded: false,
    };

    let session = null; // { user, permissions, csrfToken }
    let prefs = { collapsed: false, view: 'grid', pageSize: 10 };

    /* ---------- tùy chọn giao diện (lưu cục bộ, không phải dữ liệu nghiệp vụ) ---------- */

    const loadPrefs = () => {
        try {
            const raw = window.localStorage.getItem(CONFIG.preferenceKey);
            if (raw) prefs = Object.assign(prefs, JSON.parse(raw));
        } catch (e) { /* bỏ qua */ }
        return prefs;
    };

    const savePrefs = (patch) => {
        prefs = Object.assign(prefs, patch);
        try { window.localStorage.setItem(CONFIG.preferenceKey, JSON.stringify(prefs)); } catch (e) { /* bỏ qua */ }
        return prefs;
    };

    /* ---------- đồng bộ dữ liệu ---------- */

    /** Nạp phiên hiện tại từ máy chủ */
    const loadSession = async () => {
        session = await api.auth.me();
        return session;
    };

    const setSession = (data) => {
        session = data || null;
    };

    const clearSession = () => { session = null; cache.loaded = false; };

    const logout = async () => {
        try {
            await api.auth.logout();
        } catch (e) {
            /* Phiên có thể đã hết hạn; vẫn cần dọn trạng thái phía trình duyệt. */
        }
        clearSession();
    };

    const currentUser = () => {
        const u = session && session.user;
        if (!u) return null;
        return {
            id: u.id,
            username: u.username,
            name: u.name,
            initials: util.initials(u.name),
            role: u.roleCode || u.role,
            roleId: u.roleId,
            roleName: u.roleName,
            unit: u.orgName || '',
            email: u.email || '',
            orgId: u.orgId,
            permissions: u.permissions || [],
            mustChangePassword: !!u.mustChangePassword,
        };
    };

    const getSession = () => (session ? session.user.id : null);

    /** Kiểm tra quyền cục bộ để ẩn/hiện giao diện (máy chủ vẫn kiểm tra lại) */
    const can = (perm, content) => {
        const user = currentUser();
        if (!user) return false;
        const perms = user.permissions;
        if (perm === 'content.edit.own') {
            return !!content && content.authorId === user.id && perms.indexOf('content.edit') !== -1;
        }
        return perms.indexOf(perm) !== -1;
    };

    /** Nạp toàn bộ dữ liệu cần cho CMS (song song) */
    const load = async (options) => {
        const opts = options || {};
        const tasks = [
            api.get('/api/cms/articles?limit=200').then((rows) => { cache.articles = rows || []; }),
            api.get('/api/cms/categories').then((rows) => { cache.categories = rows || []; }),
            api.get('/api/cms/stats').then((data) => { cache.stats = data; }),
            api.get('/api/cms/media').then((rows) => { cache.media = rows || []; }),
            api.get('/api/shared/users').then((rows) => {
                cache.users = (rows || []).filter((u) => u.system === 'cms');
            }).catch(() => { cache.users = []; }),
            api.get('/api/shared/notifications').then((rows) => { cache.notifications = rows || []; }).catch(() => { cache.notifications = []; }),
            api.get('/api/cms/logs?limit=120').then((rows) => { cache.logs = rows || []; }).catch(() => { cache.logs = []; }),
            api.get('/api/cms/workflow').then((data) => { cache.workflow = data; }).catch(() => { cache.workflow = null; }),
        ];
        if (opts.minimal) tasks.splice(4, 2);
        await Promise.all(tasks);
        cache.loaded = true;
        return cache;
    };

    const reload = () => load();

    /* ---------- đọc dữ liệu ---------- */

    const get = () => cache;
    const contents = () => cache.articles.slice();
    const contentById = (id) => cache.articles.find((a) => a.id === id) || null;
    const getContent = (id) => api.get(`/api/cms/articles/${encodeURIComponent(id)}`);
    const categories = () => cache.categories.slice();
    const categoryById = (id) => cache.categories.find((c) => c.id === id) || null;
    const categoryName = (id) => {
        const c = categoryById(id);
        return c ? c.name : 'Chưa phân loại';
    };
    /** Nhóm nội dung của chuyên mục (group_key do CMS quản lý) – dùng để tách 6 nhóm */
    const categoryGroup = (id) => {
        const c = categoryById(id);
        return c ? (c.group || '') : '';
    };
    const categoryChildren = (id) => cache.categories.filter((c) => c.parentId === id);
    const categoryArticleCount = (id) => cache.articles.filter((a) => a.categoryId === id && a.status !== 'archived').length;
    const media = () => cache.media.slice();
    const mediaById = (id) => cache.media.find((m) => m.id === id) || null;
    const logs = () => cache.logs.slice();
    const notifications = () => cache.notifications.slice();
    const users = () => cache.users.slice();
    const userById = (id) => cache.users.find((u) => u.id === id) || null;
    const workflow = () => cache.workflow;

    const stats = () => {
        const s = cache.stats || {};
        const a = s.articles || {};
        return {
            total: a.total || 0,
            published: a.published || 0,
            pending: a.pending || 0,
            draft: a.draft || 0,
            approved: a.approved || 0,
            rejected: a.rejected || 0,
            revision: a.revision || 0,
            archived: a.archived || 0,
            views: a.views || 0,
            categories: s.categories || 0,
            media: s.media || 0,
            documents: s.documents || 0,
            images: s.images || 0,
            users: cache.users.length,
            submissions: s.submissions || {},
            proposals: s.proposals || {},
        };
    };

    const monthlySeries = (months) => {
        const n = months || 6;
        const data = (cache.stats && cache.stats.monthly) || [];
        return data.slice(-n);
    };

    /* ---------- ghi dữ liệu ---------- */

    const saveContent = async (data, options) => {
        const opts = options || {};
        const payload = {
            title: data.title,
            excerpt: data.excerpt,
            body: data.body,
            thumbnail: data.thumbnail,
            categoryId: data.categoryId,
            source: data.source,
            tags: data.tags,
            seoTitle: data.seoTitle,
            seoDescription: data.seoDescription,
        };
        let saved;
        if (data.id) {
            saved = await api.put(`/api/cms/articles/${encodeURIComponent(data.id)}`, payload);
        } else {
            saved = await api.post('/api/cms/articles', Object.assign({ status: data.status || 'draft' }, payload));
        }
        await load();
        return saved;
    };

    const setStatus = async (id, status, extra) => {
        const map = {
            draft: null, pending: 'submit', approved: 'approve', published: 'publish',
            rejected: 'reject', revision: 'revise', archived: 'archive',
        };
        const record = contentById(id);
        if (!record) throw new Error('Không tìm thấy nội dung cần cập nhật.');

        let action;
        if (status === 'draft') action = 'unpublish';
        else if (status === 'pending' && record.status === 'published') action = 'unpublish';
        else action = map[status];

        if (!action) throw new Error('Chuyển trạng thái không hợp lệ.');

        let saved = record;
        if (status === 'draft' && record.status === 'published') {
            saved = await api.post(`/api/cms/articles/${encodeURIComponent(id)}/unpublish`);
        } else {
            saved = await api.post(`/api/cms/articles/${encodeURIComponent(id)}/${action}`, {
                note: (extra && (extra.note || extra.detail)) || '',
            });
        }
        await load();
        return saved;
    };

    const deleteContent = async (id) => {
        await api.del(`/api/cms/articles/${encodeURIComponent(id)}`);
        await load();
        return true;
    };

    const saveCategory = async (data) => {
        const payload = {
            name: data.name,
            parentId: data.parentId || null,
            description: data.description,
            group: data.group,
            status: data.status,
            order: data.order,
        };
        const saved = data.id
            ? await api.put(`/api/cms/categories/${encodeURIComponent(data.id)}`, payload)
            : await api.post('/api/cms/categories', payload);
        cache.categories = await api.get('/api/cms/categories');
        return saved;
    };

    const deleteCategory = async (id) => {
        await api.del(`/api/cms/categories/${encodeURIComponent(id)}`);
        cache.categories = await api.get('/api/cms/categories');
        return true;
    };

    const listCatalog = (kind) => api.get(`/api/cms/catalog/${encodeURIComponent(kind)}`);
    const saveCatalog = (kind, data) => data.id
        ? api.put(`/api/cms/catalog/${encodeURIComponent(kind)}/${encodeURIComponent(data.id)}`, data)
        : api.post(`/api/cms/catalog/${encodeURIComponent(kind)}`, data);
    const deleteCatalog = (kind, id) =>
        api.del(`/api/cms/catalog/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);

    const moveCategory = async (id, direction) => {
        await api.post(`/api/cms/categories/${encodeURIComponent(id)}/reorder`, { direction: direction > 0 ? 'down' : 'up' });
        cache.categories = await api.get('/api/cms/categories');
        return true;
    };

    const addMedia = async (file) => {
        let body = file;
        if (file && file.file instanceof File) {
            const form = new FormData();
            form.append('file', file.file, file.file.name);
            form.append('alt', file.alt || '');
            form.append('folder', file.folder || '');
            body = form;
        }
        const saved = await api.post('/api/cms/media', body);
        cache.media = await api.get('/api/cms/media');
        return saved;
    };

    const deleteMedia = async (id) => {
        await api.del(`/api/cms/media/${encodeURIComponent(id)}`);
        cache.media = await api.get('/api/cms/media');
        return true;
    };

    const markNotificationsRead = async () => {
        await api.post('/api/shared/notifications/read', {});
        cache.notifications = (await api.get('/api/shared/notifications')) || [];
    };

    /** Ghi nhật ký bổ sung cho các thao tác đặc thù (máy chủ đã ghi log nghiệp vụ) */
    const addLog = (entry) => {
        // Nhật ký do máy chủ ghi; chỉ cập nhật bộ nhớ cục bộ cho hiển thị tức thời
        if (cache.logs && entry) {
            cache.logs.unshift({
                id: `local-${Date.now()}`,
                userId: getSession(),
                userName: currentUser() ? currentUser().name : 'Hệ thống',
                action: entry.action,
                targetType: entry.targetType,
                targetName: entry.targetName,
                targetId: entry.targetId,
                status: entry.status || 'success',
                detail: entry.detail,
                at: new Date().toISOString(),
            });
        }
        return null;
    };

    /* ---------- tiếp nhận, đề xuất, phối hợp ---------- */

    const submissions = () => cache.submissions || [];
    const loadSubmissions = async (query) => {
        cache.submissions = await api.get('/api/cms/submissions' + api.qs(query || {}));
        return cache.submissions;
    };
    const updateSubmission = async (id, payload) => {
        const saved = await api.put(`/api/cms/submissions/${encodeURIComponent(id)}`, payload);
        cache.submissions = await api.get('/api/cms/submissions');
        return saved;
    };
    const assignSubmission = async (id, payload) => {
        const saved = await api.post(`/api/cms/submissions/${encodeURIComponent(id)}/assign`, payload);
        cache.submissions = await api.get('/api/cms/submissions');
        return saved;
    };

    const proposals = () => (cache.workflow && cache.workflow.proposals) || [];
    const loadProposals = async () => {
        cache.proposals = await api.get('/api/cms/proposals');
        return cache.proposals;
    };
    const allProposals = () => cache.proposals || [];
    const reviewProposal = async (id, payload) => {
        const saved = await api.post(`/api/cms/proposals/${encodeURIComponent(id)}/review`, payload);
        await load();
        cache.proposals = await api.get('/api/cms/proposals');
        return saved;
    };

    const createCollaboration = (payload) => api.post('/api/cms/collaborations', payload);

    return {
        /* dữ liệu */
        get, load, reload, loadSession, setSession, clearSession, logout, getSession, currentUser, can, getContent,
        contents, contentById, categories, categoryById, categoryName, categoryGroup, categoryChildren, categoryArticleCount,
        media, mediaById, logs, notifications, users, userById, workflow,
        stats, monthlySeries,
        /* ghi */
        saveContent, setStatus, deleteContent, saveCategory, deleteCategory, moveCategory,
        listCatalog, saveCatalog, deleteCatalog,
        addMedia, deleteMedia, markNotificationsRead, addLog,
        submissions, loadSubmissions, updateSubmission, assignSubmission,
        proposals, loadProposals, allProposals, reviewProposal, createCollaboration,
        /* tùy chọn */
        loadPrefs, savePrefs,
        ROLES
    };
})();

    /* Class trạng thái & vai trò dùng lại ở nhiều trang */
    const statusLabel = (s) => (STATUS[s] ? STATUS[s].label : s || '—');
    const statusTone = (s) => (STATUS[s] ? STATUS[s].tone : 'draft');
    const roleLabel = (r) => (ROLES[r] ? ROLES[r].label : r || '—');

    /* ==========================================================================
       5. THÀNH PHẦN GIAO DIỆN DÙNG CHUNG
       ========================================================================== */

    const ui = (function () {
        const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        let openLayers = [];

        /* ---------- Toast ---------- */

        const getToastHost = () => {
            let host = document.querySelector('.cms-toast-container');
            if (!host) {
                host = document.createElement('div');
                host.className = 'cms-toast-container';
                host.setAttribute('role', 'status');
                host.setAttribute('aria-live', 'polite');
                document.body.appendChild(host);
            }
            return host;
        };

        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-exclamation',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info'
        };

        const toast = (message, options) => {
            const opts = typeof options === 'string' ? { type: options } : (options || {});
            const type = opts.type || 'info';
            const host = getToastHost();
            const el = document.createElement('div');
            el.className = `cms-toast cms-toast--${type}`;
            el.innerHTML = `
                <i class="fa-solid ${icons[type] || icons.info} cms-toast__icon" aria-hidden="true"></i>
                <div class="cms-toast__body">
                    ${opts.title ? `<strong class="cms-toast__title">${util.escape(opts.title)}</strong>` : ''}
                    <span>${util.escape(message)}</span>
                </div>
                <button type="button" class="cms-toast__close" aria-label="Đóng thông báo">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>`;
            host.appendChild(el);

            let timer = setTimeout(() => close(), opts.duration || 4200);

            const close = () => {
                clearTimeout(timer);
                if (!el.isConnected) return;
                el.classList.add('is-leaving');
                setTimeout(() => el.remove(), 200);
            };

            el.querySelector('.cms-toast__close').addEventListener('click', close);
            el.addEventListener('mouseenter', () => clearTimeout(timer));
            el.addEventListener('mouseleave', () => { timer = setTimeout(close, 1600); });
            return { close };
        };

        /* ---------- Modal ---------- */

        const modal = (options) => {
            const opts = options || {};
            const wrap = document.createElement('div');
            wrap.className = 'cms-modal';
            wrap.innerHTML = `
                <div class="cms-modal__backdrop" data-modal-close></div>
                <div class="cms-modal__dialog ${opts.size ? 'cms-modal__dialog--' + opts.size : ''}"
                     role="dialog" aria-modal="true" aria-labelledby="cms-modal-title-${Date.now()}">
                    <div class="cms-modal__head">
                        <div>
                            <h2 class="cms-modal__title" id="cms-modal-title-${Date.now()}">${util.escape(opts.title || '')}</h2>
                            ${opts.subtitle ? `<p class="cms-modal__subtitle">${util.escape(opts.subtitle)}</p>` : ''}
                        </div>
                        <button type="button" class="cms-modal__close" data-modal-close aria-label="Đóng hộp thoại">
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div class="cms-modal__body ${opts.flush ? 'cms-modal__body--flush' : ''}">${opts.content || ''}</div>
                    ${opts.footer === null ? '' : `<div class="cms-modal__foot ${opts.footerClass || ''}">${opts.footer || `
                        <button type="button" class="cms-btn" data-modal-close>Đóng</button>`}</div>`}
                </div>`;

            document.body.appendChild(wrap);
            /* requestAnimationFrame để transition/animation chạy */
            requestAnimationFrame(() => wrap.classList.add('is-open'));
            document.body.classList.add('is-modal-open');

            const previouslyFocused = document.activeElement;

            const close = () => {
                wrap.classList.remove('is-open');
                setTimeout(() => wrap.remove(), 180);
                openLayers = openLayers.filter((l) => l !== layer);
                if (!openLayers.length) document.body.classList.remove('is-modal-open');
                if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
            };

            const layer = { close, el: wrap };
            openLayers.push(layer);

            wrap.addEventListener('click', (e) => {
                if (e.target.closest('[data-modal-close]')) {
                    e.preventDefault();
                    close();
                }
            });

            wrap.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    close();
                    return;
                }
                if (e.key !== 'Tab') return;
                /* Giữ focus trong modal */
                const nodes = Array.from(wrap.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
                if (!nodes.length) return;
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            });

            requestAnimationFrame(() => {
                const focusable = wrap.querySelector('[data-autofocus]') ||
                    wrap.querySelector('.cms-modal__body input, .cms-modal__body textarea, .cms-modal__body select') ||
                    wrap.querySelector('.cms-modal__foot .cms-btn--primary') ||
                    wrap.querySelector('.cms-modal__close');
                if (focusable) focusable.focus();
            });

            return {
                el: wrap,
                body: wrap.querySelector('.cms-modal__body'),
                footer: wrap.querySelector('.cms-modal__foot'),
                close,
                query: (sel) => wrap.querySelector(sel)
            };
        };

        /** Hộp thoại xác nhận. Trả về Promise<boolean>. */
        const confirm = (options) => {
            const opts = options || {};
            const tone = opts.tone || 'warning';
            const iconMap = { danger: 'fa-triangle-exclamation', warning: 'fa-circle-question', info: 'fa-circle-info' };
            return new Promise((resolve) => {
                let settled = false;
                const dlg = modal({
                    title: opts.title || 'Xác nhận thao tác',
                    size: '',
                    content: `
                        <div class="cms-confirm">
                            <span class="cms-confirm__icon cms-confirm__icon--${tone}">
                                <i class="fa-solid ${iconMap[tone] || iconMap.warning}" aria-hidden="true"></i>
                            </span>
                            <div class="cms-confirm__body">
                                <p class="cms-confirm__title">${util.escape(opts.heading || 'Bạn có chắc chắn?')}</p>
                                <p class="cms-confirm__text">${opts.message || ''}</p>
                                ${opts.detail ? `<p class="cms-confirm__text cms-u-mt-sm">${opts.detail}</p>` : ''}
                            </div>
                        </div>`,
                    footer: `
                        <button type="button" class="cms-btn" data-modal-close>Hủy</button>
                        <button type="button" class="cms-btn cms-btn--${tone === 'danger' ? 'danger' : 'primary'}" data-confirm-ok data-autofocus>
                            ${util.escape(opts.confirmText || 'Xác nhận')}
                        </button>`,
                    footerClass: 'cms-modal__foot--between'
                });

                const finish = (value) => {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                };

                dlg.el.addEventListener('click', (e) => {
                    if (e.target.closest('[data-confirm-ok]')) {
                        finish(true);
                        dlg.close();
                    } else if (e.target.closest('[data-modal-close]')) {
                        finish(false);
                    }
                });
                dlg.el.addEventListener('cms:closed', () => finish(false));
            });
        };

        /* ---------- Dropdown ---------- */

        const closeAllDropdowns = (except) => {
            document.querySelectorAll('.cms-dropdown__menu.is-open').forEach((menu) => {
                if (menu === except) return;
                menu.classList.remove('is-open');
                const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
                if (trigger) trigger.setAttribute('aria-expanded', 'false');
            });
        };

        const initDropdowns = (root) => {
            (root || document).querySelectorAll('[data-dropdown]').forEach((wrap) => {
                if (wrap.dataset.dropdownBound) return;
                wrap.dataset.dropdownBound = '1';
                const trigger = wrap.querySelector('[data-dropdown-trigger]');
                const menu = wrap.querySelector('.cms-dropdown__menu');
                if (!trigger || !menu) return;
                if (!menu.id) menu.id = util.uniqueId('dd');

                trigger.setAttribute('aria-haspopup', 'true');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.setAttribute('aria-controls', menu.id);

                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const willOpen = !menu.classList.contains('is-open');
                    closeAllDropdowns(willOpen ? menu : null);
                    menu.classList.toggle('is-open', willOpen);
                    trigger.setAttribute('aria-expanded', String(willOpen));
                });

                menu.addEventListener('click', (e) => {
                    if (e.target.closest('[data-dropdown-keepopen]')) return;
                    if (e.target.closest('button, a')) {
                        menu.classList.remove('is-open');
                        trigger.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        };

        /* ---------- Pagination ---------- */

        /**
         * Dựng thanh phân trang.
         * @param {HTMLElement} host
         * @param {{total:number,page:number,pageSize:number}} info
         * @param {(page:number)=>void} onChange
         */
        const renderPagination = (host, info, onChange) => {
            if (!host) return;
            const totalPages = Math.max(1, Math.ceil(info.total / info.pageSize));
            const page = util.clamp(info.page, 1, totalPages);
            const from = info.total === 0 ? 0 : (page - 1) * info.pageSize + 1;
            const to = Math.min(info.total, page * info.pageSize);

            const pages = [];
            const add = (p) => { if (pages.indexOf(p) === -1) pages.push(p); };
            add(1);
            for (let p = page - 1; p <= page + 1; p++) if (p > 1 && p < totalPages) add(p);
            if (totalPages > 1) add(totalPages);
            pages.sort((a, b) => a - b);

            let buttons = '';
            let prevPage = 0;
            pages.forEach((p) => {
                if (prevPage && p - prevPage > 1) {
                    buttons += '<li><span class="cms-page-btn cms-page-btn--gap">…</span></li>';
                }
                buttons += `<li><button type="button" class="cms-page-btn ${p === page ? 'is-active' : ''}"
                    data-page="${p}" ${p === page ? 'aria-current="page"' : ''}>${p}</button></li>`;
                prevPage = p;
            });

            host.innerHTML = `
                <p class="cms-pagination__info">
                    Hiển thị <strong>${util.formatNumber(from)}–${util.formatNumber(to)}</strong>
                    trong <strong>${util.formatNumber(info.total)}</strong> kết quả
                </p>
                <nav aria-label="Phân trang kết quả">
                    <ul class="cms-pagination__pages">
                        <li>
                            <button type="button" class="cms-page-btn" data-page="${page - 1}"
                                ${page <= 1 ? 'disabled' : ''} aria-label="Trang trước">
                                <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                            </button>
                        </li>
                        ${buttons}
                        <li>
                            <button type="button" class="cms-page-btn" data-page="${page + 1}"
                                ${page >= totalPages ? 'disabled' : ''} aria-label="Trang sau">
                                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                            </button>
                        </li>
                    </ul>
                </nav>`;

            if (!host.dataset.paginationBound) {
                host.dataset.paginationBound = '1';
                host.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-page]');
                    if (!btn || btn.disabled) return;
                    const p = Number(btn.dataset.page);
                    if (!p) return;
                    host.dispatchEvent(new CustomEvent('cms:pagination', { detail: { page: p }, bubbles: true }));
                });
            }
            host.onPagination = onChange;
            host.addEventListener('cms:pagination', (e) => {
                if (host.onPagination) host.onPagination(e.detail.page);
            }, { once: false });
        };

        /* ---------- Trạng thái rỗng / lỗi ---------- */

        const emptyState = (options) => {
            const o = options || {};
            return `<div class="cms-state">
                <span class="cms-state__icon ${o.tone === 'danger' ? 'cms-state__icon--danger' : ''}">
                    <i class="fa-solid ${o.icon || 'fa-inbox'}" aria-hidden="true"></i>
                </span>
                <p class="cms-state__title">${util.escape(o.title || 'Không có dữ liệu')}</p>
                <p class="cms-state__text">${util.escape(o.text || '')}</p>
                ${o.action || ''}
            </div>`;
        };

        const skeletonRows = (rows, cols) => {
            let html = '';
            for (let i = 0; i < rows; i++) {
                html += '<tr>';
                for (let c = 0; c < cols; c++) {
                    html += `<td><span class="cms-skeleton cms-skeleton--line" style="width:${60 + (c * 13) % 40}%"></span></td>`;
                }
                html += '</tr>';
            }
            return html;
        };

        const badge = (status) => `<span class="cms-badge cms-badge--${statusTone(status)}">${util.escape(statusLabel(status))}</span>`;

        const userCell = (name) => `<span class="cms-mini-user">
            <span class="cms-mini-user__avatar" aria-hidden="true">${util.escape(util.initials(name))}</span>
            <span>${util.escape(name || '—')}</span></span>`;

        /* ---------- Xử lý phím Escape cho mọi lớp phủ ---------- */

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (openLayers.length) {
                const top = openLayers[openLayers.length - 1];
                if (top && top.close) top.close();
                return;
            }
            if (!document.querySelector('.cms-dropdown__menu.is-open')) return;
            closeAllDropdowns(null);
        });

        return {
            toast, modal, confirm,
            initDropdowns, closeAllDropdowns,
            renderPagination, emptyState, skeletonRows, badge, userCell,
            openLayers: () => openLayers
        };
    })();

    /* ==========================================================================
       6. DANH MỤC TRANG
       ========================================================================== */

    /* ======================================================================
           6. DANH MỤC TRANG – nguồn duy nhất cho sidebar, breadcrumb, tiêu đề
           Dùng chung cho cả 8 trang quản trị.
           ====================================================================== */

    const PAGES = {
        'dashboard.html': { title: 'Tổng quan', icon: 'fa-gauge-high', group: 'main', crumb: 'Tổng quan', desc: 'Tình hình hoạt động và thống kê nội dung trên Cổng thông tin.' },
        'content-list.html': { title: 'Danh sách nội dung', icon: 'fa-newspaper', group: 'content', crumb: 'Danh sách nội dung', desc: 'Quản lý toàn bộ bài viết, tin tức và chuyên đề đăng tải trên Cổng thông tin.' },
        'content-editor.html': { title: 'Biên tập nội dung', icon: 'fa-pen-to-square', group: 'content', crumb: 'Biên tập nội dung', desc: 'Soạn thảo, kiểm soát thuộc tính và xuất bản bài viết.' },
        'categories.html': { title: 'Quản lý chuyên mục', icon: 'fa-folder-tree', group: 'content', crumb: 'Chuyên mục', desc: 'Tổ chức cấu trúc chuyên mục cha – con hiển thị trên Cổng thông tin.' },
        'public-catalog.html': { title: 'Nội dung công khai', icon: 'fa-building-columns', group: 'content', crumb: 'Nội dung công khai', desc: 'Quản lý văn bản, cơ quan, sự kiện, cơ sở hỗ trợ và số liệu công khai.' },
        'system-categories.html': { title: 'Quản lý danh mục', icon: 'fa-list-check', group: 'config', crumb: 'Quản lý danh mục', desc: 'Quản lý các lựa chọn nghiệp vụ dùng chung trong CMS, Workspace và Cổng thông tin.' },
        'publishing-workflow.html': { title: 'Quy trình xuất bản', icon: 'fa-code-branch', group: 'workflow', crumb: 'Quy trình xuất bản', desc: 'Theo dõi, kiểm duyệt và phát hành nội dung theo từng bước nghiệp vụ.' },
        'media-library.html': { title: 'Thư viện tài nguyên', icon: 'fa-photo-film', group: 'media', crumb: 'Thư viện tài nguyên', desc: 'Quản lý hình ảnh, tài liệu và tệp đính kèm dùng cho nội dung Cổng thông tin.' },
        'activity-log.html': { title: 'Nhật ký hoạt động', icon: 'fa-clock-rotate-left', group: 'system', crumb: 'Nhật ký hoạt động', desc: 'Tra cứu lịch sử thao tác của người dùng trong khu vực quản trị.' },
        'submissions.html': { title: 'Tiếp nhận & xử lý yêu cầu', icon: 'fa-inbox', group: 'workflow', crumb: 'Tiếp nhận yêu cầu', desc: 'Tiếp nhận, phân công và phản hồi yêu cầu, phản ánh do công dân gửi qua Cổng thông tin.' },
        'login.html': { title: 'Đăng nhập quản trị', icon: 'fa-right-to-bracket', group: 'hidden', crumb: 'Đăng nhập', desc: '' }
    };

    const NAV_GROUPS = [
        { id: 'main', label: 'Tổng quan' },
        { id: 'content', label: 'Quản lý nội dung' },
        { id: 'workflow', label: 'Kiểm duyệt & xuất bản' },
        { id: 'media', label: 'Tài nguyên' },
        { id: 'config', label: 'Cấu hình hệ thống' },
        { id: 'system', label: 'Hệ thống' }
    ];

    /* ==========================================================================
       7. SHELL – SIDEBAR, HEADER, BREADCRUMB
       ========================================================================== */

    const Shell = (function () {
        const currentFile = () => {
            const parts = window.location.pathname.split('/');
            const file = parts[parts.length - 1] || 'dashboard.html';
            return file.indexOf('.html') === -1 ? 'dashboard.html' : file;
        };

        const isLogin = () => currentFile() === 'login.html';

        /** Kiểm tra sơ bộ phía trình duyệt. Việc chặn thực sự do boot() và máy chủ đảm nhiệm, vì
            phiên đăng nhập chỉ biết được sau khi gọi /api/auth/me (bất đồng bộ). */
        const guard = () => {
            if (isLogin() || !document.querySelector('.cms-app')) return true;
            return true;
        };

        /* ---------- Sidebar ---------- */

        const renderSidebar = () => {
            const host = document.getElementById('cms-sidebar');
            if (!host) return;
            const user = Store.currentUser();
            const stats = Store.stats();
            const active = currentFile();

            const badgeFor = (key) => {
                if (key === 'pending' && stats.pending) return `<span class="cms-nav-link__badge">${stats.pending}</span>`;
                return '';
            };

            const items = [
                { group: 'main', file: 'dashboard.html' },
                { group: 'content', file: 'content-list.html', label: 'Danh sách nội dung', badge: badgeFor('pending'), hash: '#all' },
                { group: 'content', file: 'content-editor.html', label: 'Tạo bài viết mới' },
                { group: 'content', file: 'categories.html', label: 'Chuyên mục' },
                { group: 'content', file: 'public-catalog.html', label: 'Nội dung công khai' },
                { group: 'config', file: 'system-categories.html', label: 'Quản lý danh mục' },
                { group: 'workflow', file: 'publishing-workflow.html', label: 'Quy trình xuất bản', badge: badgeFor('pending') },
                { group: 'workflow', file: 'submissions.html', label: 'Tiếp nhận yêu cầu', badge: stats.submissions && stats.submissions.new ? `<span class="cms-nav-link__badge">${stats.submissions.new}</span>` : '' },
                { group: 'media', file: 'media-library.html', label: 'Thư viện tài nguyên' },
                { group: 'system', file: 'activity-log.html', label: 'Nhật ký hoạt động' }
            ];

            const groups = NAV_GROUPS.map((g) => {
                const links = items.filter((i) => i.group === g.id).map((item) => {
                    const page = PAGES[item.file];
                    const label = item.label || page.title;
                    /* Trình biên tập thuộc nhóm "Danh sách nội dung"; liên kết "Tạo bài viết mới"
                       chỉ được đánh dấu khi đang mở bài viết mới. */
                    const isNewArticle = active === 'content-editor.html' && !new URLSearchParams(window.location.search).get('id');
                    const isActive = item.file === 'content-editor.html'
                        ? (item.label === 'Tạo bài viết mới' ? isNewArticle : false)
                        : active === item.file;
                    const isParentActive = item.file === 'content-list.html' && active === 'content-editor.html';
                    const href = item.file;
                    return `<li>
                        <a class="cms-nav-link ${isActive ? 'is-active' : ''}${isParentActive ? ' is-parent' : ''}" href="${href}"
                           data-tooltip="${util.escape(label)}" ${isActive ? 'aria-current="page"' : ''}>
                            <span class="cms-nav-link__icon"><i class="fa-solid ${page.icon}" aria-hidden="true"></i></span>
                            <span class="cms-nav-link__text">${util.escape(label)}</span>
                            ${item.badge || ''}
                        </a>
                    </li>`;
                }).join('');
                return `<div class="cms-nav-group">
                    <p class="cms-nav-group__label">${util.escape(g.label)}</p>
                    <ul class="cms-nav-list">${links}</ul>
                </div>`;
            }).join('');

            const roleInfo = user ? { label: user.roleName || roleLabel(user.role) } : null;

            host.innerHTML = `
                <div class="cms-sidebar__brand">
                    <a href="dashboard.html" class="cms-sidebar__logo" aria-label="Về trang tổng quan quản trị">
                        <img src="../../assets/icons/logo.jpg" alt="Biểu trưng Cổng thông tin">
                    </a>
                    <div class="cms-sidebar__brand-text">
                        <span class="cms-sidebar__brand-title">CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH</span>
                        <span class="cms-sidebar__brand-sub">Hệ thống quản trị</span>
                    </div>
                </div>
                <button type="button" class="cms-sidebar__collapse" id="cms-sidebar-collapse"
                        aria-label="Thu gọn thanh điều hướng" title="Thu gọn / mở rộng">
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                </button>
                <nav class="cms-sidebar__nav" aria-label="Điều hướng quản trị">${groups}</nav>
                <div class="cms-sidebar__user">
                    <span class="cms-sidebar__avatar" aria-hidden="true">${user ? util.escape(user.initials) : '?'}</span>
                    <div class="cms-sidebar__user-info">
                        <span class="cms-sidebar__user-name">${user ? util.escape(user.name) : 'Chưa đăng nhập'}</span>
                        <span class="cms-sidebar__user-role">${roleInfo ? util.escape(roleInfo.label) : 'Khách'}</span>
                    </div>
                </div>`;

            /* Trạng thái thu gọn: máy tính bảng (769–1024px) mặc định thu gọn;
               máy tính để bàn khôi phục lựa chọn đã lưu của người dùng. */
            const prefs = Store.loadPrefs();
            const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
            if (isTablet || (prefs.collapsed && window.innerWidth > 1024)) {
                host.classList.add('is-collapsed');
            }

            const collapseBtn = document.getElementById('cms-sidebar-collapse');
            const setCollapsed = (value) => {
                host.classList.toggle('is-collapsed', value);
                collapseBtn.setAttribute('aria-label', value ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng');
                const icon = collapseBtn.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-left', !value);
                    icon.classList.toggle('fa-chevron-right', value);
                }
                Store.savePrefs({ collapsed: value });
            };
            if (host.classList.contains('is-collapsed')) setCollapsed(true);
            collapseBtn.addEventListener('click', () => setCollapsed(!host.classList.contains('is-collapsed')));
        };

        /* ---------- Drawer cho mobile ---------- */

        const initDrawer = () => {
            const sidebar = document.getElementById('cms-sidebar');
            const toggle = document.getElementById('cms-menu-toggle');
            if (!sidebar || !toggle) return;

            let overlay = document.querySelector('.cms-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'cms-overlay';
                document.body.appendChild(overlay);
            }

            const close = () => {
                sidebar.classList.remove('is-open');
                overlay.classList.remove('is-active');
                toggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            };

            const open = () => {
                sidebar.classList.add('is-open');
                overlay.classList.add('is-active');
                toggle.setAttribute('aria-expanded', 'true');
                document.body.style.overflow = 'hidden';
                const first = sidebar.querySelector('.cms-nav-link');
                if (first) first.focus();
            };

            toggle.addEventListener('click', () => {
                if (sidebar.classList.contains('is-open')) close();
                else open();
            });
            overlay.addEventListener('click', close);
            sidebar.addEventListener('click', (e) => {
                if (e.target.closest('.cms-nav-link')) close();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && sidebar.classList.contains('is-open')) close();
            });
            window.addEventListener('resize', () => {
                if (window.innerWidth > 768 && sidebar.classList.contains('is-open')) close();
            });
        };

        /* ---------- Header ---------- */

        const renderHeader = () => {
            const page = PAGES[currentFile()] || PAGES['dashboard.html'];
            const titleEl = document.getElementById('cms-page-title');
            const crumbEl = document.getElementById('cms-breadcrumb');
            const user = Store.currentUser();
            const roleInfo = user ? { label: user.roleName || roleLabel(user.role) } : null;

            if (titleEl) titleEl.textContent = page.title;
            document.title = `${page.title} | CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH`.toUpperCase();

            if (crumbEl) {
                const file = currentFile();
                const isEditor = file === 'content-editor.html';
                const crumbs = [`<li><a href="dashboard.html"><i class="fa-solid fa-house" aria-hidden="true"></i> Quản trị</a></li>`];
                if (file === 'dashboard.html') {
                    crumbs.push('<li aria-current="page">Tổng quan</li>');
                } else if (isEditor) {
                    crumbs.push('<li><a href="content-list.html">Nội dung</a></li>');
                    crumbs.push(`<li aria-current="page">${page.crumb}</li>`);
                } else {
                    crumbs.push(`<li aria-current="page">${util.escape(page.crumb)}</li>`);
                }
                crumbEl.innerHTML = crumbs.join('');
            }

            const userHost = document.getElementById('cms-user-host');
            if (userHost && user) {
                userHost.innerHTML = `
                    <div class="cms-dropdown" data-dropdown>
                        <button type="button" class="cms-user" data-dropdown-trigger aria-label="Mở menu tài khoản">
                            <span class="cms-user__avatar" aria-hidden="true">${util.escape(user.initials)}</span>
                            <span class="cms-user__meta">
                                <span class="cms-user__name">${util.escape(user.name)}</span>
                                <span class="cms-user__role">${roleInfo ? util.escape(roleInfo.label) : ''}</span>
                            </span>
                            <i class="fa-solid fa-chevron-down cms-user__chevron" aria-hidden="true"></i>
                        </button>
                        <ul class="cms-dropdown__menu">
                            <li class="cms-dropdown__header">${util.escape(roleInfo ? roleInfo.label : '')}</li>
                            <li><span class="cms-dropdown__item cms-u-static">
                                <i class="fa-solid fa-id-badge" aria-hidden="true"></i>${util.escape(user.username)}</span></li>
                            <li class="cms-dropdown__divider" role="separator"></li>
                            <li><button type="button" class="cms-dropdown__item" data-user-action="profile">
                                <i class="fa-solid fa-user-pen" aria-hidden="true"></i>Thông tin tài khoản</button></li>
                            <li><button type="button" class="cms-dropdown__item" data-user-action="permissions">
                                <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Quyền hạn của tôi</button></li>
                            <li><button type="button" class="cms-dropdown__item" data-user-action="site">
                                <i class="fa-solid fa-globe" aria-hidden="true"></i>Xem Cổng thông tin</button></li>
                            <li class="cms-dropdown__divider" role="separator"></li>
                            <li><button type="button" class="cms-dropdown__item cms-dropdown__item--danger" data-user-action="logout">
                                <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>Đăng xuất</button></li>
                        </ul>
                    </div>`;
            }

            /* Thông báo */
            const noticeHost = document.getElementById('cms-notifications');
            if (noticeHost) {
                const list = Store.notifications();
                const unread = list.filter((n) => !n.read).length;
                const iconMap = { info: 'fa-circle-info', warning: 'fa-clock', success: 'fa-check' };
                noticeHost.innerHTML = `
                    <div class="cms-dropdown" data-dropdown>
                        <button type="button" class="cms-icon-btn" data-dropdown-trigger aria-label="Thông báo (${unread} chưa đọc)">
                            <i class="fa-regular fa-bell" aria-hidden="true"></i>
                            ${unread ? '<span class="cms-icon-btn__dot"></span>' : ''}
                        </button>
                        <div class="cms-dropdown__menu cms-dropdown__menu--wide">
                            <div class="cms-dropdown__header">Thông báo gần đây</div>
                            ${list.map((n) => `
                                <a class="cms-notice-item" href="${n.href}">
                                    <span class="cms-notice-item__icon cms-notice-item__icon--${n.type}">
                                        <i class="fa-solid ${iconMap[n.type] || iconMap.info}" aria-hidden="true"></i>
                                    </span>
                                    <span class="cms-notice-item__body">
                                        <span class="cms-notice-item__title">${util.escape(n.title)}</span>
                                        ${util.escape(n.text)}
                                        <span class="cms-notice-item__time">${util.escape(util.timeAgo(n.time))}</span>
                                    </span>
                                </a>`).join('')}
                            <div class="cms-dropdown__divider" role="separator"></div>
                            <button type="button" class="cms-dropdown__item" data-mark-read>
                                <i class="fa-solid fa-check-double" aria-hidden="true"></i>Đánh dấu đã đọc tất cả
                            </button>
                        </div>
                    </div>`;

                const markBtn = noticeHost.querySelector('[data-mark-read]');
                if (markBtn) {
                    markBtn.addEventListener('click', async () => {
                        try {
                            await Store.markNotificationsRead();
                            const dot = noticeHost.querySelector('.cms-icon-btn__dot');
                            if (dot) dot.remove();
                            ui.toast('Đã đánh dấu tất cả thông báo là đã đọc.', 'success');
                        } catch (err) {
                            ui.toast(err.message || 'Không cập nhật được trạng thái thông báo.', { type: 'error' });
                        }
                    });
                }
            }

            /* Năm bản quyền ở footer */
            document.querySelectorAll('.cms-year').forEach((el) => {
                el.textContent = new Date().getFullYear();
                el.setAttribute('datetime', String(new Date().getFullYear()));
            });
            document.querySelectorAll('.cms-version').forEach((el) => {
                el.textContent = `v${CONFIG.version}`;
            });
        };

        /* ---------- Hành động menu người dùng ---------- */

        const initUserActions = () => {
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-user-action]');
                if (!btn) return;
                const action = btn.dataset.userAction;
                const user = Store.currentUser();

                if (action === 'logout') {
                    ui.confirm({
                        tone: 'warning',
                        heading: 'Đăng xuất khỏi khu vực quản trị?',
                        message: 'Phiên làm việc hiện tại sẽ kết thúc trên thiết bị này.',
                        confirmText: 'Đăng xuất'
                    }).then(async (ok) => {
                        if (!ok) return;
                        Store.addLog({ action: 'logout', targetType: 'Hệ thống', targetName: 'Phiên đăng nhập quản trị', detail: 'Đăng xuất khỏi khu vực quản trị.' });
                        await Store.logout();
                        window.location.href = 'login.html';
                    });
                    return;
                }

                if (action === 'permissions') {
                    const role = user ? { label: user.roleName || roleLabel(user.role), perms: user.permissions } : null;
                    const list = [
                        ['content.create', 'Tạo nội dung mới'],
                        ['content.edit', 'Chỉnh sửa nội dung'],
                        ['content.delete', 'Xóa nội dung'],
                        ['content.submit', 'Gửi nội dung để xét duyệt'],
                        ['content.review', 'Kiểm duyệt nội dung'],
                        ['content.publish', 'Xuất bản nội dung'],
                        ['content.archive', 'Lưu trữ nội dung'],
                        ['category.manage', 'Quản lý chuyên mục'],
                        ['media.upload', 'Tải tệp lên thư viện tài nguyên'],
                        ['media.delete', 'Xóa tài nguyên'],
                        ['log.view', 'Xem nhật ký hoạt động']
                    ];
                    ui.modal({
                        title: 'Quyền hạn của tôi',
                        subtitle: role ? `${role.label} — ${user.name}` : '',
                        content: `
                            <div class="cms-permission-note">
                                <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                                <span>Phân quyền dưới đây chỉ mang tính <strong>mô phỏng giao diện</strong>.
                                Trong triển khai chính thức, quyền hạn phải được kiểm tra tại máy chủ cho từng yêu cầu.</span>
                            </div>
                            <ul class="cms-permission-list cms-u-mt-md">
                                ${list.map(([perm, label]) => {
                            const ok = role && role.perms.indexOf(perm) !== -1;
                            return `<li><i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}" aria-hidden="true"></i>
                                        ${util.escape(label)}</li>`;
                        }).join('')}
                            </ul>`
                    });
                    return;
                }

                if (action === 'profile') {
                    ui.modal({
                        title: 'Thông tin tài khoản',
                        subtitle: 'Dữ liệu minh họa – xác thực thật cần backend',
                        content: `
                            <dl class="cms-detail-list">
                                <dt>Tên đăng nhập</dt><dd>${util.escape(user ? user.username : '—')}</dd>
                                <dt>Họ và tên</dt><dd>${util.escape(user ? user.name : '—')}</dd>
                                <dt>Đơn vị</dt><dd>${util.escape(user ? user.unit : '—')}</dd>
                                <dt>Email</dt><dd>${util.escape(user ? user.email : '—')}</dd>
                                <dt>Vai trò</dt><dd>${util.escape(user ? roleLabel(user.role) : '—')}</dd>
                            </dl>`
                    });
                    return;
                }

                if (action === 'site') {
                    window.open('../../index.html', '_blank', 'noopener');
                }
            });
        };

        const init = () => {
            if (!document.querySelector('.cms-app')) return;
            if (!guard()) return;
            renderSidebar();
            renderHeader();
            initDrawer();
            ui.initDropdowns();
            initUserActions();
            initFilterToggles();
        };

        /** Dựng lại sidebar & header sau khi dữ liệu từ máy chủ đã sẵn sàng */
        const refresh = () => {
            renderSidebar();
            renderHeader();
            ui.initDropdowns();
        };

        /** Bộ lọc thu gọn trên mobile: nút mở/đóng dùng chung cho mọi trang. */
        const initFilterToggles = () => {
            document.querySelectorAll('[data-filters-toggle]').forEach((btn) => {
                const panel = btn.closest('.cms-filters');
                if (!panel || btn.dataset.bound) return;
                btn.dataset.bound = '1';

                /* Màn hình rộng: luôn mở, ẩn nút. Màn hình hẹp: mặc định đóng
                   để danh sách nội dung hiển thị ngay từ đầu. */
                const sync = () => {
                    const compact = window.matchMedia('(max-width: 768px)').matches;
                    if (!compact) {
                        panel.classList.add('is-open');
                        btn.setAttribute('aria-expanded', 'true');
                        return;
                    }
                    if (panel.dataset.userToggled) return;
                    panel.classList.remove('is-open');
                    btn.setAttribute('aria-expanded', 'false');
                };
                panel.classList.toggle('is-open', !window.matchMedia('(max-width: 768px)').matches);
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

        return { init, refresh, currentFile, isLogin, guard, PAGES };
    })();

    /* ==========================================================================
       8. TRANG TỔNG QUAN
       ========================================================================== */

    const Dashboard = (function () {
        let chartRange = 6;

        const actionMeta = {
            login: { label: 'Đăng nhập', icon: 'fa-right-to-bracket' },
            logout: { label: 'Đăng xuất', icon: 'fa-right-from-bracket' },
            create: { label: 'Tạo mới', icon: 'fa-plus' },
            update: { label: 'Chỉnh sửa', icon: 'fa-pen' },
            delete: { label: 'Xóa', icon: 'fa-trash-can' },
            upload: { label: 'Tải tệp lên', icon: 'fa-upload' },
            review: { label: 'Kiểm duyệt', icon: 'fa-stamp' },
            publish: { label: 'Xuất bản', icon: 'fa-rocket' },
            submit: { label: 'Gửi duyệt', icon: 'fa-paper-plane' },
            archive: { label: 'Lưu trữ', icon: 'fa-box-archive' }
        };

        /* ---------- Thẻ thống kê ---------- */

        const renderStats = () => {
            const host = document.getElementById('dash-stats');
            if (!host) return;
            const s = Store.stats();

            const cards = [
                { key: 'total', label: 'Tổng số bài viết', value: s.total, icon: 'fa-newspaper', tone: '', note: `${s.categories} chuyên mục đang quản lý`, href: 'content-list.html' },
                { key: 'published', label: 'Đã xuất bản', value: s.published, icon: 'fa-circle-check', tone: 'success', note: s.total ? `${Math.round(s.published / s.total * 100)}% tổng nội dung` : 'Chưa có nội dung' },
                { key: 'pending', label: 'Chờ duyệt', value: s.pending, icon: 'fa-hourglass-half', tone: 'warning', note: s.pending ? 'Cần kiểm duyệt viên xử lý' : 'Không còn tồn đọng', href: 'publishing-workflow.html?tab=pending' },
                { key: 'draft', label: 'Bản nháp', value: s.draft, icon: 'fa-file-pen', tone: 'muted', note: 'Chưa gửi duyệt', href: 'content-list.html?status=draft' },
                { key: 'categories', label: 'Tổng số chuyên mục', value: s.categories, icon: 'fa-folder-tree', tone: 'teal', note: `${s.categories - Store.categories().filter((c) => c.parentId).length} chuyên mục cấp 1`, href: 'categories.html' },
                { key: 'approved', label: 'Đã duyệt (chờ phát hành)', value: s.approved, icon: 'fa-stamp', tone: 'indigo', note: s.approved ? 'Sẵn sàng xuất bản' : 'Không có nội dung', href: 'publishing-workflow.html?tab=approved' },
                { key: 'media', label: 'Tài nguyên trong thư viện', value: s.media, icon: 'fa-photo-film', tone: '', note: `${util.formatNumber(s.images)} hình ảnh · ${util.formatNumber(s.documents)} tài liệu`, href: 'media-library.html' },
                { key: 'rejected', label: 'Cần chỉnh sửa / Từ chối', value: s.rejected + s.revision, icon: 'fa-triangle-exclamation', tone: 'muted', note: 'Cần biên tập viên xử lý lại', href: 'content-list.html?status=rejected' }
            ];

            host.innerHTML = cards.map((c) => `
                <article class="cms-stat-card ${c.tone ? 'cms-stat-card--' + c.tone : ''}">
                    <div class="cms-stat-card__top">
                        <span class="cms-stat-card__label">${util.escape(c.label)}</span>
                        <span class="cms-stat-card__icon"><i class="fa-solid ${c.icon}" aria-hidden="true"></i></span>
                    </div>
                    <p class="cms-stat-card__value" data-count="${c.value}">0</p>
                    <p class="cms-stat-card__foot">
                        ${c.href
                    ? `<a href="${c.href}" class="cms-stat-card__link">${util.escape(c.note)}</a>`
                    : util.escape(c.note)}
                    </p>
                </article>`).join('');

            /* Đếm số chạy lên – chỉ là hiệu ứng, giá trị lấy từ dữ liệu thật */
            host.querySelectorAll('[data-count]').forEach((el) => {
                const target = Number(el.dataset.count) || 0;
                if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
                    el.textContent = util.formatNumber(target);
                    return;
                }
                const start = performance.now();
                const dur = 620;
                const step = (t) => {
                    const p = Math.min(1, (t - start) / dur);
                    el.textContent = util.formatNumber(Math.round(target * (1 - Math.pow(1 - p, 3))));
                    if (p < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        };

        /* ---------- Biểu đồ cột SVG ---------- */

        const renderChart = () => {
            const host = document.getElementById('dash-chart');
            if (!host) return;
            const data = Store.monthlySeries(chartRange);
            const hasData = data.some((d) => d.created > 0 || d.published > 0);

            if (!hasData) {
                host.innerHTML = ui.emptyState({
                    icon: 'fa-chart-column',
                    title: 'Chưa có dữ liệu trong khoảng thời gian này',
                    text: 'Chọn khoảng thời gian khác hoặc tạo nội dung mới để bắt đầu thống kê.'
                });
                return;
            }

            const W = 720;
            const H = 260;
            const padding = { top: 16, right: 12, bottom: 30, left: 34 };
            const plotW = W - padding.left - padding.right;
            const plotH = H - padding.top - padding.bottom;
            const maxVal = Math.max(4, ...data.map((d) => Math.max(d.created, d.published)));
            /* Làm tròn trục Y lên mốc đẹp */
            const stepBase = Math.ceil(maxVal / 4);
            const yMax = stepBase * 4;
            const bandW = plotW / data.length;
            const barW = Math.min(26, bandW / 3.2);

            let gridLines = '';
            for (let i = 0; i <= 4; i++) {
                const v = stepBase * i;
                const y = padding.top + plotH - (v / yMax) * plotH;
                gridLines += `<line class="cms-chart__grid-line" x1="${padding.left}" y1="${y}" x2="${W - padding.right}" y2="${y}" />`;
                gridLines += `<text class="cms-chart__axis-label" x="${padding.left - 8}" y="${y + 3.5}" text-anchor="end">${v}</text>`;
            }

            let bars = '';
            data.forEach((d, i) => {
                const cx = padding.left + bandW * i + bandW / 2;
                const hCreated = (d.created / yMax) * plotH;
                const hPublished = (d.published / yMax) * plotH;
                const yCreated = padding.top + plotH - hCreated;
                const yPublished = padding.top + plotH - hPublished;

                bars += `<g class="cms-chart__bar">
                    <title>${util.escape(d.labelFull)}: ${d.created} bài tạo mới, ${d.published} bài xuất bản</title>
                    <rect x="${cx - barW - 2}" y="${yCreated}" width="${barW}" height="${Math.max(hCreated, d.created ? 2 : 0)}"
                          rx="3" fill="var(--color-primary)"></rect>
                    <rect x="${cx + 2}" y="${yPublished}" width="${barW}" height="${Math.max(hPublished, d.published ? 2 : 0)}"
                          rx="3" fill="var(--color-success)"></rect>
                    <rect x="${cx - barW - 2}" y="${padding.top}" width="${bandW * 0.7}" height="${plotH}" fill="transparent"></rect>
                </g>`;
                bars += `<text class="cms-chart__axis-label" x="${cx}" y="${H - 10}" text-anchor="middle">${util.escape(d.label)}</text>`;
            });

            const totalCreated = data.reduce((a, d) => a + d.created, 0);
            const totalPublished = data.reduce((a, d) => a + d.published, 0);
            const avg = Math.round(totalPublished / data.length * 10) / 10;

            host.innerHTML = `
                <div class="cms-chart__legend">
                    <span class="cms-chart__legend-item"><span class="cms-chart__swatch"></span>Bài tạo mới</span>
                    <span class="cms-chart__legend-item"><span class="cms-chart__swatch cms-chart__swatch--secondary"></span>Bài xuất bản</span>
                </div>
                <div class="cms-chart__canvas">
                    <svg viewBox="0 0 ${W} ${H}" role="img"
                         aria-label="Biểu đồ cột số bài tạo mới và xuất bản theo tháng, ${data.length} tháng gần nhất">
                        ${gridLines}${bars}
                    </svg>
                </div>
                <div class="cms-chart__summary">
                    <div class="cms-chart__summary-item">
                        <span class="cms-chart__summary-label">Tạo mới</span>
                        <span class="cms-chart__summary-value">${util.formatNumber(totalCreated)}</span>
                    </div>
                    <div class="cms-chart__summary-item">
                        <span class="cms-chart__summary-label">Xuất bản</span>
                        <span class="cms-chart__summary-value">${util.formatNumber(totalPublished)}</span>
                    </div>
                    <div class="cms-chart__summary-item">
                        <span class="cms-chart__summary-label">TB xuất bản/tháng</span>
                        <span class="cms-chart__summary-value">${String(avg).replace('.', ',')}</span>
                    </div>
                </div>`;

            /* Bảng số liệu thay thế cho người dùng trình đọc màn hình */
            const table = document.getElementById('dash-chart-table');
            if (table) {
                table.innerHTML = `
                    <caption class="cms-u-sr-only">Số liệu bài tạo mới và xuất bản theo tháng</caption>
                    <thead><tr><th scope="col">Tháng</th><th scope="col">Tạo mới</th><th scope="col">Xuất bản</th></tr></thead>
                    <tbody>${data.map((d) => `<tr><td>${util.escape(d.labelFull)}</td><td>${d.created}</td><td>${d.published}</td></tr>`).join('')}</tbody>`;
            }
        };

        /* ---------- Hoạt động gần đây ---------- */

        const renderActivity = () => {
            const host = document.getElementById('dash-activity');
            if (!host) return;
            const logs = Store.logs().slice(0, 6);

            if (!logs.length) {
                host.innerHTML = ui.emptyState({ icon: 'fa-clock-rotate-left', title: 'Chưa có hoạt động', text: 'Các thao tác của người dùng sẽ xuất hiện tại đây.' });
                return;
            }

            host.innerHTML = `<ul class="cms-feed">${logs.map((log) => {
                const user = Store.userById(log.userId);
                const meta = actionMeta[log.action] || { label: log.action, icon: 'fa-circle-dot' };
                return `<li class="cms-feed__item">
                    <span class="cms-feed__avatar" aria-hidden="true">${user ? util.escape(user.initials) : 'HT'}</span>
                    <div class="cms-feed__body">
                        <span class="cms-feed__text">
                            <strong>${util.escape(user ? user.name : 'Hệ thống')}</strong>
                            ${util.escape(meta.label.toLowerCase())}
                            <a href="content-list.html?q=${encodeURIComponent(log.targetName)}">${util.escape(util.truncate(log.targetName, 64))}</a>
                        </span>
                        <span class="cms-feed__time"><i class="fa-regular fa-clock" aria-hidden="true"></i>
                            ${util.escape(util.timeAgo(log.at))} · ${util.escape(util.formatDateTime(log.at))}</span>
                    </div>
                </li>`;
            }).join('')}</ul>`;
        };

        /* ---------- Nội dung cập nhật gần đây ---------- */

        const renderRecent = () => {
            const body = document.getElementById('dash-recent');
            if (!body) return;
            const list = Store.contents()
                .slice()
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .slice(0, 5);

            if (!list.length) {
                body.innerHTML = `<tr><td colspan="5" class="cms-empty-cell">${ui.emptyState({
                    icon: 'fa-newspaper',
                    title: 'Chưa có bài viết nào',
                    text: 'Bắt đầu bằng cách tạo bài viết đầu tiên cho Cổng thông tin.',
                    action: '<a class="cms-btn cms-btn--primary cms-btn--sm" href="content-editor.html?id=new"><i class="fa-solid fa-plus" aria-hidden="true"></i> Tạo bài viết</a>'
                })}</td></tr>`;
                return;
            }

            body.innerHTML = list.map((a) => `
                <tr>
                    <td data-label="Tiêu đề">
                        <div class="cms-table__title">
                            <span class="cms-table__thumb"><img src="${util.escape(a.thumbnail || '../../assets/images/1.jpg')}" alt="" loading="lazy"></span>
                            <div class="cms-table__title-text">
                                <a class="cms-table__link" href="content-editor.html?id=${encodeURIComponent(a.id)}">${util.escape(a.title)}</a>
                                <span class="cms-table__slug">${util.escape(Store.categoryName(a.categoryId))}</span>
                            </div>
                        </div>
                    </td>
                    <td data-label="Biên tập">${ui.userCell(a.authorName)}</td>
                    <td data-label="Cập nhật"><span class="cms-table__muted">${util.escape(util.formatDateTime(a.updatedAt))}</span></td>
                    <td data-label="Trạng thái">${ui.badge(a.status)}</td>
                    <td data-label="Thao tác" class="cms-table__cell-actions">
                        <a class="cms-btn cms-btn--sm cms-btn--ghost" href="content-editor.html?id=${encodeURIComponent(a.id)}" aria-label="Chỉnh sửa">
                            <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        </a>
                    </td>
                </tr>`).join('');
        };

        const init = () => {
            if (!document.getElementById('dash-stats')) return;
            renderStats();
            renderChart();
            renderActivity();
            renderRecent();

            const range = document.getElementById('dash-chart-range');
            if (range) {
                range.addEventListener('change', () => {
                    chartRange = Number(range.value) || 6;
                    renderChart();
                });
            }

            const refresh = document.getElementById('dash-refresh');
            if (refresh) {
                refresh.addEventListener('click', () => {
                    renderStats();
                    renderChart();
                    renderActivity();
                    renderRecent();
                    ui.toast('Đã làm mới số liệu tổng quan.', 'success');
                });
            }
        };

        return { init };
    })();

    /* ==========================================================================
       9. TRANG DANH SÁCH NỘI DUNG
       ========================================================================== */

    const ContentList = (function () {
        const state = {
            q: '',
            group: '',
            category: '',
            status: '',
            author: '',
            from: '',
            to: '',
            sort: 'updatedAt',
            dir: 'desc',
            page: 1,
            pageSize: 10,
            selected: new Set()
        };

        const params = new URLSearchParams(window.location.search);

        const elements = {};

        const readQuery = () => {
            if (params.get('q')) state.q = params.get('q');
            if (params.get('status')) state.status = params.get('status');
            if (params.get('category')) state.category = params.get('category');
            if (params.get('group')) state.group = params.get('group');
            if (params.get('author')) state.author = params.get('author');
        };

        /* ---------- Lọc & sắp xếp ---------- */

        const filtered = () => {
            const q = util.normalize(state.q);
            const from = state.from ? util.parseDate(state.from) : null;
            const to = state.to ? util.parseDate(state.to) : null;

            /* Nhóm nội dung lấy từ group_key của chuyên mục – không dò chuỗi tiêu đề */
            let list = Store.contents().filter((a) => {
                if (state.group && Store.categoryGroup(a.categoryId) !== state.group) return false;
                if (state.category && a.categoryId !== state.category) return false;
                if (state.status && a.status !== state.status) return false;
                if (state.author && a.authorId !== state.author) return false;

                const created = util.parseDate(a.createdAt);
                if (from && created && created < from) return false;
                if (to && created && created > to) return false;

                if (!q) return true;
                const haystack = util.normalize(`${a.title} ${a.excerpt} ${a.slug} ${a.authorName} ${(a.tags || []).join(' ')} ${Store.categoryName(a.categoryId)}`);
                return haystack.indexOf(q) !== -1;
            });

            const dir = state.dir === 'asc' ? 1 : -1;
            const sortKey = state.sort;
            list.sort((a, b) => {
                if (sortKey === 'title') return dir * util.compare(a.title, b.title);
                const da = util.parseDate(sortKey === 'createdAt' ? a.createdAt : a.updatedAt);
                const db = util.parseDate(sortKey === 'createdAt' ? b.createdAt : b.updatedAt);
                return dir * ((da ? da.getTime() : 0) - (db ? db.getTime() : 0));
            });
            return list;
        };

        const activeFilterCount = () => {
            let n = 0;
            ['q', 'group', 'category', 'status', 'author', 'from', 'to'].forEach((k) => { if (state[k]) n++; });
            return n;
        };

        /* ---------- Render ---------- */

        const renderSummary = (list) => {
            const el = elements.summary;
            if (!el) return;
            const chips = [];
            if (state.q) chips.push(`Từ khóa: “${util.escape(state.q)}”`);
            if (state.group) {
                const groupSelect = document.getElementById('filter-group');
                const opt = groupSelect ? groupSelect.querySelector(`option[value="${state.group}"]`) : null;
                chips.push(`Nhóm: ${util.escape(opt ? opt.textContent.trim() : state.group)}`);
            }
            if (state.category) chips.push(`Chuyên mục: ${util.escape(Store.categoryName(state.category))}`);
            if (state.status) chips.push(`Trạng thái: ${util.escape(statusLabel(state.status))}`);
            if (state.author) {
                const u = Store.userById(state.author);
                if (u) chips.push(`Người biên tập: ${util.escape(u.name)}`);
            }
            if (state.from) chips.push(`Từ ngày: ${util.escape(util.formatDate(state.from))}`);
            if (state.to) chips.push(`Đến ngày: ${util.escape(util.formatDate(state.to))}`);

            el.innerHTML = `<strong>${util.formatNumber(list.length)}</strong> nội dung phù hợp
                ${chips.length ? ' — ' + chips.join(' · ') : ''}`;
        };

        const renderBulkBar = () => {
            const bar = elements.bulk;
            if (!bar) return;
            const count = state.selected.size;
            bar.classList.toggle('is-visible', count > 0);
            const countEl = bar.querySelector('[data-bulk-count]');
            if (countEl) countEl.textContent = util.formatNumber(count);
            const user = Store.currentUser();
            /* Ẩn/hiện nút theo quyền của vai trò hiện tại */
            bar.querySelectorAll('[data-bulk-action]').forEach((btn) => {
                const action = btn.dataset.bulkAction;
                const permMap = {
                    publish: 'content.publish',
                    submit: 'content.submit',
                    archive: 'content.archive',
                    delete: 'content.delete'
                };
                /* "clear" luôn khả dụng – chỉ cần bỏ chọn, không đổi dữ liệu */
                if (action === 'clear') {
                    btn.classList.remove('cms-u-hidden');
                    return;
                }
                const allowed = user && user.permissions.indexOf(permMap[action]) !== -1;
                btn.classList.toggle('cms-u-hidden', !allowed);
            });
        };

        const renderTable = () => {
            const list = filtered();
            const total = list.length;
            const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
            state.page = util.clamp(state.page, 1, totalPages);
            const start = (state.page - 1) * state.pageSize;
            const rows = list.slice(start, start + state.pageSize);

            renderSummary(list);
            renderBulkBar();

            const tbody = elements.tbody;
            if (!tbody) return;

            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="8" class="cms-empty-cell">
                    ${ui.emptyState({
                    icon: 'fa-magnifying-glass',
                    title: activeFilterCount() ? 'Không tìm thấy nội dung phù hợp' : 'Chưa có nội dung nào',
                    text: activeFilterCount()
                        ? 'Thử điều chỉnh từ khóa hoặc bỏ bớt điều kiện lọc.'
                        : 'Tạo bài viết đầu tiên để bắt đầu quản lý nội dung trên Cổng thông tin.',
                    action: activeFilterCount()
                        ? '<button type="button" class="cms-btn cms-btn--sm" data-action="reset-filters"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Xóa bộ lọc</button>'
                        : '<a class="cms-btn cms-btn--primary cms-btn--sm" href="content-editor.html?id=new"><i class="fa-solid fa-plus" aria-hidden="true"></i> Tạo bài viết</a>'
                })}</td></tr>`;
            } else {
                tbody.innerHTML = rows.map((a) => {
                    const checked = state.selected.has(a.id);
                    return `<tr class="${checked ? 'is-selected' : ''}" data-id="${util.escape(a.id)}">
                        <td class="cms-table__cell-check">
                            <label class="cms-check">
                                <input type="checkbox" data-select-row value="${util.escape(a.id)}"
                                    ${checked ? 'checked' : ''} aria-label="Chọn bài viết ${util.escape(a.title)}">
                            </label>
                        </td>
                        <td data-label="Tiêu đề">
                            <div class="cms-table__title">
                                <span class="cms-table__thumb">
                                    <img src="${util.escape(a.thumbnail || '../../assets/images/1.jpg')}" alt="" loading="lazy">
                                </span>
                                <div class="cms-table__title-text">
                                    <a class="cms-table__link" href="content-editor.html?id=${encodeURIComponent(a.id)}">${util.escape(a.title)}</a>
                                    <span class="cms-table__slug">/${util.escape(a.slug)}</span>
                                </div>
                            </div>
                        </td>
                        <td data-label="Chuyên mục"><span class="cms-badge cms-badge--info cms-badge--no-dot">${util.escape(Store.categoryName(a.categoryId))}</span></td>
                        <td data-label="Người biên tập">${ui.userCell(a.authorName)}</td>
                        <td data-label="Ngày tạo"><span class="cms-table__muted">${util.escape(util.formatDate(a.createdAt))}</span></td>
                        <td data-label="Cập nhật"><time class="cms-table__muted" datetime="${util.escape(a.updatedAt)}" title="${util.escape(util.formatDateTime(a.updatedAt))}">${util.escape(util.formatDate(a.updatedAt))}</time></td>
                        <td data-label="Trạng thái">${ui.badge(a.status)}</td>
                        <td data-label="Thao tác" class="cms-table__cell-actions">
                            <div class="cms-table__actions">
                                <button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon"
                                    data-row-action="preview" aria-label="Xem trước bài viết" title="Xem trước">
                                    <i class="fa-solid fa-eye" aria-hidden="true"></i>
                                </button>
                                <a class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon"
                                    href="content-editor.html?id=${encodeURIComponent(a.id)}" aria-label="Chỉnh sửa bài viết" title="Chỉnh sửa">
                                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                                </a>
                                <div class="cms-dropdown" data-dropdown>
                                    <button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon"
                                        data-dropdown-trigger aria-label="Thêm thao tác" title="Thêm thao tác">
                                        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
                                    </button>
                                    <ul class="cms-dropdown__menu">
                                        <li><button type="button" class="cms-dropdown__item" data-row-action="submit">
                                            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>Gửi duyệt</button></li>
                                        <li><button type="button" class="cms-dropdown__item" data-row-action="publish">
                                            <i class="fa-solid fa-rocket" aria-hidden="true"></i>Xuất bản</button></li>
                                        <li><button type="button" class="cms-dropdown__item" data-row-action="archive">
                                            <i class="fa-solid fa-box-archive" aria-hidden="true"></i>Lưu trữ</button></li>
                                        <li><button type="button" class="cms-dropdown__item" data-row-action="duplicate">
                                            <i class="fa-solid fa-copy" aria-hidden="true"></i>Nhân bản</button></li>
                                        <li class="cms-dropdown__divider" role="separator"></li>
                                        <li><button type="button" class="cms-dropdown__item cms-dropdown__item--danger" data-row-action="delete">
                                            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>Xóa vĩnh viễn</button></li>
                                    </ul>
                                </div>
                            </div>
                        </td>
                    </tr>`;
                }).join('');
            }

            const foot = elements.tfoot;
            if (foot) {
                foot.innerHTML = `<tr><td colspan="8">
                    Tổng <strong>${util.formatNumber(total)}</strong> nội dung
                </td></tr>`;
            }

            ui.renderPagination(elements.pagination, {
                total,
                page: state.page,
                pageSize: state.pageSize
            }, (page) => {
                state.page = page;
                renderTable();
                const card = document.getElementById('content-table-card');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });

            /* Trạng thái checkbox "chọn tất cả" */
            if (elements.selectAll) {
                const visibleIds = rows.map((r) => r.id);
                const allChecked = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
                elements.selectAll.checked = allChecked;
                elements.selectAll.indeterminate = !allChecked && visibleIds.some((id) => state.selected.has(id));
            }

            ui.initDropdowns(tbody);
        };

        /* ---------- Bộ lọc ---------- */

        const fillSelects = () => {
            const groupSelect = document.getElementById('filter-group');
            if (groupSelect) groupSelect.value = state.group;

            const cat = document.getElementById('filter-category');
            if (cat) {
                /* Chọn nhóm thì chỉ liệt kê chuyên mục của nhóm đó */
                const cats = Store.categories()
                    .filter((c) => !state.group || c.group === state.group)
                    .sort((a, b) => util.compare(a.name, b.name));
                cat.innerHTML = '<option value="">Tất cả chuyên mục</option>' + cats.map((c) =>
                    `<option value="${util.escape(c.id)}">${c.parentId ? '— ' : ''}${util.escape(c.name)}</option>`).join('');
                cat.value = state.category;
            }
            const author = document.getElementById('filter-author');
            if (author) {
                const users = Store.users().slice().sort((a, b) => util.compare(a.name, b.name));
                author.innerHTML = '<option value="">Tất cả người biên tập</option>' + users.map((u) =>
                    `<option value="${util.escape(u.id)}">${util.escape(u.name)} (${util.escape(roleLabel(u.role))})</option>`).join('');
                author.value = state.author;
            }
            const status = document.getElementById('filter-status');
            if (status) status.value = state.status;
        };

        const syncInputs = () => {
            if (elements.search) {
                elements.search.value = state.q;
                toggleClear(elements.search);
            }
            const from = document.getElementById('filter-from');
            const to = document.getElementById('filter-to');
            if (from) from.value = state.from;
            if (to) to.value = state.to;
            fillSelects();
        };

        const toggleClear = (input) => {
            const wrap = input.closest('.cms-input-icon');
            if (wrap) wrap.classList.toggle('has-value', !!input.value);
        };

        const applyFilters = () => {
            state.page = 1;
            state.selected.clear();
            renderTable();
        };

        const resetFilters = () => {
            state.q = '';
            state.group = '';
            state.category = '';
            state.status = '';
            state.author = '';
            state.from = '';
            state.to = '';
            state.page = 1;
            state.selected.clear();
            syncInputs();
            renderTable();
            ui.toast('Đã xóa tất cả điều kiện lọc.', 'info');
        };

        /* ---------- Xem trước bài viết ---------- */

        const previewContent = async (summary) => {
            let record;
            try {
                record = await Store.getContent(summary.id);
            } catch (error) {
                ui.toast(error.message || 'Không tải được nội dung bài viết để xem trước.', { type: 'error' });
                return;
            }
            const cat = Store.categoryName(record.categoryId);
            ui.modal({
                title: 'Xem trước bài viết',
                subtitle: record.title,
                size: 'lg',
                content: `<article class="cms-preview">
                    <span class="cms-preview__tag">${util.escape(cat)}</span>
                    <h2 class="cms-preview__title">${util.escape(record.title)}</h2>
                    <div class="cms-preview__meta">
                        <span><i class="fa-regular fa-user" aria-hidden="true"></i>${util.escape(record.authorName)}</span>
                        <span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${util.escape(util.formatDateTime(record.createdAt))}</span>
                        <span><i class="fa-regular fa-eye" aria-hidden="true"></i>${util.formatNumber(record.views)} lượt xem</span>
                        <span>${ui.badge(record.status)}</span>
                    </div>
                    ${record.thumbnail ? `<img class="cms-preview__hero" src="${util.escape(record.thumbnail)}" alt="">` : ''}
                    <p class="cms-u-text-muted cms-u-mb-lg"><em>${util.escape(record.excerpt || util.truncate(util.stripTags(record.body), 220))}</em></p>
                    <div class="cms-preview__content">${record.body || '<p><em>Bài viết chưa có nội dung.</em></p>'}</div>
                </article>`,
                footer: `<button type="button" class="cms-btn" data-modal-close>Đóng</button>
                    <a class="cms-btn cms-btn--primary" href="content-editor.html?id=${encodeURIComponent(record.id)}">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>Chỉnh sửa bài viết</a>`
            });
        };

        const requirePerm = (perm, record) => {
            if (Store.can(perm, record)) return true;
            ui.toast(CONFIG.labels.pagePermission + ' Vai trò hiện tại không được phép thực hiện.', 'error');
            return false;
        };

        const changeStatus = (record, status, options) => {
            const opts = options || {};
            const messages = {
                pending: 'Bài viết sẽ được gửi tới kiểm duyệt viên.',
                published: 'Bài viết sẽ hiển thị công khai trên Cổng thông tin.',
                archived: 'Bài viết sẽ được ẩn khỏi danh sách công khai.',
                draft: 'Bài viết sẽ được chuyển về trạng thái bản nháp.'
            };
            const run = async () => {
                try {
                    await Store.setStatus(record.id, status, { note: opts.detail });
                    renderTable();
                    Shell.refresh();
                    ui.toast(opts.success || `Đã chuyển “${util.truncate(record.title, 40)}” sang ${statusLabel(status)}.`, 'success');
                    return true;
                } catch (err) {
                    ui.toast(err.message || 'Không cập nhật được trạng thái bài viết.', { type: 'error', duration: 6000 });
                    return false;
                }
            };

            if (opts.confirm === false) {
                return run();
            }

            const tone = status === 'archived' ? 'info' : 'primary';
            return ui.confirm({
                tone,
                heading: `Xác nhận ${statusLabel(status).toLowerCase()}?`,
                message: messages[status] || 'Trạng thái bài viết sẽ được cập nhật.',
                detail: `<span class="cms-confirm__highlight">${util.escape(util.truncate(record.title, 90))}</span>`,
                confirmText: 'Xác nhận'
            }).then((ok) => (ok ? run() : false));
        };

        const duplicateContent = async (record) => {
            try {
                const saved = await Store.saveContent({
                    title: `${record.title} (bản sao)`,
                    excerpt: record.excerpt,
                    body: record.body,
                    thumbnail: record.thumbnail,
                    categoryId: record.categoryId,
                    tags: record.tags,
                    source: record.source,
                    seoTitle: record.seoTitle,
                    seoDescription: record.seoDescription,
                    status: 'draft',
                });
                renderTable();
                Shell.refresh();
                ui.toast(`Đã nhân bản thành bản nháp: ${util.truncate(saved.title, 40)}`, 'success');
            } catch (err) {
                ui.toast(err.message || 'Không nhân bản được nội dung.', { type: 'error' });
            }
        };

        const deleteContent = (record) => {
            if (!requirePerm('content.delete', record)) return;
            ui.confirm({
                tone: 'danger',
                heading: 'Xóa vĩnh viễn bài viết?',
                message: 'Thao tác này không thể hoàn tác. Nếu chỉ muốn ẩn bài, hãy chọn “Lưu trữ”.',
                detail: `<span class="cms-confirm__highlight">${util.escape(record.title)}</span>`,
                confirmText: 'Xóa vĩnh viễn'
            }).then(async (ok) => {
                if (!ok) return;
                try {
                    await Store.deleteContent(record.id);
                    state.selected.delete(record.id);
                    renderTable();
                    Shell.refresh();
                    ui.toast('Đã xóa bài viết khỏi hệ thống.', 'success');
                } catch (err) {
                    ui.toast(err.message || 'Không xóa được bài viết.', { type: 'error', duration: 6000 });
                }
            });
        };

        /* ---------- Thao tác hàng loạt ---------- */

        const bulkAction = (action) => {
            const ids = Array.from(state.selected);
            if (!ids.length) return;
            const records = ids.map((id) => Store.contentById(id)).filter(Boolean);
            const permMap = { publish: 'content.publish', submit: 'content.submit', archive: 'content.archive', delete: 'content.delete' };
            if (action !== 'clear' && !Store.can(permMap[action])) {
                ui.toast(CONFIG.labels.pagePermission, 'error');
                return;
            }

            const labels = { publish: 'xuất bản', submit: 'gửi duyệt', archive: 'lưu trữ', delete: 'xóa' };

            if (action === 'clear') {
                state.selected.clear();
                renderTable();
                return;
            }

            ui.confirm({
                tone: action === 'delete' ? 'danger' : 'primary',
                heading: `Áp dụng “${labels[action]}” cho ${records.length} nội dung?`,
                message: `Trạng thái của ${records.length} bài viết đã chọn sẽ được cập nhật cùng lúc.`,
                confirmText: 'Thực hiện'
            }).then(async (ok) => {
                if (!ok) return;
                const statusMap = { publish: 'published', submit: 'pending', archive: 'archived' };
                let done = 0;
                const errors = [];
                for (const r of records) {
                    try {
                        if (action === 'delete') await Store.deleteContent(r.id);
                        else await Store.setStatus(r.id, statusMap[action], { note: `Thao tác hàng loạt: ${labels[action]}.` });
                        done += 1;
                    } catch (err) {
                        errors.push(`${r.title}: ${err.message}`);
                    }
                }
                state.selected.clear();
                renderTable();
                Shell.refresh();
                if (done) ui.toast(`Đã ${labels[action]} ${done} nội dung.`, 'success');
                if (errors.length) {
                    ui.toast(`${errors.length} nội dung không xử lý được. ${errors[0]}`, { type: 'error', duration: 8000 });
                }
            });
        };

        /* ---------- Gắn sự kiện ---------- */

        const bind = () => {
            /* Tìm kiếm có debounce */
            if (elements.search) {
                const run = util.debounce(() => {
                    applyFilters();
                }, 260);
                elements.search.addEventListener('input', () => {
                    state.q = elements.search.value;
                    toggleClear(elements.search);
                    run();
                });
                const form = elements.search.closest('form');
                if (form) {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        state.q = elements.search.value;
                        applyFilters();
                    });
                }
            }

            const clearBtn = document.querySelector('[data-search-clear]');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    elements.search.value = '';
                    state.q = '';
                    toggleClear(elements.search);
                    elements.search.focus();
                    applyFilters();
                });
            }

            ['group', 'category', 'status', 'author', 'from', 'to'].forEach((key) => {
                const el = document.getElementById(`filter-${key}`);
                if (!el) return;
                el.addEventListener('change', () => {
                    state[key] = el.value;
                    /* Đổi nhóm thì lọc lại danh sách chuyên mục và bỏ chuyên mục cũ */
                    if (key === 'group') {
                        state.category = '';
                        state.page = 1;
                        fillSelects();
                    }
                    applyFilters();
                });
            });

            const resetBtn = document.getElementById('filter-reset');
            if (resetBtn) resetBtn.addEventListener('click', resetFilters);

            /* Sắp xếp */
            document.querySelectorAll('[data-sort]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const key = btn.dataset.sort;
                    if (state.sort === key) {
                        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    } else {
                        state.sort = key;
                        state.dir = key === 'title' ? 'asc' : 'desc';
                    }
                    document.querySelectorAll('[data-sort]').forEach((b) => {
                        b.classList.toggle('is-active', b.dataset.sort === state.sort);
                        const icon = b.querySelector('i');
                        if (!icon) return;
                        const isActive = b.dataset.sort === state.sort;
                        icon.className = 'fa-solid ' + (isActive
                            ? (state.dir === 'asc' ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short')
                            : 'fa-sort');
                    });
                    renderTable();
                });
            });

            /* Chọn từng dòng / tất cả */
            if (elements.selectAll) {
                elements.selectAll.addEventListener('change', () => {
                    const rows = filtered().slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
                    rows.forEach((r) => {
                        if (elements.selectAll.checked) state.selected.add(r.id);
                        else state.selected.delete(r.id);
                    });
                    renderTable();
                });
            }

            elements.tbody.addEventListener('change', (e) => {
                const box = e.target.closest('[data-select-row]');
                if (!box) return;
                if (box.checked) state.selected.add(box.value);
                else state.selected.delete(box.value);
                const tr = box.closest('tr');
                if (tr) tr.classList.toggle('is-selected', box.checked);
                renderBulkBar();
                if (elements.selectAll) {
                    const rows = filtered().slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
                    const allChecked = rows.length > 0 && rows.every((r) => state.selected.has(r.id));
                    elements.selectAll.checked = allChecked;
                    elements.selectAll.indeterminate = !allChecked && rows.some((r) => state.selected.has(r.id));
                }
            });

            /* Thao tác dòng – event delegation */
            elements.tbody.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('[data-row-action]');
                if (!actionBtn) return;
                const tr = actionBtn.closest('tr[data-id]');
                if (!tr) return;
                const record = Store.contentById(tr.dataset.id);
                if (!record) return;
                const action = actionBtn.dataset.rowAction;

                if (action === 'preview') previewContent(record);
                else if (action === 'submit') {
                    if (requirePerm('content.submit', record)) changeStatus(record, 'pending');
                } else if (action === 'publish') {
                    if (requirePerm('content.publish', record)) changeStatus(record, 'published');
                } else if (action === 'archive') {
                    if (requirePerm('content.archive', record)) changeStatus(record, 'archived');
                } else if (action === 'duplicate') {
                    if (requirePerm('content.create')) duplicateContent(record);
                } else if (action === 'delete') {
                    deleteContent(record);
                }
            });

            /* Thao tác hàng loạt */
            document.querySelectorAll('[data-bulk-action]').forEach((btn) => {
                btn.addEventListener('click', () => bulkAction(btn.dataset.bulkAction));
            });

            /* Nút xóa bộ lọc trong empty state */
            document.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="reset-filters"]')) resetFilters();
            });

            /* Nút tạo mới ở đầu trang */
            const createBtn = document.getElementById('content-create');
            if (createBtn) {
                createBtn.addEventListener('click', (e) => {
                    if (!Store.can('content.create')) {
                        e.preventDefault();
                        ui.toast('Vai trò hiện tại không có quyền tạo nội dung.', 'error');
                    }
                });
            }

            /* Đổi số dòng mỗi trang */
            const pageSize = document.getElementById('content-pagesize');
            if (pageSize) {
                pageSize.value = String(state.pageSize);
                pageSize.addEventListener('change', () => {
                    state.pageSize = Number(pageSize.value) || 10;
                    state.page = 1;
                    renderTable();
                });
            }
        };

        const init = () => {
            const card = document.getElementById('content-table-card');
            if (!card) return;
            elements.search = document.getElementById('filter-q');
            elements.tbody = document.getElementById('content-tbody');
            elements.tfoot = document.getElementById('content-tfoot');
            elements.pagination = document.getElementById('content-pagination');
            elements.summary = document.getElementById('filter-summary');
            elements.bulk = document.getElementById('content-bulkbar');
            elements.selectAll = document.getElementById('content-select-all');

            const prefs = Store.loadPrefs();
            state.pageSize = prefs.pageSize || 10;

            readQuery();
            syncInputs();
            bind();
            renderTable();
        };

        return { init };
    })();

    /* ==========================================================================
       10. TRANG BIÊN TẬP NỘI DUNG
       ========================================================================== */

    /* ==========================================================================
       10. TRANG BIÊN TẬP NỘI DUNG (content-editor.html)
       ========================================================================== */

    const Editor = (function () {
        const params = new URLSearchParams(window.location.search);
        let currentId = params.get('id');
        if (currentId === 'new' || currentId === '' || currentId === null) currentId = null;
        let record = null;
        let dirty = false;
        let saving = false;
        let tags = [];
        let canvas = null;
        let savedRange = null;

        /** Khóa các nút thao tác trong khi đang gửi yêu cầu lên máy chủ */
        const setBusy = (busy) => {
            document.querySelectorAll('.cms-editor-toolbar [data-action], .cms-editor-head [data-action]').forEach((btn) => {
                if (busy) {
                    btn.dataset.wasDisabled = btn.disabled ? '1' : '';
                    btn.disabled = true;
                } else if (!btn.dataset.wasDisabled) {
                    btn.disabled = false;
                }
            });
        };

        const el = {};

        /* ---------- Chèn HTML tại vị trí con trỏ ---------- */

        const restoreSelection = () => {
            if (!canvas) return;
            canvas.focus();
            if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
        };

        const insertHtml = (html) => {
            if (!canvas) return;
            restoreSelection();
            let inserted = false;
            try {
                inserted = document.execCommand('insertHTML', false, html);
            } catch (e) {
                inserted = false;
            }
            if (!inserted) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount && canvas.contains(sel.anchorNode)) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    const frag = range.createContextualFragment(html);
                    range.insertNode(frag);
                    range.collapse(false);
                } else {
                    canvas.insertAdjacentHTML('beforeend', html);
                }
            }
            markDirty();
            updateCounters();
        };

        const rememberSelection = () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount && canvas && canvas.contains(sel.anchorNode)) {
                savedRange = sel.getRangeAt(0).cloneRange();
            }
        };

        /* ---------- Đếm từ / ký tự ---------- */

        const updateCounters = () => {
            if (!canvas) return;
            const text = util.stripTags(canvas.innerHTML);
            const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
            if (el.wordCount) el.wordCount.textContent = util.formatNumber(words);
            if (el.charCount) el.charCount.textContent = util.formatNumber(text.length);
            if (el.readTime) el.readTime.textContent = Math.max(1, Math.round(words / 220)) + ' phút';
        };

        const updateCounter = (input, counter, max) => {
            if (!input || !counter) return;
            const len = input.value.length;
            counter.textContent = len + '/' + max;
            counter.classList.toggle('is-over', len > max);
        };

        /* ---------- Dirty state ---------- */

        const markDirty = () => {
            dirty = true;
            if (el.dirtyHint) el.dirtyHint.classList.add('is-visible');
        };

        const clearDirty = () => {
            dirty = false;
            if (el.dirtyHint) el.dirtyHint.classList.remove('is-visible');
        };

        /* ---------- Form <-> dữ liệu ---------- */

        const readForm = () => ({
            title: el.title.value.trim(),
            slug: el.slug.value.trim(),
            excerpt: el.excerpt.value.trim(),
            body: canvas.innerHTML.trim(),
            thumbnail: el.thumbImage.getAttribute('data-value') || '',
            categoryId: el.category.value,
            tags: tags.slice(),
            source: el.source.value.trim(),
            publishedAt: el.date.value ? el.date.value + 'T' + (el.time.value || '00:00') + ':00' : null,
            seoTitle: el.seoTitle.value.trim(),
            seoDescription: el.seoDesc.value.trim()
        });

        const clearErrors = () => {
            document.querySelectorAll('#editor-form .is-invalid').forEach((n) => n.classList.remove('is-invalid'));
            document.querySelectorAll('#editor-form .cms-error-text').forEach((n) => n.classList.remove('is-visible'));
        };

        const validate = (mode) => {
            const errors = [];
            clearErrors();
            if (!el.title.value.trim()) {
                errors.push({ field: el.title, message: 'Vui lòng nhập tiêu đề bài viết.' });
            } else if (el.title.value.trim().length < 10) {
                errors.push({ field: el.title, message: 'Tiêu đề nên có ít nhất 10 ký tự để rõ nghĩa.' });
            }
            if (!el.category.value) {
                errors.push({ field: el.category, message: 'Vui lòng chọn chuyên mục cho bài viết.' });
            }
            if (mode === 'publish' || mode === 'submit') {
                if (util.stripTags(canvas.innerHTML).length < 40) {
                    errors.push({ field: canvas, message: 'Nội dung bài viết quá ngắn để gửi duyệt hoặc xuất bản (tối thiểu 40 ký tự).' });
                }
                if (!el.excerpt.value.trim()) {
                    errors.push({ field: el.excerpt, message: 'Mô tả ngắn giúp bài viết hiển thị tốt trên trang chủ và công cụ tìm kiếm.' });
                }
            }

            if (errors.length) {
                errors.forEach((err) => {
                    err.field.classList.add('is-invalid');
                    const field = err.field.closest('.cms-field');
                    const errEl = field ? field.querySelector('.cms-error-text') : null;
                    if (errEl) {
                        errEl.textContent = err.message;
                        errEl.classList.add('is-visible');
                    }
                });
                errors[0].field.focus();
                ui.toast(errors[0].message, { type: 'error', title: 'Chưa thể lưu nội dung' });
                return false;
            }
            return true;
        };

        /* ---------- Lưu ---------- */

        const save = async (status) => {
            if (saving) return null;
            if (!validate(status === 'published' ? 'publish' : status === 'pending' ? 'submit' : 'draft')) {
                return null;
            }

            const data = readForm();
            const patch = {
                title: data.title,
                slug: data.slug || util.slugify(data.title),
                excerpt: data.excerpt,
                body: data.body,
                thumbnail: data.thumbnail,
                categoryId: data.categoryId,
                tags: data.tags,
                source: data.source,
                seoTitle: data.seoTitle,
                seoDescription: data.seoDescription,
            };

            saving = true;
            setBusy(true);
            try {
                if (!currentId) {
                    record = await Store.saveContent(Object.assign({ status: 'draft' }, patch));
                    currentId = record.id;
                } else {
                    patch.id = currentId;
                    record = await Store.saveContent(patch);
                }

                /* Chuyển trạng thái sau khi đã lưu nội dung */
                const flow = { pending: 'pending', published: 'published', approved: 'approved' };
                if (flow[status] && record.status !== flow[status]) {
                    record = await Store.setStatus(currentId, flow[status]);
                }

                clearDirty();
                syncHeader();
                window.history.replaceState({}, '', 'content-editor.html?id=' + encodeURIComponent(currentId));
                ui.toast(status === 'draft' ? 'Đã lưu nội dung.'
                    : status === 'pending' ? 'Đã gửi bài viết để xét duyệt.'
                        : 'Đã xuất bản bài viết.', 'success');
                Shell.refresh();
                return record;
            } catch (err) {
                ui.toast(err.message || 'Không lưu được nội dung. Vui lòng thử lại.', {
                    type: 'error', title: 'Không thể lưu', duration: 6000,
                });
                return null;
            } finally {
                saving = false;
                setBusy(false);
            }
        };

        /* ---------- Đồng bộ phần đầu (trạng thái, nút thao tác) ---------- */

        const canReview = () => Store.can('content.review');

        const syncHeader = () => {
            if (!record) return;
            const fresh = Store.contentById(record.id) || record;
            record = fresh;
            if (el.statusBadge) el.statusBadge.innerHTML = ui.badge(fresh.status);
            if (el.metaLine) {
                el.metaLine.textContent = 'Cập nhật ' + util.formatDateTime(fresh.updatedAt) + ' · ' + fresh.authorName;
            }
            if (el.btnPublish) el.btnPublish.classList.toggle('cms-u-hidden', !Store.can('content.publish'));
            if (el.btnReview) el.btnReview.classList.toggle('cms-u-hidden', !canReview());
            if (el.btnDelete) el.btnDelete.classList.toggle('cms-u-hidden', !Store.can('content.delete'));
            document.title = ((fresh.title || 'Bài viết mới') + ' | ' + 'CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase();
        };

        /* ---------- Nạp dữ liệu vào form ---------- */

        const loadRecord = async () => {
            if (currentId) {
                record = await Store.getContent(currentId);
                if (!record) throw new Error('Không tìm thấy bài viết yêu cầu.');
            } else {
                record = {
                    id: null, title: '', slug: '', excerpt: '', body: '', thumbnail: '',
                    categoryId: '', tags: [], source: '', status: 'draft', seoTitle: '', seoDescription: ''
                };
            }

            el.title.value = record.title || '';
            el.slug.value = record.slug || '';
            el.slug.dataset.manual = record.slug ? '1' : '';
            el.excerpt.value = record.excerpt || '';
            canvas.innerHTML = record.body || '';
            el.source.value = record.source || '';
            el.seoTitle.value = record.seoTitle || record.title || '';
            el.seoDesc.value = record.seoDescription || record.excerpt || '';
            tags = (record.tags || []).slice();
            renderTags();
            setThumbnail(record.thumbnail || '');

            const pub = util.parseDate(record.publishedAt || record.createdAt || new Date());
            if (pub) {
                el.date.value = util.toISODate(pub);
                el.time.value = String(pub.getHours()).padStart(2, '0') + ':' + String(pub.getMinutes()).padStart(2, '0');
            }

            fillCategorySelect(record.categoryId);

            updateCounters();
            updateSeo();
            syncHeader();
            clearDirty();

            const canEdit = !currentId || Store.can('content.edit', record);
            el.form.querySelectorAll('input, textarea, select').forEach((n) => { n.disabled = !canEdit; });
            canvas.setAttribute('contenteditable', canEdit ? 'true' : 'false');
            el.toolbar.querySelectorAll('button, select').forEach((n) => { n.disabled = !canEdit; });
            if (!canEdit) {
                const note = document.getElementById('editor-readonly');
                if (note) note.classList.remove('cms-u-hidden');
                [el.btnSave, el.btnSubmit, el.btnPublish].forEach((b) => b && b.classList.add('cms-u-hidden'));
            }
        };

        const fillCategorySelect = (selectedId) => {
            if (!el.category) return;
            const cats = Store.categories().filter((c) => c.status === 'active' || c.id === selectedId);
            const roots = cats.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
            let html = '<option value="">— Chọn chuyên mục —</option>';
            roots.forEach((root) => {
                html += '<option value="' + util.escape(root.id) + '">' + util.escape(root.name) + '</option>';
                cats.filter((c) => c.parentId === root.id).sort((a, b) => a.order - b.order).forEach((child) => {
                    html += '<option value="' + util.escape(child.id) + '">&nbsp;&nbsp;&nbsp;↳ ' + util.escape(child.name) + '</option>';
                });
            });
            el.category.innerHTML = html;
            el.category.value = selectedId || '';
        };

        /* ---------- Ảnh đại diện ---------- */

        const setThumbnail = (url) => {
            const picker = el.thumbPicker;
            if (!picker) return;
            const img = picker.querySelector('img');
            const placeholder = picker.querySelector('.cms-thumb-picker__placeholder');
            if (url) {
                img.src = url;
                img.setAttribute('data-value', url);
                img.hidden = false;
                if (placeholder) placeholder.hidden = true;
                picker.classList.add('has-image');
            } else {
                img.removeAttribute('src');
                img.removeAttribute('data-value');
                img.hidden = true;
                if (placeholder) placeholder.hidden = false;
                picker.classList.remove('has-image');
            }
        };

        const openThumbPicker = () => {
            const images = Store.media().filter((m) => m.type === 'image').slice(0, 12);
            let content;
            if (images.length) {
                content = '<div class="cms-media-grid">' + images.map((m) => {
                    return '<button type="button" class="cms-media-card" data-pick-thumb="' + util.escape(m.url) + '">' +
                        '<span class="cms-media-card__thumb"><img src="' + util.escape(m.url) + '" alt="' + util.escape(m.alt) + '" loading="lazy"></span>' +
                        '<span class="cms-media-card__info">' +
                        '<span class="cms-media-card__name">' + util.escape(m.name) + '</span>' +
                        '<span class="cms-media-card__meta">' + util.formatBytes(m.size) + '</span>' +
                        '</span></button>';
                }).join('') + '</div>';
            } else {
                content = ui.emptyState({ icon: 'fa-images', title: 'Thư viện chưa có hình ảnh', text: 'Tải ảnh lên thư viện tài nguyên trước khi chọn ảnh đại diện.' });
            }

            const host = ui.modal({
                title: 'Chọn ảnh đại diện',
                subtitle: 'Ảnh đại diện hiển thị trong danh sách và phần giới thiệu bài viết.',
                size: 'lg',
                content,
                footer: '<button type="button" class="cms-btn" data-modal-close>Đóng</button>' +
                    '<a class="cms-btn cms-btn--primary" href="media-library.html"><i class="fa-solid fa-upload" aria-hidden="true"></i> Mở thư viện tài nguyên</a>'
            });

            host.body.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-pick-thumb]');
                if (!btn) return;
                setThumbnail(btn.dataset.pickThumb);
                markDirty();
                host.close();
                ui.toast('Đã chọn ảnh đại diện.', 'success');
            });
        };

        /* ---------- Thẻ nội dung ---------- */

        const renderTags = () => {
            const host = el.tagList;
            if (!host) return;
            host.innerHTML = tags.map((t, i) => {
                return '<span class="cms-tag">' + util.escape(t) +
                    '<button type="button" data-remove-tag="' + i + '" aria-label="Xóa thẻ ' + util.escape(t) + '">' +
                    '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button></span>';
            }).join('');
        };

        const addTag = (value) => {
            const t = String(value || '').trim().replace(/,+$/, '');
            if (!t) return;
            if (tags.some((x) => util.normalize(x) === util.normalize(t))) {
                ui.toast('Thẻ này đã tồn tại.', 'warning');
                return;
            }
            if (tags.length >= 8) {
                ui.toast('Tối đa 8 thẻ cho mỗi bài viết.', 'warning');
                return;
            }
            tags.push(t);
            renderTags();
            markDirty();
        };

        /* ---------- SEO preview ---------- */

        const updateSeo = () => {
            if (!el.seoPreview) return;
            const slug = el.slug.value || util.slugify(el.title.value) || 'duong-dan-bai-viet';
            const category = Store.categoryById(el.category ? el.category.value : '');
            const detailPage = category && category.group === 'tuyen-truyen-giao-duc'
                ? 'pages/public/education-detail.html'
                : 'pages/public/news-detail.html';
            el.seoPreview.querySelector('.cms-seo-preview__url').textContent =
                (detailPage === 'pages/public/education-detail.html' ? 'Cổng thông tin › chuyên đề › ' : 'Cổng thông tin › tin tức › ') + slug;
            el.seoPreview.querySelector('.cms-seo-preview__title').textContent =
                el.seoTitle.value || el.title.value || 'Tiêu đề bài viết';
            el.seoPreview.querySelector('.cms-seo-preview__desc').textContent =
                el.seoDesc.value || el.excerpt.value || 'Mô tả ngắn của bài viết sẽ hiển thị tại đây.';
            updateCounter(el.seoTitle, el.seoTitleCount, 60);
            updateCounter(el.seoDesc, el.seoDescCount, 160);
            updateCounter(el.excerpt, el.excerptCount, 300);
        };

        /* ---------- Preview ---------- */

        const preview = () => {
            const data = readForm();
            const cat = Store.categoryName(el.category.value);
            ui.modal({
                title: 'Xem trước bài viết',
                subtitle: 'Hiển thị theo bố cục trang công khai',
                size: 'lg',
                content: '<article class="cms-preview">' +
                    '<span class="cms-preview__tag">' + util.escape(cat) + '</span>' +
                    '<h2 class="cms-preview__title">' + util.escape(data.title || 'Chưa có tiêu đề') + '</h2>' +
                    '<div class="cms-preview__meta">' +
                    '<span><i class="fa-regular fa-user" aria-hidden="true"></i> ' + util.escape(record ? record.authorName : 'Bạn') + '</span>' +
                    '<span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + util.escape(util.formatDate(el.date.value)) + '</span>' +
                    '<span><i class="fa-regular fa-folder" aria-hidden="true"></i> ' + util.escape(cat) + '</span>' +
                    '</div>' +
                    (data.thumbnail ? '<img class="cms-preview__hero" src="' + util.escape(data.thumbnail) + '" alt="">' : '') +
                    (data.excerpt ? '<p class="cms-u-text-muted cms-u-mb-lg"><em>' + util.escape(data.excerpt) + '</em></p>' : '') +
                    '<div class="cms-preview__content">' + (data.body || '<p><em>Chưa có nội dung.</em></p>') + '</div>' +
                    '</article>'
            });
        };

        /* ---------- Toolbar ---------- */

        const exec = (command, value) => {
            restoreSelection();
            try {
                document.execCommand(command, false, value || null);
            } catch (e) {
                ui.toast('Trình duyệt không hỗ trợ lệnh định dạng này.', 'warning');
                return;
            }
            refreshToolbarState();
            markDirty();
            updateCounters();
        };

        const refreshToolbarState = () => {
            if (!el.toolbar) return;
            el.toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
                let on = false;
                try {
                    on = document.queryCommandState(btn.dataset.cmd);
                } catch (e) {
                    on = false;
                }
                btn.classList.toggle('is-active', !!on);
            });
            const blockSelect = el.toolbar.querySelector('[data-block-select]');
            if (blockSelect) {
                let tag = 'p';
                try {
                    const val = document.queryCommandValue('formatBlock');
                    if (val) tag = val.toLowerCase();
                } catch (e) {
                    tag = 'p';
                }
                blockSelect.value = ['p', 'h2', 'h3', 'h4'].indexOf(tag) !== -1 ? tag : 'p';
            }
        };

        const openLinkDialog = () => {
            rememberSelection();
            const dlg = ui.modal({
                title: 'Chèn liên kết',
                content: '<div class="cms-field cms-u-mb-md">' +
                    '<label class="cms-label" for="link-text">Văn bản hiển thị</label>' +
                    '<input type="text" class="cms-input" id="link-text" placeholder="Ví dụ: Luật Phòng, chống ma túy" data-autofocus>' +
                    '</div>' +
                    '<div class="cms-field">' +
                    '<label class="cms-label" for="link-url">Đường dẫn (URL) <span class="cms-label__req">*</span></label>' +
                    '<input type="url" class="cms-input" id="link-url" placeholder="https://...">' +
                    '<span class="cms-help">Chỉ chấp nhận đường dẫn http(s), mailto, tel hoặc đường dẫn tương đối.</span>' +
                    '</div>',
                footer: '<button type="button" class="cms-btn" data-modal-close>Hủy</button>' +
                    '<button type="button" class="cms-btn cms-btn--primary" data-insert-link>Chèn liên kết</button>'
            });
            dlg.footer.querySelector('[data-insert-link]').addEventListener('click', () => {
                const text = dlg.query('#link-text').value.trim();
                const url = dlg.query('#link-url').value.trim();
                if (!/^(https?:\/\/|mailto:|tel:|\/|\.\.\/)/i.test(url)) {
                    ui.toast('Đường dẫn không hợp lệ. Vui lòng nhập URL bắt đầu bằng http(s)://', 'error');
                    dlg.query('#link-url').focus();
                    return;
                }
                insertHtml('<a href="' + util.escape(url) + '">' + util.escape(text || url) + '</a>');
                dlg.close();
            });
        };

        const openImageDialog = () => {
            const images = Store.media().filter((m) => m.type === 'image');
            const grid = images.length
                ? '<div class="cms-media-grid">' + images.map((m) => {
                    return '<button type="button" class="cms-media-card" data-pick-image="' + util.escape(m.url) + '">' +
                        '<span class="cms-media-card__thumb"><img src="' + util.escape(m.url) + '" alt="' + util.escape(m.alt) + '" loading="lazy"></span>' +
                        '<span class="cms-media-card__info"><span class="cms-media-card__name">' + util.escape(m.name) + '</span></span>' +
                        '</button>';
                }).join('') + '</div>'
                : ui.emptyState({ icon: 'fa-images', title: 'Thư viện chưa có hình ảnh', text: '' });

            const picker = ui.modal({
                title: 'Chèn hình ảnh',
                subtitle: 'Chọn ảnh từ thư viện tài nguyên của Cổng thông tin',
                size: 'lg',
                content: '<div class="cms-field cms-u-mb-lg">' +
                    '<label class="cms-label" for="img-url">Hoặc nhập đường dẫn ảnh</label>' +
                    '<div class="cms-u-flex cms-u-gap-sm"><input type="url" class="cms-input" id="img-url" placeholder="https://... hoặc ../../assets/images/1.jpg">' +
                    '<button type="button" class="cms-btn cms-btn--primary" data-insert-url>Chèn</button></div>' +
                    '</div>' + grid,
                footer: '<button type="button" class="cms-btn" data-modal-close>Đóng</button>'
            });

            picker.body.addEventListener('click', (e) => {
                const pick = e.target.closest('[data-pick-image]');
                if (pick) {
                    insertHtml('<figure><img src="' + util.escape(pick.dataset.pickImage) + '" alt=""><figcaption></figcaption></figure>');
                    picker.close();
                    return;
                }
                if (e.target.closest('[data-insert-url]')) {
                    const url = picker.query('#img-url').value.trim();
                    if (!/^(https?:\/\/|\/|\.\.\/)/i.test(url)) {
                        ui.toast('Đường dẫn ảnh không hợp lệ.', 'error');
                        return;
                    }
                    insertHtml('<figure><img src="' + util.escape(url) + '" alt=""><figcaption></figcaption></figure>');
                    picker.close();
                }
            });
        };

        const openTableDialog = () => {
            rememberSelection();
            const dlg = ui.modal({
                title: 'Chèn bảng',
                content: '<div class="cms-form-grid">' +
                    '<div class="cms-field"><label class="cms-label" for="tbl-rows">Số dòng</label>' +
                    '<input type="number" class="cms-input" id="tbl-rows" min="1" max="20" value="3" data-autofocus></div>' +
                    '<div class="cms-field"><label class="cms-label" for="tbl-cols">Số cột</label>' +
                    '<input type="number" class="cms-input" id="tbl-cols" min="1" max="10" value="3"></div>' +
                    '</div>',
                footer: '<button type="button" class="cms-btn" data-modal-close>Hủy</button>' +
                    '<button type="button" class="cms-btn cms-btn--primary" data-insert-table>Chèn bảng</button>'
            });
            dlg.footer.querySelector('[data-insert-table]').addEventListener('click', () => {
                const rows = util.clamp(Number(dlg.query('#tbl-rows').value) || 3, 1, 20);
                const cols = util.clamp(Number(dlg.query('#tbl-cols').value) || 3, 1, 10);
                let html = '<table><thead><tr>';
                for (let c = 0; c < cols; c++) html += '<th>Cột ' + (c + 1) + '</th>';
                html += '</tr></thead><tbody>';
                for (let r = 1; r < rows; r++) {
                    html += '<tr>';
                    for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
                    html += '</tr>';
                }
                html += '</tbody></table><p><br></p>';
                insertHtml(html);
                dlg.close();
            });
        };

        const bindToolbar = () => {
            el.toolbar.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) e.preventDefault();
            });

            el.toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-cmd]');
                if (!btn) return;
                e.preventDefault();
                const cmd = btn.dataset.cmd;
                if (cmd === 'createLink') return openLinkDialog();
                if (cmd === 'insertImage') return openImageDialog();
                if (cmd === 'insertTable') return openTableDialog();
                if (cmd === 'formatBlock') return exec(cmd, btn.dataset.value);
                return exec(cmd, btn.dataset.value);
            });

            const blockSelect = el.toolbar.querySelector('[data-block-select]');
            if (blockSelect) {
                blockSelect.addEventListener('change', () => exec('formatBlock', blockSelect.value));
            }

            const fontSelect = el.toolbar.querySelector('[data-font-select]');
            if (fontSelect) {
                fontSelect.addEventListener('change', () => {
                    if (!fontSelect.value) return;
                    exec('fontName', fontSelect.value);
                    fontSelect.value = '';
                });
            }

            canvas.addEventListener('keyup', refreshToolbarState);
            canvas.addEventListener('mouseup', () => {
                rememberSelection();
                refreshToolbarState();
            });
            canvas.addEventListener('keyup', rememberSelection);
        };

        /* ---------- Thao tác tiêu đề trang ---------- */

        const bindActions = () => {
            el.btnSave.addEventListener('click', () => save('draft'));
            el.btnSubmit.addEventListener('click', async () => {
                const saved = await save('pending');
                if (saved) ui.toast('Kiểm duyệt viên sẽ nhận thông báo về bài viết này.', 'info');
            });
            el.btnPublish.addEventListener('click', () => {
                ui.confirm({
                    tone: 'primary',
                    heading: 'Xuất bản bài viết?',
                    message: 'Bài viết sẽ hiển thị công khai trên Chuyên trang điện tử.',
                    confirmText: 'Xuất bản'
                }).then((ok) => {
                    if (ok) save('published');
                });
            });
            if (el.btnReview) {
                el.btnReview.addEventListener('click', async () => {
                    if (!currentId) return ui.toast('Hãy lưu bài viết trước khi duyệt.', 'warning');
                    try {
                        record = await Store.setStatus(currentId, 'approved');
                        syncHeader();
                        Shell.refresh();
                        ui.toast('Đã chấp thuận nội dung.', 'success');
                    } catch (err) {
                        ui.toast(err.message || 'Không duyệt được nội dung.', { type: 'error' });
                    }
                });
            }
            if (el.btnPreview) el.btnPreview.addEventListener('click', preview);
            if (el.btnDelete) {
                el.btnDelete.addEventListener('click', () => {
                    if (!currentId) return ui.toast('Bài viết chưa được lưu nên không có gì để xóa.', 'info');
                    ui.confirm({
                        tone: 'danger',
                        heading: 'Xóa bài viết này?',
                        message: 'Thao tác không thể hoàn tác. Bạn có thể chọn “Lưu trữ” thay vì xóa nếu chỉ muốn ẩn bài.',
                        confirmText: 'Xóa vĩnh viễn'
                    }).then(async (ok) => {
                        if (!ok) return;
                        try {
                            await Store.deleteContent(currentId);
                            dirty = false;
                            window.location.href = 'content-list.html';
                        } catch (err) {
                            ui.toast(err.message || 'Không xóa được bài viết.', { type: 'error', duration: 6000 });
                        }
                    });
                });
            }

            const saveTop = document.getElementById('editor-save-side');
            if (saveTop) saveTop.addEventListener('click', () => save('draft'));

            if (el.thumbPicker) {
                el.thumbPicker.addEventListener('click', (e) => {
                    if (e.target.closest('.cms-thumb-picker__remove')) {
                        e.stopPropagation();
                        setThumbnail('');
                        markDirty();
                        return;
                    }
                    openThumbPicker();
                });
            }

            if (el.tagInput) {
                el.tagInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag(el.tagInput.value);
                        el.tagInput.value = '';
                    } else if (e.key === 'Backspace' && !el.tagInput.value && tags.length) {
                        tags.pop();
                        renderTags();
                        markDirty();
                    }
                });
                el.tagInput.addEventListener('blur', () => {
                    if (el.tagInput.value.trim()) {
                        addTag(el.tagInput.value);
                        el.tagInput.value = '';
                    }
                });
            }
            if (el.tagList) {
                el.tagList.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-remove-tag]');
                    if (!btn) return;
                    tags.splice(Number(btn.dataset.removeTag), 1);
                    renderTags();
                    markDirty();
                });
            }

            el.title.addEventListener('input', () => {
                if (!el.slug.dataset.manual) el.slug.value = util.slugify(el.title.value);
                if (!el.seoTitle.dataset.manual) el.seoTitle.value = el.title.value.slice(0, 60);
                updateSeo();
                markDirty();
            });

            el.slug.addEventListener('input', () => {
                el.slug.dataset.manual = '1';
                const clean = el.slug.value.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-');
                if (clean !== el.slug.value) {
                    const pos = el.slug.selectionStart;
                    el.slug.value = clean;
                    el.slug.setSelectionRange(pos, pos);
                }
                updateSeo();
            });

            if (el.seoTitle) el.seoTitle.addEventListener('input', () => {
                el.seoTitle.dataset.manual = '1';
                updateSeo();
            });
            if (el.seoDesc) el.seoDesc.addEventListener('input', () => {
                el.seoDesc.dataset.manual = '1';
                updateSeo();
            });
            if (el.excerpt) el.excerpt.addEventListener('input', () => {
                updateSeo();
                markDirty();
            });

            el.form.addEventListener('input', (e) => {
                if (e.target !== el.title && e.target !== el.excerpt) markDirty();
            });
            canvas.addEventListener('input', () => {
                markDirty();
                updateCounters();
            });

            window.addEventListener('beforeunload', (e) => {
                if (!dirty) return;
                e.preventDefault();
                e.returnValue = '';
            });

            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    save('draft');
                }
            });
        };

        const init = async () => {
            if (!document.getElementById('editor-form')) return;
            canvas = document.getElementById('editor-canvas');
            el.form = document.getElementById('editor-form');
            el.title = document.getElementById('editor-title-input');
            el.slug = document.getElementById('editor-slug');
            el.excerpt = document.getElementById('editor-excerpt');
            el.category = document.getElementById('editor-category');
            el.source = document.getElementById('editor-source');
            el.seoTitle = document.getElementById('editor-seo-title');
            el.seoDesc = document.getElementById('editor-seo-desc');
            el.excerptCount = document.getElementById('excerpt-count');
            el.seoTitleCount = document.getElementById('seo-title-count');
            el.seoDescCount = document.getElementById('seo-desc-count');
            el.date = document.getElementById('editor-date');
            el.time = document.getElementById('editor-time');
            el.toolbar = document.getElementById('editor-toolbar');
            el.statusBadge = document.getElementById('editor-status');
            el.metaLine = document.getElementById('editor-meta');
            el.dirtyHint = document.getElementById('editor-dirty');
            el.btnSave = document.getElementById('editor-save');
            el.btnSubmit = document.getElementById('editor-submit');
            el.btnPublish = document.getElementById('editor-publish');
            el.btnReview = document.getElementById('editor-review');
            el.btnPreview = document.getElementById('editor-preview');
            el.btnDelete = document.getElementById('editor-delete');
            el.thumbPicker = document.getElementById('editor-thumb');
            el.thumbImage = el.thumbPicker ? el.thumbPicker.querySelector('img') : null;
            el.tagInput = document.getElementById('editor-tag-input');
            el.tagList = document.getElementById('editor-tags');
            el.seoPreview = document.getElementById('editor-seo-preview');
            el.wordCount = document.getElementById('editor-words');
            el.charCount = document.getElementById('editor-chars');
            el.readTime = document.getElementById('editor-readtime');

            await loadRecord();
            bindActions();
            bindToolbar();
            refreshToolbarState();
        };

        return { init };
    })();

    /* ==========================================================================
       11. TRANG QUẢN LÝ CHUYÊN MỤC
       ========================================================================== */

    /* ==========================================================================
       11. TRANG QUẢN LÝ CHUYÊN MỤC (categories.html)
       ========================================================================== */

    const Categories = (function () {
        const state = { q: '', status: '' };
        const el = {};

        const allSorted = () => {
            const list = Store.categories();
            const roots = list.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
            const out = [];
            roots.forEach((root) => {
                out.push(Object.assign({ depth: 0 }, root));
                list.filter((c) => c.parentId === root.id)
                    .sort((a, b) => a.order - b.order)
                    .forEach((child) => out.push(Object.assign({ depth: 1 }, child)));
            });
            return out;
        };

        const filtered = () => {
            const q = util.normalize(state.q);
            return allSorted().filter((c) => {
                if (state.status && c.status !== state.status) return false;
                if (!q) return true;
                return util.normalize(c.name + ' ' + c.slug + ' ' + c.description).indexOf(q) !== -1;
            });
        };

        const canManage = () => Store.can('category.manage');

        /* ---------- Render ---------- */

        const render = () => {
            const list = filtered();
            const all = Store.categories();
            const activeCount = all.filter((c) => c.status === 'active').length;

            if (el.summary) {
                el.summary.innerHTML = '<strong>' + list.length + '</strong> chuyên mục hiển thị · ' +
                    all.length + ' tổng số (' + activeCount + ' đang hoạt động)';
            }

            if (!el.tbody) return;

            if (!list.length) {
                el.tbody.innerHTML = '<tr><td colspan="8" class="cms-empty-cell">' + ui.emptyState({
                    icon: 'fa-folder-open',
                    title: state.q || state.status ? 'Không tìm thấy chuyên mục phù hợp' : 'Chưa có chuyên mục nào',
                    text: state.q || state.status
                        ? 'Thử từ khóa khác hoặc bỏ điều kiện lọc.'
                        : 'Tạo chuyên mục đầu tiên để tổ chức nội dung trên Cổng thông tin.',
                    action: '<button type="button" class="cms-btn cms-btn--primary cms-btn--sm" data-category-action="create">' +
                        '<i class="fa-solid fa-plus" aria-hidden="true"></i> Tạo chuyên mục</button>'
                }) + '</td></tr>';
                return;
            }

            el.tbody.innerHTML = list.map((c) => {
                const count = Store.categoryArticleCount(c.id);
                const parent = c.parentId ? Store.categoryById(c.parentId) : null;
                const manage = canManage();
                return '<tr data-id="' + util.escape(c.id) + '">' +
                    '<td class="cms-table__cell-check">' +
                    '<span class="cms-cat-depth" style="--depth:' + c.depth + '" aria-hidden="true">' +
                    '<i class="fa-solid ' + (c.depth ? 'fa-reply fa-flip-horizontal' : 'fa-folder') + '"></i></span></td>' +
                    '<td data-label="Tên chuyên mục"><div class="cms-table__title-text">' +
                    '<span class="cms-table__link">' + util.escape(c.name) + '</span>' +
                    '<span class="cms-table__slug">/' + util.escape(c.slug) + '</span></div></td>' +
                    '<td data-label="Chuyên mục cha">' + (parent
                        ? '<span class="cms-u-text-sm">' + util.escape(parent.name) + '</span>'
                        : '<span class="cms-badge cms-badge--neutral cms-badge--no-dot">Cấp 1</span>') + '</td>' +
                    '<td data-label="Số bài viết"><span class="cms-table__nowrap">' + util.formatNumber(count) + '</span></td>' +
                    '<td data-label="Thứ tự"><span class="cms-table__nowrap">' + c.order + '</span></td>' +
                    '<td data-label="Trạng thái"><span class="cms-badge cms-badge--' +
                    (c.status === 'active' ? 'published' : 'draft') + '">' +
                    (c.status === 'active' ? 'Đang hoạt động' : 'Tạm ẩn') + '</span></td>' +
                    '<td data-label="Ngày tạo"><span class="cms-table__muted">' + util.escape(util.formatDate(c.createdAt)) + '</span></td>' +
                    '<td data-label="Thao tác" class="cms-table__cell-actions"><div class="cms-table__actions">' +
                    '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-category-action="up" ' +
                    'aria-label="Di chuyển lên" title="Lên"' + (manage ? '' : ' disabled') + '>' +
                    '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>' +
                    '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-category-action="down" ' +
                    'aria-label="Di chuyển xuống" title="Xuống"' + (manage ? '' : ' disabled') + '>' +
                    '<i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>' +
                    '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-category-action="edit" ' +
                    'aria-label="Chỉnh sửa chuyên mục" title="Chỉnh sửa">' +
                    '<i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
                    '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-category-action="delete" ' +
                    'aria-label="Xóa chuyên mục" title="Xóa"' + (manage ? '' : ' disabled') + '>' +
                    '<i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>' +
                    '</div></td></tr>';
            }).join('');
        };

        /* ---------- Form tạo / sửa ---------- */

        const openForm = async (category) => {
            if (!canManage()) {
                ui.toast('Vai trò hiện tại không có quyền quản lý chuyên mục.', 'error');
                return;
            }
            const isEdit = !!category;
            const data = category || { name: '', slug: '', parentId: '', group: '', description: '', status: 'active', order: '' };
            let groups;
            try {
                groups = await window.PortalAPI.get('/api/cms/system-categories?type=category_group');
            } catch (err) {
                ui.toast(err.message || 'Không tải được nhóm chuyên mục.', 'error');
                return;
            }
            groups = (Array.isArray(groups) ? groups : [])
                .filter((group) => group.status === 'active' || group.code === data.group);

            const parentOptions = allSorted()
                .filter((c) => !isEdit || (c.id !== data.id && c.parentId !== data.id))
                .map((c) => '<option value="' + util.escape(c.id) + '"' + (c.id === data.parentId ? ' selected' : '') + '>' +
                    (c.depth ? '— ' : '') + util.escape(c.name) + '</option>').join('');

            const dlg = ui.modal({
                title: isEdit ? 'Chỉnh sửa chuyên mục' : 'Tạo chuyên mục mới',
                subtitle: isEdit ? data.name : 'Chuyên mục giúp phân loại nội dung trên Cổng thông tin',
                content: '<form id="category-form" novalidate><div class="cms-form-grid">' +
                    '<div class="cms-field cms-field--full">' +
                    '<label class="cms-label" for="cat-name">Tên chuyên mục <span class="cms-label__req">*</span></label>' +
                    '<input type="text" class="cms-input" id="cat-name" value="' + util.escape(data.name) + '" maxlength="100" data-autofocus>' +
                    '<span class="cms-error-text">Vui lòng nhập tên chuyên mục.</span></div>' +
                    '<div class="cms-field cms-field--full">' +
                    '<label class="cms-label" for="cat-slug">Slug <span class="cms-label__hint">(đường dẫn, tự tạo từ tên)</span></label>' +
                    '<input type="text" class="cms-input" id="cat-slug" value="' + util.escape(data.slug) + '" placeholder="tin-chi-dao">' +
                    '<span class="cms-error-text">Slug chỉ gồm chữ thường không dấu, số và dấu gạch nối.</span></div>' +
                    '<div class="cms-field"><label class="cms-label" for="cat-parent">Chuyên mục cha</label>' +
                    '<select class="cms-select" id="cat-parent"><option value="">— Không có (chuyên mục cấp 1) —</option>' +
                    parentOptions + '</select></div>' +
                    '<div class="cms-field"><label class="cms-label" for="cat-group">Nhóm chuyên mục <span class="cms-label__req">*</span></label>' +
                    '<select class="cms-select" id="cat-group" required><option value="">— ' +
                    (groups.length ? 'Chọn nhóm —' : 'Chưa có nhóm chuyên mục —') + '</option>' +
                    groups.map((group) => '<option value="' + util.escape(group.code) + '"' +
                        (group.code === data.group ? ' selected' : '') +
                        (group.status !== 'active' ? ' disabled' : '') + '>' + util.escape(group.name) + '</option>').join('') +
                    '</select></div>' +
                    '<div class="cms-field"><label class="cms-label" for="cat-order">Thứ tự hiển thị</label>' +
                    '<input type="number" class="cms-input" id="cat-order" min="1" max="99" value="' + (data.order || '') + '" placeholder="Tự động"></div>' +
                    '<div class="cms-field cms-field--full"><label class="cms-label" for="cat-desc">Mô tả</label>' +
                    '<textarea class="cms-textarea" id="cat-desc" rows="3" maxlength="300">' + util.escape(data.description) + '</textarea>' +
                    '<span class="cms-help">Mô tả ngắn giúp người quản trị và người đọc hiểu phạm vi chuyên mục.</span></div>' +
                    '<div class="cms-field cms-field--full"><label class="cms-switch">' +
                    '<input type="checkbox" id="cat-status"' + (data.status === 'active' ? ' checked' : '') + '>' +
                    '<span class="cms-switch__track"></span><span>Hiển thị trên Cổng thông tin</span></label></div>' +
                    '</div></form>',
                footer: '<button type="button" class="cms-btn" data-modal-close>Hủy</button>' +
                    '<button type="button" class="cms-btn cms-btn--primary" data-save-category>' +
                    '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ' + (isEdit ? 'Lưu thay đổi' : 'Tạo chuyên mục') + '</button>'
            });

            const nameInput = dlg.query('#cat-name');
            const slugInput = dlg.query('#cat-slug');
            let slugManual = !!data.slug;

            slugInput.addEventListener('input', () => { slugManual = true; });
            nameInput.addEventListener('input', () => {
                if (!slugManual) slugInput.value = util.slugify(nameInput.value);
            });

            dlg.footer.querySelector('[data-save-category]').addEventListener('click', async () => {
                const name = nameInput.value.trim();
                const slug = slugInput.value.trim() || util.slugify(name);
                let valid = true;

                nameInput.classList.remove('is-invalid');
                slugInput.classList.remove('is-invalid');
                dlg.query('.cms-error-text').classList.remove('is-visible');

                if (!name) {
                    nameInput.classList.add('is-invalid');
                    valid = false;
                }
                if (!/^[a-z0-9-]+$/.test(slug)) {
                    slugInput.classList.add('is-invalid');
                    valid = false;
                }
                const duplicate = Store.categories().some((c) => c.slug === slug && (!isEdit || c.id !== data.id));
                if (duplicate) {
                    slugInput.classList.add('is-invalid');
                    ui.toast('Slug đã tồn tại, vui lòng chọn slug khác.', 'error');
                    valid = false;
                }
                if (!valid) {
                    ui.toast('Vui lòng kiểm tra lại các trường được đánh dấu.', 'error');
                    return;
                }

                const payload = {
                    name: name,
                    slug: slug,
                    parentId: dlg.query('#cat-parent').value || null,
                    group: dlg.query('#cat-group').value,
                    description: dlg.query('#cat-desc').value.trim(),
                    status: dlg.query('#cat-status').checked ? 'active' : 'inactive',
                    order: Number(dlg.query('#cat-order').value) || (isEdit ? data.order : Store.categories().length + 1)
                };
                if (isEdit) payload.id = data.id;

                try {
                    await Store.saveCategory(payload);
                    dlg.close();
                    render();
                    ui.toast(isEdit ? 'Đã cập nhật chuyên mục.' : 'Đã tạo chuyên mục mới.', 'success');
                } catch (err) {
                    ui.toast(err.message || 'Không lưu được chuyên mục.', { type: 'error', duration: 6000 });
                }
            });
        };

        /* ---------- Xóa (kiểm tra ràng buộc) ---------- */

        const removeCategory = (category) => {
            if (!canManage()) {
                ui.toast('Vai trò hiện tại không có quyền xóa chuyên mục.', 'error');
                return;
            }
            const count = Store.categoryArticleCount(category.id);
            const children = Store.categoryChildren(category.id).length;

            if (count > 0) {
                ui.modal({
                    title: 'Không thể xóa chuyên mục',
                    content: '<div class="cms-confirm">' +
                        '<span class="cms-confirm__icon cms-confirm__icon--danger">' +
                        '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>' +
                        '<div class="cms-confirm__body">' +
                        '<p class="cms-confirm__title">Chuyên mục đang chứa nội dung</p>' +
                        '<p class="cms-confirm__text">Chuyên mục <span class="cms-confirm__highlight">' + util.escape(category.name) +
                        '</span> đang có <span class="cms-confirm__highlight">' + count + ' bài viết</span>. ' +
                        'Vui lòng chuyển các bài viết sang chuyên mục khác trước khi xóa để tránh nội dung bị mất phân loại.</p>' +
                        (children ? '<p class="cms-confirm__text">Chuyên mục này còn ' + children + ' chuyên mục con.</p>' : '') +
                        '</div></div>',
                    footer: '<button type="button" class="cms-btn" data-modal-close>Đóng</button>' +
                        '<a class="cms-btn cms-btn--primary" href="content-list.html?category=' + encodeURIComponent(category.id) + '">' +
                        '<i class="fa-solid fa-list" aria-hidden="true"></i> Xem ' + count + ' bài viết</a>'
                });
                return;
            }

            ui.confirm({
                tone: 'danger',
                heading: 'Xóa chuyên mục này?',
                message: children
                    ? children + ' chuyên mục con sẽ được chuyển thành chuyên mục cấp 1.'
                    : 'Chuyên mục chưa có bài viết nào nên có thể xóa an toàn.',
                detail: '<span class="cms-confirm__highlight">' + util.escape(category.name) + '</span>',
                confirmText: 'Xóa chuyên mục'
            }).then(async (ok) => {
                if (!ok) return;
                try {
                    await Store.deleteCategory(category.id);
                    render();
                    ui.toast('Đã xóa chuyên mục.', 'success');
                } catch (err) {
                    ui.toast(err.message || 'Không xóa được chuyên mục.', { type: 'error', duration: 6000 });
                }
            });
        };

        const bind = () => {
            const search = document.getElementById('category-q');
            if (search) {
                search.addEventListener('input', util.debounce(() => {
                    state.q = search.value;
                    render();
                }, 220));
            }
            const status = document.getElementById('category-status');
            if (status) {
                status.addEventListener('change', () => {
                    state.status = status.value;
                    render();
                });
            }
            const create = document.getElementById('category-create');
            if (create) create.addEventListener('click', () => openForm(null));

            if (el.tbody) {
                el.tbody.addEventListener('click', async (e) => {
                    const btn = e.target.closest('[data-category-action]');
                    if (!btn) return;
                    const tr = btn.closest('tr[data-id]');
                    if (!tr) return;
                    const category = Store.categoryById(tr.dataset.id);
                    if (!category) return;
                    const action = btn.dataset.categoryAction;
                    if (action === 'edit') return openForm(category);
                    if (action === 'delete') return removeCategory(category);
                    if (action === 'up' || action === 'down') {
                        if (!canManage()) return;
                        try {
                            const moved = await Store.moveCategory(category.id, action === 'up' ? -1 : 1);
                            if (!moved) ui.toast('Chuyên mục đã ở vị trí đầu hoặc cuối nhóm.', 'info');
                            render();
                        } catch (err) {
                            ui.toast(err.message || 'Không cập nhật được thứ tự chuyên mục.', { type: 'error' });
                        }
                    }
                });
            }

            document.addEventListener('click', (e) => {
                if (e.target.closest('[data-category-action="create"]')) openForm(null);
            });
        };

        const init = () => {
            if (!document.getElementById('category-tbody')) return;
            el.tbody = document.getElementById('category-tbody');
            el.summary = document.getElementById('category-summary');
            if (!canManage()) {
                const create = document.getElementById('category-create');
                if (create) {
                    create.disabled = true;
                    create.title = 'Vai trò hiện tại không có quyền quản lý chuyên mục';
                }
            }
            bind();
            render();
        };

        return { init };
    })();

    /* ==========================================================================
       12. TRANG THƯ VIỆN TÀI NGUYÊN
       ========================================================================== */

    /* ==========================================================================
       12. TRANG THƯ VIỆN TÀI NGUYÊN (media-library.html)
       ========================================================================== */

    const Media = (function () {
        const state = { q: '', type: '', date: '', view: 'grid', selected: null, page: 1, pageSize: 24 };
        const el = {};

        const filtered = () => {
            const q = util.normalize(state.q);
            const now = new Date();
            return Store.media().filter((m) => {
                if (state.type === 'image' && m.type !== 'image') return false;
                if (state.type === 'document' && m.type !== 'document') return false;
                if (['pdf', 'docx', 'xlsx'].indexOf(state.type) !== -1 && m.ext !== state.type) return false;

                if (state.date) {
                    const d = util.parseDate(m.uploadedAt);
                    if (!d) return false;
                    if (state.date === '7' && (now - d) > 7 * 86400000) return false;
                    if (state.date === '30' && (now - d) > 30 * 86400000) return false;
                    if (state.date === 'year' && d.getFullYear() !== now.getFullYear()) return false;
                }
                if (!q) return true;
                return util.normalize(m.name + ' ' + m.folder + ' ' + m.alt).indexOf(q) !== -1;
            }).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        };

        const fileIcon = (m) => {
            if (m.type === 'image') return 'fa-file-image';
            if (m.type === 'video') return 'fa-file-video';
            if (m.ext === 'pdf') return 'fa-file-pdf';
            if (m.ext === 'doc' || m.ext === 'docx') return 'fa-file-word';
            if (m.ext === 'xls' || m.ext === 'xlsx') return 'fa-file-excel';
            return 'fa-file';
        };

        /* ---------- Render ---------- */

        const render = () => {
            const list = filtered();
            const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
            state.page = util.clamp(state.page, 1, totalPages);
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
            const canDelete = Store.can('media.delete');

            if (el.summary) {
                const size = list.reduce((s, m) => s + (m.size || 0), 0);
                el.summary.innerHTML = '<strong>' + util.formatNumber(list.length) + '</strong> tệp · ' + util.formatBytes(size);
            }

            const empty = ui.emptyState({
                icon: 'fa-photo-film',
                title: state.q || state.type || state.date ? 'Không có tệp phù hợp' : 'Thư viện đang trống',
                text: state.q || state.type || state.date
                    ? 'Thử từ khóa hoặc bộ lọc khác.'
                    : 'Tải lên hình ảnh, tài liệu để sử dụng trong các bài viết trên Cổng thông tin.'
            });

            if (el.grid) {
                el.grid.innerHTML = rows.map((m) => {
                    const thumb = m.type === 'image'
                        ? '<img src="' + util.escape(m.url) + '" alt="' + util.escape(m.alt || m.name) + '" loading="lazy">'
                        : m.type === 'video'
                            ? '<video src="' + util.escape(m.url) + '" muted preload="metadata"></video>'
                            : '<i class="fa-solid ' + fileIcon(m) + ' cms-media-card__fileicon" aria-hidden="true"></i>';
                    return '<article class="cms-media-card' + (state.selected === m.id ? ' is-selected' : '') + '" data-id="' +
                        util.escape(m.id) + '" tabindex="0" role="button" aria-label="Xem thông tin ' + util.escape(m.name) + '">' +
                        '<div class="cms-media-card__thumb">' + thumb +
                        '<span class="cms-media-card__badge">' + util.escape(m.ext) + '</span>' +
                        '<span class="cms-media-card__check"><i class="fa-solid fa-check" aria-hidden="true"></i></span></div>' +
                        '<div class="cms-media-card__info">' +
                        '<p class="cms-media-card__name" title="' + util.escape(m.name) + '">' + util.escape(m.name) + '</p>' +
                        '<p class="cms-media-card__meta">' + util.formatBytes(m.size) + ' · ' + util.escape(util.formatDate(m.uploadedAt)) + '</p>' +
                        '</div></article>';
                }).join('');
            }

            if (el.list) {
                el.list.innerHTML = rows.map((m) => {
                    const thumb = m.type === 'image'
                        ? '<img src="' + util.escape(m.url) + '" alt="" loading="lazy">'
                        : '<i class="fa-solid ' + fileIcon(m) + '" style="font-size:1rem;color:var(--color-primary)" aria-hidden="true"></i>';
                    return '<div class="cms-media-row' + (state.selected === m.id ? ' is-selected' : '') + '" data-id="' +
                        util.escape(m.id) + '" tabindex="0">' +
                        '<span class="cms-media-card__check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>' +
                        '<span class="cms-media-row__thumb cms-u-flex cms-u-items-center">' + thumb + '</span>' +
                        '<span class="cms-media-row__name" title="' + util.escape(m.name) + '">' + util.escape(m.name) + '</span>' +
                        '<span class="cms-media-row__meta">' + util.escape(m.ext.toUpperCase()) + '</span>' +
                        '<span class="cms-media-row__meta">' + util.formatBytes(m.size) + '</span>' +
                        '<span class="cms-media-row__meta">' + util.escape(util.formatDate(m.uploadedAt)) + '</span>' +
                        '<span class="cms-media-row__actions">' +
                        '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-media-action="info" ' +
                        'aria-label="Xem thông tin tệp" title="Thông tin">' +
                        '<i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>' +
                        '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-media-action="copy" ' +
                        'aria-label="Sao chép đường dẫn" title="Sao chép đường dẫn">' +
                        '<i class="fa-solid fa-link" aria-hidden="true"></i></button>' +
                        '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon' +
                        (canDelete ? '' : ' cms-u-hidden') + '" data-media-action="delete" aria-label="Xóa tệp" title="Xóa">' +
                        '<i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>' +
                        '</span></div>';
                }).join('');
            }

            if (!rows.length) {
                if (el.grid) el.grid.innerHTML = empty;
                if (el.list) el.list.innerHTML = empty;
            }

            ui.renderPagination(el.pagination, { total: list.length, page: state.page, pageSize: state.pageSize }, (p) => {
                state.page = p;
                render();
            });

            renderDetail(state.selected ? Store.mediaById(state.selected) : null);
        };

        /* ---------- Chi tiết tệp ---------- */

        const renderDetail = (m) => {
            const host = el.detail;
            if (!host) return;
            if (!m) {
                host.innerHTML = '<div class="cms-file-detail__empty">' +
                    '<i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>' +
                    '<p class="cms-u-mt-sm">Chọn một tệp trong thư viện để xem thông tin chi tiết.</p></div>';
                return;
            }
            const uploader = Store.userById(m.uploadedBy);
            const preview = m.type === 'image'
                ? '<img src="' + util.escape(m.url) + '" alt="' + util.escape(m.alt || m.name) + '">'
                : m.type === 'video'
                    ? '<video src="' + util.escape(m.url) + '" controls preload="metadata" style="width:100%;max-height:240px"></video>'
                    : '<i class="fa-solid ' + fileIcon(m) + ' cms-media-card__fileicon" style="font-size:2.5rem;padding:2rem" aria-hidden="true"></i>';
            const canDelete = Store.can('media.delete');

            host.innerHTML = '<div class="cms-file-detail">' +
                '<div class="cms-file-detail__preview">' + preview + '</div>' +
                '<dl class="cms-file-detail__list">' +
                '<div class="cms-file-detail__row"><dt>Tên tệp</dt><dd>' + util.escape(m.name) + '</dd></div>' +
                '<div class="cms-file-detail__row"><dt>Định dạng</dt><dd>' + util.escape(m.ext.toUpperCase()) + '</dd></div>' +
                '<div class="cms-file-detail__row"><dt>Kích thước</dt><dd>' + util.formatBytes(m.size) + '</dd></div>' +
                (m.width ? '<div class="cms-file-detail__row"><dt>Kích thước ảnh</dt><dd>' + m.width + ' × ' + m.height + ' px</dd></div>' : '') +
                '<div class="cms-file-detail__row"><dt>Ngày tải lên</dt><dd>' + util.escape(util.formatDateTime(m.uploadedAt)) + '</dd></div>' +
                '<div class="cms-file-detail__row"><dt>Người tải lên</dt><dd>' + util.escape(uploader ? uploader.name : '—') + '</dd></div>' +
                '<div class="cms-file-detail__row"><dt>Thư mục</dt><dd>' + util.escape(m.folder || '—') + '</dd></div>' +
                '<div class="cms-file-detail__row cms-file-detail__row--stack"><dt>Đường dẫn lưu trữ</dt><dd>' +
                util.escape(m.url.length > 120 ? m.url.slice(0, 120) + '… [dữ liệu nhúng]' : m.url) + '</dd></div>' +
                '</dl>' +
                '<div class="cms-u-flex cms-u-gap-sm cms-u-wrap">' +
                '<button type="button" class="cms-btn cms-btn--sm cms-btn--primary" data-media-action="copy" data-id="' + util.escape(m.id) + '">' +
                '<i class="fa-solid fa-link" aria-hidden="true"></i> Sao chép đường dẫn</button>' +
                '<button type="button" class="cms-btn cms-btn--sm" data-media-action="insert" data-id="' + util.escape(m.id) + '">' +
                '<i class="fa-solid fa-code" aria-hidden="true"></i> Chèn vào bài viết</button>' +
                '<button type="button" class="cms-btn cms-btn--sm cms-btn--danger' + (canDelete ? '' : ' cms-u-hidden') +
                '" data-media-action="delete" data-id="' + util.escape(m.id) + '">' +
                '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> Xóa</button>' +
                '</div></div>';
        };

        /* ---------- Sao chép / chèn ---------- */

        const fallbackCopy = (text) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.className = 'cms-u-sr-only';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return ok;
            } catch (e) {
                return false;
            }
        };

        const copyText = (text) => {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
            }
            return Promise.resolve(fallbackCopy(text));
        };

        const copyUrl = (m) => {
            copyText(m.url).then((ok) => {
                ui.toast(ok
                    ? 'Đã sao chép đường dẫn của tệp: ' + util.truncate(m.name, 48)
                    : 'Không thể sao chép tự động — hãy chọn đường dẫn trong ô thông tin tệp.', ok ? 'success' : 'warning');
            });
        };

        const insertIntoArticle = (m) => {
            const html = m.type === 'image'
                ? '<img src="' + m.url + '" alt="' + util.escape(m.alt || '') + '">'
                : '<a href="' + m.url + '" target="_blank" rel="noopener">' + util.escape(m.name) + '</a>';
            copyText(html).then((ok) => {
                ui.toast(ok
                    ? 'Đã sao chép mã nhúng. Mở trình biên tập bài viết và dán vào nội dung.'
                    : 'Không thể sao chép mã nhúng — hãy sao chép đường dẫn tệp và chèn thủ công.', ok ? 'success' : 'warning');
            });
        };

        /* ---------- Tải lên ---------- */

        const showQueueItem = (file, status, percent, message) => {
            const queue = el.queue;
            if (!queue) return null;
            let item = queue.querySelector('[data-file="' + CSS.escape(file.name) + '"]');
            if (!item) {
                item = document.createElement('div');
                item.className = 'cms-upload-item';
                item.dataset.file = file.name;
                item.innerHTML = '<div class="cms-upload-item__row">' +
                    '<span class="cms-upload-item__name"></span>' +
                    '<span class="cms-upload-item__state"></span></div>' +
                    '<div class="cms-progress"><span class="cms-progress__bar"></span></div>';
                item.querySelector('.cms-upload-item__name').textContent = file.name;
                queue.appendChild(item);
            }
            item.classList.toggle('is-error', status === 'error');
            item.classList.toggle('is-done', status === 'done');
            item.querySelector('.cms-upload-item__state').textContent =
                status === 'error' ? (message || 'Lỗi') : status === 'done' ? 'Hoàn tất' : percent + '%';
            item.querySelector('.cms-progress__bar').style.width = status === 'error' ? '100%' : percent + '%';
            return item;
        };

        const IMAGE_EXT = CONFIG.upload.imageExt;
        const VIDEO_EXT = CONFIG.upload.videoExt;
        const AUDIO_EXT = CONFIG.upload.audioExt;

        const validateFile = (file) => {
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            if (file.size === 0) return { ok: false, message: 'Tệp rỗng hoặc không đọc được.' };
            if (CONFIG.upload.ext.indexOf(ext) === -1) {
                return {
                    ok: false,
                    message: 'Định dạng .' + (ext || '?') + ' không được hỗ trợ. Chỉ nhận: ' + CONFIG.upload.text
                };
            }
            if (CONFIG.upload.maxSize > 0 && file.size > CONFIG.upload.maxSize) {
                return {
                    ok: false,
                    message: 'Tệp vượt quá ' + util.formatBytes(CONFIG.upload.maxSize)
                        + '. Vui lòng nén hoặc chọn tệp nhỏ hơn.'
                };
            }
            return { ok: true };
        };

        const readImageSize = (dataUrl) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: null, height: null });
            img.src = dataUrl;
        });

        const uploadFiles = (fileList) => {
            if (!Store.can('media.upload')) {
                ui.toast('Vai trò hiện tại không có quyền tải tệp lên.', 'error');
                return;
            }
            Array.from(fileList || []).forEach((file) => {
                const check = validateFile(file);
                if (!check.ok) {
                    showQueueItem(file, 'error', 0, check.message);
                    ui.toast(file.name + ': ' + check.message, 'error');
                    return;
                }

                const ext = (file.name.split('.').pop() || '').toLowerCase();
                const isImage = IMAGE_EXT.indexOf(ext) !== -1;
                const isVideo = VIDEO_EXT.indexOf(ext) !== -1;
                const isAudio = AUDIO_EXT.indexOf(ext) !== -1;
                showQueueItem(file, 'progress', 5);

                /* Tiến trình đọc tệp và ghi nhận vào thư viện tài nguyên */
                let percent = 5;
                const timer = setInterval(() => {
                    percent = Math.min(92, percent + 10 + Math.random() * 20);
                    showQueueItem(file, 'progress', Math.round(percent));
                }, 130);

                Store.addMedia({
                    file,
                    alt: '',
                    folder: isVideo ? 'Video' : isAudio ? 'Âm thanh' : isImage ? 'Hình ảnh hoạt động' : 'Tài liệu tải lên'
                }).then(() => {
                    clearInterval(timer);
                    showQueueItem(file, 'done', 100);
                    state.page = 1;
                    render();
                    ui.toast('Đã tải lên: ' + file.name, 'success');
                }).catch((err) => {
                    clearInterval(timer);
                    showQueueItem(file, 'error', 0, err.message);
                    ui.toast(err.message || 'Không lưu được tệp vào thư viện.', { type: 'error', duration: 6000 });
                });
            });
        };

        /* ---------- Xóa ---------- */

        const removeMedia = (m) => {
            if (!Store.can('media.delete')) {
                ui.toast('Vai trò hiện tại không có quyền xóa tài nguyên.', 'error');
                return;
            }
            ui.confirm({
                tone: 'danger',
                heading: 'Xóa tệp khỏi thư viện?',
                message: 'Tệp sẽ bị gỡ khỏi thư viện. Hệ thống kiểm tra tệp đang được dùng trong bài viết trước khi xóa.',
                detail: '<span class="cms-confirm__highlight">' + util.escape(m.name) + '</span>',
                confirmText: 'Xóa tệp'
            }).then(async (ok) => {
                if (!ok) return;
                try {
                    await Store.deleteMedia(m.id);
                    if (state.selected === m.id) state.selected = null;
                    render();
                    ui.toast('Đã xóa tệp khỏi thư viện.', 'success');
                } catch (err) {
                    ui.toast(err.message || 'Không xóa được tệp.', { type: 'error', duration: 6000 });
                }
            });
        };

        /* ---------- Sự kiện ---------- */

        const handleMediaAction = (e) => {
            const btn = e.target.closest('[data-media-action]');
            if (!btn) return;
            const host = btn.closest('[data-id]');
            const id = btn.dataset.id || (host ? host.dataset.id : state.selected);
            const m = Store.mediaById(id);
            if (!m) return;
            const action = btn.dataset.mediaAction;
            if (action === 'copy') copyUrl(m);
            else if (action === 'insert') insertIntoArticle(m);
            else if (action === 'delete') removeMedia(m);
            else if (action === 'info') {
                state.selected = m.id;
                render();
                const aside = document.querySelector('.cms-media-aside');
                if (aside && window.innerWidth < 1024) aside.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        const syncClearIcon = (input) => {
            const wrap = input.closest('.cms-input-icon');
            if (wrap) wrap.classList.toggle('has-value', !!input.value);
        };

        const bind = () => {
            const search = document.getElementById('media-q');
            if (search) {
                search.addEventListener('input', util.debounce(() => {
                    state.q = search.value;
                    state.page = 1;
                    syncClearIcon(search);
                    render();
                }, 220));
            }
            const clear = document.querySelector('[data-media-search-clear]');
            if (clear && search) {
                clear.addEventListener('click', () => {
                    search.value = '';
                    state.q = '';
                    state.page = 1;
                    syncClearIcon(search);
                    search.focus();
                    render();
                });
            }

            const type = document.getElementById('media-type');
            if (type) type.addEventListener('change', () => { state.type = type.value; state.page = 1; render(); });
            const date = document.getElementById('media-date');
            if (date) date.addEventListener('change', () => { state.date = date.value; state.page = 1; render(); });

            document.querySelectorAll('[data-view]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    state.view = btn.dataset.view;
                    document.querySelectorAll('[data-view]').forEach((b) => {
                        const on = b.dataset.view === state.view;
                        b.classList.toggle('is-active', on);
                        b.setAttribute('aria-pressed', String(on));
                    });
                    if (el.area) {
                        el.area.classList.toggle('is-list', state.view === 'list');
                        el.area.classList.toggle('is-grid', state.view !== 'list');
                    }
                    Store.savePrefs({ view: state.view });
                });
            });

            if (el.area) {
                el.area.addEventListener('click', (e) => {
                    if (e.target.closest('[data-media-action]')) {
                        handleMediaAction(e);
                        return;
                    }
                    const card = e.target.closest('[data-id]');
                    if (!card) return;
                    state.selected = card.dataset.id;
                    render();
                });
                el.area.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    const card = e.target.closest('[data-id]');
                    if (!card) return;
                    e.preventDefault();
                    state.selected = card.dataset.id;
                    render();
                });
            }

            if (el.detail) el.detail.addEventListener('click', handleMediaAction);

            const input = document.getElementById('media-file-input');
            const dropzone = document.getElementById('media-dropzone');
            if (input) {
                input.addEventListener('change', () => {
                    uploadFiles(input.files);
                    input.value = '';
                });
            }
            if (dropzone && input) {
                dropzone.addEventListener('click', () => input.click());
                dropzone.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        input.click();
                    }
                });
                ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
                    e.preventDefault();
                    dropzone.classList.add('is-dragover');
                }));
                ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('is-dragover');
                }));
                dropzone.addEventListener('drop', (e) => {
                    if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
                });
            }

            const uploadBtn = document.getElementById('media-upload-btn');
            if (uploadBtn && input) uploadBtn.addEventListener('click', () => input.click());
        };

        const init = () => {
            if (!document.getElementById('media-area')) return;
            el.area = document.getElementById('media-area');
            el.grid = document.getElementById('media-grid');
            el.list = document.getElementById('media-list');
            el.detail = document.getElementById('media-detail');
            el.queue = document.getElementById('media-queue');
            el.pagination = document.getElementById('media-pagination');
            el.summary = document.getElementById('media-summary');
            el.used = document.getElementById('media-used');

            if (el.used) {
                const totalBytes = Store.media().reduce((s, m) => s + (m.size || 0), 0);
                el.used.textContent = util.formatBytes(totalBytes);
            }

            const prefs = Store.loadPrefs();
            state.view = prefs.view === 'list' ? 'list' : 'grid';
            if (state.view === 'list') el.area.classList.add('is-list');
            document.querySelectorAll('[data-view]').forEach((b) => {
                const on = b.dataset.view === state.view;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-pressed', String(on));
            });

            bind();
            render();
        };

        return { init };
    })();

    /* ==========================================================================
       13. TRANG QUY TRÌNH XUẤT BẢN
       ========================================================================== */

    /* ==========================================================================
       13. TRANG QUY TRÌNH XUẤT BẢN (publishing-workflow.html)
       ========================================================================== */

    const PublicCatalog = (function () {
        let kind = 'legal-documents';
        let rows = [];
        const categoryCache = new Map();

        const TITLES = {
            'legal-documents': 'Văn bản pháp luật',
            agencies: 'Cơ quan - Đơn vị',
            events: 'Sự kiện',
            'support-facilities': 'Cơ sở y tế và điểm tư vấn',
            statistics: 'Số liệu thống kê',
        };

        /* Nhãn dự phòng khi chưa tải được danh mục; nguồn chính là `event_status` trong CMS */
        const EVENT_STATUS = { upcoming: 'Sắp diễn ra', ongoing: 'Đang diễn ra', past: 'Đã kết thúc' };
        const PUBLISH_STATUS = { draft: 'Chưa công khai', published: 'Đã công khai', hidden: 'Tạm ẩn' };
        const EFFECT_STATUS = {
            in_effect: 'Còn hiệu lực', expired: 'Hết hiệu lực',
            replaced: 'Bị thay thế', amended: 'Được sửa đổi, bổ sung',
        };
        /* Nhãn trạng thái dùng chung cho bảng danh sách (tránh hiển thị khóa kỹ thuật) */
        const STATUS_LABEL = Object.assign({
            active: 'Đang hoạt động', inactive: 'Ngừng hoạt động',
            reported: 'Đã báo cáo', verified: 'Đã phê duyệt',
            pending: 'Chờ kiểm duyệt', rejected: 'Không công khai', hidden: 'Tạm ẩn',
        }, EVENT_STATUS, EFFECT_STATUS);
        const getCategoryOptions = async (type, currentValue) => {
            let categories = categoryCache.get(type);
            if (!categories) {
                categories = await window.PortalAPI.get(`/api/cms/system-categories?type=${encodeURIComponent(type)}`);
                if (!Array.isArray(categories)) categories = [];
                categoryCache.set(type, categories);
            }
            return categories
                .filter((category) => category.status === 'active' || category.code === currentValue)
                .map((category) => ({
                    value: category.code,
                    label: category.name,
                    disabled: category.status !== 'active',
                }));
        };

        /** Chọn tệp qua hộp thoại, tải lên thư viện tài nguyên, trả về URL công khai */
        const pickAndUpload = (accept, folder) => new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            if (accept) input.accept = accept;
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                if (!file) return resolve(null);
                try {
                    const saved = await Store.addMedia({ file, alt: '', folder: folder || 'Tài liệu tải lên' });
                    ui.toast('Đã tải lên: ' + file.name, 'success');
                    resolve(saved && saved.url ? saved.url : null);
                } catch (err) {
                    ui.toast(err.message || 'Không tải được tệp.', { type: 'error', duration: 6000 });
                    resolve(null);
                }
            });
            input.click();
        });

        const fields = (item, categories) => {
            const v = item || {};
            if (kind === 'legal-documents') {
                return [
                    ['code', 'Số hiệu / mã văn bản', v.code || v.docNumber || '', 'text', true],
                    ['title', 'Tên văn bản', v.title || '', 'text', true],
                    ['docType', 'Loại văn bản', v.docType || v.doc_type || '', { select: categories.docTypes }, true],
                    ['legalField', 'Lĩnh vực pháp luật', v.legalField || v.legal_field || '', { select: categories.legalFields }, false],
                    ['issuer', 'Cơ quan ban hành', v.issuer || '', 'text', false],
                    ['issuedAt', 'Ngày ban hành', (v.issuedAt || v.issued_at || '').slice(0, 10), 'date', false],
                    ['effectiveAt', 'Ngày có hiệu lực', (v.effectiveAt || v.effective_at || '').slice(0, 10), 'date', false],
                    ['expiryAt', 'Ngày hết hiệu lực (nếu có)', (v.expiryAt || v.expiry_at || '').slice(0, 10), 'date', false],
                    ['effectStatus', 'Tình trạng hiệu lực', v.effectStatus || v.effect_status || 'in_effect', { select: EFFECT_STATUS }, false],
                    ['summary', 'Trích yếu nội dung', v.summary || '', 'textarea', false],
                    ['content', 'Nội dung văn bản', v.content || '', 'textarea', false],
                    ['fileUrl', 'Tệp đính kèm (PDF, DOC…)', v.fileUrl || v.file_url || '', { file: '.pdf,.doc,.docx' }, false],
                    ['status', 'Trạng thái công khai', (v.status || 'active') === 'inactive' ? 'inactive' : 'active',
                        { select: { active: 'Đang công khai', inactive: 'Ngừng công khai' } }, false],
                ];
            }
            if (kind === 'agencies') {
                return [
                    ['name', 'Tên cơ quan - đơn vị', v.name || '', 'text', true],
                    ['shortName', 'Tên viết tắt', v.shortName || v.short_name || '', 'text', false],
                    ['slug', 'Đường dẫn (slug)', v.slug || '', 'text', false],
                    ['roleType', 'Loại hình cơ quan', v.roleType || v.role_type || '', { select: categories.agencyTypes }, true],
                    ['managementLevel', 'Cấp quản lý', v.managementLevel || v.management_level || '', { select: categories.managementLevels }, false],
                    ['orgId', 'Liên kết đơn vị trong hệ thống', v.orgId || v.org_id || '', { orgSelect: true }, false],
                    ['address', 'Địa chỉ trụ sở', v.address || '', 'text', false],
                    ['phone', 'Điện thoại', v.phone || '', 'text', false],
                    ['email', 'Email', v.email || '', 'text', false],
                    ['website', 'Website', v.website || '', 'text', false],
                    ['headName', 'Người đứng đầu / đại diện', v.headName || v.head_name || '', 'text', false],
                    ['description', 'Giới thiệu', v.description || '', 'textarea', false],
                    ['functions', 'Chức năng, nhiệm vụ', v.functions || v.functionsText || v.functions_text || '', 'textarea', false],
                    ['structure', 'Cơ cấu tổ chức', v.structure || '', 'textarea', false],
                    ['logo', 'Logo / ảnh đại diện', v.logo || v.logoUrl || v.logo_url || '', { image: true }, false],
                    ['status', 'Trạng thái công khai', (v.status || 'active') === 'inactive' ? 'inactive' : 'active',
                        { select: { active: 'Đang công khai', inactive: 'Ngừng công khai' } }, false],
                ];
            }
            if (kind === 'events') {
                return [
                    ['title', 'Tên sự kiện', v.title || '', 'text', true],
                    ['slug', 'Đường dẫn (slug)', v.slug || '', 'text', false],
                    ['eventType', 'Loại sự kiện', v.eventType || v.event_type || v.category || '', 'text', false],
                    ['startAt', 'Thời gian bắt đầu', toLocalInput(v.startAt || v.start_at || v.start || ''), 'datetime', false],
                    ['endAt', 'Thời gian kết thúc', toLocalInput(v.endAt || v.end_at || v.end || ''), 'datetime', false],
                    ['location', 'Địa điểm tổ chức', v.location || '', 'text', false],
                    ['organizer', 'Đơn vị tổ chức', v.organizer || '', 'text', false],
                    ['coOrganizer', 'Đơn vị phối hợp', v.coOrganizer || v.co_organizer || '', 'text', false],
                    ['summary', 'Mô tả', v.summary || '', 'textarea', false],
                    ['content', 'Nội dung chi tiết', v.content || '', 'textarea', false],
                    ['imageUrl', 'Ảnh sự kiện', v.imageUrl || v.image_url || v.image || '', { image: true }, false],
                    ['status', 'Trạng thái sự kiện', v.status || 'upcoming',
                        { select: Object.keys(categories.eventStatuses || {}).length ? categories.eventStatuses : EVENT_STATUS }, false],
                    ['publishStatus', 'Trạng thái xuất bản', v.publishStatus || v.publish_status || 'published',
                        { select: PUBLISH_STATUS }, false],
                ];
            }
            if (kind === 'support-facilities') {
                const services = Array.isArray(v.services) ? v.services.join(', ') : (v.services || '');
                return [
                    ['name', 'Tên cơ sở / điểm tư vấn', v.name || '', 'text', true],
                    ['code', 'Mã định danh', v.code || '', 'text', false],
                    ['type', 'Loại hình cơ sở', v.type || '', { select: categories.facilityTypes }, true],
                    ['orgId', 'Đơn vị quản lý trực tiếp', v.orgId || v.org_id || '', { orgSelect: true }, false],
                    ['ward', 'Phường / xã', v.ward || '', 'text', false],
                    ['address', 'Địa chỉ cụ thể', v.address || '', 'text', false],
                    ['latitude', 'Vĩ độ (latitude)', v.latitude != null ? String(v.latitude) : '', 'text', false],
                    ['longitude', 'Kinh độ (longitude)', v.longitude != null ? String(v.longitude) : '', 'text', false],
                    ['phone', 'Số điện thoại', v.phone || '', 'text', false],
                    ['email', 'Email', v.email || '', 'text', false],
                    ['website', 'Website', v.website || '', 'text', false],
                    ['hours', 'Thời gian hoạt động', v.hours || '', 'text', false],
                    ['contactPerson', 'Bộ phận tiếp nhận liên hệ', v.contactPerson || v.contact_person || '', 'text', false],
                    ['services', 'Dịch vụ cung cấp (phân cách bằng dấu phẩy)', services, 'textarea', false],
                    ['audience', 'Đối tượng tiếp nhận', v.audience || '', 'text', false],
                    ['scope', 'Phạm vi hỗ trợ', v.scope || '', 'text', false],
                    ['conditions', 'Điều kiện tiếp nhận', v.conditions || '', 'textarea', false],
                    ['procedures', 'Thủ tục / hướng dẫn liên hệ', v.procedures || '', 'textarea', false],
                    ['costNote', 'Thông tin chi phí (nếu được xác minh)', v.costNote || v.cost_note || '', 'text', false],
                    ['description', 'Mô tả / giới thiệu', v.description || '', 'textarea', false],
                    ['imageUrl', 'Hình ảnh cơ sở', v.image || v.imageUrl || v.image_url || '', { image: true }, false],
                    ['source', 'Nguồn thông tin', v.source || '', 'text', false],
                    ['verifiedAt', 'Ngày xác minh gần nhất', (v.verifiedAt || v.verified_at || '').slice(0, 10), 'date', false],
                    ['status', 'Trạng thái hoạt động', (v.status || 'active') === 'inactive' ? 'inactive' : 'active',
                        { select: { active: 'Đang hoạt động', inactive: 'Ngừng hoạt động' } }, false],
                    ['publishStatus', 'Trạng thái kiểm duyệt / công khai', v.publishStatus || v.publish_status || 'published',
                        { select: { pending: 'Chờ kiểm duyệt', published: 'Đã công khai', rejected: 'Không công khai' } }, false],
                ];
            }
            return [
                ['key', 'Mã kỳ số liệu', v.periodKey || v.period_key || v.key || '', 'text', true],
                ['label', 'Tên kỳ số liệu', v.label || '', 'text', true],
                ['scope', 'Phạm vi', v.scope || '', 'text', false],
                ['sourceType', 'Loại số liệu', v.sourceType || v.source_type || 'reported', { select: { reported: 'Đã báo cáo', verified: 'Đã phê duyệt' } }, false],
                ['note', 'Ghi chú', v.note || '', 'textarea', false],
            ];
        };

        /** Nạp danh sách đơn vị quản lý từ nguồn dùng chung của Workspace. */
        const loadOrganizationOptions = async (select, currentValue) => {
            const help = select.closest('.cms-field')?.querySelector('[data-org-help]');
            const orgs = await window.PortalAPI.get('/api/shared/organizations');
            const list = Array.isArray(orgs) ? orgs.slice().sort((a, b) => util.compare(a.name, b.name)) : [];
            select.innerHTML = '<option value="">— Chọn đơn vị quản lý —</option>' + list.map((o) =>
                `<option value="${util.escape(o.id)}">${util.escape(o.name)}</option>`).join('');
            if (currentValue) select.value = currentValue;
            if (help) help.textContent = list.length
                ? 'Danh sách đơn vị được quản lý trong Workspace.'
                : 'Chưa có đơn vị. Hãy tạo đơn vị trong Workspace trước khi liên kết.';
        };

        /** Chuyển ISO sang giá trị cho <input type="datetime-local"> */
        const toLocalInput = (value) => {
            if (!value) return '';
            const d = new Date(value);
            if (isNaN(d)) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const fieldHtml = ([key, label, value, type, required]) => {
            const req = required ? ' required' : '';
            const labelHtml = util.escape(label) + (required ? ' *' : '');
            const id = 'catalog-' + key;

            if (type === 'textarea') {
                return `<div class="cms-field cms-u-mb-md"><label class="cms-label" for="${id}">${labelHtml}</label>
                    <textarea class="cms-textarea" id="${id}" rows="4"${req}>${util.escape(value)}</textarea></div>`;
            }

            /*
             * Chọn đơn vị quản lý trong hệ thống (khóa ngoại tới `organizations`).
             * Danh sách do máy chủ cung cấp; ô trống cho phép hồ sơ chưa gắn đơn vị.
             */
            if (type && typeof type === 'object' && type.orgSelect) {
                return `<div class="cms-field cms-u-mb-md"><label class="cms-label" for="${id}">${labelHtml}</label>
                    <select class="cms-select" id="${id}"${req} data-org-select>
                        <option value="">— Chưa gắn đơn vị trong hệ thống —</option>
                    </select>
                    <p class="cms-help" data-org-help>Đang tải danh sách đơn vị…</p></div>`;
            }

            /* Danh sách lựa chọn: tránh gõ tay sai chính tả/khóa */
            if (type && typeof type === 'object' && type.select) {
                const choices = Array.isArray(type.select)
                    ? type.select
                    : Object.entries(type.select).map(([val, text]) => ({ value: val, label: text }));
                const options = (Array.isArray(type.select)
                    ? [`<option value="">${choices.length ? '— Chọn danh mục —' : '— Chưa có danh mục —'}</option>`]
                    : []).concat(choices.map((choice) =>
                    `<option value="${util.escape(choice.value)}"${choice.value === value ? ' selected' : ''}${choice.disabled ? ' disabled' : ''}>${util.escape(choice.label)}</option>`)).join('');
                return `<div class="cms-field cms-u-mb-md"><label class="cms-label" for="${id}">${labelHtml}</label>
                    <select class="cms-select" id="${id}"${req}>${options}</select></div>`;
            }

            /* Upload ảnh: có xem trước + nút đổi ảnh + nút xoá ảnh */
            if (type && typeof type === 'object' && type.image) {
                return `<div class="cms-field cms-u-mb-md"><label class="cms-label" for="${id}">${labelHtml}</label>
                    <div class="catalog-upload" data-upload-for="${key}">
                        <div class="catalog-upload__preview" id="${id}-preview">
                            ${value ? `<img src="${util.escape(value)}" alt="Xem trước ${util.escape(label)}">` : '<span class="catalog-upload__empty">Chưa có ảnh</span>'}
                        </div>
                        <div class="catalog-upload__actions">
                            <button type="button" class="cms-btn cms-btn--sm" data-upload-pick="${key}" data-accept="image/*">
                                <i class="fa-solid fa-upload"></i> ${value ? 'Đổi ảnh' : 'Tải ảnh lên'}</button>
                            <button type="button" class="cms-btn cms-btn--sm cms-btn--ghost" data-upload-clear="${key}">Xoá</button>
                        </div>
                        <input type="text" class="cms-input cms-u-mt-sm" id="${id}" value="${util.escape(value)}"
                            placeholder="Hoặc dán đường dẫn ảnh (VD: /uploads/ten-anh.jpg)">
                    </div></div>`;
            }

            /* Upload tệp đính kèm */
            if (type && typeof type === 'object' && type.file) {
                const name = value ? String(value).split('/').pop() : '';
                return `<div class="cms-field cms-u-mb-md"><label class="cms-label" for="${id}">${labelHtml}</label>
                    <div class="catalog-upload" data-upload-for="${key}">
                        <div class="catalog-upload__file" id="${id}-file">
                            <i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>
                            <span>${value ? util.escape(name) : 'Chưa có tệp đính kèm'}</span>
                        </div>
                        <div class="catalog-upload__actions">
                            <button type="button" class="cms-btn cms-btn--sm" data-upload-pick="${key}" data-accept="${type.file}">
                                <i class="fa-solid fa-upload"></i> ${value ? 'Đổi tệp' : 'Tải tệp lên'}</button>
                            ${value ? `<a class="cms-btn cms-btn--sm cms-btn--ghost" href="${util.escape(value)}" target="_blank" rel="noopener">Xem</a>` : ''}
                            <button type="button" class="cms-btn cms-btn--sm cms-btn--ghost" data-upload-clear="${key}">Xoá</button>
                        </div>
                        <input type="text" class="cms-input cms-u-mt-sm" id="${id}" value="${util.escape(value)}"
                            placeholder="Hoặc dán đường dẫn tệp (VD: /uploads/van-ban.pdf)">
                    </div></div>`;
            }

            const inputType = type === 'datetime' ? 'datetime-local' : type;
            return `<div class="cms-field cms-u-mb-md"><label class="cms-label" for="${id}">${labelHtml}</label>
                <input type="${inputType}" class="cms-input" id="${id}" value="${util.escape(value)}"${req}></div>`;
        };

        const openForm = async (item) => {
            const values = {
                docTypes: [], legalFields: [], agencyTypes: [], managementLevels: [], facilityTypes: [], eventStatuses: {},
            };
            try {
                if (kind === 'legal-documents') {
                    [values.docTypes, values.legalFields] = await Promise.all([
                        getCategoryOptions('doc_type', item && (item.docType || item.doc_type)),
                        getCategoryOptions('legal_field', item && (item.legalField || item.legal_field)),
                    ]);
                } else if (kind === 'agencies') {
                    [values.agencyTypes, values.managementLevels] = await Promise.all([
                        getCategoryOptions('agency_type', item && (item.roleType || item.role_type)),
                        getCategoryOptions('management_level', item && (item.managementLevel || item.management_level)),
                    ]);
                } else if (kind === 'support-facilities') {
                    values.facilityTypes = await getCategoryOptions('facility_type', item && item.type);
                } else if (kind === 'events') {
                    const statuses = await getCategoryOptions('event_status', item && item.status);
                    values.eventStatuses = statuses.reduce((acc, option) => {
                        acc[option.value] = option.label;
                        return acc;
                    }, {});
                }
            } catch (err) {
                ui.toast(err.message || 'Không tải được danh mục lựa chọn.', 'error');
                return;
            }
            const dlg = ui.modal({
                title: item ? 'Chỉnh sửa ' + TITLES[kind] : 'Thêm ' + TITLES[kind],
                size: 'lg',
                content: '<form id="public-catalog-form">' + fields(item, values).map(fieldHtml).join('') +
                    (kind === 'statistics' ? '<div class="cms-field cms-u-mb-md"><label class="cms-label" for="catalog-items">Chỉ số (mỗi dòng: tên|giá trị|đơn vị)</label><textarea class="cms-textarea" id="catalog-items" rows="5"></textarea></div>' : '') +
                    '</form>',
            });
            const form = dlg.query('#public-catalog-form');

            /* Ô chọn đơn vị quản lý: danh sách thật từ `organizations` */
            const orgSelect = form.querySelector('[data-org-select]');
            if (orgSelect) {
                try {
                    await loadOrganizationOptions(orgSelect, (item && (item.orgId || item.org_id)) || '');
                } catch (err) {
                    orgSelect.disabled = true;
                    const help = orgSelect.closest('.cms-field')?.querySelector('[data-org-help]');
                    if (help) help.textContent = 'Không tải được danh sách đơn vị quản lý.';
                    ui.toast(err.message || 'Không tải được danh sách đơn vị quản lý.', 'error');
                }
            }

            /* Upload ảnh / tệp ngay trong form (không phải dán đường dẫn thủ công) */
            form.addEventListener('click', async (e) => {
                const pick = e.target.closest('[data-upload-pick]');
                if (pick) {
                    const key = pick.dataset.uploadPick;
                    const accept = pick.dataset.accept || '';
                    const isImage = accept.indexOf('image/') === 0;
                    const url = await pickAndUpload(accept, isImage ? 'Hình ảnh hoạt động' : 'Tài liệu tải lên');
                    if (!url) return;
                    const input = dlg.query('#catalog-' + key);
                    if (input) input.value = url;
                    const preview = dlg.query('#catalog-' + key + '-preview');
                    if (preview) preview.innerHTML = `<img src="${util.escape(url)}" alt="Xem trước">`;
                    const fileBox = dlg.query('#catalog-' + key + '-file');
                    if (fileBox) {
                        fileBox.innerHTML = `<i class="fa-solid fa-file-circle-check" aria-hidden="true"></i><span>${util.escape(url.split('/').pop())}</span>`;
                    }
                    pick.innerHTML = '<i class="fa-solid fa-upload"></i> Đổi ' + (isImage ? 'ảnh' : 'tệp');
                    return;
                }
                const clear = e.target.closest('[data-upload-clear]');
                if (clear) {
                    const key = clear.dataset.uploadClear;
                    const input = dlg.query('#catalog-' + key);
                    if (input) input.value = '';
                    const preview = dlg.query('#catalog-' + key + '-preview');
                    if (preview) preview.innerHTML = '<span class="catalog-upload__empty">Chưa có ảnh</span>';
                    const fileBox = dlg.query('#catalog-' + key + '-file');
                    if (fileBox) {
                        fileBox.innerHTML = '<i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i><span>Chưa có tệp đính kèm</span>';
                    }
                }
            });

            if (item && kind === 'statistics' && Array.isArray(item.items)) {
                dlg.query('#catalog-items').value = item.items.map((i) => `${i.label}|${i.value}|${i.unit || ''}`).join('\n');
            }
            dlg.footer.innerHTML = '<button type="button" class="cms-btn" data-modal-close>Hủy</button><button type="button" class="cms-btn cms-btn--primary" id="catalog-save">Lưu</button>';
            dlg.footer.querySelector('#catalog-save').addEventListener('click', async () => {
                const payload = { id: item ? item.id : null };
                fields(item, values).forEach(([key]) => {
                    const el = dlg.query('#catalog-' + key);
                    if (el) payload[key] = el.value.trim();
                });
                if (kind === 'statistics') {
                    payload.items = (dlg.query('#catalog-items').value || '').split(/\r?\n/).map((line, idx) => {
                        const [label, value, unit] = line.split('|').map((x) => x.trim());
                        return label ? { key: `metric-${idx + 1}`, label, value: Number(value) || 0, unit: unit || '' } : null;
                    }).filter(Boolean);
                }
                try {
                    await Store.saveCatalog(kind, payload);
                    dlg.close();
                    ui.toast('Đã lưu dữ liệu công khai.', 'success');
                    await render();
                } catch (err) {
                    ui.toast(err.message || 'Không lưu được dữ liệu.', 'error');
                }
            });
        };

        const render = async () => {
            const title = document.getElementById('public-catalog-title');
            const host = document.getElementById('public-catalog-content');
            if (title) title.textContent = TITLES[kind];
            if (host) host.innerHTML = '<div class="cms-state">Đang tải dữ liệu…</div>';
            try {
                rows = await Store.listCatalog(kind);
                if (!Array.isArray(rows)) rows = [];
                if (!host) return;
                if (!rows.length) {
                    host.innerHTML = ui.emptyState({ icon: 'fa-folder-open', title: 'Chưa có dữ liệu', text: 'Nhấn “Thêm mới” để nhập bản ghi đầu tiên.' });
                    return;
                }
                host.innerHTML = `<div class="cms-table-wrap"><table class="cms-table cms-table--stack"><thead><tr><th>Ảnh</th><th>Tên / tiêu đề</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>` +
                    rows.map((r) => {
                        const name = r.title || r.name || r.label || r.code || r.id;
                        const detail = r.summary || r.description || r.address || r.location || r.scope || r.category || '—';
                        const status = r.status || (r.sourceType ? r.sourceType : '');
                        const label = STATUS_LABEL[status] || status || '—';
                        const thumb = r.image || r.imageUrl || r.logo || (r.thumbnail || '');
                        const thumbHtml = thumb
                            ? `<img class="catalog-thumb" src="${util.escape(thumb)}" alt="" loading="lazy">`
                            : '<span class="catalog-thumb catalog-thumb--none"><i class="fa-regular fa-image" aria-hidden="true"></i></span>';
                        return `<tr>
                            <td data-label="Ảnh">${thumbHtml}</td>
                            <td data-label="Tên / tiêu đề"><strong>${util.escape(name)}</strong></td>
                            <td data-label="Thông tin">${util.escape(detail)}</td>
                            <td data-label="Trạng thái"><span class="cms-badge cms-badge--${status === 'active' || status === 'verified' ? 'success' : 'muted'}">${util.escape(label)}</span></td>
                            <td data-label="Thao tác"><div class="cms-u-flex cms-u-gap-sm">
                                <button type="button" class="cms-btn cms-btn--sm" data-catalog-edit="${util.escape(r.id)}"><i class="fa-solid fa-pen"></i> Sửa</button>
                                <button type="button" class="cms-btn cms-btn--sm cms-btn--danger" data-catalog-delete="${util.escape(r.id)}"><i class="fa-solid fa-trash"></i> Xóa</button>
                            </div></td></tr>`;
                    }).join('') + '</tbody></table></div>';
            } catch (err) {
                if (host) host.innerHTML = ui.emptyState({ icon: 'fa-triangle-exclamation', tone: 'danger', title: 'Không tải được dữ liệu', text: err.message || '' });
            }
        };

        const init = () => {
            if (!document.getElementById('public-catalog-content')) return;
            document.querySelectorAll('[data-kind]').forEach((btn) => btn.addEventListener('click', async () => {
                kind = btn.dataset.kind;
                document.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('is-active', b === btn));
                await render();
            }));
            const create = document.getElementById('public-catalog-create');
            if (create) create.addEventListener('click', () => {
                if (!Store.can('catalog.manage')) return ui.toast('Vai trò của bạn không có quyền quản lý dữ liệu công khai.', 'error');
                openForm(null);
            });
            const host = document.getElementById('public-catalog-content');
            if (host) host.addEventListener('click', async (e) => {
                const edit = e.target.closest('[data-catalog-edit]');
                if (edit) {
                    if (!Store.can('catalog.manage')) return ui.toast('Vai trò của bạn không có quyền quản lý dữ liệu công khai.', 'error');
                    openForm(rows.find((r) => r.id === edit.dataset.catalogEdit));
                    return;
                }
                const del = e.target.closest('[data-catalog-delete]');
                if (del) {
                    if (!Store.can('catalog.manage')) return ui.toast('Vai trò của bạn không có quyền quản lý dữ liệu công khai.', 'error');
                    const ok = await ui.confirm({ tone: 'danger', heading: 'Xóa bản ghi công khai?', message: 'Bản ghi sẽ biến mất khỏi Cổng thông tin công khai.', confirmText: 'Xóa' });
                    if (!ok) return;
                    try { await Store.deleteCatalog(kind, del.dataset.catalogDelete); ui.toast('Đã xóa bản ghi.', 'success'); await render(); }
                    catch (err) { ui.toast(err.message || 'Không xóa được bản ghi.', 'error'); }
                }
            });
            render();
        };

        return { init };
    })();

    const Workflow = (function () {
        const params = new URLSearchParams(window.location.search);
        const state = {
            tab: params.get('tab') || 'pending',
            selectedId: params.get('id') || null,
            q: ''
        };
        const el = {};

        const TABS = {
            pending: { label: 'Chờ duyệt', statuses: ['pending'] },
            approved: { label: 'Đã duyệt', statuses: ['approved'] },
            revision: { label: 'Cần chỉnh sửa', statuses: ['revision', 'rejected'] },
            published: { label: 'Đã xuất bản', statuses: ['published'] }
        };

        const listFor = (tab) => {
            const conf = TABS[tab] || TABS.pending;
            const q = util.normalize(state.q);
            return Store.contents()
                .filter((a) => conf.statuses.indexOf(a.status) !== -1)
                .filter((a) => !q || util.normalize(a.title + ' ' + a.authorName).indexOf(q) !== -1)
                .sort((a, b) => {
                    const da = util.parseDate(a.submittedAt || a.updatedAt);
                    const db = util.parseDate(b.submittedAt || b.updatedAt);
                    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
                });
        };

        const currentRecord = () => {
            const list = listFor(state.tab);
            const id = state.selectedId || (list[0] && list[0].id);
            if (!id) return null;
            const workflow = Store.workflow() || {};
            const detailed = ['pending', 'approved', 'rejected', 'published']
                .reduce((found, key) => found || (workflow[key] || []).find((item) => item.id === id), null);
            return detailed || Store.contentById(id) || list.find((item) => item.id === id) || null;
        };

        /* ---------- Lịch sử phê duyệt ---------- */

        const historyFor = (record) => {
            const items = [{
                tone: 'info', icon: 'fa-pen',
                title: 'Tạo nội dung · ' + record.authorName,
                time: record.createdAt,
                note: 'Khởi tạo bài viết ở trạng thái bản nháp.'
            }];

            const map = {
                update: { icon: 'fa-pen', tone: 'info', title: 'Chỉnh sửa nội dung' },
                submit: { icon: 'fa-paper-plane', tone: 'warning', title: 'Gửi duyệt' },
                review: { icon: 'fa-stamp', tone: 'success', title: 'Chấp thuận nội dung' },
                publish: { icon: 'fa-rocket', tone: 'success', title: 'Xuất bản' }
            };

            Store.logs()
                .filter((l) => l.targetId === record.id && map[l.action])
                .sort((a, b) => new Date(a.at) - new Date(b.at))
                .forEach((l) => {
                    const u = Store.userById(l.userId);
                    const meta = map[l.action];
                    items.push({
                        tone: l.action === 'review' && l.status === 'failed' ? 'danger' : meta.tone,
                        icon: l.action === 'review' && l.status === 'failed' ? 'fa-circle-xmark' : meta.icon,
                        title: (l.action === 'review' && l.status === 'failed' ? 'Từ chối / yêu cầu chỉnh sửa' : meta.title) +
                            ' · ' + (u ? u.name : 'Hệ thống'),
                        time: l.at,
                        note: l.detail
                    });
                });

            if (record.reviewedAt) {
                const reviewer = Store.userById(record.reviewedBy);
                items.push({
                    tone: record.status === 'rejected' ? 'danger' : 'success',
                    icon: record.status === 'rejected' ? 'fa-circle-xmark' : 'fa-check',
                    title: (record.status === 'rejected' ? 'Từ chối' : 'Kiểm duyệt') + ' · ' +
                        (reviewer ? reviewer.name : 'Kiểm duyệt viên'),
                    time: record.reviewedAt,
                    note: record.reviewNote || ''
                });
            }
            if (record.publishedAt) {
                items.push({
                    tone: 'success', icon: 'fa-rocket',
                    title: 'Phát hành trên Cổng thông tin',
                    time: record.publishedAt,
                    note: 'Nội dung hiển thị công khai.'
                });
            }

            /* Bỏ mốc trùng thời điểm */
            const seen = {};
            return items.filter((i) => {
                const key = i.time + '|' + i.title;
                if (seen[key]) return false;
                seen[key] = true;
                return true;
            }).sort((a, b) => new Date(a.time) - new Date(b.time));
        };

        /* ---------- Render ---------- */

        const renderTabs = () => {
            document.querySelectorAll('[data-wf-tab]').forEach((btn) => {
                const tab = btn.dataset.wfTab;
                const count = listFor(tab).length;
                const countEl = btn.querySelector('.cms-tab__count');
                if (countEl) countEl.textContent = count;
                const on = tab === state.tab;
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-selected', String(on));
            });
        };

        const renderQueue = () => {
            if (!el.queue) return;
            const list = listFor(state.tab);
            if (!list.length) {
                el.queue.innerHTML = ui.emptyState({
                    icon: 'fa-inbox',
                    title: 'Không có nội dung ' + (TABS[state.tab] ? TABS[state.tab].label.toLowerCase() : ''),
                    text: 'Danh sách cập nhật khi biên tập viên gửi bài hoặc kiểm duyệt viên xử lý nội dung.'
                });
                return;
            }
            el.queue.innerHTML = list.map((a) => {
                return '<article class="cms-queue-item' + (a.id === state.selectedId ? ' is-active' : '') +
                    '" data-id="' + util.escape(a.id) + '" tabindex="0" role="button" aria-label="Xem chi tiết ' + util.escape(a.title) + '">' +
                    '<span class="cms-queue-item__thumb"><img src="' + util.escape(a.thumbnail || '../../assets/images/1.jpg') + '" alt="" loading="lazy"></span>' +
                    '<div class="cms-queue-item__body">' +
                    '<span class="cms-queue-item__title">' + util.escape(a.title) + '</span>' +
                    '<span class="cms-queue-item__meta">' + ui.badge(a.status) +
                    '<span><i class="fa-regular fa-user" aria-hidden="true"></i> ' + util.escape(a.authorName) + '</span>' +
                    '<span><i class="fa-regular fa-clock" aria-hidden="true"></i> ' +
                    util.escape(util.timeAgo(a.submittedAt || a.updatedAt)) + '</span>' +
                    '</span></div></article>';
            }).join('');
        };

        const renderActions = (record, canReview, canPublish) => {
            const readonly = '<p class="cms-u-text-sm cms-u-text-muted"><i class="fa-solid fa-lock" aria-hidden="true"></i> ' +
                'Vai trò hiện tại không có quyền kiểm duyệt hoặc xuất bản nội dung này.</p>';

            if (record.status === 'pending') {
                if (!canReview) return readonly;
                return '<div class="cms-u-flex cms-u-gap-sm cms-u-wrap">' +
                    '<button type="button" class="cms-btn cms-btn--success" data-wf-action="approve" style="flex:1 1 120px">' +
                    '<i class="fa-solid fa-check" aria-hidden="true"></i> Chấp thuận</button>' +
                    '<button type="button" class="cms-btn cms-btn--danger" data-wf-action="reject" style="flex:1 1 120px">' +
                    '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Từ chối</button>' +
                    '<button type="button" class="cms-btn cms-btn--block" data-wf-action="revise">' +
                    '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Yêu cầu chỉnh sửa</button></div>';
            }
            if (record.status === 'approved') {
                if (!canPublish) return readonly;
                return '<button type="button" class="cms-btn cms-btn--primary" data-wf-action="publish">' +
                    '<i class="fa-solid fa-rocket" aria-hidden="true"></i> Xuất bản lên Cổng thông tin</button>';
            }
            if (record.status === 'rejected' || record.status === 'revision') {
                return '<a class="cms-btn cms-btn--primary" href="content-editor.html?id=' + encodeURIComponent(record.id) + '">' +
                    '<i class="fa-solid fa-pen" aria-hidden="true"></i> Chỉnh sửa nội dung</a>';
            }
            if (record.status === 'published') {
                return '<a class="cms-btn cms-btn--ghost" href="../../index.html" target="_blank" rel="noopener">' +
                    '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Xem Cổng thông tin</a>';
            }
            return '';
        };

        const renderDetail = () => {
            if (!el.detail) return;
            const record = currentRecord();
            if (!record) {
                el.detail.innerHTML = '<div class="cms-card"><div class="cms-card__body">' + ui.emptyState({
                    icon: 'fa-code-branch',
                    title: 'Chọn nội dung để xem chi tiết',
                    text: 'Thông tin người gửi, người kiểm duyệt, thời gian xử lý và lịch sử phê duyệt sẽ hiển thị tại đây.'
                }) + '</div></div>';
                return;
            }

            state.selectedId = record.id;
            const submitter = Store.userById(record.submittedBy || record.authorId);
            const reviewer = Store.userById(record.reviewedBy);
            const user = Store.currentUser();
            const canReview = Store.can('content.review');
            const canPublish = Store.can('content.publish');
            const currentStep = (STATUS[record.status] || { step: 0 }).step;
            const steps = [
                { label: 'Soạn thảo' },
                { label: 'Bản nháp' },
                { label: 'Chờ duyệt' },
                { label: 'Kiểm duyệt' },
                { label: 'Xuất bản' }
            ];
            const history = historyFor(record);

            let stepHtml = '';
            steps.forEach((s, i) => {
                const cls = i < currentStep ? 'is-done' : i === currentStep ? 'is-current' : '';
                stepHtml += '<li class="cms-workflow-step ' + cls + '">' +
                    '<span class="cms-workflow-step__icon">' +
                    (i < currentStep ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : (i + 1)) + '</span>' +
                    '<span class="cms-workflow-step__label">' + util.escape(s.label) + '</span></li>';
            });

            let historyHtml = '';
            history.forEach((h) => {
                historyHtml += '<li class="cms-timeline__item">' +
                    '<span class="cms-timeline__dot cms-timeline__dot--' + h.tone + '">' +
                    '<i class="fa-solid ' + h.icon + '" aria-hidden="true"></i></span>' +
                    '<div class="cms-timeline__body">' +
                    '<span class="cms-timeline__title">' + util.escape(h.title) + '</span>' +
                    '<span class="cms-timeline__time">' + util.escape(util.formatDateTime(h.time)) + '</span>' +
                    (h.note ? '<p class="cms-timeline__note">' + util.escape(h.note) + '</p>' : '') +
                    '</div></li>';
            });

            el.detail.innerHTML =
                '<div class="cms-card">' +
                '<div class="cms-card__head"><div>' +
                '<h2 class="cms-card__title"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> Chi tiết nội dung</h2>' +
                '<p class="cms-card__subtitle">' + util.escape(Store.categoryName(record.categoryId)) + '</p></div>' +
                ui.badge(record.status) + '</div>' +
                '<div class="cms-card__body">' +
                '<h3 style="font-size:var(--fs-md);font-weight:700;line-height:1.45;color:var(--text-heading);margin-bottom:.5rem">' +
                util.escape(record.title) + '</h3>' +
                '<p class="cms-u-text-sm cms-u-text-muted cms-u-mb-lg">' + util.escape(record.excerpt) + '</p>' +
                '<ol class="cms-workflow-steps" style="margin-bottom:1rem">' + stepHtml + '</ol>' +
                '<div class="cms-u-flex cms-u-gap-sm cms-u-wrap">' +
                '<a class="cms-btn cms-btn--sm cms-btn--ghost" href="content-editor.html?id=' + encodeURIComponent(record.id) + '">' +
                '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Mở trình biên tập</a>' +
                '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost" data-wf-action="preview">' +
                '<i class="fa-solid fa-eye" aria-hidden="true"></i> Xem trước</button></div>' +
                '</div></div>' +

                '<div class="cms-card">' +
                '<div class="cms-card__head"><h2 class="cms-card__title">' +
                '<i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Thông tin xử lý</h2></div>' +
                '<div class="cms-review-meta">' +
                '<div class="cms-review-meta__item"><span class="cms-review-meta__label">Người gửi</span>' +
                '<span class="cms-review-meta__value">' + util.escape(submitter ? submitter.name : record.authorName) + '</span></div>' +
                '<div class="cms-review-meta__item"><span class="cms-review-meta__label">Thời gian gửi</span>' +
                '<span class="cms-review-meta__value">' + (record.submittedAt ? util.escape(util.formatDateTime(record.submittedAt)) : '—') + '</span></div>' +
                '<div class="cms-review-meta__item"><span class="cms-review-meta__label">Người kiểm duyệt</span>' +
                '<span class="cms-review-meta__value">' + (reviewer ? util.escape(reviewer.name) : 'Chưa xử lý') + '</span></div>' +
                '<div class="cms-review-meta__item"><span class="cms-review-meta__label">Thời gian xử lý</span>' +
                '<span class="cms-review-meta__value">' + (record.reviewedAt ? util.escape(util.formatDateTime(record.reviewedAt)) : '—') + '</span></div>' +
                (record.reviewNote ? '<div class="cms-review-meta__item" style="grid-column:1/-1">' +
                    '<span class="cms-review-meta__label">Lý do / Yêu cầu chỉnh sửa</span>' +
                    '<span class="cms-review-meta__value">' + util.escape(record.reviewNote) + '</span></div>' : '') +
                '</div>' +
                '<div class="cms-card__foot"><span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ' +
                'Vai trò hiện tại: <strong>' + util.escape(user ? roleLabel(user.role) : '—') + '</strong></span></div>' +
                '</div>' +

                '<div class="cms-card">' +
                '<div class="cms-card__head"><h2 class="cms-card__title">' +
                '<i class="fa-solid fa-timeline" aria-hidden="true"></i> Lịch sử phê duyệt</h2></div>' +
                '<div class="cms-card__body"><ol class="cms-timeline">' + historyHtml + '</ol></div>' +
                '<div class="cms-card__foot cms-u-flex-col" style="align-items:stretch">' +
                renderActions(record, canReview, canPublish) + '</div>' +
                '</div>';
        };

        /* ---------- Hành động ---------- */

        const askNote = (options) => new Promise((resolve) => {
            let settled = false;
            const finish = (v) => {
                if (settled) return;
                settled = true;
                resolve(v);
            };
            const dlg = ui.modal({
                title: options.title,
                subtitle: 'Ý kiến này được lưu vào lịch sử phê duyệt của nội dung.',
                content: '<div class="cms-field">' +
                    '<label class="cms-label" for="wf-note">' + util.escape(options.label) + ' <span class="cms-label__req">*</span></label>' +
                    '<textarea class="cms-textarea" id="wf-note" rows="4" placeholder="' + util.escape(options.placeholder || '') + '" data-autofocus></textarea>' +
                    '<span class="cms-error-text">Vui lòng nhập lý do để biên tập viên biết cần sửa gì.</span>' +
                    '</div>',
                footer: '<button type="button" class="cms-btn" data-modal-close>Hủy</button>' +
                    '<button type="button" class="cms-btn cms-btn--' + (options.tone || 'primary') + '" data-note-ok>' +
                    util.escape(options.confirmText) + '</button>'
            });
            const textarea = dlg.query('#wf-note');
            dlg.footer.querySelector('[data-note-ok]').addEventListener('click', () => {
                const value = textarea.value.trim();
                if (!value) {
                    textarea.classList.add('is-invalid');
                    const err = dlg.query('.cms-error-text');
                    if (err) err.classList.add('is-visible');
                    textarea.focus();
                    return;
                }
                dlg.close();
                finish(value);
            });
            dlg.el.querySelectorAll('[data-modal-close]').forEach((n) => {
                n.addEventListener('click', () => finish(null));
            });
        });

        const previewRecord = (record) => {
            ui.modal({
                title: 'Xem trước nội dung',
                subtitle: record.title,
                size: 'lg',
                content: '<article class="cms-preview">' +
                    '<span class="cms-preview__tag">' + util.escape(Store.categoryName(record.categoryId)) + '</span>' +
                    '<h2 class="cms-preview__title">' + util.escape(record.title) + '</h2>' +
                    '<div class="cms-preview__meta">' +
                    '<span><i class="fa-regular fa-user" aria-hidden="true"></i> ' + util.escape(record.authorName) + '</span>' +
                    '<span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' + util.escape(util.formatDate(record.createdAt)) + '</span>' +
                    '<span>' + ui.badge(record.status) + '</span></div>' +
                    (record.thumbnail ? '<img class="cms-preview__hero" src="' + util.escape(record.thumbnail) + '" alt="">' : '') +
                    '<div class="cms-preview__content">' + record.body + '</div></article>'
            });
        };

        const handleAction = (action) => {
            const record = currentRecord();
            if (!record) return;
            const user = Store.currentUser();
            const perms = user ? user.permissions : [];

            if (action === 'preview') {
                previewRecord(record);
                return;
            }

            if (action === 'approve') {
                if (perms.indexOf('content.review') === -1) {
                    ui.toast(CONFIG.labels.pagePermission, 'error');
                    return;
                }
                ui.confirm({
                    tone: 'primary',
                    heading: 'Chấp thuận nội dung này?',
                    message: 'Nội dung chuyển sang trạng thái “Đã duyệt” và chờ người có quyền xuất bản phát hành.',
                    confirmText: 'Chấp thuận'
                }).then(async (ok) => {
                    if (!ok) return;
                    try {
                        await Store.setStatus(record.id, 'approved', { note: 'Kiểm duyệt viên chấp thuận nội dung.' });
                        state.tab = 'approved';
                        refreshAll();
                        Shell.refresh();
                        ui.toast('Đã chấp thuận nội dung.', 'success');
                    } catch (err) {
                        ui.toast(err.message || 'Không duyệt được nội dung.', { type: 'error', duration: 6000 });
                    }
                });
                return;
            }

            if (action === 'reject' || action === 'revise') {
                if (perms.indexOf('content.review') === -1) {
                    ui.toast(CONFIG.labels.pagePermission, 'error');
                    return;
                }
                askNote({
                    title: action === 'reject' ? 'Từ chối nội dung' : 'Yêu cầu chỉnh sửa',
                    label: 'Lý do',
                    placeholder: 'Nêu rõ nội dung cần bổ sung hoặc chỉnh sửa...',
                    tone: 'danger',
                    confirmText: action === 'reject' ? 'Từ chối nội dung' : 'Gửi yêu cầu'
                }).then(async (note) => {
                    if (!note) return;
                    try {
                        await Store.setStatus(record.id, action === 'reject' ? 'rejected' : 'revision', { note: note });
                        refreshAll();
                        Shell.refresh();
                        ui.toast(action === 'reject' ? 'Đã từ chối nội dung.' : 'Đã gửi yêu cầu chỉnh sửa.', 'success');
                    } catch (err) {
                        ui.toast(err.message || 'Không cập nhật được nội dung.', { type: 'error', duration: 6000 });
                    }
                });
                return;
            }

            if (action === 'publish') {
                if (perms.indexOf('content.publish') === -1) {
                    ui.toast(CONFIG.labels.pagePermission, 'error');
                    return;
                }
                ui.confirm({
                    tone: 'primary',
                    heading: 'Xuất bản nội dung lên Cổng thông tin?',
                    message: 'Nội dung sẽ hiển thị công khai với người đọc trên website.',
                    detail: '<span class="cms-confirm__highlight">' + util.escape(record.title) + '</span>',
                    confirmText: 'Xuất bản'
                }).then(async (ok) => {
                    if (!ok) return;
                    try {
                        await Store.setStatus(record.id, 'published');
                        state.tab = 'published';
                        refreshAll();
                        Shell.refresh();
                        ui.toast('Đã xuất bản nội dung.', 'success');
                    } catch (err) {
                        ui.toast(err.message || 'Không xuất bản được nội dung.', { type: 'error', duration: 6000 });
                    }
                });
            }
        };

        const refreshAll = () => {
            renderTabs();
            renderQueue();
            renderDetail();
        };

        const bind = () => {
            document.querySelectorAll('[data-wf-tab]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    state.tab = btn.dataset.wfTab;
                    state.selectedId = null;
                    if (!TABS[state.tab]) state.tab = 'pending';
                    refreshAll();
                });
            });

            if (el.queue) {
                const pick = (target) => {
                    const item = target.closest('[data-id]');
                    if (!item) return;
                    state.selectedId = item.dataset.id;
                    renderQueue();
                    renderDetail();
                    if (window.innerWidth < 1200) {
                        const detail = document.getElementById('wf-detail');
                        if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                };
                el.queue.addEventListener('click', (e) => pick(e.target));
                el.queue.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick(e.target);
                    }
                });
            }

            if (el.detail) {
                el.detail.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-wf-action]');
                    if (btn) handleAction(btn.dataset.wfAction);
                });
            }

            const search = document.getElementById('wf-q');
            if (search) {
                search.addEventListener('input', util.debounce(() => {
                    state.q = search.value;
                    renderQueue();
                }, 220));
            }
        };

        const init = () => {
            if (!document.getElementById('wf-queue')) return;
            el.queue = document.getElementById('wf-queue');
            el.detail = document.getElementById('wf-detail');
            if (!TABS[state.tab]) state.tab = 'pending';
            bind();
            refreshAll();
        };

        return { init };
    })();

    /* ==========================================================================
       14. TRANG NHẬT KÝ HOẠT ĐỘNG
       ========================================================================== */

    const ActivityLog = (function () {
        const state = { q: '', user: '', action: '', status: '', from: '', to: '', page: 1, pageSize: 15 };
        const el = {};

        const ACTION_META = {
            login: { label: 'Đăng nhập', icon: 'fa-right-to-bracket' },
            logout: { label: 'Đăng xuất', icon: 'fa-right-from-bracket' },
            create: { label: 'Tạo mới', icon: 'fa-plus' },
            update: { label: 'Chỉnh sửa', icon: 'fa-pen' },
            delete: { label: 'Xóa', icon: 'fa-trash-can' },
            upload: { label: 'Tải tài liệu', icon: 'fa-upload' },
            review: { label: 'Duyệt nội dung', icon: 'fa-stamp' },
            publish: { label: 'Xuất bản', icon: 'fa-rocket' },
            submit: { label: 'Gửi duyệt', icon: 'fa-paper-plane' },
            archive: { label: 'Lưu trữ', icon: 'fa-box-archive' }
        };

        const STATUS_META = {
            success: { label: 'Thành công', tone: 'published' },
            warning: { label: 'Cảnh báo', tone: 'pending' },
            failed: { label: 'Thất bại', tone: 'rejected' }
        };

        const filtered = () => {
            const q = util.normalize(state.q);
            const from = state.from ? util.parseDate(state.from) : null;
            const to = state.to ? util.parseDate(state.to) : null;
            return Store.logs().filter((l) => {
                if (state.user && l.userId !== state.user) return false;
                if (state.action && l.action !== state.action) return false;
                if (state.status && l.status !== state.status) return false;
                const d = util.parseDate(l.at);
                if (from && d && d < from) return false;
                if (to && d && d.getTime() > to.getTime() + 86399000) return false;
                if (!q) return true;
                const u = Store.userById(l.userId);
                return util.normalize(l.targetName + ' ' + l.detail + ' ' + l.targetType + ' ' + (u ? u.name : '')).indexOf(q) !== -1;
            }).sort((a, b) => new Date(b.at) - new Date(a.at));
        };

        const renderSummary = () => {
            const host = document.getElementById('log-summary');
            if (!host) return;
            const logs = Store.logs();
            const today = new Date();
            const todayCount = logs.filter((l) => {
                const d = util.parseDate(l.at);
                return d && d.toDateString() === today.toDateString();
            }).length;
            const attention = logs.filter((l) => l.status !== 'success').length;
            const people = {};
            logs.forEach((l) => { people[l.userId] = true; });

            const cards = [
                { label: 'Tổng hoạt động', value: logs.length, icon: 'fa-list-check', tone: '' },
                { label: 'Hoạt động hôm nay', value: todayCount, icon: 'fa-calendar-day', tone: 'success' },
                { label: 'Thất bại / cảnh báo', value: attention, icon: 'fa-triangle-exclamation', tone: 'warning' },
                { label: 'Người dùng có thao tác', value: Object.keys(people).length, icon: 'fa-users', tone: '' }
            ];
            host.innerHTML = cards.map((c) => {
                return '<div class="cms-log-summary__item">' +
                    '<span class="cms-log-summary__icon' + (c.tone ? ' cms-log-summary__icon--' + c.tone : '') + '">' +
                    '<i class="fa-solid ' + c.icon + '" aria-hidden="true"></i></span>' +
                    '<div><p class="cms-log-summary__value">' + util.formatNumber(c.value) + '</p>' +
                    '<p class="cms-log-summary__label">' + util.escape(c.label) + '</p></div></div>';
            }).join('');
        };

        const render = () => {
            const list = filtered();
            const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
            state.page = util.clamp(state.page, 1, totalPages);
            const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

            if (el.summaryText) {
                el.summaryText.innerHTML = '<strong>' + util.formatNumber(list.length) + '</strong> bản ghi phù hợp' +
                    (state.user || state.action || state.status || state.from || state.to || state.q ? ' (đã áp dụng bộ lọc)' : '');
            }

            if (!el.tbody) return;

            if (!rows.length) {
                el.tbody.innerHTML = '<tr><td colspan="7" class="cms-empty-cell">' + ui.emptyState({
                    icon: 'fa-clock-rotate-left',
                    title: 'Không có bản ghi phù hợp',
                    text: 'Thử mở rộng khoảng thời gian hoặc bỏ bớt điều kiện lọc.',
                    action: '<button type="button" class="cms-btn cms-btn--sm" data-log-reset>' +
                        '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Xóa bộ lọc</button>'
                }) + '</td></tr>';
                ui.renderPagination(el.pagination, { total: 0, page: 1, pageSize: state.pageSize }, () => { });
                return;
            }

            let html = '';
            let lastDay = '';
            rows.forEach((l) => {
                const user = Store.userById(l.userId);
                const act = ACTION_META[l.action] || { label: l.action, icon: 'fa-circle-dot' };
                const st = STATUS_META[l.status] || STATUS_META.success;
                const day = util.formatDate(l.at);
                if (day !== lastDay) {
                    lastDay = day;
                    html += '<tr class="cms-log-day"><td colspan="7" class="cms-log-day__cell">' + util.escape(day) + '</td></tr>';
                }
                html += '<tr data-id="' + util.escape(l.id) + '">' +
                    '<td data-label="Người thực hiện">' + ui.userCell(user ? user.name : 'Hệ thống') + '</td>' +
                    '<td data-label="Hành động"><span class="cms-log-action">' +
                    '<i class="fa-solid ' + act.icon + '" aria-hidden="true"></i>' + util.escape(act.label) + '</span></td>' +
                    '<td data-label="Đối tượng"><span class="cms-log-target">' +
                    '<span class="cms-log-target__name" title="' + util.escape(l.targetName) + '">' + util.escape(l.targetName || '—') + '</span>' +
                    '<span class="cms-log-target__type">' + util.escape(l.targetType) + '</span></span></td>' +
                    '<td data-label="Thời gian"><span class="cms-table__muted">' + util.escape(util.formatDateTime(l.at)) + '</span></td>' +
                    '<td data-label="IP"><span class="cms-log-ip">' + util.escape(l.ip || '—') + '</span></td>' +
                    '<td data-label="Trạng thái"><span class="cms-badge cms-badge--' + st.tone + '">' + util.escape(st.label) + '</span></td>' +
                    '<td data-label="Chi tiết" class="cms-table__cell-actions">' +
                    '<button type="button" class="cms-btn cms-btn--sm cms-btn--ghost cms-btn--icon" data-log-detail ' +
                    'aria-label="Xem chi tiết hoạt động" title="Chi tiết">' +
                    '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></button></td></tr>';
            });
            el.tbody.innerHTML = html;

            ui.renderPagination(el.pagination, { total: list.length, page: state.page, pageSize: state.pageSize }, (p) => {
                state.page = p;
                render();
            });
        };

        const showDetail = (log) => {
            const user = Store.userById(log.userId);
            const act = ACTION_META[log.action] || { label: log.action };
            const st = STATUS_META[log.status] || STATUS_META.success;
            ui.modal({
                title: 'Chi tiết hoạt động',
                subtitle: act.label + ' · ' + util.formatDateTime(log.at),
                content: '<dl class="cms-detail-list">' +
                    '<dt>Mã bản ghi</dt><dd>' + util.escape(log.id) + '</dd>' +
                    '<dt>Người thực hiện</dt><dd>' + util.escape(user ? user.name + ' (' + user.username + ')' : 'Hệ thống') + '</dd>' +
                    '<dt>Đơn vị</dt><dd>' + util.escape(user ? user.unit : '—') + '</dd>' +
                    '<dt>Hành động</dt><dd>' + util.escape(act.label) + '</dd>' +
                    '<dt>Đối tượng</dt><dd>' + util.escape(log.targetName || '—') + '</dd>' +
                    '<dt>Loại đối tượng</dt><dd>' + util.escape(log.targetType) + '</dd>' +
                    '<dt>Thời gian</dt><dd>' + util.escape(util.formatDateTime(log.at)) + '</dd>' +
                    '<dt>Địa chỉ IP</dt><dd>' + util.escape(log.ip || '—') + '</dd>' +
                    '<dt>Trạng thái</dt><dd><span class="cms-badge cms-badge--' + st.tone + '">' + util.escape(st.label) + '</span></dd>' +
                    '</dl>' +
                    '<div class="cms-detail-block"><p class="cms-detail-block__title">Mô tả chi tiết</p>' +
                    '<pre class="cms-code">' + util.escape(log.detail || 'Không có mô tả.') + '</pre></div>' +
                    '<p class="cms-u-text-sm cms-u-text-muted cms-u-mt-md">' +
                    '<i class="fa-solid fa-circle-info" aria-hidden="true"></i> Nhật ký được ghi tại máy chủ cho mọi thao tác quan trọng và chỉ người có quyền mới xem được.</p>'
            });
        };

        const fillFilters = () => {
            const u = document.getElementById('log-user');
            if (u) {
                u.innerHTML = '<option value="">Tất cả người dùng</option>' + Store.users().map((user) =>
                    '<option value="' + util.escape(user.id) + '">' + util.escape(user.name) + '</option>').join('');
                u.value = state.user;
            }
            const a = document.getElementById('log-action');
            if (a) {
                a.innerHTML = '<option value="">Tất cả hành động</option>' + Object.keys(ACTION_META).map((k) =>
                    '<option value="' + k + '">' + util.escape(ACTION_META[k].label) + '</option>').join('');
                a.value = state.action;
            }
        };

        const reset = () => {
            Object.assign(state, { q: '', user: '', action: '', status: '', from: '', to: '', page: 1 });
            ['q', 'user', 'action', 'status', 'from', 'to'].forEach((k) => {
                const input = document.getElementById('log-' + k);
                if (input) input.value = '';
            });
            fillFilters();
            render();
            ui.toast('Đã xóa bộ lọc nhật ký.', 'info');
        };

        const exportCsv = () => {
            const list = filtered();
            const headerRow = ['Thoi gian', 'Nguoi thuc hien', 'Hanh dong', 'Doi tuong', 'Loai doi tuong', 'Trang thai', 'IP', 'Chi tiet'];
            const lines = [headerRow.join(',')];

            const quote = String.fromCharCode(34);
            const cell = (v) => quote + String(v == null ? '' : v).split(quote).join(quote + quote) + quote;

            list.forEach((l) => {
                const u = Store.userById(l.userId);
                lines.push([
                    util.formatDateTime(l.at),
                    u ? u.name : 'He thong',
                    (ACTION_META[l.action] || { label: l.action }).label,
                    l.targetName,
                    l.targetType,
                    (STATUS_META[l.status] || {}).label || l.status,
                    l.ip,
                    l.detail
                ].map(cell).join(','));
            });

            const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'nhat-ky-hoat-dong-' + util.toISODate(new Date()) + '.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            ui.toast('Đã xuất ' + list.length + ' bản ghi nhật ký ra tệp CSV.', 'success');
        };

        const bind = () => {
            const q = document.getElementById('log-q');
            if (q) {
                q.addEventListener('input', util.debounce(() => {
                    state.q = q.value;
                    state.page = 1;
                    render();
                }, 220));
            }

            ['user', 'action', 'status', 'from', 'to'].forEach((k) => {
                const input = document.getElementById('log-' + k);
                if (!input) return;
                input.addEventListener('change', () => {
                    state[k] = input.value;
                    state.page = 1;
                    render();
                });
            });

            const resetBtn = document.getElementById('log-reset');
            if (resetBtn) resetBtn.addEventListener('click', reset);
            document.addEventListener('click', (e) => {
                if (e.target.closest('[data-log-reset]')) reset();
            });

            if (el.tbody) {
                el.tbody.addEventListener('click', (e) => {
                    if (!e.target.closest('[data-log-detail]')) return;
                    const tr = e.target.closest('tr[data-id]');
                    if (!tr) return;
                    const log = Store.logs().find((l) => l.id === tr.dataset.id);
                    if (log) showDetail(log);
                });
            }

            const exportBtn = document.getElementById('log-export');
            if (exportBtn) exportBtn.addEventListener('click', exportCsv);
        };

        const init = () => {
            if (!document.getElementById('log-tbody')) return;
            el.tbody = document.getElementById('log-tbody');
            el.pagination = document.getElementById('log-pagination');
            el.summaryText = document.getElementById('log-summary-text');
            fillFilters();
            bind();
            renderSummary();
            render();
        };

        return { init };
    })();

    /* ==========================================================================
       14B. TIẾP NHẬN TỪ CÔNG DÂN (submissions)
       Hiển thị và xử lý yêu cầu do người dân gửi qua biểu mẫu trên Cổng thông tin.
       Chuyển yêu cầu sang Workspace để giao nhiệm vụ xử lý.
       ========================================================================== */

    const Submissions = (function () {
        const state = { status: 'all', q: '' };
        const LABELS = {
            new: { label: 'Mới tiếp nhận', tone: 'pending' },
            assigned: { label: 'Đã phân công', tone: 'approved' },
            in_progress: { label: 'Đang xử lý', tone: 'revision' },
            answered: { label: 'Đã phản hồi', tone: 'published' },
            closed: { label: 'Đã đóng', tone: 'archived' },
            rejected: { label: 'Từ chối', tone: 'rejected' },
        };
        const FORMS = { contact: 'Liên hệ', report: 'Phản ánh', support: 'Hỗ trợ', feedback: 'Góp ý' };

        const badge = (status) => {
            const meta = LABELS[status] || { label: status, tone: 'draft' };
            return '<span class="cms-badge cms-badge--' + meta.tone + '">' + util.escape(meta.label) + '</span>';
        };

        const filtered = () => {
            const needle = util.normalize(state.q || '');
            return Store.submissions().filter((s) => {
                if (state.status !== 'all' && s.status !== state.status) return false;
                if (!needle) return true;
                return util.normalize(s.subject).indexOf(needle) !== -1
                    || util.normalize(s.ticketCode).indexOf(needle) !== -1
                    || util.normalize(s.topicName).indexOf(needle) !== -1
                    || util.normalize(s.content).indexOf(needle) !== -1;
            });
        };

        const render = () => {
            const body = document.getElementById('sub-tbody');
            if (!body) return;
            const rows = filtered();
            const list = document.getElementById('sub-list-host');
            const summary = document.getElementById('sub-summary');
            if (summary) summary.textContent = `Tổng ${rows.length} yêu cầu`;
            if (list) {
                list.innerHTML = ['all', 'new', 'assigned', 'in_progress', 'answered', 'closed'].map((key) => {
                    const count = key === 'all' ? Store.submissions().length : Store.submissions().filter((s) => s.status === key).length;
                    return `<button type="button" class="cms-chip ${state.status === key ? 'is-active' : ''}" data-sub-status="${key}">
                        ${util.escape(key === 'all' ? 'Tất cả' : LABELS[key].label)}
                        <span class="cms-chip__count">${count}</span></button>`;
                }).join('');
            }

            if (!rows.length) {
                body.innerHTML = `<tr><td colspan="6" class="cms-empty-cell">${ui.emptyState({
                    icon: 'fa-inbox',
                    title: 'Chưa có yêu cầu phù hợp',
                    text: 'Yêu cầu do người dân gửi qua biểu mẫu trên Cổng thông tin sẽ xuất hiện tại đây.',
                })}</td></tr>`;
                return;
            }

            body.innerHTML = rows.map((s) => `
                <tr data-id="${util.escape(s.id)}">
                    <td data-label="Mã tiếp nhận"><span class="cms-code-chip">${util.escape(s.ticketCode)}</span></td>
                    <td data-label="Nội dung">
                        <div class="cms-table__title-text">
                            <button type="button" class="cms-table__link" data-sub-open="${util.escape(s.id)}">${util.escape(util.truncate(s.subject || s.content, 70))}</button>
                            <span class="cms-table__slug">${util.escape(s.topicName || FORMS[s.formType] || s.formType)}${s.isAnonymous ? ' · Ẩn danh' : ''}</span>
                        </div>
                    </td>
                    <td data-label="Người gửi">${ui.userCell(s.isAnonymous ? 'Công dân ẩn danh' : (s.name || '—'))}</td>
                    <td data-label="Đơn vị"><span class="cms-table__muted">${util.escape(s.assignedOrgName || 'Chưa phân công')}</span></td>
                    <td data-label="Tiếp nhận"><span class="cms-table__muted">${util.escape(util.formatDateTime(s.createdAt))}</span></td>
                    <td data-label="Trạng thái">${badge(s.status)}${s.taskId ? ' <span class="cms-code-chip" title="Đã chuyển Workspace"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i></span>' : ''}</td>
                </tr>`).join('');
        };

        const openDetail = async (id) => {
            let item = Store.submissions().find((s) => s.id === id);
            if (!item) return;
            let orgs = [];
            try { orgs = await window.PortalAPI.get('/api/shared/organizations'); } catch (e) { orgs = []; }

            const orgOptions = orgs.map((o) => `<option value="${util.escape(o.id)}" ${item.assignedOrgId === o.id ? 'selected' : ''}>${util.escape(o.name)}</option>`).join('');
            const dlg = ui.modal({
                title: 'Chi tiết yêu cầu ' + item.ticketCode,
                subtitle: FORMS[item.formType] || item.formType,
                size: 'lg',
                content: `
                    <div class="cms-sub-detail">
                        <div class="cms-sub-detail__meta">
                            <div><span>Người gửi</span><strong>${util.escape(item.isAnonymous ? 'Công dân ẩn danh' : (item.name || '—'))}</strong></div>
                            <div><span>Liên hệ</span><strong>${util.escape(item.email || item.phone || '—')}</strong></div>
                            <div><span>Thời điểm</span><strong>${util.escape(util.formatDateTime(item.createdAt))}</strong></div>
                            <div><span>Trạng thái</span><strong>${badge(item.status)}</strong></div>
                        </div>
                        <h3 class="cms-sub-detail__subject">${util.escape(item.subject || 'Không có tiêu đề')}</h3>
                        ${item.topicName ? `<p class="cms-sub-detail__topic">Nhóm nội dung: ${util.escape(item.topicName)}</p>` : ''}
                        <p class="cms-sub-detail__content">${util.escape(item.content)}</p>
                        <div class="cms-field">
                            <label class="cms-label" for="sub-org">Đơn vị xử lý</label>
                            <select class="cms-select" id="sub-org"><option value="">— Chưa phân công —</option>${orgOptions}</select>
                        </div>
                        <div class="cms-field">
                            <label class="cms-label" for="sub-priority">Mức độ ưu tiên</label>
                            <select class="cms-select" id="sub-priority">
                                ${['low', 'normal', 'high', 'urgent'].map((p) => `<option value="${p}" ${item.priority === p ? 'selected' : ''}>${({ low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp' })[p]}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cms-field">
                            <label class="cms-label" for="sub-response">Phản hồi nội bộ / kết quả xử lý</label>
                            <textarea class="cms-textarea" id="sub-response" rows="3">${util.escape(item.response || '')}</textarea>
                        </div>
                        <div class="cms-field">
                            <label class="cms-label" for="sub-public">Nội dung công khai cho công dân</label>
                            <textarea class="cms-textarea" id="sub-public" rows="3">${util.escape(item.publicResponse || '')}</textarea>
                            <span class="cms-help">Nội dung này hiển thị khi công dân tra cứu mã tiếp nhận trên Cổng thông tin.</span>
                        </div>
                        ${item.taskId ? `<p class="cms-alert cms-alert--info"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i><span>Yêu cầu đã được chuyển sang Workspace xử lý (mã nhiệm vụ: ${util.escape(item.taskId)}).</span></p>` : ''}
                    </div>`,
                footer: `
                    <button type="button" class="cms-btn" data-modal-close>Đóng</button>
                    ${item.taskId ? '' : '<button type="button" class="cms-btn" data-sub-assign><i class="fa-solid fa-share" aria-hidden="true"></i> Chuyển Workspace</button>'}
                    <button type="button" class="cms-btn cms-btn--primary" data-sub-save><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Lưu xử lý</button>`,
                footerClass: 'cms-modal__foot--between',
            });

            dlg.el.querySelector('[data-sub-save]').addEventListener('click', async () => {
                const payload = {
                    assignedOrgId: dlg.query('#sub-org').value || null,
                    priority: dlg.query('#sub-priority').value,
                    response: dlg.query('#sub-response').value,
                    publicResponse: dlg.query('#sub-public').value,
                    isPublicResult: !!dlg.query('#sub-public').value.trim(),
                    note: 'Cập nhật xử lý tại CMS',
                };
                try {
                    await Store.updateSubmission(item.id, payload);
                    dlg.close();
                    render();
                    ui.toast('Đã lưu kết quả xử lý yêu cầu.', 'success');
                } catch (err) {
                    ui.toast(err.message || 'Không lưu được kết quả xử lý.', { type: 'error', duration: 6000 });
                }
            });

            const assignBtn = dlg.el.querySelector('[data-sub-assign]');
            if (assignBtn) {
                assignBtn.addEventListener('click', async () => {
                    const orgId = dlg.query('#sub-org').value;
                    if (!orgId) {
                        ui.toast('Vui lòng chọn đơn vị xử lý trước khi chuyển Workspace.', 'warning');
                        return;
                    }
                    try {
                        const res = await Store.assignSubmission(item.id, { orgId, dueDays: 7 });
                        dlg.close();
                        render();
                        ui.toast(`Đã chuyển yêu cầu sang Workspace (${res.code || 'nhiệm vụ mới'}).`, 'success');
                    } catch (err) {
                        ui.toast(err.message || 'Không chuyển được yêu cầu.', { type: 'error', duration: 6000 });
                    }
                });
            }
        };

        const bind = () => {
            const q = document.getElementById('sub-q');
            if (q) q.addEventListener('input', util.debounce(() => { state.q = q.value; render(); }, 220));
            const chips = document.getElementById('sub-list-host');
            if (chips) {
                chips.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-sub-status]');
                    if (!btn) return;
                    state.status = btn.dataset.subStatus;
                    render();
                });
            }
            const body = document.getElementById('sub-tbody');
            if (body) {
                body.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-sub-open]');
                    if (!btn) return;
                    openDetail(btn.dataset.subOpen);
                });
            }
        };

        const init = async () => {
            if (!document.getElementById('sub-tbody')) return;
            try {
                await Store.loadSubmissions();
                bind();
                render();
            } catch (err) {
                const body = document.getElementById('sub-tbody');
                if (body) {
                    body.innerHTML = `<tr><td colspan="6" class="cms-empty-cell">${ui.emptyState({
                        icon: 'fa-triangle-exclamation', tone: 'danger',
                        title: 'Không tải được danh sách tiếp nhận',
                        text: err.message || 'Vui lòng thử lại sau.',
                    })}</td></tr>`;
                }
            }
        };

        return { init };
    })();

    /* ==========================================================================
       15. TRANG ĐĂNG NHẬP (login.html)
       Xác thực thực hiện tại máy chủ (POST /api/auth/login), mật khẩu được băm
       bằng scrypt và không bao giờ được lưu trên trình duyệt.
       ========================================================================== */

    const Login = (function () {
        const init = () => {
            const form = document.getElementById('login-form');
            if (!form) return;

            const username = document.getElementById('login-username');
            const password = document.getElementById('login-password');
            const toggle = document.getElementById('login-toggle-password');
            const remember = document.getElementById('login-remember');
            const submit = document.getElementById('login-submit');
            const error = document.getElementById('login-error');
            const errorText = document.getElementById('login-error-text');
            const rememberKey = 'hcm-cms-last-user';

            try {
                const saved = localStorage.getItem(rememberKey);
                if (saved) {
                    username.value = saved;
                    if (remember) remember.checked = true;
                }
            } catch (e) {
                /* trình duyệt chặn lưu trữ – bỏ qua */
            }

            const query = new URLSearchParams(window.location.search);
            const nextPage = query.get('next');
            const target = nextPage && PAGES[nextPage] && nextPage !== 'login.html' ? nextPage : 'dashboard.html';

            /* Đã có phiên hợp lệ: chuyển thẳng tới trang được yêu cầu (trừ khi ?stay=1) */
            if (query.get('stay') !== '1') {
                window.PortalAPI.auth.me().then((me) => {
                    if (me && me.user && me.user.system === 'cms') {
                        window.location.replace(target);
                    }
                }).catch(() => { /* chưa đăng nhập */ });
            }

            if (toggle) {
                toggle.addEventListener('click', () => {
                    const show = password.type === 'password';
                    password.type = show ? 'text' : 'password';
                    toggle.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
                    toggle.setAttribute('aria-pressed', String(show));
                    const icon = toggle.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('fa-eye', !show);
                        icon.classList.toggle('fa-eye-slash', show);
                    }
                    password.focus();
                });
            }

            const showError = (message) => {
                if (!error || !errorText) return;
                errorText.textContent = message;
                error.classList.remove('is-visible');
                void error.offsetWidth; /* khởi động lại hiệu ứng rung */
                error.classList.add('is-visible');
            };

            const clearError = () => {
                if (error) error.classList.remove('is-visible');
                [username, password].forEach((n) => { if (n) n.classList.remove('is-invalid'); });
            };

            [username, password].forEach((input) => {
                if (input) input.addEventListener('input', clearError);
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                clearError();

                const u = username.value.trim();
                const p = password.value;

                if (!u) {
                    username.classList.add('is-invalid');
                    showError('Vui lòng nhập tên đăng nhập.');
                    username.focus();
                    return;
                }
                if (!p) {
                    password.classList.add('is-invalid');
                    showError('Vui lòng nhập mật khẩu.');
                    password.focus();
                    return;
                }

                submit.disabled = true;
                submit.classList.add('is-loading');
                submit.setAttribute('aria-busy', 'true');

                try {
                    await window.PortalAPI.auth.login(u, p, 'cms');
                    Store.setSession((await window.PortalAPI.auth.me()));
                    try {
                        if (remember && remember.checked) localStorage.setItem(rememberKey, u);
                        else localStorage.removeItem(rememberKey);
                    } catch (err) { /* bỏ qua */ }
                    window.location.href = target;
                } catch (err) {
                    submit.disabled = false;
                    submit.classList.remove('is-loading');
                    submit.removeAttribute('aria-busy');
                    password.classList.add('is-invalid');
                    showError(err.message || 'Không thể đăng nhập. Vui lòng thử lại.');
                    password.focus();
                }
            });
        };

        return { init };
    })();

    /* ==========================================================================
       16. KHỞI TẠO
       ========================================================================== */

    /** Màn hình chờ trong lúc nạp dữ liệu từ máy chủ */
    const showLoadingState = () => {
        const main = document.getElementById('cms-main');
        if (!main) return;
        let host = document.getElementById('cms-boot');
        if (!host) {
            host = document.createElement('div');
            host.id = 'cms-boot';
            host.className = 'cms-boot';
            host.setAttribute('role', 'status');
            host.setAttribute('aria-live', 'polite');
            host.innerHTML = '<span class="cms-spinner" aria-hidden="true"></span><span>Đang tải dữ liệu…</span>';
            main.prepend(host);
        }
    };

    const hideLoadingState = () => {
        const host = document.getElementById('cms-boot');
        if (host) host.remove();
    };

    /** Hiển thị lỗi tải dữ liệu kèm nút thử lại */
    const showBootError = (err) => {
        hideLoadingState();
        const inner = document.querySelector('.cms-main__inner');
        if (!inner) return;
        inner.innerHTML = ui.emptyState({
            icon: 'fa-triangle-exclamation',
            tone: 'danger',
            title: 'Không tải được dữ liệu',
            text: err && err.isNetwork
                ? 'Không kết nối được máy chủ. Vui lòng kiểm tra đường truyền rồi thử lại.'
                : (err && err.message) || 'Máy chủ gặp sự cố. Vui lòng thử lại sau.',
            action: '<button type="button" class="cms-btn cms-btn--primary cms-btn--sm" id="cms-boot-retry">'
                + '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Thử lại</button>',
        });
        const retry = document.getElementById('cms-boot-retry');
        if (retry) retry.addEventListener('click', () => window.location.reload());
    };

    const boot = async () => {
        Shell.init();
        if (Shell.isLogin()) {
            Login.init();
            return;
        }
        if (!document.querySelector('.cms-app')) return;

        showLoadingState();
        try {
            const session = await Store.loadSession();
            if (!session || !session.user) {
                const here = window.location.pathname.split('/').pop() || 'dashboard.html';
                window.location.replace('login.html?next=' + encodeURIComponent(here));
                return;
            }
            const user = Store.currentUser();
            if (user && user.system === 'cms' && user.mustChangePassword) {
                ui.toast('Vui lòng đổi mật khẩu khởi tạo trước khi tiếp tục sử dụng hệ thống.', 'warning', { duration: 8000 });
            }
            await Store.load();
            hideLoadingState();

            /* Dựng lại sidebar/header với dữ liệu thật (số bài chờ duyệt…) */
            Shell.refresh();

            Dashboard.init();
            ContentList.init();
            await Editor.init();
            Categories.init();
            PublicCatalog.init();
            Media.init();
            Workflow.init();
            ActivityLog.init();
            Submissions.init();
        } catch (err) {
            if (err && err.isAuth) {
                const here = window.location.pathname.split('/').pop() || 'dashboard.html';
                window.location.replace('login.html?next=' + encodeURIComponent(here));
                return;
            }
            showBootError(err);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    /* Phiên hết hạn ở bất kỳ thời điểm nào -> quay về trang đăng nhập */
    window.addEventListener('api:unauthorized', () => {
        if (Shell.isLogin()) return;
        const here = window.location.pathname.split('/').pop() || 'dashboard.html';
        window.location.replace('login.html?next=' + encodeURIComponent(here));
    });

    window.CMS = {
        version: CONFIG.version,
        util: util,
        store: Store,
        ui: ui,
        shell: Shell,
        statuses: STATUS,
        roles: ROLES,
    };
})();
