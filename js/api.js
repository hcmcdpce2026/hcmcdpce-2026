/**
 * api.js – Lớp giao tiếp API dùng chung cho PUBLIC, CMS và WORKSPACE.
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh –
 *
 * - Tự nhận diện gốc API theo vị trí trang (index.html ở gốc, trang trong /pages/...).
 * - Gửi kèm cookie phiên (same-origin) và X-CSRF-Token cho thao tác ghi.
 * - Chuẩn hóa lỗi thành Error có .status/.code để UI hiển thị thống nhất.
 * - Phát sự kiện 'api:unauthorized' khi phiên hết hạn để phân hệ tự chuyển hướng.
 */
(function () {
    'use strict';
    if (window.PortalAPI) return;

    /* Xác định gốc API: khi chạy bằng máy chủ thì cùng origin; khi mở tệp tĩnh
       (file://) hoặc triển khai tách frontend, dùng window.PORTAL_API_BASE. */
    function detectBase() {
        if (window.PORTAL_API_BASE) return String(window.PORTAL_API_BASE).replace(/\/$/, '');
        const loc = window.location;
        if (loc.protocol === 'file:') return 'http://localhost:8099';
        return ''; // cùng origin
    }

    const BASE = detectBase();
    const API_SCRIPT_URL = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : new URL('js/api.js', window.location.href).href;
    const CSRF_KEY = 'hcm-portal-csrf';
    let staticPublicDataPromise = null;

    let csrfToken = '';
    try { csrfToken = sessionStorage.getItem(CSRF_KEY) || ''; } catch (e) { /* bị chặn lưu trữ */ }

    function setCsrf(token) {
        csrfToken = token || '';
        try {
            if (csrfToken) sessionStorage.setItem(CSRF_KEY, csrfToken);
            else sessionStorage.removeItem(CSRF_KEY);
        } catch (e) { /* bỏ qua */ }
    }

    function clearCsrf() { setCsrf(''); }

    /** Lỗi API có thông tin trạng thái để UI phân loại */
    class ApiError extends Error {
        constructor(message, status, payload) {
            super(message || 'Không thể kết nối máy chủ.');
            this.name = 'ApiError';
            this.status = status || 0;
            this.payload = payload || null;
            this.field = payload && payload.field ? payload.field : null;
        }
        get isNetwork() { return this.status === 0; }
        get isAuth() { return this.status === 401; }
        get isForbidden() { return this.status === 403; }
        get isValidation() { return this.status === 400 || this.status === 422; }
        get isConflict() { return this.status === 409; }
    }

    const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Vui lòng kiểm tra đường truyền và thử lại.';

    function normalizeSearch(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    }

    function isPublicRead(method, path) {
        return method === 'GET' && /^\/api\/public\//.test(path);
    }

    function loadStaticPublicData() {
        if (!staticPublicDataPromise) {
            const snapshotUrl = new URL('../public-data/public.json', API_SCRIPT_URL).href;
            staticPublicDataPromise = fetch(snapshotUrl, { headers: { Accept: 'application/json' }, cache: 'no-cache' })
                .then((response) => {
                    if (!response.ok) throw new ApiError('Chưa có dữ liệu PUBLIC tĩnh được xuất.', response.status);
                    return response.json();
                })
                .then((data) => {
                    if (!data || data.schemaVersion !== 1) {
                        throw new ApiError('Tệp dữ liệu PUBLIC tĩnh không đúng định dạng.', 500);
                    }
                    return data;
                })
                .catch((error) => {
                    staticPublicDataPromise = null;
                    throw error;
                });
        }
        return staticPublicDataPromise;
    }

    function staticAssetUrl(value) {
        if (typeof value !== 'string') return value;
        const root = new URL('../', API_SCRIPT_URL);
        return value.replace(/(^|["'(=\s])(?:public-data\/media\/|\/uploads\/)([^"'`\s?#)<>]+)/g, (match, prefix, name) =>
            `${prefix}${new URL(`public-data/media/${encodeURIComponent(decodeURIComponent(name))}`, root).href}`);
    }

    function resolveStaticAssets(value) {
        if (Array.isArray(value)) return value.map(resolveStaticAssets);
        if (value && typeof value === 'object') {
            const result = {};
            Object.keys(value).forEach((key) => { result[key] = resolveStaticAssets(value[key]); });
            return result;
        }
        return staticAssetUrl(value);
    }

    function staticPublicResult(path, snapshot) {
        const url = new URL(path, window.location.href);
        const pathname = url.pathname.replace(/\/+$/, '');
        const query = url.searchParams;
        const articles = snapshot.articles || [];
        const categories = snapshot.categories || [];
        const events = snapshot.events || [];
        const agencies = snapshot.agencies || [];

        if (pathname === '/api/public/articles') {
            const id = query.get('id');
            if (id) return staticArticleDetail(articles, id);

            const search = normalizeSearch(query.get('search') || query.get('q'));
            const category = query.get('categoryId') || query.get('category');
            const group = query.get('group');
            let rows = articles;
            if (group) rows = rows.filter((item) => item.categoryGroup === group);
            if (category) rows = rows.filter((item) =>
                item.categoryId === category || item.categorySlug === category || item.categoryName === category);
            if (query.get('featured') === 'true') rows = rows.filter((item) => item.tags && item.tags.length);
            if (search) rows = rows.filter((item) =>
                normalizeSearch(item.title).includes(search)
                || normalizeSearch(item.excerpt).includes(search)
                || (item.tags || []).some((tag) => normalizeSearch(tag).includes(search)));

            const limit = Math.min(50, Number(query.get('limit')) || 12);
            const page = Math.max(1, Number(query.get('page')) || 1);
            return rows.slice((page - 1) * limit, page * limit)
                .map(({ body, ...item }) => item);
        }

        const articleDetail = pathname.match(/^\/api\/public\/articles\/([^/]+)$/);
        if (articleDetail) return staticArticleDetail(articles, decodeURIComponent(articleDetail[1]));
        if (pathname === '/api/public/categories') return categories;

        if (pathname === '/api/public/system-categories') {
            const type = query.get('type');
            return (snapshot.systemCategories || []).filter((category) => !type || category.categoryType === type);
        }

        if (pathname === '/api/public/system-category-types') {
            return snapshot.systemCategoryTypes || [];
        }

        if (pathname === '/api/public/summary') return snapshot.summary || null;

        if (pathname === '/api/public/event-statuses') return snapshot.eventStatuses || [];

        if (pathname === '/api/public/legal-documents') {
            const id = query.get('id');
            if (id) {
                const item = (snapshot.legalDocuments || []).find((row) => row.id === id || row.code === id);
                if (!item) throw new ApiError('Văn bản không tồn tại.', 404);
                return item;
            }
            let rows = snapshot.legalDocuments || [];
            if (query.get('type')) rows = rows.filter((item) => item.docType === query.get('type'));
            if (query.get('field')) rows = rows.filter((item) => item.legalField === query.get('field'));
            if (query.get('issuer')) rows = rows.filter((item) => item.issuer === query.get('issuer'));
            if (query.get('year')) rows = rows.filter((item) => String(item.issuedAt || '').slice(0, 4) === query.get('year'));
            if (query.get('effectStatus')) rows = rows.filter((item) => item.effectStatus === query.get('effectStatus'));
            if (query.get('search')) {
                const search = normalizeSearch(query.get('search'));
                rows = rows.filter((item) => normalizeSearch(item.title).includes(search)
                    || normalizeSearch(item.docNumber).includes(search)
                    || normalizeSearch(item.summary).includes(search));
            }
            return rows.map(({ content, ...item }) => item);
        }

        if (pathname === '/api/public/events') {
            const id = query.get('id');
            if (!id) {
                let rows = events;
                if (query.get('type')) rows = rows.filter((row) => row.eventType === query.get('type'));
                if (query.get('status')) rows = rows.filter((row) => row.status === query.get('status'));
                if (query.get('search')) {
                    const search = normalizeSearch(query.get('search'));
                    rows = rows.filter((row) => normalizeSearch(row.title).includes(search)
                        || normalizeSearch(row.summary).includes(search)
                        || normalizeSearch(row.location).includes(search));
                }
                return rows;
            }
            const item = events.find((row) => row.id === id || row.slug === id);
            if (!item) throw new ApiError('Sự kiện không tồn tại hoặc chưa được công bố.', 404);
            return Object.assign({}, item, {
                related: events.filter((row) => row.id !== id).slice(0, 3),
            });
        }

        if (pathname === '/api/public/agencies') {
            const id = query.get('id');
            if (!id) return agencies;
            const item = agencies.find((row) => row.id === id || row.slug === id);
            if (!item) throw new ApiError('Cơ quan, đơn vị không tồn tại.', 404);
            return Object.assign({}, item, {
                related: agencies.filter((row) => row.id !== id).slice(0, 3),
            });
        }

        if (pathname === '/api/public/statistics') return snapshot.statistics || [];
        if (pathname === '/api/public/support-facilities') {
            let rows = snapshot.supportFacilities || [];
            if (query.get('type')) rows = rows.filter((f) => f.type === query.get('type'));
            if (query.get('service')) rows = rows.filter((f) =>
                (f.services || []).some((service) => String(service).includes(query.get('service'))));
            if (query.get('audience')) rows = rows.filter((f) =>
                String(f.audience || '').includes(query.get('audience')));
            if (query.get('search')) {
                const search = normalizeSearch(query.get('search'));
                rows = rows.filter((f) => normalizeSearch(`${f.name} ${f.address} ${f.description} ${f.ward}`).includes(search));
            }
            return rows.map((row) => {
                const publicRow = Object.assign({}, row);
                delete publicRow.district;
                return publicRow;
            });
        }
        if (pathname === '/api/public/banners') return snapshot.banners || [];
        if (pathname === '/api/public/notifications') return snapshot.notifications || [];
        return undefined;
    }

    function staticArticleDetail(articles, id) {
        const article = articles.find((item) => item.id === id || item.slug === id);
        if (!article) throw new ApiError('Bài viết không tồn tại hoặc chưa được xuất bản.', 404);
        return Object.assign({}, article, {
            related: article.categoryId
                ? articles.filter((item) => item.categoryId === article.categoryId && item.id !== article.id)
                    .slice(0, 4)
                    .map(({ body, ...item }) => item)
                : [],
        });
    }

    async function tryStaticPublicRead(path) {
        if (!isPublicRead('GET', path)) return { matched: false };
        const snapshot = await loadStaticPublicData();
        const result = staticPublicResult(path, snapshot);
        if (result === undefined) return { matched: false };
        return { matched: true, data: resolveStaticAssets(result) };
    }

    /**
     * Gọi API.
     * @param {string} method HTTP method
     * @param {string} path   đường dẫn bắt đầu bằng /api/...
     * @param {object} [body] dữ liệu JSON
     * @param {object} [options] { signal, timeout }
     */
    async function request(method, path, body, options) {
        const opts = options || {};
        const headers = { Accept: 'application/json' };
        const isWrite = method !== 'GET' && method !== 'HEAD';
        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
        if (isWrite && csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timer = null;
        const timeoutMs = opts.timeout || (isFormData ? 0 : 20000);
        if (controller) {
            if (opts.signal) {
                if (opts.signal.aborted) controller.abort();
                else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
            }
            if (timeoutMs > 0) timer = setTimeout(() => controller.abort(), timeoutMs);
        }

        let response;
        try {
            response = await fetch(BASE + path, {
                method,
                headers,
                credentials: 'same-origin',
                body: body === undefined ? undefined : (isFormData ? body : JSON.stringify(body)),
                signal: controller ? controller.signal : undefined,
            });
        } catch (err) {
            if (timer) clearTimeout(timer);
            if (isPublicRead(method, path)) {
                try {
                    const fallback = await tryStaticPublicRead(path);
                    if (fallback.matched) return fallback.data;
                } catch (_) {
                    /* Keep the original API connection error if no static snapshot is available. */
                }
            }
            if (err && err.name === 'AbortError') throw new ApiError('Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.', 0);
            throw new ApiError(NETWORK_MESSAGE, 0);
        }
        if (timer) clearTimeout(timer);

        const text = await response.text();
        let payload = null;
        if (text) {
            try { payload = JSON.parse(text); } catch (e) { payload = null; }
        }

        if (!response.ok) {
            /* 404 JSON của chính API là câu trả lời thật (endpoint/bản ghi không tồn tại),
               KHÔNG được thay bằng snapshot tĩnh — làm vậy lỗi thật bị che mất. */
            const isApiError = response.headers.get('content-type')?.includes('application/json');
            if (response.status === 404 && !isApiError && isPublicRead(method, path)) {
                try {
                    const fallback = await tryStaticPublicRead(path);
                    if (fallback.matched) return fallback.data;
                } catch (_) {
                    /* Preserve the original HTTP error when the static host has no snapshot. */
                }
            }
            if (response.status === 401 && window.dispatchEvent) {
                clearCsrf();
                window.dispatchEvent(new CustomEvent('api:unauthorized'));
            }
            const message = (payload && payload.error) || defaultMessage(response.status);
            throw new ApiError(message, response.status, payload);
        }

        return payload ? payload.data : null;
    }

    function defaultMessage(status) {
        switch (status) {
            case 400: return 'Dữ liệu gửi lên không hợp lệ.';
            case 401: return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
            case 403: return 'Bạn không có quyền thực hiện thao tác này.';
            case 404: return 'Không tìm thấy dữ liệu yêu cầu.';
            case 409: return 'Dữ liệu đã tồn tại hoặc đang được sử dụng.';
            case 413: return 'Dữ liệu hoặc tệp tải lên quá lớn.';
            case 429: return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
            default: return status >= 500 ? 'Máy chủ gặp sự cố. Vui lòng thử lại sau.' : 'Không thể hoàn tất yêu cầu.';
        }
    }

    const get = (path, options) => request('GET', path, undefined, options);
    const post = (path, body, options) => request('POST', path, body || {}, options);
    const put = (path, body, options) => request('PUT', path, body || {}, options);
    const del = (path, options) => request('DELETE', path, undefined, options);

    /* ------------------------------ Xác thực ------------------------------ */

    const auth = {
        /** Đăng nhập: system = 'cms' | 'workspace' */
        async login(username, password, system) {
            const data = await post('/api/auth/login', { username, password, system });
            if (data && data.csrfToken) setCsrf(data.csrfToken);
            return data;
        },
        async logout() {
            try { await post('/api/auth/logout'); } catch (e) { /* phiên có thể đã hết hạn */ }
            clearCsrf();
        },
        async me() {
            try {
                const data = await get('/api/auth/me');
                if (data && data.csrfToken) setCsrf(data.csrfToken);
                return data;
            } catch (err) {
                if (err.isAuth) return null;
                throw err;
            }
        },
        changePassword(currentPassword, newPassword) {
            return post('/api/auth/change-password', { currentPassword, newPassword });
        },
    };

    /* --------------------------- Tiện ích URL ----------------------------- */

    /** Tham số truy vấn trên URL hiện tại */
    function query(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    /** Xây dựng query string từ object, bỏ giá trị rỗng */
    function qs(params) {
        const search = new URLSearchParams();
        Object.keys(params || {}).forEach((key) => {
            const value = params[key];
            if (value === undefined || value === null || value === '') return;
            search.set(key, value);
        });
        const text = search.toString();
        return text ? '?' + text : '';
    }

    window.PortalAPI = {
        base: BASE,
        request, get, post, put, del, auth,
        ApiError, setCsrf, clearCsrf, get csrfToken() { return csrfToken; },
        query, qs,
    };
})();
