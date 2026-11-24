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
        return method === 'GET' && /^\/api\/public\/(?:articles|categories|system-categories|system-category-types|event-statuses|summary|legal-documents|events|agencies|media-library|media-library-folders|statistics|support-facilities|banners|notifications)(?:\/|\?|$)/.test(path);
    }

    /*
     * Khi triển khai tĩnh (GitHub Pages) không có máy chủ API: các lời gọi đọc công
     * khai lấy từ snapshot, KHÔNG gọi mạng (tránh 404 lặp lại trong console).
     * Máy chủ Node không bị ảnh hưởng vì isPublicRead() đã trả lời trước. Ở chế độ
     * phát triển (localhost) vẫn ưu tiên máy chủ đang chạy.
     */
    function isServerlessHost() {
        if (detectBase()) return false;
        const host = String(window.location.hostname || '');
        return !/^(localhost|127\.|0\.0\.0\.0|\[::1\])$/.test(host);
    }

    /**
     * Khối hỗ trợ trợ lý ảo tĩnh trên GitHub Pages (không có máy chủ để chạy engine).
     * Các hàm được hoist nên `request` gọi được ở mọi vị trí trong file.
     */
    function staticNormalize(text) {
        return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

        if (pathname === '/api/public/summary') {
            const summary = snapshot.summary || {};
            const newsCount = articles.filter((item) => item.categoryGroup === 'tin-tuc').length;
            const educationCount = articles.filter((item) =>
                item.categoryGroup === 'tuyen-truyen-giao-duc').length;
            const eventCount = events.length;
            const legalDocuments = snapshot.legalDocuments || [];
            return {
                ...summary,
                news: summary.news != null ? summary.news : newsCount,
                educationArticles: summary.educationArticles != null ? summary.educationArticles : educationCount,
                events: summary.events != null ? summary.events : eventCount,
                articles: newsCount + educationCount + eventCount,
                laws: summary.laws != null ? summary.laws : legalDocuments.length,
                agencies: summary.agencies != null ? summary.agencies : agencies.length,
                supportFacilities: summary.supportFacilities != null
                    ? summary.supportFacilities
                    : (snapshot.supportFacilities || []).length,
            };
        }

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

        if (pathname === '/api/public/media-library') return snapshot.mediaLibrary || [];
        if (pathname === '/api/public/media-library-folders') return snapshot.mediaFolders || [];
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

    /*
     * Trợ lý ảo trên bản tĩnh: không có máy chủ/engine, nên dùng bộ tri thức ngắn
     * nhúng sẵn và tra cứu trong snapshot PUBLIC. Đây là bản dự phòng — bản đầy
     * đủ chạy trên máy chủ Node (`server/lib/chatbot/engine.js`).
     */
    const STATIC_KB = [
        {
            q: 'ma tuy la gi dinh nghia chat ma tuy',
            a: 'Ma túy là các chất gây nghiện, chất hướng thần được quy định trong danh mục do Chính phủ ban hành. '
                + 'Chất gây nghiện là chất kích thích hoặc ức chế thần kinh, dễ gây tình trạng nghiện; chất hướng thần '
                + 'còn gây ảo giác, dùng nhiều lần có thể dẫn tới nghiện. Sử dụng, tàng trữ, mua bán trái phép chất ma túy '
                + 'đều vi phạm pháp luật.',
        },
        {
            q: 'dau hieu nhan biet nguoi su dung ma tuy con em nghi nghien',
            a: 'Các biểu hiện đáng lưu ý: thay đổi thất thường giờ giấc sinh hoạt, lén lút, tiêu tiền bất thường; '
                + 'tâm trạng thay đổi nhanh, cáu gắt, lo âu; sụt cân, mắt đỏ, đồng tử bất thường; xuất hiện dụng cụ lạ, '
                + 'mùi lạ; thay đổi nhóm bạn, bỏ học. Không có dấu hiệu nào khẳng định chắc chắn — hãy bình tĩnh trao đổi '
                + 'và liên hệ Trạm y tế/Công an cấp xã hoặc gọi 0982.120.908.',
        },
        {
            q: 'tac hai cua ma tuy he luy suc khoe gia dinh xa hoi',
            a: 'Ma túy gây tổn hại sức khỏe (rối loạn thần kinh, tim mạch, gan, phổi; nguy cơ HIV/AIDS, viêm gan B, C '
                + 'khi dùng chung kim tiêm; quá liều có thể tử vong), phá vỡ gia đình và gia tăng tội phạm, tai nạn xã hội.',
        },
        {
            q: 'ky nang tu choi ru re ep buoc su dung ma tuy',
            a: 'Bốn nguyên tắc: (1) nói “không” rõ ràng ngay từ đầu; (2) rời khỏi tình huống, gọi người thân đến đón; '
                + '(3) từ chối bằng lý do xã hội (đang uống thuốc, phải về nhà); (4) không nhận đồ ăn/uống từ người lạ. '
                + 'Nếu bị ép buộc, tìm nơi đông người và gọi 113 hoặc 0982.120.908.',
        },
        {
            q: 'cai nghien tu nguyen thu tuc quy trinh cac buoc dang ky ho so giay to',
            a: 'Quy trình 4 bước: (1) Khai báo và tiếp nhận tại Công an cấp xã/UBND/Trạm y tế nơi cư trú; '
                + '(2) Xác định tình trạng nghiện bằng xét nghiệm theo quy trình Bộ Y tế; (3) Lựa chọn hình thức cai nghiện '
                + 'tự nguyện và ký cam kết; (4) Hỗ trợ tái hòa nhập (quản lý sau cai, học nghề, việc làm). '
                + 'Hồ sơ cơ bản: Thẻ Căn cước/CCCD hoặc tài khoản VNeID mức 2, không cần sổ hộ khẩu giấy.',
        },
        {
            q: 'hinh thuc cai nghien cac cach cai nghien',
            a: 'Có 4 hình thức: cai nghiện tự nguyện tại gia đình/cộng đồng; cai nghiện tự nguyện tại cơ sở công lập; '
                + 'điều trị thay thế bằng Methadone; quản lý sau cai và tái hòa nhập cộng đồng.',
        },
        {
            q: 'methadone chi phi mien phi thuoc thay the dieu tri',
            a: 'Tại các cơ sở công lập ở TP. Hồ Chí Minh, thuốc Methadone được cấp phát miễn phí, người bệnh chỉ đóng góp '
                + 'chi phí dịch vụ y tế ở mức tối thiểu. Điều trị giúp kiểm soát cơn thèm nhớ và giảm nguy cơ lây nhiễm qua '
                + 'đường máu.',
        },
        {
            q: 'to giac bao tin tu diem toi pham ma tuy bao o dau cong an',
            a: 'Gọi ngay 113 hoặc số điện thoại Công an cấp xã/phường nơi xảy ra sự việc; cung cấp địa điểm, thời gian, '
                + 'đối tượng (nếu biết); không tự xử lý trực tiếp. Có thể gửi phản ánh trực tuyến qua trang Liên hệ. '
                + 'Thông tin người báo tin được giữ bí mật.',
        },
        {
            q: 'xu phat su dung trai phep ma tuy hinh su truy cuu trach nhiem',
            a: 'Người sử dụng trái phép chất ma túy bị xử phạt vi phạm hành chính; tái phạm trong thời gian cai nghiện/'
                + 'quản lý sau cai/điều trị thay thế hoặc đã bị xử phạt hành chính mà còn vi phạm có thể bị truy cứu trách '
                + 'nhiệm hình sự (Điều 256a Bộ luật Hình sự). Tàng trữ, vận chuyển, mua bán, tổ chức sử dụng trái phép bị '
                + 'xử lý nghiêm khắc.',
        },
        {
            q: 'tu giac khai bao co bi truy cuu hinh su khong',
            a: 'Người tự giác khai báo tình trạng nghiện để đăng ký cai nghiện tự nguyện được hỗ trợ tiếp cận y tế và '
                + 'không bị truy cứu trách nhiệm hình sự; chỉ bị truy cứu nếu tái sử dụng trong thời gian đang cai nghiện, '
                + 'điều trị thay thế, quản lý sau cai hoặc đã bị xử phạt hành chính mà còn vi phạm.',
        },
    ];

    const STATIC_STOP = new Set('la gi va cua cho toi minh ban em anh chi khong duoc the nao nhu o dau khi '
        .split(' ').filter(Boolean));

    function staticTokens(text) {
        return staticNormalize(text).split(' ')
            /* Bỏ số/năm ("2030") và từ dừng: không giúp xác định chủ đề */
            .filter((w) => w.length > 1 && !STATIC_STOP.has(w) && !/^\d+$/.test(w))
            .map((w) => (w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w));
    }

    /** Trả lời tĩnh từ bộ tri thức + snapshot PUBLIC */
    function staticChatResult(body, snapshot) {
        const message = String((body && body.message) || '').slice(0, 500).trim();
        const normalized = staticNormalize(message);
        const tokens = staticTokens(message);
        const base = {
            intent: 'question',
            disclaimer: 'Bản tĩnh (GitHub Pages) trả lời từ dữ liệu đã xuất; thông tin chỉ mang tính tham khảo.',
        };

        if (!message) {
            return { ...base, answer: 'Bạn hãy đặt câu hỏi cụ thể về phòng, chống ma túy.', sources: [], suggestions: staticSuggestions(snapshot) };
        }
        if (/qua lieu|overdose|kho tho|co giat|bat tinh|cap cuu|ngat/.test(normalized)) {
            return {
                ...base, intent: 'emergency', urgent: true,
                answer: 'Trường hợp khẩn cấp, hãy GỌI NGAY 115 (cấp cứu) hoặc 113 (công an). Trong lúc chờ: đặt người bệnh '
                    + 'nằm nghiêng an toàn, nới lỏng quần áo, giữ ấm, không cho ăn uống, không tự ý dùng thêm thuốc.',
                sources: [], suggestions: [],
            };
        }
        if (/^(xin )?chao|^hello|^hi$|^alo$|^ban la ai/.test(normalized)) {
            return {
                ...base,
                answer: 'Xin chào! Tôi là trợ lý ảo của Chuyên trang (bản tĩnh). Bạn có thể hỏi về kiến thức ma túy, '
                    + 'dấu hiệu nhận biết, cai nghiện, Methadone, tố giác hoặc xử phạt.',
                sources: [], suggestions: staticSuggestions(snapshot),
            };
        }
        if (/hotline|duong day nong|lien he|so dien thoai|tong dai/.test(normalized)) {
            return {
                ...base,
                answer: 'Cấp cứu/an ninh: 113 hoặc 115. Tư vấn pháp lý và cai nghiện: 0982.120.908. '
                    + 'Email: hcmcdpce@gmail.com — Số 10 Đường 3/2, Hòa Hưng, TP. Hồ Chí Minh.',
                sources: [{ type: 'page', title: 'Trang Liên hệ và hỗ trợ', url: 'pages/public/contact.html', label: 'Liên hệ', excerpt: '' }],
                suggestions: staticSuggestions(snapshot),
            };
        }

        /* Chấm điểm tri thức tĩnh: phải khớp TỈ LỆ từ khóa của câu hỏi, và không
           ưu tiên mục tri thức chỉ vì trùng từ chung ("ma tuy"). */
        const STATIC_GENERIC = new Set(['ma', 'tuy', 'ma tuy', 'phong', 'chong', 'thanh', 'pho', 'nguoi', 'viet', 'nam']);
        let best = null;
        let bestScore = 0;
        STATIC_KB.forEach((item) => {
            const key = item.q.split(' ');
            const hits = tokens.filter((t) => key.includes(t));
            const specific = hits.filter((t) => !STATIC_GENERIC.has(t)).length;
            if (hits.length < 2 || specific === 0) return;
            /* Điểm = số từ khóa đặc thù khớp / độ dài câu hỏi (ưu tiên câu khớp rõ) */
            const score = (specific * 2 + (hits.length - specific)) / Math.max(tokens.length, 2);
            if (score > bestScore) { bestScore = score; best = item; }
        });
        if (best && bestScore >= 0.35) {
            return { ...base, answer: best.a, sources: [], suggestions: staticSuggestions(snapshot) };
        }

        /* Tra cứu trong snapshot bài viết/văn bản */
        const haystack = (item) => staticNormalize(`${item.title || ''} ${item.excerpt || item.summary || ''} ${(item.tags || []).join(' ')}`);
        const articles = (snapshot.articles || [])
            .map((item) => ({ item, score: tokens.filter((t) => haystack(item).includes(t)).length }))
            .filter((row) => row.score >= 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        const legal = (snapshot.legalDocuments || [])
            .map((item) => ({ item, score: tokens.filter((t) => staticNormalize(`${item.title} ${item.summary || ''} ${item.docNumber || ''}`).includes(t)).length }))
            .filter((row) => row.score >= 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        const events = (snapshot.events || [])
            .map((item) => ({ item, score: tokens.filter((t) => staticNormalize(`${item.title} ${item.summary || ''} ${item.location || ''}`).includes(t)).length }))
            .filter((row) => row.score >= 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        const support = (snapshot.supportFacilities || [])
            .map((item) => ({ item, score: tokens.filter((t) => staticNormalize(`${item.name} ${item.address || ''} ${item.ward || ''} ${item.description || ''}`).includes(t)).length }))
            .filter((row) => row.score >= 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        /* Chọn nhóm kết quả có điểm cao nhất (bài viết / văn bản / sự kiện / cơ sở) */
        const groups = [
            { key: 'article', label: 'Các bài viết', rows: articles },
            { key: 'legal', label: 'Các văn bản pháp luật', rows: legal },
            { key: 'event', label: 'Các sự kiện', rows: events },
            { key: 'support', label: 'Các cơ sở hỗ trợ', rows: support },
        ].filter((g) => g.rows.length);
        groups.sort((a, b) => b.rows[0].score - a.rows[0].score);
        const bestGroup = groups[0];
        if (bestGroup) {
            const isArticle = bestGroup.key === 'article';
            return {
                ...base,
                answer: `${bestGroup.label} liên quan trên Chuyên trang:\n`
                    + bestGroup.rows.map((row, i) => `${i + 1}. ${row.item.title || row.item.name}`).join('\n'),
                sources: bestGroup.rows.map((row) => ({
                    type: bestGroup.key,
                    title: row.item.title || row.item.name,
                    excerpt: String(row.item.excerpt || row.item.summary || row.item.description || '').slice(0, 160),
                    label: isArticle ? 'Bài viết'
                        : bestGroup.key === 'legal' ? 'Văn bản pháp luật'
                            : bestGroup.key === 'event' ? 'Sự kiện' : 'Cơ sở hỗ trợ',
                    url: isArticle
                        ? `pages/public/${row.item.categoryGroup === 'tuyen-truyen-giao-duc' ? 'education-detail' : 'news-detail'}.html?id=${encodeURIComponent(row.item.id)}`
                        : bestGroup.key === 'legal' ? `pages/public/law-detail.html?id=${encodeURIComponent(row.item.id)}`
                            : bestGroup.key === 'event' ? `pages/public/event-detail.html?id=${encodeURIComponent(row.item.id)}`
                                : 'pages/public/support.html',
                })),
                suggestions: staticSuggestions(snapshot),
            };
        }

        return {
            ...base,
            answer: 'Xin lỗi, bản tĩnh chưa có nội dung phù hợp với câu hỏi này. Bạn có thể xem trang Tuyên truyền - Giáo dục, '
                + 'Pháp luật, Hỗ trợ cai nghiện; hoặc gọi 0982.120.908 (tư vấn) / 115, 113 (khẩn cấp).',
            sources: [], suggestions: staticSuggestions(snapshot),
        };
    }

    function staticSuggestions(snapshot) {
        const list = [
            'Ma túy là gì và được phân loại như thế nào?',
            'Làm sao nhận biết một người nghi sử dụng ma túy?',
            'Thủ tục đăng ký cai nghiện tự nguyện gồm những gì?',
        ];
        return snapshot && snapshot.articles && snapshot.articles.length ? list : list.slice(0, 2);
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

        /* Bản tĩnh: đọc dữ liệu công khai và chat từ snapshot, không gọi mạng */
        if (isServerlessHost()) {
            try {
                const staticResult = await tryStaticPublicRead(path);
                if (staticResult.matched) return staticResult.data;
                if (method === 'POST' && path === '/api/public/chat') {
                    const snapshot = await loadStaticPublicData();
                    return staticChatResult(body, snapshot);
                }
            } catch (_) {
                /* snapshot không có: tiếp tục thử máy chủ (nếu có) */
            }
        }
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
            /*
             * Trợ lý ảo trên bản tĩnh (GitHub Pages): không có máy chủ để chạy
             * engine nên trả lời từ snapshot PUBLIC đã xuất sẵn.
             */
            if (method === 'POST' && path === '/api/public/chat') {
                try {
                    const snapshot = await loadStaticPublicData();
                    return staticChatResult(body, snapshot);
                } catch (_) {
                    /* không có snapshot: rơi xuống lỗi kết nối bên dưới */
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
            /* Bản tĩnh: /api/public/chat không tồn tại (404 HTML) → trả lời từ snapshot */
            if (response.status === 404 && method === 'POST' && path === '/api/public/chat' && !isApiError) {
                try {
                    const snapshot = await loadStaticPublicData();
                    return staticChatResult(body, snapshot);
                } catch (_) {
                    /* giữ lỗi HTTP gốc */
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
