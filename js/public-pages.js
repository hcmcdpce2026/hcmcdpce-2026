/**
 * public-pages.js – Kết nối các trang PUBLIC với API của Cổng thông tin.
 * Cổng thông tin điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh –
 *
 * - news.html / index.html : nạp tin đã xuất bản từ CMS
 * - news-detail.html       : nạp chi tiết bài viết theo ?id=
 * - statistics.html        : nạp số liệu thống kê kèm nguồn dữ liệu
 * - laws.html              : nạp văn bản pháp luật
 * - events.html            : nạp sự kiện công khai
 * - agencies.html          : nạp danh mục cơ quan, đơn vị
 * - support.html           : nạp danh sách cơ sở hỗ trợ
 *
 * HTML chỉ giữ cấu trúc giao diện; dữ liệu nghiệp vụ được tải từ API công khai.
 */
(function () {
    'use strict';
    if (!window.PortalAPI) return;

    const api = window.PortalAPI;

    /* ------------------------------- Tiện ích ------------------------------- */

    const esc = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return '—';
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const detailUrl = (a) => `news-detail.html?id=${encodeURIComponent(a.id)}`;

    /**
     * Đường dẫn ảnh đại diện, luôn tính từ GỐC dự án để không bị lặp tiền tố.
     * - URL tuyệt đối / data URI: giữ nguyên
     * - Đường dẫn nội bộ (có thể đã có sẵn "../"): cắt hết "../" rồi ghép lại theo `prefix`
     * - Không có ảnh: dùng ảnh giữ chỗ trung tính
     * @param {object} a bài viết
     * @param {number} _i không dùng (giữ chỗ tương thích)
     * @param {string} prefix tiền tố tới gốc dự án ('../../' ở /pages/public/...)
     */
    const thumbOf = (a, _i, prefix) => {
        const src = a && typeof a.thumbnail === 'string' ? a.thumbnail.trim() : '';
        if (src) {
            if (/^(https?:|data:|\/\/)/.test(src)) return src;
            if (src.startsWith('/')) return src;            // tuyệt đối từ gốc website
            const normalized = src.replace(/^(\.\.?\/)+/, '').replace(/^\.\//, '');
            return prefix + normalized;
        }
        return `${prefix}assets/images/article-placeholder.svg`;
    };

    /** Trạng thái tải: chèn khung chờ / thông báo lỗi vào vùng chứa */
    const setLoading = (host, text) => {
        if (!host) return;
        host.setAttribute('aria-busy', 'true');
        host.innerHTML = `<div class="pub-state"><span class="pub-state__spinner" aria-hidden="true"></span>
            <span>${esc(text || 'Đang tải dữ liệu…')}</span></div>`;
    };

    const setError = (host, message) => {
        if (!host) return;
        host.removeAttribute('aria-busy');
        host.innerHTML = `<div class="pub-state pub-state--error" role="alert">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <div><strong>Không tải được dữ liệu</strong><p>${esc(message || 'Vui lòng kiểm tra kết nối và thử lại.')}</p>
            <button type="button" class="pub-state__retry">Thử lại</button></div></div>`;
        const btn = host.querySelector('.pub-state__retry');
        if (btn) btn.addEventListener('click', () => window.location.reload());
    };

    const setEmpty = (host, message) => {
        if (!host) return;
        host.removeAttribute('aria-busy');
        host.innerHTML = `<div class="pub-state"><i class="fa-solid fa-inbox" aria-hidden="true"></i>
            <span>${esc(message || 'Chưa có nội dung được xuất bản.')}</span></div>`;
    };

    const asList = (value, label) => {
        if (!Array.isArray(value)) throw new Error(`Dữ liệu ${label} trả về không hợp lệ.`);
        return value;
    };

    /** Bật/tắt khối “trạng thái trống” của từng trang danh sách (#xx-empty-state). */
    const toggleEmptyState = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('is-visible', !!visible);
    };

    /**
     * Báo cho main.js (bộ lọc/tìm kiếm tĩnh) lập lại chỉ mục sau khi danh sách
     * trong HTML đã bị thay bằng dữ liệu từ API.
     */
    const refreshStaticPage = (host) => {
        if (!host) return;
        host.dispatchEvent(new CustomEvent('portal:content-rendered', { bubbles: true }));
    };

    /* ----------------------------- Danh sách tin ---------------------------- */

    async function initNewsList() {
        const list = document.getElementById('news-article-list');
        const countEl = document.getElementById('news-result-count');
        const isHomepage = !list && !!document.querySelector('.site-main__featured-grid');
        if (!list && !isHomepage) return;

        if (list) await renderNewsCategoryTabs();

        const keyword = api.query('q') || '';
        const banner = document.getElementById('news-search-banner');
        if (keyword && banner) {
            banner.classList.add('is-visible');
            const kw = document.getElementById('news-search-keyword');
            if (kw) kw.textContent = keyword;
            const clear = document.getElementById('news-clear-search');
            if (clear) clear.addEventListener('click', () => { window.location.href = 'news.html'; });
        }

        /* Danh sách tin 100% do API cung cấp: xoá nội dung cũ rồi báo main.js lập lại chỉ mục lọc. */
        if (list) {
            list.innerHTML = '';
            refreshStaticPage(list);
            setLoading(list, 'Đang tải tin tức…');
        }
        try {
            const articles = await api.get('/api/public/articles' + api.qs({ limit: 50, search: keyword }));
            toggleSpotlight((articles || []).length > 0);
            renderSpotlight(articles || []);
            renderNewsSidebar(articles || []);
            if (list) renderNewsList(list, articles || [], countEl, keyword);
            if (isHomepage) renderHomepageNews(articles || []);
        } catch (err) {
            toggleSpotlight(false);
            if (list) setError(list, err.message);
        }
    }

    /** Khối “Tin tiêu điểm” chỉ hiển thị khi có bài viết (tránh khoảng trống lớn) */
    function toggleSpotlight(hasArticles) {
        const spotlight = document.querySelector('.news-spotlight');
        if (!spotlight) return;
        if (!hasArticles) {
            const grid = spotlight.querySelector('.news-spotlight__grid');
            if (grid) grid.innerHTML = '';
        }
        spotlight.hidden = !hasArticles;
    }

    /**
     * Khối “Tin tiêu điểm”: bài mới nhất làm tin chính, 2 bài kế tiếp vào cột phụ.
     * Nội dung hoàn toàn từ API (bài đã xuất bản qua CMS).
     */
    function renderSpotlight(articles) {
        const grid = document.querySelector('.news-spotlight__grid');
        const spotlight = document.querySelector('.news-spotlight');
        if (!grid || !articles.length) return;
        const [hero, ...rest] = articles;
        const side = rest.slice(0, 2);

        /* Khi chỉ có 1 bài, lưới chuyển sang 1 cột để không bị khoảng trống bên phải */
        if (spotlight) spotlight.classList.toggle('news-spotlight--single', side.length === 0);

        grid.innerHTML = `
            <article class="news-hero-card">
                <img src="${thumbOf(hero, 0, '../../')}" alt="${esc(hero.title)}" class="news-hero-card__img" loading="lazy">
                <div class="news-hero-card__overlay"></div>
                <div class="news-hero-card__body">
                    <span class="news-badge">${esc(hero.categoryName || 'Tiêu điểm')}</span>
                    <h2 class="news-hero-card__title">
                        <a href="${detailUrl(hero)}">${esc(hero.title)}</a>
                    </h2>
                    <p class="news-hero-card__excerpt">${esc(hero.excerpt || '')}</p>
                    <div class="news-meta">
                        <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDate(hero.publishedAt)}</span>
                        <span><i class="fa-solid fa-building-shield" aria-hidden="true"></i> ${esc(hero.source || 'Ban Biên tập')}</span>
                    </div>
                </div>
            </article>
            ${side.length ? `<div class="news-spotlight__side">${side.map((a, i) => `
                <article class="news-mini-card">
                    <a href="${detailUrl(a)}" class="news-mini-card__thumb">
                        <img src="${thumbOf(a, i + 1, '../../')}" alt="${esc(a.title)}" loading="lazy">
                    </a>
                    <div>
                        <span class="news-mini-card__cat">${esc(a.categoryName || 'Tin tức')}</span>
                        <h3 class="news-mini-card__title"><a href="${detailUrl(a)}">${esc(a.title)}</a></h3>
                        <div class="news-meta">
                            <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDate(a.publishedAt)}</span>
                        </div>
                    </div>
                </article>`).join('')}</div>` : ''}`;
    }

    /**
     * Nút lọc theo chuyên mục trên news.html – dựng từ danh mục thật trong CMS,
     * mỗi nút mang data-category = slug chuyên mục (khớp với thẻ bài viết).
     */
    async function renderNewsCategoryTabs() {
        const host = document.getElementById('news-category-tabs');
        if (!host) return;
        try {
            const categories = await api.get('/api/public/categories');
            const used = (categories || []).filter((c) => Number(c.articleCount || 0) > 0);
            const extra = used.map((c) => `
                <button type="button" class="news-cat-btn" data-category="${esc(c.slug)}">
                    ${esc(c.name)}
                </button>`).join('');
            host.innerHTML = `<button type="button" class="news-cat-btn is-active" data-category="all">
                    Tất cả tin bài
                </button>${extra}`;
            host.dispatchEvent(new CustomEvent('portal:content-rendered', { bubbles: true }));
        } catch (err) {
            /* Giữ nút “Tất cả tin bài” khi không tải được danh mục */
        }
    }

    function renderNewsList(list, articles, countEl, keyword) {
        if (!list) return;
        if (!articles.length) {
            list.innerHTML = '';
            refreshStaticPage(list);
            return setEmpty(list, keyword
                ? 'Không có bài viết phù hợp với điều kiện tìm kiếm.'
                : 'Chưa có bài viết nào được xuất bản.');
        }

        list.innerHTML = articles.map((a, i) => `
            <article class="news-article" data-category="${esc(a.categoryId || '')}">
                <a class="news-article__thumb" href="${detailUrl(a)}">
                    <img src="${thumbOf(a, i, '../../')}" alt="${esc(a.title)}" loading="lazy">
                </a>
                <div class="news-article__body">
                    <span class="news-article__cat">${esc(a.categoryName || 'Tin tức')}</span>
                    <h3 class="news-article__title"><a href="${detailUrl(a)}">${esc(a.title)}</a></h3>
                    <p class="news-article__excerpt">${esc(a.excerpt || '')}</p>
                    <div class="news-meta">
                        <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDate(a.publishedAt)}</span>
                        ${Number(a.views || 0) > 0
                            ? `<span><i class="fa-regular fa-eye" aria-hidden="true"></i> ${Number(a.views).toLocaleString('vi-VN')} lượt xem</span>`
                            : ''}
                    </div>
                </div>
            </article>`).join('');

        if (countEl) countEl.textContent = `Hiển thị ${articles.length} bài viết`;
        list.removeAttribute('aria-busy');
        refreshStaticPage(list);
    }

    /** Sidebar tin tức: Tin đọc nhiều (theo lượt xem) + thẻ chủ đề từ dữ liệu đã xuất bản */
    function renderNewsSidebar(articles) {
        const trendingHost = document.getElementById('news-trending-list');
        if (trendingHost) {
            const top = [...articles]
                .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
                .slice(0, 5);
            trendingHost.innerHTML = top.length
                ? top.map((a, i) => `
                    <li class="news-trending__item">
                        <span class="news-trending__rank">${String(i + 1).padStart(2, '0')}</span>
                        <a href="${detailUrl(a)}" class="news-trending__link">${esc(a.title)}</a>
                    </li>`).join('')
                : '<li class="pub-inline-empty">Chưa có bài viết nào.</li>';
        }

        const tagHost = document.getElementById('news-tag-cloud');
        if (tagHost) {
            const counts = new Map();
            articles.forEach((a) => (Array.isArray(a.tags) ? a.tags : []).forEach((t) => {
                const key = String(t || '').trim();
                if (key) counts.set(key, (counts.get(key) || 0) + 1);
            }));
            const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
            tagHost.innerHTML = tags.length
                ? tags.map(([tag]) => `<button type="button" class="news-tag-chip" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')
                : '<span class="pub-inline-empty">Chưa có thẻ chủ đề.</span>';
        }

        /*
         * Khi chưa có bài viết, hai khối phụ thuộc dữ liệu (Tin đọc nhiều, Chủ đề
         * quan tâm) được thu gọn để cột phải không cao vượt cột nội dung chính.
         */
        const hasArticles = articles.length > 0;
        [trendingHost, tagHost].forEach((host) => {
            const widget = host && host.closest('.news-widget');
            if (widget) widget.hidden = !hasArticles;
        });
    }

    /** Khối tin nổi bật + tin mới nhất trên trang chủ */
    function renderHomepageNews(articles) {
        const featured = document.querySelector('.site-main__featured-grid');
        const latest = document.querySelector('.site-main__latest-list');
        if (featured && !articles.length) {
            featured.innerHTML = `<div class="pub-state" style="grid-column:1/-1">
                <i class="fa-regular fa-newspaper" aria-hidden="true"></i>
                <span>Chưa có tin tức được xuất bản.</span></div>`;
        }
        if (latest && !articles.length) latest.innerHTML = '';
        if (featured && articles.length) {
            featured.innerHTML = articles.slice(0, 3).map((a, i) => `
                <article class="site-main__featured-card">
                    <a href="pages/public/${detailUrl(a)}" class="site-main__featured-image">
                        <img src="${thumbOf(a, i, '')}" alt="${esc(a.title)}" loading="lazy">
                    </a>
                    <div class="site-main__featured-content">
                        <span class="site-main__category">${esc(a.categoryName || 'Tin tức')}</span>
                        <h3 class="site-main__featured-title">
                            <a href="pages/public/${detailUrl(a)}">${esc(a.title)}</a>
                        </h3>
                        <p class="site-main__featured-description">${esc(a.excerpt || '')}</p>
                        <span class="site-main__date">${fmtDate(a.publishedAt)}</span>
                    </div>
                </article>`).join('');
        }
        if (latest && articles.length) {
            latest.innerHTML = articles.slice(3, 6).map((a, i) => `
                <article class="site-main__latest-item">
                    <a href="pages/public/${detailUrl(a)}" class="site-main__latest-image">
                        <img src="${thumbOf(a, i + 3, '')}" alt="${esc(a.title)}" loading="lazy">
                    </a>
                    <div class="site-main__latest-content">
                        <span class="site-main__category">${esc(a.categoryName || 'Tin tức')}</span>
                        <h3 class="site-main__latest-title">
                            <a href="pages/public/${detailUrl(a)}">${esc(a.title)}</a>
                        </h3>
                        <p class="site-main__latest-description">${esc(a.excerpt || '')}</p>
                        <span class="site-main__date">${fmtDate(a.publishedAt)}</span>
                    </div>
                </article>`).join('');
        }
    }

    /* ---------------------------- Chi tiết bài viết ------------------------- */

    async function initNewsDetail() {
        if (!document.getElementById('art-title')) return;
        const id = api.query('id');
        if (!id) {
            const t = document.getElementById('art-title');
            if (t) t.textContent = 'Không xác định được bài viết cần xem';
            return;
        }
        const setText = (el, text) => { if (el) el.textContent = text; };
        try {
            const a = await api.get(`/api/public/articles/${encodeURIComponent(id)}`);
            document.title = `${(a.title + ' | CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

            setText(document.getElementById('art-title'), a.title);
            setText(document.getElementById('art-sapo'), a.excerpt || '');
            setText(document.getElementById('art-badge'), a.categoryName || 'Tin tức');
            setText(document.getElementById('art-breadcrumb-cat'), a.categoryName || 'Tin tức');
            setText(document.getElementById('art-author'), a.source || a.authorName || 'Ban Biên tập');

            const words = String(a.body || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
            setText(document.getElementById('art-readtime'), `Thời gian đọc: ~${Math.max(1, Math.round(words / 200))} phút`);

            /* Ảnh đại diện + chú thích */
            const heroImg = document.getElementById('art-image');
            if (heroImg) {
                heroImg.src = thumbOf(a, 0, '../../');
                heroImg.alt = a.title;
            }
            setText(document.getElementById('art-caption'), a.title);
            setText(document.getElementById('art-source'), a.source ? `Nguồn: ${a.source}` : '');

            /* Thẻ (tags) */
            const tagsEl = document.getElementById('art-tags');
            if (tagsEl) {
                const tags = Array.isArray(a.tags) ? a.tags : [];
                tagsEl.innerHTML = tags.length
                    ? ['<span class="article-tags__label">Thẻ:</span>',
                        ...tags.map((t) => `<a href="news.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`)].join('')
                    : '';
            }

            /* Thân bài */
            const bodyEl = document.getElementById('art-body-content') || document.getElementById('article-body');
            if (bodyEl) {
                const summary = bodyEl.querySelector('.article-summary');
                if (summary) summary.remove();
                bodyEl.innerHTML = a.body || `<p>${esc(a.excerpt || '')}</p>`;
            }

            const meta = document.querySelector('[data-publish-date]');
            if (meta) meta.textContent = fmtDate(a.publishedAt);
            const views = document.querySelector('[data-view-count]');
            if (views) views.textContent = `${Number(a.views || 0).toLocaleString('vi-VN')} lượt xem`;

            /* Tin cùng chuyên mục / liên quan */
            const related = Array.isArray(a.related) ? a.related : [];
            const moreHost = document.getElementById('art-related-grid') || document.querySelector('[data-related-articles]');
            if (moreHost) {
                moreHost.innerHTML = related.length ? related.map((r, i) => `
                    <article class="related-card">
                        <a href="${detailUrl(r)}"><img src="${thumbOf(r, i, '../../')}" alt="${esc(r.title)}" loading="lazy"></a>
                        <h3><a href="${detailUrl(r)}">${esc(r.title)}</a></h3>
                        <span class="related-card__date">${fmtDate(r.publishedAt)}</span>
                    </article>`).join('') : '<p class="pub-inline-empty">Chưa có tin liên quan.</p>';
            }
            const sideList = document.getElementById('art-sidebar-list');
            if (sideList) {
                sideList.innerHTML = related.length
                    ? related.map((r, i) => `
                        <a href="${detailUrl(r)}" class="article-side-item">
                            <span class="article-side-num">${i + 1}</span>
                            <div><h4>${esc(r.title)}</h4></div>
                        </a>`).join('')
                    : '<p class="pub-inline-empty">Chưa có tin cùng chuyên mục.</p>';
            }
        } catch (err) {
            const title = document.getElementById('art-title');
            const bodyEl = document.getElementById('art-body-content') || document.getElementById('article-body');
            if (title) title.textContent = 'Không tìm thấy bài viết';
            if (bodyEl) {
                bodyEl.innerHTML = `<div class="pub-state pub-state--error" role="alert">
                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                    <div><strong>${err.status === 404 ? 'Bài viết không tồn tại' : 'Không tải được bài viết'}</strong>
                    <p>${esc(err.status === 404 ? 'Nội dung có thể đã được thu hồi hoặc chưa được xuất bản.' : (err.message || ''))}</p>
                    <a class="pub-state__retry" href="news.html">Xem danh sách tin tức</a></div></div>`;
            }
        }
    }

    /* ------------------------ Chi tiết chuyên đề giáo dục -------------------- */

    async function initEducationDetail() {
        const container = document.getElementById('edd-article-container');
        if (!container) return;
        const id = api.query('id');
        const setText = (elId, text) => {
            const el = document.getElementById(elId);
            if (el) el.textContent = text;
        };
        if (!id) {
            setText('edd-title', 'Không xác định được chuyên đề cần xem');
            return;
        }
        try {
            const a = await api.get(`/api/public/articles/${encodeURIComponent(id)}`);
            document.title = `${(a.title + ' | CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

            setText('edd-crumb-title', a.categoryName || 'Chuyên đề');
            setText('edd-category', a.categoryName || 'Tuyên truyền - Giáo dục');
            setText('edd-title', a.title);
            setText('edd-audience', a.source || 'Dành cho cộng đồng');
            setText('edd-sapo', a.excerpt || '');

            const words = String(a.body || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
            setText('edd-readtime', `Thời lượng đọc: ${Math.max(1, Math.round(words / 200))} phút`);

            const img = document.getElementById('edd-image');
            if (img) {
                img.src = thumbOf(a, 0, '../../');
                img.alt = a.title;
            }
            setText('edd-caption', a.title);

            const body = document.getElementById('edd-body');
            if (body) body.innerHTML = a.body || `<p>${esc(a.excerpt || '')}</p>`;

            const tags = Array.isArray(a.tags) ? a.tags : [];
            const takeaways = document.getElementById('edd-takeaways');
            if (takeaways) {
                takeaways.innerHTML = tags.length
                    ? tags.map((t) => `<li>${esc(t)}</li>`).join('')
                    : '<li>Nội dung đang được ban biên tập cập nhật.</li>';
            }

            const relatedHost = document.getElementById('edd-related-list');
            if (relatedHost) {
                const related = Array.isArray(a.related) ? a.related : [];
                relatedHost.innerHTML = related.length
                    ? related.map((r, i) => `
                        <li>
                            <a href="education-detail.html?id=${encodeURIComponent(r.id)}" class="article-related-card">
                                <span class="article-related-card__thumb">
                                    <img src="${thumbOf(r, i, '../../')}" alt="${esc(r.title)}" loading="lazy">
                                </span>
                                <span class="article-related-card__body">
                                    <span class="article-related-card__cat">${esc(r.categoryName || 'Chuyên đề')}</span>
                                    <strong class="article-related-card__title">${esc(r.title)}</strong>
                                    <span class="article-related-card__desc">${esc(r.excerpt || '')}</span>
                                </span>
                            </a>
                        </li>`).join('')
                    : '<li class="pub-inline-empty">Chưa có chuyên đề cùng chuyên mục.</li>';
            }
        } catch (err) {
            setText('edd-title', err.status === 404 ? 'Không tìm thấy chuyên đề' : 'Không tải được chuyên đề');
            setText('edd-sapo', err.status === 404
                ? 'Nội dung có thể đã được thu hồi hoặc chưa được xuất bản.'
                : (err.message || ''));
        }
    }

    /* ------------------------------ Thống kê -------------------------------- */

    async function initStatistics() {
        const kpiHost = document.querySelector('.st-kpi-grid');
        if (!kpiHost) return;
        try {
            const periods = await api.get('/api/public/statistics');
            const select = document.getElementById('st-period-select');
            if (!periods || !periods.length) {
                if (select) select.innerHTML = '<option value="">Chưa có kỳ số liệu</option>';
                setEmpty(kpiHost, 'Chưa có số liệu thống kê được công bố.');
                return;
            }

            if (select) {
                select.innerHTML = periods.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
            }

            const ICONS = ['fa-bullhorn', 'fa-hospital-user', 'fa-shield-heart', 'fa-hand-holding-heart', 'fa-users', 'fa-phone-volume'];
            const TONES = ['blue', 'teal', 'indigo', 'amber', 'green', 'red'];

            const renderPeriod = (period) => {
                kpiHost.innerHTML = period.items.map((i, idx) => `
                    <article class="st-kpi-card">
                        <div class="st-kpi-card__top">
                            <div class="st-kpi-card__icon st-kpi-card__icon--${TONES[idx % TONES.length]}">
                                <i class="fa-solid ${ICONS[idx % ICONS.length]}" aria-hidden="true"></i>
                            </div>
                            <span class="st-kpi-card__trend ${period.verified ? 'is-verified' : ''}">${period.verified ? 'Đã phê duyệt' : 'Kỳ báo cáo'}</span>
                        </div>
                        <div>
                            <div class="st-kpi-card__value">${Number(i.value).toLocaleString('vi-VN')}</div>
                            <p class="st-kpi-card__label">${esc(i.label)}${i.unit ? ` (${esc(i.unit)})` : ''}</p>
                        </div>
                    </article>`).join('');

                const note = document.getElementById('st-data-note');
                if (note) {
                    note.textContent = `Kỳ số liệu: ${period.label}. ${period.note || ''}`.trim();
                }
                const tableTag = document.getElementById('table-period-tag');
                if (tableTag) tableTag.textContent = `Kỳ báo cáo: ${period.label}`;
                const chartTag = document.getElementById('chart-1-tag');
                if (chartTag) chartTag.textContent = period.label;
            };

            renderPeriod(periods[0]);
            if (select) {
                select.addEventListener('change', () => {
                    const found = periods.find((p) => p.id === select.value) || periods[0];
                    renderPeriod(found);
                });
            }
        } catch (err) {
            kpiHost.innerHTML = `<div class="pub-state pub-state--error" role="alert" style="grid-column:1/-1">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <div><strong>Không tải được số liệu</strong><p>${esc(err.message || '')}</p></div></div>`;
        }
    }

    /* -------------------- Chuyên đề tuyên truyền - giáo dục ------------------ */

    /**
     * Chuyên đề tuyên truyền được lấy từ bài viết đã xuất bản trong các chuyên mục
     * nhóm "education" (CMS quản lý nội dung → PUBLIC hiển thị).
     */
    const EDUCATION_TOPICS = {
        'canh-bao-thu-doan-moi': 'tac-hai', 'nhan-dien-tac-hai': 'tac-hai', 'tac-hai': 'tac-hai',
        'ky-nang-phong-ngua': 'ky-nang', 'phong-ngua': 'ky-nang',
        'gia-dinh-hoc-duong': 'gia-dinh', 'gia-dinh': 'gia-dinh', 'hoc-duong': 'gia-dinh',
    };
    const topicOf = (categorySlug) => EDUCATION_TOPICS[categorySlug] || 'ky-nang';

    async function initEducation() {
        const grid = document.getElementById('ed-grid-list');
        if (!grid) return;
        const countEl = document.getElementById('ed-result-count');
        const tabsHost = document.querySelector('.ed-tabs');
        setLoading(grid, 'Đang tải chuyên đề tuyên truyền - giáo dục…');
        try {
            /* Chỉ lấy nội dung đã xuất bản thuộc nhóm chuyên mục "education" */
            const rows = asList(
                await api.get('/api/public/articles' + api.qs({ limit: 50, group: 'education' })),
                'chuyên đề tuyên truyền'
            );

            if (!rows.length) {
                setEmpty(grid, 'Chưa có chuyên đề tuyên truyền nào được xuất bản.');
                toggleEmptyState('ed-empty-state', false);
                if (countEl) countEl.textContent = '';
                refreshStaticPage(grid);
                return;
            }

            grid.innerHTML = rows.map((a, i) => `
                <article class="ed-card" data-topic="${topicOf(a.categorySlug)}">
                    <a href="education-detail.html?id=${encodeURIComponent(a.id)}" class="ed-card__thumb">
                        <img src="${thumbOf(a, i, '../../')}" alt="${esc(a.title)}" loading="lazy">
                        <span class="ed-card__tag">${esc(a.categoryName || 'Tuyên truyền')}</span>
                    </a>
                    <div class="ed-card__body">
                        <span class="ed-card__audience">
                            <i class="fa-solid fa-book-open-reader" aria-hidden="true"></i>
                            ${esc(a.source || 'Ban Biên tập')}
                        </span>
                        <h2 class="ed-card__title">
                            <a href="education-detail.html?id=${encodeURIComponent(a.id)}">${esc(a.title)}</a>
                        </h2>
                        <p class="ed-card__desc">${esc(a.excerpt || '')}</p>
                        <div class="ed-card__footer">
                            <span>${fmtDate(a.publishedAt)}</span>
                            <a href="education-detail.html?id=${encodeURIComponent(a.id)}" class="ed-card__link">
                                Đọc chuyên đề <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                            </a>
                        </div>
                    </div>
                </article>`).join('');
            grid.removeAttribute('aria-busy');

            if (countEl) countEl.textContent = `Hiển thị ${rows.length} chuyên đề tuyên truyền - giáo dục`;

            /* Nút lọc theo chuyên mục thực có dữ liệu */
            if (tabsHost) {
                const topics = new Map();
                rows.forEach((article) => {
                    const topic = topicOf(article.categorySlug);
                    if (!topics.has(topic)) topics.set(topic, article.categoryName || 'Chuyên đề');
                });
                tabsHost.innerHTML = `<button type="button" class="ed-tab-btn is-active" data-topic="all">
                        Tất cả chuyên đề (${rows.length})
                    </button>` + [...topics].map(([topic, label]) => `
                    <button type="button" class="ed-tab-btn" data-topic="${esc(topic)}">${esc(label)}</button>`).join('');
            }

            refreshStaticPage(grid);
        } catch (err) {
            setError(grid, err.message);
        }
    }

    /* -------------------------- Văn bản pháp luật --------------------------- */

    async function initLaws() {
        const host = document.getElementById('lw-doc-list');
        if (!host) return;
        setLoading(host, 'Đang tải văn bản pháp luật…');
        try {
            const docs = asList(await api.get('/api/public/legal-documents'), 'văn bản pháp luật');
            if (!docs.length) {
                setEmpty(host, 'Chưa có văn bản pháp luật nào được công bố.');
                toggleEmptyState('lw-empty-state', false);
                refreshStaticPage(host);
                return;
            }

            const TYPE_LABEL = {
                'luat': 'Luật', 'bo-luat': 'Bộ luật', 'nghi-dinh': 'Nghị định',
                'thong-tu': 'Thông tư', 'chi-thi': 'Chỉ thị',
            };

            /* Danh sách do API cung cấp; báo main.js lập lại chỉ mục bộ lọc/tìm kiếm. */
            host.innerHTML = docs.map((d) => `
                <article class="lw-doc-card" data-doctype="${esc(d.docType)}" data-topic="all">
                    <div class="lw-doc-card__top">
                        <div class="lw-doc-card__badges">
                            <span class="lw-doc-code">
                                <i class="fa-solid fa-file-lines" aria-hidden="true"></i>
                                ${esc(d.docNumber || d.code)}
                            </span>
                            <span class="lw-doc-type">${esc(TYPE_LABEL[d.docType] || d.docType)}</span>
                        </div>
                        <span class="lw-doc-status">
                            <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                            Đang có hiệu lực
                        </span>
                    </div>
                    <h2 class="lw-doc-card__title">
                        <a href="law-detail.html?id=${encodeURIComponent(d.id)}">${esc(d.title)}</a>
                    </h2>
                    <p class="lw-doc-card__desc">${esc(d.summary || '')}</p>
                    <div class="lw-doc-card__footer">
                        <div class="lw-doc-card__meta">
                            <span><i class="fa-solid fa-landmark" aria-hidden="true"></i> ${esc(d.issuer || '')} ban hành</span>
                            <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> Hiệu lực từ ${fmtDate(d.effectiveAt || d.issuedAt)}</span>
                        </div>
                        <a href="law-detail.html?id=${encodeURIComponent(d.id)}" class="lw-doc-card__link">
                            Xem nội dung tóm tắt & điều khoản <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                        </a>
                    </div>
                </article>`).join('');
            host.removeAttribute('aria-busy');

            /* Cập nhật số lượng trên tab "Tất cả văn bản" */
            const tab = document.querySelector('.lw-tab-btn[data-doctype="all"]');
            if (tab) tab.textContent = `Tất cả văn bản (${docs.length})`;
            const countEl = document.getElementById('lw-result-count');
            if (countEl) countEl.textContent = `Hiển thị ${docs.length} văn bản quy phạm pháp luật`;
            refreshStaticPage(host);
        } catch (err) {
            setError(host, err.message);
        }
    }

    /* --------------------------- Chi tiết sự kiện ---------------------------- */

    async function initEventDetail() {
        const title = document.getElementById('evd-title');
        if (!title) return;
        const id = api.query('id');
        const setText = (elId, text) => {
            const el = document.getElementById(elId);
            if (el) el.textContent = text;
        };
        if (!id) {
            title.textContent = 'Không xác định được sự kiện cần xem';
            return;
        }
        try {
            const e = await api.get('/api/public/events' + api.qs({ id }));
            document.title = `${(e.title + ' | CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

            setText('evd-crumb-name', e.title);
            setText('evd-category', e.category || 'Hoạt động - Sự kiện');
            setText('evd-title', e.title);
            setText('evd-lead', e.summary || '');
            setText('evd-caption', e.title);
            setText('evd-time', e.start ? `${fmtDate(e.start)}${e.end ? ' – ' + fmtDate(e.end) : ''}` : '—');
            setText('evd-location', e.location || '—');
            setText('evd-organizer', e.organizer || '—');
            setText('evd-audience', e.organizer ? `Đơn vị chủ trì: ${e.organizer}` : 'Mọi đối tượng quan tâm');

            const hero = document.getElementById('evd-image');
            if (hero) {
                hero.src = thumbOf(e, 0, '../../');
                hero.alt = e.title;
            }

            /* Trạng thái sự kiện theo thời gian thực */
            const badge = document.getElementById('evd-status');
            if (badge) {
                const now = Date.now();
                const start = e.start ? new Date(e.start).getTime() : null;
                const end = e.end ? new Date(e.end).getTime() : start;
                let label = 'Sắp diễn ra';
                let mod = 'upcoming';
                if (start && now >= start && end && now <= end) { label = 'Đang triển khai'; mod = 'ongoing'; }
                else if (start && now > end) { label = 'Đã tổ chức'; mod = 'past'; }
                badge.textContent = label;
                badge.className = `evd-badge-status evd-badge-status--${mod}`;
            }

            const overview = document.getElementById('evd-overview');
            if (overview) {
                overview.innerHTML = e.content
                    ? e.content
                    : `<p>${esc(e.summary || 'Nội dung chi tiết đang được cập nhật.')}</p>`;
            }

            /* Khung chương trình / ghi chú: chỉ hiển thị khi CMS cung cấp */
            const agenda = document.getElementById('evd-agenda');
            if (agenda) {
                agenda.closest('.evd-section').hidden = true;
                agenda.innerHTML = '';
            }
            const notes = document.getElementById('evd-notes');
            if (notes) {
                notes.closest('.evd-section').hidden = true;
                notes.innerHTML = '';
            }

            /* Sự kiện khác */
            const relatedHost = document.getElementById('evd-related-list');
            if (relatedHost) {
                const related = Array.isArray(e.related) ? e.related : [];
                relatedHost.innerHTML = related.length
                    ? related.map((r) => `
                        <li>
                            <a class="article-related-card" href="event-detail.html?id=${encodeURIComponent(r.id)}">
                                <strong class="article-related-card__title">${esc(r.title)}</strong>
                                <span class="article-related-card__desc">${fmtDate(r.start)} · ${esc(r.location || '')}</span>
                            </a>
                        </li>`).join('')
                    : '<li class="pub-inline-empty">Chưa có sự kiện khác.</li>';
            }

            /* Mẫu đăng ký tham gia */
            const form = document.getElementById('evd-reg-form');
            if (form) {
                form.addEventListener('submit', (ev) => {
                    ev.preventDefault();
                    const success = document.getElementById('evd-reg-success');
                    if (success) {
                        success.hidden = false;
                        success.textContent = 'Đã ghi nhận thông tin đăng ký. Cán bộ phụ trách sẽ liên hệ lại với bạn.';
                    }
                    form.reset();
                });
            }
        } catch (err) {
            title.textContent = err.status === 404 ? 'Không tìm thấy sự kiện' : 'Không tải được sự kiện';
            setText('evd-lead', err.status === 404
                ? 'Sự kiện có thể đã kết thúc hoặc chưa được công bố.'
                : (err.message || ''));
        }
    }

    /* --------------------------- Chi tiết cơ quan ---------------------------- */

    async function initAgencyDetail() {
        const nameEl = document.getElementById('agd-title');
        if (!nameEl) return;
        const id = api.query('id');
        const setText = (elId, text) => {
            const el = document.getElementById(elId);
            if (el && text !== undefined) el.textContent = text;
        };
        if (!id) {
            nameEl.textContent = 'Không xác định được đơn vị cần xem';
            return;
        }
        try {
            const o = await api.get('/api/public/agencies' + api.qs({ id }));
            document.title = `${(o.name + ' | CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

            setText('agd-crumb-name', o.name);
            setText('agd-badge', o.shortName || o.name);
            setText('agd-title', o.name);
            setText('agd-summary', o.description || '');
            setText('agd-address', o.address || '—');
            setText('agd-hotline', o.phone || '—');
            setText('agd-scope', 'Toàn Thành phố Hồ Chí Minh');
            setText('agd-hours', 'Trong giờ hành chính (thứ Hai – thứ Sáu)');

            /* Thông tin liên hệ dạng liên kết hành động */
            const hotline = document.getElementById('agd-hotline');
            if (hotline && o.phone) hotline.href = `tel:${String(o.phone).replace(/\s/g, '')}`;

            /* Chỉ giữ các khối mà CMS thực sự cung cấp dữ liệu */
            ['agd-duties', 'agd-steps', 'agd-notes'].forEach((hostId) => {
                const host = document.getElementById(hostId);
                if (!host) return;
                host.innerHTML = '';
                const section = host.closest('section, .agd-section, .agd-block');
                if (section) section.hidden = true;
            });

            const relatedHost = document.getElementById('agd-related-list');
            if (relatedHost) {
                const related = Array.isArray(o.related) ? o.related : [];
                relatedHost.innerHTML = related.length
                    ? related.map((r) => `
                        <li>
                            <a class="article-related-card" href="agency-detail.html?id=${encodeURIComponent(r.id)}">
                                <strong class="article-related-card__title">${esc(r.name)}</strong>
                                <span class="article-related-card__desc">${esc(r.address || '')}</span>
                            </a>
                        </li>`).join('')
                    : '<li class="pub-inline-empty">Chưa có đơn vị khác.</li>';
            }
        } catch (err) {
            nameEl.textContent = err.status === 404 ? 'Không tìm thấy cơ quan, đơn vị' : 'Không tải được thông tin đơn vị';
            setText('agd-summary', err.message || '');
        }
    }

    /* ------------------------------ Sự kiện --------------------------------- */

    async function initEvents() {
        const eventHost = document.getElementById('ev-grid-list');
        const homeHost = document.querySelector('.site-main__events-grid');
        const host = eventHost || homeHost;
        const isHomepage = !eventHost && !!homeHost;
        const spotlight = document.getElementById('ev-spotlight');
        const countEl = document.getElementById('ev-result-count');
        if (!host && !spotlight) return;

        const STATUS = {
            upcoming: { label: 'Sắp diễn ra', cls: 'ev-card__status--upcoming' },
            ongoing: { label: 'Đang triển khai', cls: 'ev-card__status--ongoing' },
            past: { label: 'Đã tổ chức', cls: 'ev-card__status--past' },
        };
        const statusOf = (e) => {
            const now = Date.now();
            const start = e.start ? Date.parse(e.start) : NaN;
            const end = e.end ? Date.parse(e.end) : start;
            if (Number.isFinite(start) && now < start) return 'upcoming';
            if (Number.isFinite(start) && Number.isFinite(end) && now <= end) return 'ongoing';
            return Number.isFinite(start) ? 'past' : 'upcoming';
        };
        const eventImage = (event, index, prefix) => thumbOf({ thumbnail: event.image }, index, prefix);

        if (host) setLoading(host, 'Đang tải sự kiện…');
        if (spotlight) spotlight.hidden = true;
        try {
            const list = asList(await api.get('/api/public/events'), 'sự kiện');

            /* --- Sự kiện trọng điểm: sự kiện sắp/đang diễn ra gần nhất --- */
            if (spotlight) {
                const upcoming = list
                    .filter((e) => statusOf(e) !== 'past')
                    .sort((a, b) => (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0));
                const lead = upcoming[0] || list[0];
                if (!lead) {
                    spotlight.innerHTML = '';
                    spotlight.hidden = true;
                } else {
                    spotlight.hidden = false;
                    spotlight.innerHTML = `
                        <div class="ev-spotlight__media">
                            <img src="${eventImage(lead, 0, '../../')}" alt="${esc(lead.title)}">
                            <span class="ev-spotlight__badge">Sự kiện trọng điểm</span>
                        </div>
                        <div class="ev-spotlight__content">
                            <span class="ev-spotlight__status">
                                <i class="fa-solid fa-circle-dot" aria-hidden="true"></i>
                                ${esc(STATUS[statusOf(lead)].label)}
                            </span>
                            <h2 class="ev-spotlight__title">${esc(lead.title)}</h2>
                            <p class="ev-spotlight__desc">${esc(lead.summary || '')}</p>
                            <div class="ev-spotlight__meta">
                                <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDate(lead.start)}</span>
                                <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(lead.location || '—')}</span>
                            </div>
                            <div class="ev-spotlight__actions">
                                <a href="event-detail.html?id=${encodeURIComponent(lead.id)}" class="site-main__button site-main__button--primary">
                                    Xem chương trình chi tiết
                                </a>
                                <a href="contact.html" class="site-main__button site-main__button--outline">
                                    Đăng ký phối hợp tại cơ sở
                                </a>
                            </div>
                        </div>`;
                }
            }

            /* --- Danh sách sự kiện --- */
            if (!host) return;
            if (!list.length) {
                setEmpty(host, isHomepage
                    ? 'Chưa có sự kiện nào được công bố.'
                    : 'Chưa có hoạt động, sự kiện nào được công bố.');
                toggleEmptyState('ev-empty-state', false);
                if (countEl) countEl.textContent = '';
                return;
            }

            if (isHomepage) {
                host.innerHTML = list.slice(0, 3).map((event, index) => `
                    <article class="site-main__event-card">
                        <a href="pages/public/event-detail.html?id=${encodeURIComponent(event.id)}" class="site-main__event-image">
                            <img src="${eventImage(event, index, '')}" alt="${esc(event.title)}" loading="lazy">
                        </a>
                        <div class="site-main__event-content">
                            <span class="site-main__category">${esc(event.category || 'Hoạt động')}</span>
                            <h3 class="site-main__event-title">
                                <a href="pages/public/event-detail.html?id=${encodeURIComponent(event.id)}">${esc(event.title)}</a>
                            </h3>
                            <p class="site-main__event-description">${esc(event.summary || '')}</p>
                        </div>
                    </article>`).join('');
                host.removeAttribute('aria-busy');
                return;
            }

            const renderCard = (e, i) => {
                const st = statusOf(e);
                const startDate = e.start ? new Date(e.start) : null;
                const validStart = startDate && !Number.isNaN(startDate.getTime());
                const day = validStart ? String(startDate.getDate()).padStart(2, '0') : '—';
                const month = validStart ? `Th${startDate.getMonth() + 1}` : '';
                return `
                    <article class="ev-card" data-category="${esc(e.category || 'all')}" data-status="${st}">
                        <div class="ev-card__thumb">
                            <img src="${eventImage(e, i, '../../')}" alt="${esc(e.title)}" loading="lazy">
                            <div class="ev-card__date-badge">
                                <span class="ev-card__date-day">${day}</span>
                                <span class="ev-card__date-month">${month}</span>
                            </div>
                            <span class="ev-card__status ${STATUS[st].cls}">${STATUS[st].label}</span>
                        </div>
                        <div class="ev-card__body">
                            <span class="ev-card__cat">${esc(e.category || 'Hoạt động')}</span>
                            <h2 class="ev-card__title">${esc(e.title)}</h2>
                            <p class="ev-card__desc">${esc(e.summary || '')}</p>
                            <div class="ev-card__info">
                                <span><i class="fa-regular fa-clock" aria-hidden="true"></i> ${fmtDate(e.start)}</span>
                                <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(e.location || '—')}</span>
                            </div>
                            <div class="ev-card__footer">
                                <a class="ev-card__btn ev-detail-trigger" href="event-detail.html?id=${encodeURIComponent(e.id)}">
                                    Xem chi tiết <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                                </a>
                            </div>
                        </div>
                    </article>`;
            };

            host.innerHTML = list.map(renderCard).join('');
            host.removeAttribute('aria-busy');
            if (countEl) countEl.textContent = `Hiển thị ${list.length} hoạt động, sự kiện`;

            /* Nhóm hoạt động lấy từ dữ liệu thật */
            const tabs = document.querySelector('.ev-tabs');
            if (tabs) {
                const cats = [...new Set(list.map((e) => e.category).filter(Boolean))];
                tabs.innerHTML = `<button type="button" class="ev-tab-btn is-active" data-category="all">
                        Tất cả hoạt động (${list.length})
                    </button>` + cats.map((c) => {
                    const label = c.replace(/[-_]+/g, ' ');
                    return `<button type="button" class="ev-tab-btn" data-category="${esc(c)}">${esc(label)}</button>`;
                }).join('');
            }

            const searchInput = document.getElementById('ev-search-input');
            const statusSelect = document.getElementById('ev-status-select');
            const resetButton = document.getElementById('ev-reset-btn');
            const emptyResetButton = document.getElementById('ev-empty-reset');
            const normalize = (value) => String(value || '').toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
            let selectedCategory = 'all';
            const tabsHost = document.querySelector('.ev-tabs');
            const renderFilteredEvents = () => {
                const cards = [...host.querySelectorAll('.ev-card')];
                const keyword = normalize(searchInput ? searchInput.value : '');
                const status = statusSelect ? statusSelect.value : 'all';
                let visible = 0;
                cards.forEach((card) => {
                    const searchable = normalize([
                        card.querySelector('.ev-card__title')?.textContent,
                        card.querySelector('.ev-card__desc')?.textContent,
                        card.querySelector('.ev-card__info')?.textContent,
                        card.querySelector('.ev-card__cat')?.textContent,
                    ].join(' '));
                    const matches = (selectedCategory === 'all' || card.dataset.category === selectedCategory)
                        && (status === 'all' || card.dataset.status === status)
                        && (!keyword || searchable.includes(keyword));
                    card.classList.toggle('is-filtered-out', !matches);
                    if (matches) visible += 1;
                });
                if (countEl) countEl.textContent = `Hiển thị ${visible} / ${cards.length} hoạt động, sự kiện`;
                toggleEmptyState('ev-empty-state', visible === 0);
                if (tabsHost) {
                    tabsHost.querySelectorAll('.ev-tab-btn').forEach((button) => {
                        const active = button.dataset.category === selectedCategory;
                        button.classList.toggle('is-active', active);
                        button.setAttribute('aria-selected', String(active));
                    });
                }
            };
            if (tabsHost) {
                tabsHost.addEventListener('click', (event) => {
                    const button = event.target.closest('.ev-tab-btn');
                    if (!button || !tabsHost.contains(button)) return;
                    selectedCategory = button.dataset.category || 'all';
                    renderFilteredEvents();
                });
            }
            if (searchInput) searchInput.addEventListener('input', renderFilteredEvents);
            if (statusSelect) statusSelect.addEventListener('change', renderFilteredEvents);
            const resetFilters = () => {
                selectedCategory = 'all';
                if (searchInput) searchInput.value = '';
                if (statusSelect) statusSelect.value = 'all';
                renderFilteredEvents();
            };
            if (resetButton) resetButton.addEventListener('click', resetFilters);
            if (emptyResetButton) emptyResetButton.addEventListener('click', resetFilters);
            renderFilteredEvents();
        } catch (err) {
            if (spotlight) spotlight.hidden = true;
            if (host) setError(host, err.message);
        }
    }

    /* -------------------------- Cơ quan - đơn vị ---------------------------- */

    async function initAgencies() {
        const host = document.getElementById('ag-grid-list');
        if (!host) return;
        setLoading(host, 'Đang tải danh bạ cơ quan, đơn vị…');
        try {
            const list = asList(await api.get('/api/public/agencies'), 'cơ quan, đơn vị');
            if (!list.length) {
                setEmpty(host, 'Chưa có cơ quan, đơn vị nào được công bố.');
                toggleEmptyState('ag-empty-state', false);
                refreshStaticPage(host);
                return;
            }

            const ICONS = {
                coordination: 'fa-shield-halved', enforcement: 'fa-building-shield',
                health: 'fa-hospital', education: 'fa-graduation-cap',
                association: 'fa-people-group', local: 'fa-building-columns',
            };
            const GROUPS = {
                coordination: 'chuyen-trach', enforcement: 'chuyen-trach',
                health: 'y-te', education: 'giao-duc', association: 'doan-the', local: 'chuyen-trach',
            };
            const BADGES = {
                coordination: 'Chỉ đạo & Chuyên trách', enforcement: 'Lực lượng nòng cốt',
                health: 'Y tế & Điều trị', education: 'Giáo dục - Tuyên truyền',
                association: 'Đoàn thể - Xã hội', local: 'Chính quyền cơ sở',
            };
            const GROUP_LABELS = {
                'chuyen-trach': 'Chỉ đạo & Chuyên trách',
                'y-te': 'Y tế & Điều trị',
                'giao-duc': 'Giáo dục - Tuyên truyền',
                'doan-the': 'Đoàn thể - Xã hội',
            };

            host.innerHTML = list.map((o) => `
                <article class="ag-card" data-group="${GROUPS[o.roleType] || 'chuyen-trach'}" data-area="toan-thanh-pho">
                    <div>
                        <div class="ag-card__top">
                            <div class="ag-card__icon">
                                <i class="fa-solid ${ICONS[o.roleType] || 'fa-building-shield'}" aria-hidden="true"></i>
                            </div>
                            <span class="ag-card__badge">${BADGES[o.roleType] || 'Đơn vị'}</span>
                        </div>
                        <h2 class="ag-card__title">
                            <a href="agency-detail.html?id=${encodeURIComponent(o.id)}">${esc(o.name)}</a>
                        </h2>
                        <p class="ag-card__desc">${esc(o.description || '')}</p>
                        <ul class="ag-card__meta">
                            <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(o.address || '—')}</li>
                            <li><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(o.phone || '—')}</li>
                            <li><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc(o.email || '—')}</li>
                        </ul>
                    </div>
                    <div class="ag-card__footer">
                        <span class="ag-card__scope">Phạm vi: Toàn Thành phố</span>
                        <a href="agency-detail.html?id=${encodeURIComponent(o.id)}" class="ag-card__link">
                            Xem hồ sơ đơn vị <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                        </a>
                    </div>
                </article>`).join('');
            host.removeAttribute('aria-busy');

            const count = document.getElementById('ag-result-count');
            if (count) count.textContent = `Hiển thị ${list.length} cơ quan, đơn vị`;
            const tab = document.querySelector('.ag-tab-btn[data-group="all"]');
            if (tab) tab.textContent = `Tất cả đơn vị (${list.length})`;
            const tabsHost = document.querySelector('.ag-tabs');
            if (tabsHost) {
                const groups = [...new Set(list.map((agency) => GROUPS[agency.roleType] || 'chuyen-trach'))];
                tabsHost.innerHTML = `<button type="button" class="ag-tab-btn is-active" data-group="all">
                        Tất cả đơn vị (${list.length})
                    </button>` + groups.map((group) => `
                    <button type="button" class="ag-tab-btn" data-group="${group}">${GROUP_LABELS[group]}</button>`).join('');
            }
            refreshStaticPage(host);
        } catch (err) {
            setError(host, err.message);
        }
    }

    /* --------------------------- Hỗ trợ cai nghiện -------------------------- */

    async function initSupport() {
        const host = document.querySelector('[data-support-list]') || document.getElementById('sup-centers-list');
        if (!host) return;
        try {
            const list = await api.get('/api/public/support-facilities');
            if (!list.length) {
                setEmpty(host, 'Chưa có cơ sở hỗ trợ cai nghiện nào được công bố.');
                return;
            }

            const items = (q, type) => list.filter((f) => {
                const text = `${f.name} ${f.district} ${f.address} ${f.description}`.toLowerCase();
                const matchQ = !q || text.includes(q.toLowerCase());
                const matchType = !type || type === 'all' || f.type === type;
                return matchQ && matchType;
            });

            const render = (q, type) => {
                const rows = items(q, type);
                host.innerHTML = rows.length ? rows.map((f) => `
                    <li class="sup-center-item">
                        <h3 class="sup-center-item__name">${esc(f.name)}</h3>
                        <p class="sup-center-item__desc">${esc(f.description || '')}</p>
                        <div class="sup-center-item__meta">
                            <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(f.address || f.district || '')}</span>
                            <span><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(f.phone || '—')}</span>
                            <span><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(f.hours || '')}</span>
                        </div>
                    </li>`).join('')
                    : '<li class="sup-center-item sup-center-item--empty">Không tìm thấy cơ sở phù hợp với điều kiện lọc.</li>';
            };

            render('', 'all');
            const input = document.getElementById('sup-search-input');
            const select = document.getElementById('sup-type-select');
            const apply = () => render(input ? input.value : '', select ? select.value : 'all');
            if (input) input.addEventListener('input', apply);
            if (select) select.addEventListener('change', apply);
            const btn = document.getElementById('sup-search-btn');
            if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); apply(); });
        } catch (err) {
            setError(host, err.message);
        }
    }

    /* ------------------------------ Khởi tạo -------------------------------- */

    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isHome = !/\.html$/.test(window.location.pathname) || page === 'index.html';

    const run = () => {
        if (isHome) {
            initNewsList();
            initEvents();
        }
        if (page === 'news.html') initNewsList();
        if (page === 'news-detail.html') initNewsDetail();
        if (page === 'education-detail.html') initEducationDetail();
        if (page === 'statistics.html') initStatistics();
        if (page === 'laws.html') initLaws();
        if (page === 'education.html') initEducation();
        if (page === 'events.html') initEvents();
        if (page === 'event-detail.html') initEventDetail();
        if (page === 'agencies.html') initAgencies();
        if (page === 'agency-detail.html') initAgencyDetail();
        if (page === 'support.html') initSupport();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();

    window.PublicPages = { initNewsList, initNewsDetail, initEducation, initEducationDetail, initStatistics, initEvents, initEventDetail, initAgencies, initAgencyDetail };
})();
