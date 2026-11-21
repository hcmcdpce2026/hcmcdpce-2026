/**
 * public-pages.js – Kết nối các trang PUBLIC với API của Cổng thông tin.
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh –
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
    const placeholderUrl = (prefix) => `${prefix}assets/images/article-placeholder.svg`;

    const thumbOf = (a, _i, prefix) => {
        const src = a && typeof a.thumbnail === 'string' ? a.thumbnail.trim() : '';
        if (src) {
            if (/^(https?:|data:|\/\/)/.test(src)) return src;
            if (src.startsWith('/')) return src;            // tuyệt đối từ gốc website
            const normalized = src.replace(/^(\.\.?\/)+/, '').replace(/^\.\//, '');
            return prefix + normalized;
        }
        return placeholderUrl(prefix);
    };

    /**
     * Ảnh đại diện có đường dẫn hỏng (tệp bị xoá, đường dẫn chép nhầm) sẽ lặp
     * vô hạn nếu trỏ lại chính URL lỗi. Gắn listener một lần cho mỗi ảnh và
     * thay bằng ảnh giữ chỗ tính từ gốc dự án.
     */
    document.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement)) return;
        if (img.dataset.fallbackApplied === '1') return;
        img.dataset.fallbackApplied = '1';
        img.src = placeholderUrl(assetPrefix());
        /* Giữ nguyên alt nghiệp vụ (tên bài viết); chỉ bổ sung khi ảnh trang trí. */
        if (!img.alt) img.alt = 'Chưa có hình ảnh minh họa';
    }, true);

    /** Tiền tố tới gốc dự án theo vị trí trang hiện tại (index.html ở gốc hoặc /pages/...). */
    function assetPrefix() {
        return /\/pages\//.test(window.location.pathname) ? '../../' : '';
    }

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
            /*
             * Trang Tin tức chỉ lấy bài thuộc nhóm chuyên mục "tin-tuc".
             * Trước đây truy vấn không kèm `group` nên nội dung Tuyên truyền -
             * Giáo dục (nhóm education) cũng lọt vào khối tin tiêu điểm và danh sách.
             * Trang chủ thì lấy toàn bộ bài đã xuất bản vì cần hiển thị đa nhóm.
             */
            const params = { limit: 50, search: keyword };
            if (list) params.group = 'tin-tuc';
            const articles = await api.get('/api/public/articles' + api.qs(params));
            if (list) await renderNewsCategoryTabs(articles);
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

    /** Số bài tối đa ở cột phải của khối tin tiêu điểm. */
    const SPOTLIGHT_SIDE_LIMIT = 3;

    /**
     * Khối “Tin tiêu điểm”: bài mới nhất làm tin chính bên trái, các bài kế tiếp
     * vào cột phải — tối đa 3 bài, đúng thứ tự mới nhất trước.
     *
     * Thứ tự do API quyết định (`ORDER BY published_at DESC`), nên chỉ cần cắt
     * đúng số lượng: `hero` là bài đầu, cột phải là 3 bài tiếp theo.
     * Cột phải luôn cố định kể cả khi chỉ có 1-2 bài: lưới giữ nguyên 2 cột để
     * tin chính không co giãn khác thường so với trạng thái đủ bài.
     * Nội dung hoàn toàn từ API (bài đã xuất bản qua CMS).
     */
    function renderSpotlight(articles) {
        const grid = document.querySelector('.news-spotlight__grid');
        const spotlight = document.querySelector('.news-spotlight');
        if (!grid || !articles.length) return;
        const [hero, ...rest] = articles;
        const side = rest.slice(0, SPOTLIGHT_SIDE_LIMIT);

        /* Chỉ còn đúng 1 bài: không có cột phải để dựng → tin chính chiếm full chiều rộng */
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
                    <a href="${detailUrl(a)}" class="news-mini-card__thumb" tabindex="-1" aria-hidden="true">
                        <img src="${thumbOf(a, i + 1, '../../')}" alt="" loading="lazy">
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
     * Chỉ lấy chuyên mục nhóm "tin-tuc": chuyên mục của nhóm khác không có bài
     * nào trên trang này nên sẽ tạo ra nút lọc luôn rỗng.
     */
    async function renderNewsCategoryTabs(articles) {
        const host = document.getElementById('news-category-tabs');
        if (!host) return;
        try {
            const categories = await api.get('/api/public/categories');
            const articleCounts = new Map();
            (Array.isArray(articles) ? articles : []).forEach((article) => {
                const slug = article.categorySlug;
                if (slug) articleCounts.set(slug, (articleCounts.get(slug) || 0) + 1);
            });
            const used = (categories || [])
                .filter((c) => articleCounts.has(c.slug) && (!c.group || c.group === 'tin-tuc'))
                .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
            const extra = used.map((c) => `
                <button type="button" class="news-cat-btn" data-category="${esc(c.slug)}">
                    ${esc(c.name)} (${articleCounts.get(c.slug)})
                </button>`).join('');
            host.innerHTML = `<button type="button" class="news-cat-btn is-active" data-category="all">
                    Tất cả tin bài (${Array.isArray(articles) ? articles.length : 0})
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

        /*
         * data-category phải dùng SLUG chứ không phải id: nút lọc
         * (#news-category-tabs) được dựng từ /api/public/categories và mang
         * data-category="<slug>". Trước đây thẻ gắn categoryId (id nội bộ),
         * không bao giờ khớp slug → bấm tag nào cũng ra 0 bài.
         * data-category-id giữ lại để tra cứu/đối chiếu khi cần.
         */
        list.innerHTML = articles.map((a, i) => `
            <article class="news-article" data-category="${esc(a.categorySlug || a.categoryId || '')}"
                data-category-id="${esc(a.categoryId || '')}">
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

    /**
     * Trang chủ – khối “Tuyên truyền - Giáo dục”.
     * Chỉ lấy bài đã xuất bản thuộc nhóm chuyên mục `education`; giữ nguyên bố cục
     * 3 thẻ của section và hiển thị 3 bài mới nhất (hoặc theo thứ tự CMS).
     */
    async function initHomeEducation() {
        const grid = document.getElementById('home-education-grid');
        if (!grid) return;
        const ICONS = [
            'fa-shield-heart', 'fa-triangle-exclamation', 'fa-people-group',
            'fa-book-open-reader', 'fa-graduation-cap', 'fa-house-chimney-user',
        ];
        setLoading(grid, 'Đang tải chuyên đề tuyên truyền - giáo dục…');
        try {
            const rows = asList(
                await api.get('/api/public/articles' + api.qs({ limit: 3, group: 'tuyen-truyen-giao-duc' })),
                'chuyên đề tuyên truyền'
            );

            if (!rows.length) {
                /* Không có bài: giữ section nhưng không để khoảng trống lớn */
                grid.innerHTML = `<div class="pub-state" style="grid-column:1/-1">
                    <i class="fa-solid fa-book-open" aria-hidden="true"></i>
                    <span>Chuyên đề tuyên truyền - giáo dục đang được Ban Biên tập cập nhật.</span></div>`;
                grid.removeAttribute('aria-busy');
                return;
            }

            grid.innerHTML = rows.slice(0, 3).map((a, i) => `
                <article class="site-main__education-card">
                    <div class="site-main__education-icon">
                        <i class="fa-solid ${ICONS[i % ICONS.length]}" aria-hidden="true"></i>
                    </div>
                    <h3 class="site-main__education-title">
                        <a href="pages/public/education-detail.html?id=${encodeURIComponent(a.id)}">${esc(a.title)}</a>
                    </h3>
                    <p class="site-main__education-description">${esc(a.excerpt || '')}</p>
                    <a href="pages/public/education-detail.html?id=${encodeURIComponent(a.id)}"
                        class="site-main__education-link">
                        Tìm hiểu thêm
                        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                    </a>
                </article>`).join('');
            grid.removeAttribute('aria-busy');
        } catch (err) {
            setError(grid, err.message);
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
            document.title = `${(a.title + ' | CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

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
            document.title = `${(a.title + ' | CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

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

    /**
     * Biểu đồ thanh ngang: tỉ trọng từng chỉ tiêu so với chỉ tiêu lớn nhất.
     * Nguồn dữ liệu là `period.items` do API công khai trả về.
     */
    function renderHBar(period) {
        const host = document.getElementById('st-hbar-container');
        if (!host) return;
        const items = (period.items || []).filter((i) => Number.isFinite(Number(i.value)));
        if (!items.length) {
            setEmpty(host, 'Chưa có số liệu cho kỳ báo cáo này.');
            return;
        }
        const max = Math.max.apply(null, items.map((i) => Number(i.value) || 0)) || 1;
        host.innerHTML = items.map((item) => {
            const value = Number(item.value) || 0;
            const pct = Math.max(2, Math.round((value / max) * 100));
            return `<div class="st-hbar-item">
                <div class="st-hbar-item__top">
                    <span>${esc(item.label)}</span>
                    <span class="st-hbar-item__count">${value.toLocaleString('vi-VN')}${item.unit ? ' ' + esc(item.unit) : ''}</span>
                </div>
                <div class="st-hbar-item__track">
                    <div class="st-hbar-item__fill" style="width:${pct}%"></div>
                </div>
            </div>`;
        }).join('');
    }

    /**
     * Biểu đồ cột theo quý, dựng từ các kỳ báo cáo có nhãn dạng “Quý I..IV”.
     * Kỳ hiện tại được làm nổi bật; quý không có số liệu hiển thị cột 0.
     */
    const QUARTER_LABELS = ['Quý I', 'Quý II', 'Quý III', 'Quý IV'];

    function quarterIndexOf(key) {
        const k = String(key || '').toLowerCase();
        if (/q1|quy-?1|quý-?1|quy_?i\b/.test(k)) return 0;
        if (/q2|quy-?2|quý-?2|quy_?ii\b/.test(k)) return 1;
        if (/q3|quy-?3|quý-?3|quy_?iii\b/.test(k)) return 2;
        if (/q4|quy-?4|quý-?4|quy_?iv\b/.test(k)) return 3;
        return -1;
    }

    function renderVChart(period, periods) {
        const host = document.getElementById('st-vchart-bars');
        if (!host) return;

        /* Ưu tiên chỉ tiêu mô tả lượng người được tư vấn/điều trị, nếu không có thì dùng chỉ tiêu đầu tiên */
        const pickMetric = (p) => {
            const items = p.items || [];
            return items.find((i) => /tư vấn|điều trị|cai nghiện/i.test(String(i.label || ''))) || items[0];
        };

        const values = QUARTER_LABELS.map(() => 0);
        let matched = 0;
        (periods || []).forEach((p) => {
            const idx = quarterIndexOf(p.key);
            if (idx === -1) return;
            const metric = pickMetric(p);
            if (!metric) return;
            values[idx] = Number(metric.value) || 0;
            matched += 1;
        });

        if (!matched) {
            /* #st-vchart-bars là lưới 4 cột: thông báo trống phải trải hết chiều ngang,
               nếu không nó bị bóp trong một cột và chữ xuống dòng theo từng ký tự. */
            host.innerHTML = `<div class="pub-state" style="grid-column:1/-1;align-self:center">
                <i class="fa-solid fa-chart-column" aria-hidden="true"></i>
                <span>Chưa có số liệu theo quý được công bố.</span></div>`;
            return;
        }

        const max = Math.max.apply(null, values) || 1;
        host.innerHTML = values.map((v) => {
            const pct = Math.max(v > 0 ? 6 : 0, Math.round((v / max) * 100));
            return `<div class="st-vchart__col" title="${v.toLocaleString('vi-VN')} lượt">
                <span class="st-vchart__val">${v ? v.toLocaleString('vi-VN') : '—'}</span>
                <div class="st-vchart__bar" style="height:${pct}%"></div>
            </div>`;
        }).join('');
    }

    /** Bảng tổng hợp chỉ tiêu của kỳ đang chọn. */
    function renderStatTable(period) {
        const body = document.getElementById('st-table-body');
        if (!body) return;
        const items = period.items || [];
        if (!items.length) {
            body.innerHTML = '<tr><td colspan="5">Chưa có số liệu cho kỳ báo cáo này.</td></tr>';
            return;
        }
        body.innerHTML = items.map((item) => `
            <tr>
                <td>${esc(item.label)}</td>
                <td>${esc(item.unit || '—')}</td>
                <td class="st-table__num">${Number(item.value || 0).toLocaleString('vi-VN')}</td>
                <td>${period.verified ? '<span class="st-text-success">Đã phê duyệt</span>' : '<span>Kỳ báo cáo</span>'}</td>
                <td><span class="st-badge-pos">${period.verified ? 'Đã xác minh' : 'Đang tổng hợp'}</span></td>
            </tr>`).join('');
    }

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

                renderHBar(period);
                renderVChart(period, periods);
                renderStatTable(period);
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
     *
     * Bộ lọc chủ đề dựa trên slug chuyên mục do CMS quản lý — không dùng bảng ánh xạ
     * cố định — nên chuyên mục thêm/sửa trong CMS tự xuất hiện thành một chủ đề lọc.
     */
    const topicOf = (a) => a.categorySlug || 'khac';

    async function initEducation() {
        const grid = document.getElementById('ed-grid-list');
        if (!grid) return;
        const countEl = document.getElementById('ed-result-count');
        const tabsHost = document.querySelector('.ed-tabs');
        setLoading(grid, 'Đang tải chuyên đề tuyên truyền - giáo dục…');
        try {
            /* Chỉ lấy nội dung đã xuất bản thuộc nhóm chuyên mục "education" */
            const rows = asList(
                await api.get('/api/public/articles' + api.qs({ limit: 50, group: 'tuyen-truyen-giao-duc' })),
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
                <article class="ed-card" data-topic="${esc(topicOf(a))}">
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

            /* Nút lọc dựng từ chuyên mục thực có bài đã xuất bản, kèm số bài của từng chủ đề */
            if (tabsHost) {
                const topics = new Map();
                rows.forEach((article) => {
                    const topic = topicOf(article);
                    if (!topics.has(topic)) topics.set(topic, { label: article.categoryName || 'Chuyên đề', count: 0 });
                    topics.get(topic).count += 1;
                });
                tabsHost.innerHTML = `<button type="button" class="ed-tab-btn is-active" data-topic="all">
                        Tất cả chuyên đề (${rows.length})
                    </button>` + [...topics].map(([topic, info]) => `
                    <button type="button" class="ed-tab-btn" data-topic="${esc(topic)}">${esc(info.label)} (${info.count})</button>`).join('');
            }

            refreshStaticPage(grid);
        } catch (err) {
            setError(grid, err.message);
        }
    }

    /* -------------------------- Văn bản pháp luật --------------------------- */

    /**
     * Tình trạng hiệu lực hiển thị theo dữ liệu CMS, không mặc định "Đang có hiệu lực":
     * văn bản đã hết hiệu lực/bị thay thế phải được cảnh báo đúng cho người tra cứu.
     */
    const LAW_EFFECT = {
        in_effect: { label: 'Còn hiệu lực', icon: 'fa-circle-check', mod: 'ok' },
        expired: { label: 'Đã hết hiệu lực', icon: 'fa-circle-xmark', mod: 'expired' },
        replaced: { label: 'Đã bị thay thế', icon: 'fa-shuffle', mod: 'replaced' },
        amended: { label: 'Được sửa đổi, bổ sung', icon: 'fa-pen-to-square', mod: 'amended' },
    };

    function lawStatusBadge(doc) {
        const cfg = LAW_EFFECT[doc.effectStatus] || LAW_EFFECT.in_effect;
        return `<span class="lw-doc-status lw-doc-status--${cfg.mod}">
            <i class="fa-solid ${cfg.icon}" aria-hidden="true"></i> ${esc(cfg.label)}
        </span>`;
    }

    async function initLawDetail() {
        if (!document.getElementById('lwd-title')) return;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value == null || value === '' ? '—' : value;
        };
        const sections = document.getElementById('lwd-sections');
        const showError = (message) => {
            setText('lwd-title', message);
            setText('lwd-crumb-code', '');
            if (sections) sections.innerHTML = `<p role="alert">${esc(message)}</p>`;
            const viewer = document.getElementById('lwd-viewer-wrap');
            if (viewer) viewer.hidden = true;
        };
        const id = api.query('id');
        if (!id) {
            showError('Không xác định được văn bản cần xem.');
            return;
        }

        try {
            const doc = await api.get(`/api/public/legal-documents${api.qs({ id })}`);
            const number = doc.docNumber || doc.code || '—';
            const title = doc.title || 'Văn bản pháp luật';
            const effect = LAW_EFFECT[doc.effectStatus] || LAW_EFFECT.in_effect;

            document.title = `${title} | Pháp luật`;
            setText('lwd-crumb-code', number);
            setText('lwd-code', number);
            setText('lwd-type', doc.docTypeName || doc.docType);
            setText('lwd-status', effect.label);
            setText('lwd-title', title);
            setText('lwd-prop-code', number);
            setText('lwd-prop-type', doc.docTypeName || doc.docType);
            setText('lwd-prop-issuer', doc.issuer);
            setText('lwd-prop-issued', fmtDate(doc.issuedAt));
            setText('lwd-prop-effective', fmtDate(doc.effectiveAt));
            setText('lwd-prop-status', effect.label);

            const textBlocks = (value) => String(value || '').trim().split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => `<p>${esc(line)}</p>`)
                .join('');
            const content = [];
            if (doc.summary) content.push(`<section class="lwd-article-block"><h3>Trích yếu</h3>${textBlocks(doc.summary)}</section>`);
            if (doc.content) content.push(`<section class="lwd-article-block"><h3>Nội dung chi tiết</h3>${textBlocks(doc.content)}</section>`);
            if (sections) {
                sections.innerHTML = content.length
                    ? content.join('')
                    : '<p>Chưa có nội dung tóm tắt hoặc toàn văn được cập nhật.</p>';
            }

            let fileUrl = '';
            try {
                const rawUrl = String(doc.fileUrl || '').trim();
                if (rawUrl) {
                    const resolvedUrl = new URL(rawUrl, new URL('../../', window.location.href));
                    if (resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:') fileUrl = resolvedUrl.href;
                }
            } catch (_) {
                fileUrl = '';
            }
            const frame = document.getElementById('lwd-pdf-frame');
            const empty = document.getElementById('lwd-pdf-empty');
            const hint = document.getElementById('lwd-pdf-hint');
            const previewUrl = fileUrl ? new URL(fileUrl) : null;
            if (previewUrl && previewUrl.origin === window.location.origin
                && previewUrl.pathname.startsWith('/uploads/')) {
                previewUrl.searchParams.set('preview', '1');
            }
            if (frame) {
                frame.hidden = !fileUrl;
                if (previewUrl) frame.src = previewUrl.href;
                else frame.removeAttribute('src');
            }
            if (empty) {
                empty.hidden = Boolean(fileUrl);
                empty.style.display = fileUrl ? 'none' : 'flex';
            }
            if (hint) hint.hidden = !fileUrl;
            ['lwd-open-tab', 'lwd-download-btn'].forEach((linkId) => {
                const link = document.getElementById(linkId);
                if (!link) return;
                link.href = fileUrl || '#';
                link.classList.toggle('is-disabled', !fileUrl);
                if (fileUrl) {
                    link.removeAttribute('aria-disabled');
                    link.removeAttribute('tabindex');
                } else {
                    link.setAttribute('aria-disabled', 'true');
                    link.tabIndex = -1;
                }
            });

            const relatedList = document.getElementById('lwd-related-list');
            if (relatedList) {
                try {
                    const docs = await api.get('/api/public/legal-documents');
                    const related = (Array.isArray(docs) ? docs : [])
                        .filter((item) => item.id !== doc.id && (
                            (doc.legalField && item.legalField === doc.legalField)
                            || (doc.docType && item.docType === doc.docType)
                        ))
                        .slice(0, 5);
                    relatedList.innerHTML = related.length
                        ? related.map((item) => `<li><a href="law-detail.html?id=${encodeURIComponent(item.id)}">
                            <span class="lwd-related-code">${esc(item.docNumber || item.code || '')}</span>
                            <span class="lwd-related-title">${esc(item.title || '')}</span>
                        </a></li>`).join('')
                        : '<li>Chưa có văn bản liên quan.</li>';
                } catch (_) {
                    relatedList.innerHTML = '<li>Không tải được danh sách văn bản liên quan.</li>';
                }
            }
        } catch (err) {
            showError(err.message || 'Không tải được văn bản pháp luật.');
        }
    }

    async function initLaws() {
        const host = document.getElementById('lw-doc-list');
        if (!host) return;
        setLoading(host, 'Đang tải văn bản pháp luật…');
        try {
            const [docs, typeCategories, fieldCategories] = await Promise.all([
                api.get('/api/public/legal-documents'),
                api.get('/api/public/system-categories?type=doc_type'),
                api.get('/api/public/system-categories?type=legal_field'),
            ]);
            asList(docs, 'văn bản pháp luật');
            asList(typeCategories, 'loại văn bản');
            asList(fieldCategories, 'lĩnh vực pháp luật');
            const typeLabels = new Map(typeCategories.map((category) => [category.code, category.name]));
            const fieldLabels = new Map(fieldCategories.map((category) => [category.code, category.name]));
            const counts = docs.reduce((result, doc) => {
                if (doc.docType) result[doc.docType] = (result[doc.docType] || 0) + 1;
                return result;
            }, {});
            const labelWithCount = (label, count) => count > 0 ? `${label} (${count})` : label;
            const fieldSelect = document.getElementById('lw-topic-select');
            if (fieldSelect) {
                fieldSelect.textContent = '';
                const allFields = document.createElement('option');
                allFields.value = 'all';
                allFields.textContent = 'Tất cả lĩnh vực quy định';
                fieldSelect.appendChild(allFields);
                fieldCategories.forEach((category) => {
                    const option = document.createElement('option');
                    option.value = category.code;
                    option.textContent = category.name;
                    fieldSelect.appendChild(option);
                });
            }
            const tabsHost = document.getElementById('lw-type-tabs');
            if (tabsHost) {
                tabsHost.innerHTML = `<button type="button" class="lw-tab-btn is-active" aria-selected="true" data-doctype="all">
                    ${esc(labelWithCount('Tất cả văn bản', docs.length))}
                </button>` + typeCategories.map((category) => `
                    <button type="button" class="lw-tab-btn" aria-selected="false" data-doctype="${esc(category.code)}">
                        ${esc(labelWithCount(category.name, counts[category.code] || 0))}
                    </button>`).join('');
            }
            if (!docs.length) {
                setEmpty(host, 'Chưa có văn bản pháp luật nào được công bố.');
                toggleEmptyState('lw-empty-state', false);
                refreshStaticPage(host);
                return;
            }

            /* Danh sách do API cung cấp; báo main.js lập lại chỉ mục bộ lọc/tìm kiếm. */
            host.innerHTML = docs.map((d) => `
                <article class="lw-doc-card" data-doctype="${esc(d.docType)}" data-topic="${esc(d.legalField || 'all')}">
                    <div class="lw-doc-card__top">
                        <div class="lw-doc-card__badges">
                            <span class="lw-doc-code">
                                <i class="fa-solid fa-file-lines" aria-hidden="true"></i>
                                ${esc(d.docNumber || d.code)}
                            </span>
                            <span class="lw-doc-type">${esc(d.docTypeName || typeLabels.get(d.docType) || d.docType || '')}${d.legalField ? ` · ${esc(d.legalFieldName || fieldLabels.get(d.legalField) || d.legalField)}` : ''}</span>
                        </div>
                        ${lawStatusBadge(d)}
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
            if (tab) tab.textContent = labelWithCount('Tất cả văn bản', docs.length);
            const countEl = document.getElementById('lw-result-count');
            if (countEl) countEl.textContent = `Hiển thị ${docs.length} văn bản quy phạm pháp luật`;
            refreshStaticPage(host);
        } catch (err) {
            setError(host, err.message);
        }
    }

    async function initContactTopics() {
        const select = document.getElementById('ct-topic');
        if (!select) return;
        const status = document.getElementById('ct-topic-status');
        const submitButton = document.getElementById('ct-submit-btn');
        const setStatus = (message) => {
            if (!status) return;
            status.textContent = message;
            status.hidden = !message;
        };
        try {
            const rows = asList(await api.get('/api/public/system-categories?type=contact_topic'), 'nhóm nội dung liên hệ');
            select.textContent = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = rows.length ? 'Chọn nhóm nội dung liên hệ' : 'Chưa có nhóm nội dung liên hệ';
            placeholder.disabled = true;
            placeholder.selected = true;
            select.appendChild(placeholder);
            rows.forEach((row) => {
                const option = document.createElement('option');
                option.value = row.code;
                option.textContent = row.name;
                select.appendChild(option);
            });
            select.disabled = rows.length === 0;
            if (submitButton) submitButton.disabled = rows.length === 0;
            setStatus(rows.length ? '' : 'Hiện chưa có lựa chọn liên hệ đang sử dụng. Vui lòng liên hệ quản trị viên.');
        } catch (error) {
            select.textContent = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Không thể tải nhóm nội dung liên hệ';
            option.disabled = true;
            option.selected = true;
            select.appendChild(option);
            select.disabled = true;
            if (submitButton) submitButton.disabled = true;
            setStatus('Không thể tải nhóm nội dung liên hệ. Vui lòng tải lại trang hoặc thử lại sau.');
            console.error('[public] Không tải được nhóm nội dung liên hệ:', error);
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
            document.title = `${(e.title + ' | CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

            setText('evd-crumb-name', e.title);
            setText('evd-category', e.eventType || e.category || 'Hoạt động - Sự kiện');
            setText('evd-title', e.title);
            setText('evd-lead', e.summary || '');
            setText('evd-caption', e.title);
            setText('evd-time', e.start ? `${fmtDate(e.start)}${e.end ? ' – ' + fmtDate(e.end) : ''}` : '—');
            setText('evd-location', e.location || '—');
            setText('evd-organizer', e.organizer || '—');
            setText('evd-audience', e.organizer ? `Đơn vị chủ trì: ${e.organizer}` : 'Mọi đối tượng quan tâm');

            const hero = document.getElementById('evd-image');
            if (hero) {
                hero.src = thumbOf({ thumbnail: e.image || e.imageUrl || e.image_url }, 0, '../../');
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
                                <span class="article-related-card__desc">
                                    <i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDate(r.start)}
                                </span>
                                ${r.location ? `<span class="article-related-card__desc">
                                    <i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(r.location)}
                                </span>` : ''}
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
            document.title = `${(o.name + ' | CHUYÊN TRANG ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH').toUpperCase()}`;

            setText('agd-crumb-name', o.name);
            setText('agd-badge', o.shortName || o.name);
            setText('agd-title', o.name);
            setText('agd-summary', o.description || '');
            setText('agd-address', o.address || '—');
            setText('agd-hotline', o.phone || '—');
            setText('agd-scope', o.managementLevelName || 'Chưa phân loại');
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

        /*
         * Nhãn, thứ tự và sự tồn tại của trạng thái do CMS quản lý
         * (danh mục `event_status`). Mã vẫn phải khớp cột public_events.status,
         * nhưng người biên tập có thể đổi tên hiển thị, ẩn bớt hoặc sắp lại.
         * Nếu chưa tải được danh mục thì vẫn tính trạng thái theo mã + ngày.
         */
        const TRANG_THAI_MAC_DINH = { upcoming: 'Sắp diễn ra', ongoing: 'Đang triển khai', past: 'Đã tổ chức' };
        const statusOptions = await api.get('/api/public/event-statuses').catch(() => null);
        const statusLabels = Object.assign({}, TRANG_THAI_MAC_DINH);
        const statusRoles = {};
        (Array.isArray(statusOptions) ? statusOptions : []).forEach((row) => {
            if (!row || !row.code) return;
            statusLabels[row.code] = row.name || statusLabels[row.code] || row.code;
            statusRoles[row.code] = row.role || '';
        });
        const roleOfStatus = (code) => statusRoles[code] || '';
        const statusClass = (code) => 'ev-card__status--' + String(code || 'past').replace(/[^a-z0-9-]/gi, '');
        const statusOf = (e) => {
            const now = Date.now();
            const start = e.start ? Date.parse(e.start) : NaN;
            const end = e.end ? Date.parse(e.end) : NaN;
            const declaredStatus = statusLabels[e.status] ? e.status : null;
            if (Number.isFinite(start) && now < start) return 'upcoming';
            if (Number.isFinite(end)) return now <= end ? 'ongoing' : 'past';
            if (Number.isFinite(start)) return declaredStatus === 'ongoing' ? 'ongoing' : 'past';
            return declaredStatus || 'past';
        };
        const eventTypeOf = (event) => String(event.eventType || event.category || '').trim();
        const eventImage = (event, index, prefix) => thumbOf({ thumbnail: event.image }, index, prefix);

        if (host) setLoading(host, 'Đang tải sự kiện…');
        if (spotlight) spotlight.hidden = true;
        try {
            const list = asList(await api.get('/api/public/events'), 'sự kiện');

            /* --- Sự kiện trọng điểm: sự kiện sắp/đang diễn ra gần nhất --- */
            if (spotlight) {
                const eligible = list
                    .filter((event) => ['upcoming', 'ongoing'].includes(statusOf(event)))
                    .sort((a, b) => {
                        const aStart = Date.parse(a.start);
                        const bStart = Date.parse(b.start);
                        return (Number.isFinite(aStart) ? aStart : Infinity)
                            - (Number.isFinite(bStart) ? bStart : Infinity);
                    });
                const lead = eligible[0];
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
                                ${esc(statusLabels[statusOf(lead)] || statusOf(lead))}
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
                            <span class="site-main__category">${esc(eventTypeOf(event) || 'Hoạt động')}</span>
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
                const eventType = eventTypeOf(e);
                const startDate = e.start ? new Date(e.start) : null;
                const validStart = startDate && !Number.isNaN(startDate.getTime());
                const day = validStart ? String(startDate.getDate()).padStart(2, '0') : '—';
                const month = validStart ? `Th${startDate.getMonth() + 1}` : '';
                return `
                    <article class="ev-card" data-category="${esc(eventType || 'all')}" data-status="${st}">
                        <div class="ev-card__thumb">
                            <img src="${eventImage(e, i, '../../')}" alt="${esc(e.title)}" loading="lazy">
                            <div class="ev-card__date-badge">
                                <span class="ev-card__date-day">${day}</span>
                                <span class="ev-card__date-month">${month}</span>
                            </div>
                            <span class="ev-card__status ${statusClass(st)}">${esc(statusLabels[st] || st)}</span>
                        </div>
                        <div class="ev-card__body">
                            <span class="ev-card__cat">${esc(eventType || 'Hoạt động')}</span>
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
                const categoryCounts = new Map();
                list.forEach((event) => {
                    const eventType = eventTypeOf(event);
                    if (eventType) categoryCounts.set(eventType, (categoryCounts.get(eventType) || 0) + 1);
                });
                const cats = [...categoryCounts.keys()];
                tabs.innerHTML = `<button type="button" class="ev-tab-btn is-active" data-category="all">
                        Tất cả hoạt động (${list.length})
                    </button>` + cats.map((c) => {
                    const label = c.replace(/[-_]+/g, ' ');
                    return `<button type="button" class="ev-tab-btn" data-category="${esc(c)}">${esc(label)} (${categoryCounts.get(c)})</button>`;
                }).join('');
            }

            const searchInput = document.getElementById('ev-search-input');
            const statusSelect = document.getElementById('ev-status-select');
            const resetButton = document.getElementById('ev-reset-btn');
            const emptyResetButton = document.getElementById('ev-empty-reset');

            /* Lựa chọn trạng thái dựng từ danh mục CMS (event_status) thay vì HTML tĩnh */
            if (statusSelect) {
                const current = statusSelect.value || 'all';
                statusSelect.textContent = '';
                const allOption = document.createElement('option');
                allOption.value = 'all';
                allOption.textContent = 'Tất cả trạng thái';
                statusSelect.appendChild(allOption);
                (Array.isArray(statusOptions) ? statusOptions : []).forEach((row) => {
                    if (!row || !row.code) return;
                    const option = document.createElement('option');
                    option.value = row.code;
                    option.textContent = row.name || row.code;
                    statusSelect.appendChild(option);
                });
                statusSelect.value = [...statusSelect.options].some((o) => o.value === current) ? current : 'all';
            }
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

    const AGENCY_ICONS = {
        coordination: 'fa-shield-halved', enforcement: 'fa-building-shield',
        health: 'fa-hospital', education: 'fa-graduation-cap',
        association: 'fa-people-group', local: 'fa-building-columns',
        rehab: 'fa-house-medical', treatment: 'fa-house-medical',
    };

    const normalizeText = (value) => String(value || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

    /**
     * Cơ quan - Đơn vị.
     * Bộ lọc và thẻ được dựng hoàn toàn từ dữ liệu CMS: thêm/sửa/xóa cơ quan hoặc
     * đổi loại hình trong CMS sẽ phản ánh ngay vào nút lọc và danh sách.
     */
    async function initAgencies() {
        const host = document.getElementById('ag-grid-list');
        if (!host) return;
        setLoading(host, 'Đang tải danh bạ cơ quan, đơn vị…');
        try {
            const [listResult, roleResult, levelResult] = await Promise.all([
                api.get('/api/public/agencies'),
                api.get('/api/public/system-categories?type=agency_type'),
                api.get('/api/public/system-categories?type=management_level'),
            ]);
            const list = asList(listResult, 'cơ quan, đơn vị');
            const roleCategories = asList(roleResult, 'loại hình cơ quan');
            const levelCategories = asList(levelResult, 'cấp quản lý');
            const roleLabels = new Map(roleCategories.map((category) => [category.code, category.name]));
            const levelLabels = new Map(levelCategories.map((category) => [category.code, category.name]));
            const tabsHost = document.getElementById('ag-group-tabs');
            const areaSelect = document.getElementById('ag-area-select');
            const legend = document.getElementById('ag-legend');
            const allRoles = roleCategories.map((category) => category.code);
            const allLevels = levelCategories.map((category) => category.code);
            const roleOf = (o) => o.roleType || '';
            const levelOf = (o) => o.managementLevel || '';
            const countBy = (keyFn) => list.reduce((acc, o) => {
                const key = keyFn(o);
                if (key) acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const roleCounts = countBy(roleOf);
            const levelCounts = countBy(levelOf);
            const labelWithCount = (label, count) => count > 0 ? `${label} (${count})` : label;
            const roleOrder = allRoles.concat(Object.keys(roleCounts).filter((key) => !roleLabels.has(key)));
            const levelOrder = allLevels.concat(Object.keys(levelCounts).filter((key) => !levelLabels.has(key)));

            if (tabsHost) {
                tabsHost.innerHTML = `<button type="button" class="ag-tab-btn is-active" aria-selected="true" data-group="all">
                    ${esc(labelWithCount('Tất cả đơn vị', list.length))}
                </button>` + roleOrder.map((key) => `
                    <button type="button" class="ag-tab-btn" aria-selected="false" data-group="${esc(key)}">
                        ${esc(labelWithCount(roleLabels.get(key) || key, roleCounts[key] || 0))}
                    </button>`).join('');
            }
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="all">Tất cả cấp quản lý</option>' + levelOrder.map((key) =>
                    `<option value="${esc(key)}">${esc(levelLabels.get(key) || key)}</option>`).join('');
                areaSelect.value = 'all';
            }

            if (!list.length) {
                setEmpty(host, 'Chưa có cơ quan, đơn vị nào được công bố.');
                toggleEmptyState('ag-empty-state', false);
                refreshStaticPage(host);
                return;
            }

            host.innerHTML = list.map((o) => `
                <article class="ag-card" data-group="${esc(roleOf(o))}" data-level="${esc(levelOf(o))}"
                    data-search="${esc(normalizeText(`${o.name} ${o.shortName || ''} ${o.description || ''} ${o.address || ''} ${o.functions || ''}`))}">
                    <div>
                        <div class="ag-card__top">
                            <div class="ag-card__icon">
                                <i class="fa-solid ${AGENCY_ICONS[roleOf(o)] || 'fa-building-shield'}" aria-hidden="true"></i>
                            </div>
                            <span class="ag-card__badge">${esc(o.roleTypeName || roleLabels.get(roleOf(o)) || roleOf(o))}</span>
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
                        <span class="ag-card__scope">${esc(o.managementLevelName || levelLabels.get(levelOf(o)) || levelOf(o) || 'Chưa phân loại')}</span>
                        <a href="agency-detail.html?id=${encodeURIComponent(o.id)}" class="ag-card__link">
                            Xem hồ sơ đơn vị <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                        </a>
                    </div>
                </article>`).join('');
            host.removeAttribute('aria-busy');

            /* Bộ lọc hiển thị danh mục CMS và số bản ghi tương ứng. */
            if (legend) {
                legend.innerHTML = roleOrder.slice(0, 4).map((key) =>
                    `<span><i class="ag-dot ag-dot--gov"></i> ${esc(roleLabels.get(key) || key)}</span>`).join('');
            }

            /* --- Lọc kết hợp: loại hình + cấp quản lý + tìm kiếm --- */
            const cards = [...host.querySelectorAll('.ag-card')];
            const state = { group: 'all', level: 'all', keyword: '' };
            const resultCount = document.getElementById('ag-result-count');
            const searchInput = document.getElementById('ag-search-input');
            const resetBtn = document.getElementById('ag-reset-btn');
            const emptyResetBtn = document.getElementById('ag-empty-reset');

            const applyFilters = () => {
                const keyword = normalizeText(state.keyword);
                let visible = 0;
                cards.forEach((card) => {
                    const match = (state.group === 'all' || card.dataset.group === state.group)
                        && (state.level === 'all' || card.dataset.level === state.level)
                        && (!keyword || (card.dataset.search || '').includes(keyword));
                    card.classList.toggle('is-filtered-out', !match);
                    if (match) visible += 1;
                });
                if (resultCount) {
                    resultCount.textContent = visible === 0
                        ? 'Không tìm thấy cơ quan, đơn vị phù hợp'
                        : `Hiển thị ${visible} / ${cards.length} cơ quan, đơn vị`;
                }
                toggleEmptyState('ag-empty-state', visible === 0);
                if (tabsHost) {
                    tabsHost.querySelectorAll('.ag-tab-btn').forEach((btn) => {
                        const active = (btn.dataset.group || 'all') === state.group;
                        btn.classList.toggle('is-active', active);
                        btn.setAttribute('aria-selected', String(active));
                    });
                }
            };

            if (tabsHost && !tabsHost.dataset.bound) {
                tabsHost.dataset.bound = '1';
                tabsHost.addEventListener('click', (event) => {
                    const btn = event.target.closest('.ag-tab-btn');
                    if (!btn || !tabsHost.contains(btn)) return;
                    state.group = btn.dataset.group || 'all';
                    applyFilters();
                });
            }
            if (areaSelect && !areaSelect.dataset.bound) {
                areaSelect.dataset.bound = '1';
                areaSelect.addEventListener('change', () => {
                    state.level = areaSelect.value || 'all';
                    applyFilters();
                });
            }
            if (searchInput && !searchInput.dataset.bound) {
                searchInput.dataset.bound = '1';
                searchInput.addEventListener('input', () => {
                    state.keyword = searchInput.value;
                    applyFilters();
                });
            }
            const reset = () => {
                state.group = 'all';
                state.level = 'all';
                state.keyword = '';
                if (searchInput) searchInput.value = '';
                if (areaSelect) areaSelect.value = 'all';
                applyFilters();
            };
            [resetBtn, emptyResetBtn].forEach((btn) => {
                if (btn && !btn.dataset.bound) {
                    btn.dataset.bound = '1';
                    btn.addEventListener('click', reset);
                }
            });

            applyFilters();
            refreshStaticPage(host);
        } catch (err) {
            setError(host, err.message);
        }
    }

    /* --------------------------- Hỗ trợ cai nghiện -------------------------- */

    /**
     * Trang Hỗ trợ – mô hình danh bạ/định vị dịch vụ.
     * Toàn bộ cơ sở và loại hình lấy từ CMS; không có dữ liệu địa điểm
     * nào được khai báo tĩnh trong HTML hay JavaScript.
     */
    async function initSupport() {
        const host = document.getElementById('sup-centers-list') || document.querySelector('[data-support-list]');
        if (!host) return;
        const input = document.getElementById('sup-search-input');
        const typeSelect = document.getElementById('sup-type-select');
        const searchBtn = document.getElementById('sup-search-btn');
        setLoading(host, 'Đang tải danh sách cơ sở y tế và điểm tư vấn…');
        try {
            const [listResult, typeResult] = await Promise.all([
                api.get('/api/public/support-facilities'),
                api.get('/api/public/system-categories?type=facility_type'),
            ]);
            const list = asList(listResult, 'cơ sở hỗ trợ');
            const facilityTypes = asList(typeResult, 'loại hình cơ sở');
            const typeLabels = new Map(facilityTypes.map((category) => [category.code, category.name]));
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="all">Tất cả loại hình dịch vụ</option>' + facilityTypes.map((category) =>
                    `<option value="${esc(category.code)}">${esc(category.name)}</option>`).join('');
            }
            if (!list.length) {
                setEmpty(host, 'Chưa có cơ sở y tế hoặc điểm tư vấn nào được công bố.');
                return;
            }

            /* Số cơ sở Methadone hiển thị theo dữ liệu thực, không phải con số cố định */
            const methadoneCount = list.filter((f) =>
                normalizeText(`${f.type} ${f.typeName} ${f.name} ${(f.services || []).join(' ')}`)
                    .includes('methadone')).length;
            const countEl = document.getElementById('sup-methadone-count');
            if (countEl) countEl.textContent = methadoneCount ? `${methadoneCount} cơ sở` : 'Tra cứu';
            const footerEl = document.getElementById('sup-methadone-footer');
            if (footerEl) footerEl.textContent = methadoneCount ? `CÓ TẠI ${methadoneCount} CƠ SỞ Y TẾ` : 'THEO DANH MỤC CƠ SỞ Y TẾ';

            const card = (f) => {
                const hasCoords = Number.isFinite(f.latitude) && Number.isFinite(f.longitude);
                const directions = hasCoords
                    ? `https://www.google.com/maps/dir/?api=1&destination=${f.latitude},${f.longitude}`
                    : null;
                const phone = f.phone ? `<a href="tel:${esc(String(f.phone).replace(/[^\d+]/g, ''))}">${esc(f.phone)}</a>` : '—';
                return `
                <li class="sup-center-item">
                    <h3 class="sup-center-item__name">${esc(f.name)}</h3>
                    ${f.type ? `<span class="sup-center-item__type">${esc(f.typeName || typeLabels.get(f.type) || f.type)}</span>` : ''}
                    ${f.managingOrg ? `<p class="sup-center-item__org"><i class="fa-solid fa-sitemap" aria-hidden="true"></i> ${esc(f.managingOrg)}</p>` : ''}
                    <p class="sup-center-item__desc">${esc(f.description || '')}</p>
                    ${f.services && f.services.length ? `<p class="sup-center-item__desc"><strong>Dịch vụ:</strong> ${esc(f.services.join(', '))}</p>` : ''}
                    <div class="sup-center-item__meta">
                        <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(f.address || f.ward || f.city || '')}</span>
                        <span><i class="fa-solid fa-phone" aria-hidden="true"></i> ${phone}</span>
                        <span><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(f.hours || '')}</span>
                    </div>
                    ${directions ? `<div class="sup-center-item__meta">
                        <a href="${directions}" target="_blank" rel="noopener noreferrer">
                            <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Mở chỉ đường</a>
                    </div>` : ''}
                </li>`;
            };

            const apply = () => {
                const q = normalizeText(input ? input.value : '');
                const type = typeSelect ? typeSelect.value : 'all';
                const rows = list.filter((f) => {
                    const text = normalizeText(`${f.name} ${f.ward || ''} ${f.address || ''} ${f.city || ''} ${f.description || ''} ${(f.services || []).join(' ')}`);
                    return (type === 'all' || f.type === type)
                        && (!q || text.includes(q));
                });
                host.innerHTML = rows.length ? rows.map(card).join('')
                    : '<li class="sup-center-item sup-center-item--empty">Không tìm thấy cơ sở phù hợp với điều kiện tra cứu.</li>';
            };

            apply();
            if (input && !input.dataset.bound) { input.dataset.bound = '1'; input.addEventListener('input', apply); }
            [typeSelect].forEach((sel) => {
                if (sel && !sel.dataset.bound) { sel.dataset.bound = '1'; sel.addEventListener('change', apply); }
            });
            if (searchBtn && !searchBtn.dataset.bound) {
                searchBtn.dataset.bound = '1';
                searchBtn.addEventListener('click', (e) => { e.preventDefault(); apply(); });
            }
        } catch (err) {
            setError(host, err.message);
        }
    }

    /* ------------------------------- FAQ ------------------------------------ */

    /**
     * FAQ dùng <details>/<summary> (bàn phím Enter/Space hoạt động sẵn, biểu tượng
     * xoay theo [open]). Bổ sung `aria-expanded` và `aria-controls` mà trình duyệt
     * không tự gắn, để trình đọc màn hình thông báo đúng trạng thái đóng/mở.
     * Dùng chung cho trang Liên hệ và trang Hỗ trợ để hai nơi hành xử giống nhau.
     */
    function initFaqAccordion(root) {
        const host = root || document;
        const items = host.querySelectorAll('details.ct-faq-item, details.sup-faq-item');
        items.forEach((details, index) => {
            const summary = details.querySelector(':scope > summary');
            const body = details.lastElementChild;
            if (!summary || !body || body === summary || summary.dataset.faqBound === '1') return;
            summary.dataset.faqBound = '1';

            if (!body.id) body.id = `faq-panel-${index + 1}`;
            summary.setAttribute('aria-controls', body.id);
            summary.setAttribute('aria-expanded', String(details.open));
            body.setAttribute('role', 'region');
            body.setAttribute('aria-labelledby', summary.id || '');
            if (!summary.id) {
                summary.id = `${body.id}-summary`;
                body.setAttribute('aria-labelledby', summary.id);
            }

            /* <details> phát sự kiện toggle: đồng bộ aria-expanded theo trạng thái thật */
            details.addEventListener('toggle', () => {
                summary.setAttribute('aria-expanded', String(details.open));
            });
        });
    }

    /* ------------------------------ Khởi tạo -------------------------------- */

    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isHome = !/\.html$/.test(window.location.pathname) || page === 'index.html';

    const run = () => {
        initFaqAccordion();
        if (isHome) {
            initNewsList();
            initHomeEducation();
            initEvents();
        }
        if (page === 'news.html') initNewsList();
        if (page === 'news-detail.html') initNewsDetail();
        if (page === 'education-detail.html') initEducationDetail();
        if (page === 'statistics.html') initStatistics();
        if (page === 'laws.html') initLaws();
        if (page === 'law-detail.html') initLawDetail();
        if (page === 'education.html') initEducation();
        if (page === 'events.html') initEvents();
        if (page === 'event-detail.html') initEventDetail();
        if (page === 'agencies.html') initAgencies();
        if (page === 'agency-detail.html') initAgencyDetail();
        if (page === 'support.html') initSupport();
        if (page === 'contact.html') initContactTopics();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();

    window.PublicPages = {
        initNewsList, initNewsDetail, initEducation, initEducationDetail, initHomeEducation,
        initStatistics, initLaws, initLawDetail, initEvents, initEventDetail, initAgencies, initAgencyDetail, initSupport, initContactTopics,
        initFaqAccordion,
    };
})();
