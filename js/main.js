/**
 * main.js - Xử lý tương tác dùng chung cho Header và Footer
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

const initCommonLayout = () => {
    initCurrentDate();
    initMobileNavigation();
    initActiveNavigation();
    initHeaderSearch();
    initStickyHeader();
    initFooterYear();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommonLayout);
} else {
    initCommonLayout();
}

/*
   Số liệu trang chủ đếm từ API công khai (api.js phải được nạp trước), nên
   chỉ chạy sau khi toàn bộ tài nguyên đã sẵn sàng (sự kiện load).
*/
if (document.readyState === 'complete') {
    initHomepageStats();
} else {
    window.addEventListener('load', initHomepageStats);
}

/* ==========================================================================
   1. CẬP NHẬT NGÀY HIỆN TẠI TRÊN TOPBAR (#current-date)
   ========================================================================== */
function initCurrentDate() {
    const dateEl = document.getElementById('current-date');
    if (!dateEl) return;

    const now = new Date();
    const weekdays = [
        'Chủ Nhật',
        'Thứ Hai',
        'Thứ Ba',
        'Thứ Tư',
        'Thứ Năm',
        'Thứ Sáu',
        'Thứ Bảy'
    ];

    const dayName = weekdays[now.getDay()];
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    dateEl.textContent = `${dayName}, ngày ${day}/${month}/${year}`;
    dateEl.setAttribute('datetime', `${year}-${month}-${day}`);
}

/* ==========================================================================
   2. ĐIỀU HƯỚNG MOBILE (.site-header__menu-toggle & #main-navigation)
   ========================================================================== */
function initMobileNavigation() {
    const menuToggle = document.querySelector('.site-header__menu-toggle');
    const navigation = document.getElementById('main-navigation');

    if (!menuToggle || !navigation) return;

    const setMenuState = (isOpen) => {
        navigation.classList.toggle('is-open', isOpen);
        menuToggle.setAttribute('aria-expanded', String(isOpen));
        menuToggle.setAttribute(
            'aria-label',
            isOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'
        );

        const icon = menuToggle.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-bars', !isOpen);
            icon.classList.toggle('fa-xmark', isOpen);
        }
    };

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCurrentlyOpen = navigation.classList.contains('is-open');
        setMenuState(!isCurrentlyOpen);
    });

    // Đóng menu khi người dùng chọn một liên kết trên mobile
    navigation.querySelectorAll('.site-header__nav-link').forEach((link) => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768 && navigation.classList.contains('is-open')) {
                setMenuState(false);
            }
        });
    });

    // Đóng menu khi click ra ngoài vùng điều hướng
    document.addEventListener('click', (e) => {
        if (
            navigation.classList.contains('is-open') &&
            !navigation.contains(e.target) &&
            !menuToggle.contains(e.target)
        ) {
            setMenuState(false);
        }
    });

    // Đóng menu khi nhấn phím Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navigation.classList.contains('is-open')) {
            setMenuState(false);
            menuToggle.focus();
        }
    });

    // Reset trạng thái menu khi phóng to màn hình vượt mốc Mobile (768px)
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navigation.classList.contains('is-open')) {
            setMenuState(false);
        }
    });
}

/* ==========================================================================
   3. ĐÁNH DẤU MỤC MENU ĐANG XEM (.site-header__nav-link--active)
   ========================================================================== */
function initActiveNavigation() {
    const navLinks = document.querySelectorAll('.site-header__nav-link');
    if (!navLinks.length) return;

    const currentPath = window.location.pathname;
    let currentFile = currentPath.split('/').pop() || 'index.html';

    // Ánh xạ các trang chi tiết về mục danh mục cha trên thanh menu chính
    const detailToParentMap = {
        'news-detail.html': 'news.html',
        'article.html': 'news.html',
        'education-detail.html': 'education.html',
        'law-detail.html': 'laws.html',
        'agency-detail.html': 'agencies.html',
        'event-detail.html': 'news.html'
    };

    if (detailToParentMap[currentFile]) {
        currentFile = detailToParentMap[currentFile];
    }

    navLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;

        const targetFile = href.split('?')[0].split('#')[0].split('/').pop() || 'index.html';
        const isMatch = targetFile === currentFile;

        link.classList.toggle('site-header__nav-link--active', isMatch);
        if (isMatch) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
}

/* ==========================================================================
   4. THANH TÌM KIẾM TRÊN HEADER (.site-header__search-form)
   ========================================================================== */
function initHeaderSearch() {
    const searchForm = document.querySelector('.site-header__search-form');
    const searchInput = document.querySelector('.site-header__search-input');

    if (!searchForm || !searchInput) return;

    // Giữ lại từ khóa tìm kiếm trên ô input nếu URL đang có tham số ?q=
    const params = new URLSearchParams(window.location.search);
    const currentQuery = params.get('q');
    if (currentQuery && !searchInput.value) {
        searchInput.value = currentQuery;
    }

    searchForm.addEventListener('submit', (e) => {
        const trimmedValue = searchInput.value.trim();

        if (!trimmedValue) {
            e.preventDefault();
            searchInput.focus();
            return;
        }

        searchInput.value = trimmedValue;
    });
}

/* ==========================================================================
   5. TRẠNG THÁI CUỘN TRANG CHO HEADER (.site-header.is-scrolled)
   ========================================================================== */
function initStickyHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const updateHeaderScrollState = () => {
        header.classList.toggle('is-scrolled', window.scrollY > 40);
    };

    updateHeaderScrollState();
    window.addEventListener('scroll', updateHeaderScrollState, { passive: true });
}

/* ==========================================================================
   6. TỰ ĐỘNG CẬP NHẬT NĂM BẢN QUYỀN Ở FOOTER (.site-footer__year)
   ========================================================================== */
function initFooterYear() {
    const yearElements = document.querySelectorAll('.site-footer__year');
    if (!yearElements.length) return;

    const currentYear = String(new Date().getFullYear());
    yearElements.forEach((el) => {
        el.textContent = currentYear;
        el.setAttribute('datetime', currentYear);
    });
}

/* ==========================================================================
   7. SỐ LIỆU TỔNG QUAN TRÊN TRANG CHỦ (.site-main__stat-value[data-stat])
   Số liệu được đếm từ dữ liệu thật do API công khai (đã xuất bản/xuất bản từ CMS).
   Khi chưa có bản ghi, thẻ tương ứng giữ trạng thái "Đang cập nhật" thay vì
   hiển thị số 0 gây hiểu nhầm.
   ========================================================================== */
function initHomepageStats() {
    const nodes = document.querySelectorAll('.site-main__stat-value[data-stat]');
    if (!nodes.length || !window.PortalAPI) return;

    const api = window.PortalAPI;

    const setValue = (key, total) => {
        if (!(total > 0)) return;
        nodes.forEach((el) => {
            if (el.getAttribute('data-stat') !== key) return;
            el.textContent = String(total);
            el.classList.add('is-available');
            el.closest('.site-main__stat-card')?.classList.add('is-available');
        });
    };

    api.get('/api/public/legal-documents')
        .then((rows) => setValue('laws', Array.isArray(rows) ? rows.length : 0))
        .catch(() => {});
    api.get('/api/public/articles' + api.qs({ limit: 50 }))
        .then((rows) => setValue('articles', Array.isArray(rows) ? rows.length : 0))
        .catch(() => {});
    api.get('/api/public/agencies')
        .then((rows) => setValue('agencies', Array.isArray(rows) ? rows.length : 0))
        .catch(() => {});
    /* Chuyên đề tuyên truyền: số nhóm chuyên mục có nội dung đã xuất bản */
    api.get('/api/public/categories')
        .then((rows) => {
            const withContent = (rows || []).filter((c) => Number(c.articleCount || 0) > 0);
            const groups = new Set(withContent.map((c) => c.group || '').filter(Boolean));
            setValue('education', groups.size);
        })
        .catch(() => {});
}















































/**
 * about.js - Xử lý tương tác riêng cho trang Giới thiệu (about.html)
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

const initAboutPage = () => {
    initAboutTabs();
    initAboutTocScrollspy();
    initAboutSmoothAnchors();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutPage);
} else {
    initAboutPage();
}

/* ==========================================================================
   1. HỆ THỐNG TAB CHỨC NĂNG VÀ NHIỆM VỤ TRỌNG TÂM (.about-tabs)
   ========================================================================== */
function initAboutTabs() {
    const tabButtons = Array.from(document.querySelectorAll('.about-tabs__btn'));
    const tabPanels = Array.from(document.querySelectorAll('.about-tabs__panel'));

    if (!tabButtons.length || !tabPanels.length) return;

    const activateTab = (targetBtn, shouldFocus = false) => {
        const targetPanelId = targetBtn.getAttribute('aria-controls');

        tabButtons.forEach((btn) => {
            const isSelected = btn === targetBtn;
            btn.setAttribute('aria-selected', String(isSelected));
            btn.setAttribute('tabindex', isSelected ? '0' : '-1');
        });

        tabPanels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.id === targetPanelId);
        });

        if (shouldFocus) {
            targetBtn.focus();
        }
    };

    // Khởi tạo tabindex chuẩn cho các nút tab
    tabButtons.forEach((btn) => {
        const isInitiallySelected = btn.getAttribute('aria-selected') === 'true';
        btn.setAttribute('tabindex', isInitiallySelected ? '0' : '-1');
    });

    // Sự kiện click & điều hướng bàn phím theo chuẩn WAI-ARIA Tabs
    tabButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            activateTab(btn, false);
        });

        btn.addEventListener('keydown', (e) => {
            let nextIndex = null;

            switch (e.key) {
                case 'ArrowRight':
                    nextIndex = (index + 1) % tabButtons.length;
                    break;
                case 'ArrowLeft':
                    nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
                    break;
                case 'Home':
                    nextIndex = 0;
                    break;
                case 'End':
                    nextIndex = tabButtons.length - 1;
                    break;
                default:
                    return;
            }

            e.preventDefault();
            activateTab(tabButtons[nextIndex], true);
        });
    });

    // Tự động mở đúng tab nếu URL có hash trỏ tới tab hoặc panel (vd: #tab-panel-2)
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash) {
        const matchedBtn = tabButtons.find(
            (btn) => btn.id === currentHash || btn.getAttribute('aria-controls') === currentHash
        );
        if (matchedBtn) {
            activateTab(matchedBtn, false);
        }
    }
}

/* ==========================================================================
   2. MỤC LỤC TRƯỢT CỐ ĐỊNH - SCROLLSPY (.about-toc)
   ========================================================================== */
function initAboutTocScrollspy() {
    const tocLinks = Array.from(document.querySelectorAll('.about-toc__link'));
    if (!tocLinks.length) return;

    const sections = tocLinks
        .map((link) => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('#')) return null;
            return document.getElementById(href.slice(1));
        })
        .filter(Boolean);

    if (!sections.length) return;

    let isManualScrolling = false;
    let manualScrollTimer = null;

    const setActiveLink = (sectionId) => {
        tocLinks.forEach((link) => {
            const isMatch = link.getAttribute('href') === `#${sectionId}`;
            link.classList.toggle('is-active', isMatch);
            if (isMatch) {
                link.setAttribute('aria-current', 'true');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    };

    // Khi người dùng bấm trực tiếp vào mục lục, khóa tạm thời observer để tránh nhấp nháy
    tocLinks.forEach((link) => {
        link.addEventListener('click', () => {
            const targetId = link.getAttribute('href')?.slice(1);
            if (!targetId) return;

            setActiveLink(targetId);
            isManualScrolling = true;

            clearTimeout(manualScrollTimer);
            manualScrollTimer = setTimeout(() => {
                isManualScrolling = false;
            }, 800);
        });
    });

    // Theo dõi các khối nội dung khi cuộn trang
    const observer = new IntersectionObserver(
        (entries) => {
            if (isManualScrolling) return;

            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    setActiveLink(entry.target.id);
                }
            });
        },
        {
            rootMargin: '-18% 0px -65% 0px',
            threshold: 0
        }
    );

    sections.forEach((section) => observer.observe(section));

    // Xử lý trường hợp cuộn chạm đáy trang (kích hoạt mục cuối cùng #lo-trinh)
    window.addEventListener(
        'scroll',
        () => {
            if (isManualScrolling) return;

            const isNearBottom =
                window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;

            if (isNearBottom) {
                setActiveLink(sections[sections.length - 1].id);
            } else if (window.scrollY < 160) {
                setActiveLink(sections[0].id);
            }
        },
        { passive: true }
    );
}

/* ==========================================================================
   3. CUỘN MƯỢT NỘI TRANG CÓ BÙ TRỪ CHIỀU CAO HEADER
   ========================================================================== */
function initAboutSmoothAnchors() {
    const anchorLinks = document.querySelectorAll(
        '.about-toc__link[href^="#"], .about-hero__actions a[href^="#"]'
    );
    const header = document.querySelector('.site-header');

    if (!anchorLinks.length) return;

    anchorLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href')?.slice(1);
            const targetEl = targetId ? document.getElementById(targetId) : null;

            if (!targetEl) return;

            e.preventDefault();

            const headerOffset = header ? header.offsetHeight + 20 : 24;
            const elementPosition = targetEl.getBoundingClientRect().top + window.scrollY;
            const offsetPosition = Math.max(0, elementPosition - headerOffset);

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });

            // Cập nhật URL hash mà không gây giật khung hình
            if (history.replaceState) {
                history.replaceState(null, '', `#${targetId}`);
            }
        });
    });
}





/**
 * news.js - Xử lý tương tác riêng cho trang Tin tức & Hoạt động (news.html)
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

const initNewsPage = () => {
    const articleList = document.getElementById('news-article-list');
    if (!articleList) return;

    const articles = Array.from(articleList.querySelectorAll('article.news-article'));
    /* Nút chuyên mục và thẻ chủ đề do public-pages.js dựng động → ủy quyền sự kiện ở cấp document */
    const tagChips = () => Array.from(document.querySelectorAll('.news-tag-chip'));
    const localSearchInput = document.getElementById('news-local-search');
    const headerSearchForm = document.querySelector('.site-header__search-form');
    const headerSearchInput = document.querySelector('.site-header__search-input');

    const searchBanner = document.getElementById('news-search-banner');
    const searchKeywordEl = document.getElementById('news-search-keyword');
    const clearSearchBtn = document.getElementById('news-clear-search');
    const resetAllBtn = document.getElementById('news-reset-all');

    const spotlightSection = document.querySelector('.news-spotlight');
    const resultCountEl = document.getElementById('news-result-count');
    const emptyStateEl = document.getElementById('news-empty-state');
    const paginationContainer = document.querySelector('.news-pagination');

    const ITEMS_PER_PAGE = 6;

    const state = {
        category: 'all',
        keyword: '',
        activeTag: '',
        currentPage: 1
    };

    /* ----------------------------------------------------------------------
       Chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chữ thường) để tìm kiếm chính xác
       ---------------------------------------------------------------------- */
    const normalizeText = (str) => {
        return (str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Lập chỉ mục nội dung tìm kiếm cho từng bài viết (đọc lại từ DOM khi có dữ liệu mới)
    let articleRecords = [];
    const indexArticles = () => {
        articleRecords = Array.from(articleList.querySelectorAll('article.news-article')).map((el) => {
            const title = el.querySelector('.news-article__title')?.textContent || '';
            const desc = el.querySelector('.news-article__desc')?.textContent || '';
            const tag = el.querySelector('.news-article__tag')?.textContent
                || el.querySelector('.news-article__cat')?.textContent || '';
            const meta = el.querySelector('.news-meta')?.textContent || '';

            return {
                element: el,
                category: el.dataset.category || 'all',
                searchableText: normalizeText(`${title} ${desc} ${tag} ${meta}`)
            };
        });
    };
    indexArticles();

    /* ----------------------------------------------------------------------
       Đồng bộ tham số ?q= trên URL mà không tải lại trang
       ---------------------------------------------------------------------- */
    const syncUrlQuery = (keyword) => {
        if (!window.history || !window.history.replaceState) return;

        const url = new URL(window.location.href);
        if (keyword) {
            url.searchParams.set('q', keyword);
        } else {
            url.searchParams.delete('q');
        }
        window.history.replaceState(null, '', url.toString());
    };

    /* ----------------------------------------------------------------------
       Cuộn mượt tới khu vực danh sách bài viết (bù trừ chiều cao Header)
       ---------------------------------------------------------------------- */
    const scrollToNewsFeed = () => {
        const feedSection = document.querySelector('.news-main');
        const header = document.querySelector('.site-header');
        if (!feedSection) return;

        const headerOffset = header ? header.offsetHeight + 16 : 20;
        const targetTop = feedSection.getBoundingClientRect().top + window.scrollY - headerOffset;

        window.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'smooth'
        });
    };

    /* ----------------------------------------------------------------------
       Cập nhật trạng thái active cho nút chuyên mục & thẻ chủ đề
       ---------------------------------------------------------------------- */
    const updateFilterControlsUI = () => {
        Array.from(document.querySelectorAll('#news-category-tabs .news-cat-btn')).forEach((btn) => {
            const isSelected = (btn.dataset.category || 'all') === state.category;
            btn.classList.toggle('is-active', isSelected);
            btn.setAttribute('aria-selected', String(isSelected));
        });

        tagChips().forEach((chip) => {
            const chipTag = chip.dataset.tag || '';
            const isSelected = Boolean(state.activeTag) && chipTag === state.activeTag;
            chip.classList.toggle('is-active', isSelected);
            chip.setAttribute('aria-pressed', String(isSelected));
        });
    };

    /* ----------------------------------------------------------------------
       Render phân trang động (.news-pagination)
       ---------------------------------------------------------------------- */
    const renderPagination = (totalItems) => {
        if (!paginationContainer) return;

        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) {
            paginationContainer.innerHTML =
                totalItems > 0
                    ? '<button type="button" class="news-pagination__btn is-active" aria-current="page">1</button>'
                    : '';
            paginationContainer.classList.toggle('is-hidden', totalItems === 0);
            return;
        }

        paginationContainer.classList.remove('is-hidden');
        paginationContainer.innerHTML = '';

        for (let page = 1; page <= totalPages; page++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'news-pagination__btn';
            btn.textContent = String(page);

            if (page === state.currentPage) {
                btn.classList.add('is-active');
                btn.setAttribute('aria-current', 'page');
            }

            btn.addEventListener('click', () => {
                if (state.currentPage === page) return;
                state.currentPage = page;
                renderArticles();
                scrollToNewsFeed();
            });

            paginationContainer.appendChild(btn);
        }
    };

    /* ----------------------------------------------------------------------
       Hàm lọc & hiển thị danh sách bài viết
       ---------------------------------------------------------------------- */
    const renderArticles = () => {
        /* Đồng bộ chỉ mục với DOM hiện tại: danh sách do API dựng lại sau mỗi lần tải */
        const liveCount = articleList.querySelectorAll('article.news-article').length;
        if (liveCount !== articleRecords.length) indexArticles();

        const normalizedKeyword = normalizeText(state.keyword);

        const matchedRecords = articleRecords.filter((item) => {
            const matchesCategory =
                state.category === 'all' || item.category === state.category;
            const matchesKeyword =
                !normalizedKeyword || item.searchableText.includes(normalizedKeyword);

            return matchesCategory && matchesKeyword;
        });

        const totalMatched = matchedRecords.length;
        const totalPages = Math.max(1, Math.ceil(totalMatched / ITEMS_PER_PAGE));
        if (state.currentPage > totalPages) {
            state.currentPage = 1;
        }

        const startIndex = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const visibleSet = new Set(
            matchedRecords.slice(startIndex, endIndex).map((r) => r.element)
        );

        articleRecords.forEach((record) => {
            record.element.classList.toggle('is-filtered-out', !visibleSet.has(record.element));
        });

        // Ẩn khối Tin tiêu điểm khi đang tìm kiếm từ khóa để ưu tiên kết quả lọc
        if (spotlightSection) spotlightSection.classList.toggle('is-filtered', Boolean(normalizedKeyword));

        // Hiển thị banner trạng thái từ khóa tìm kiếm (#news-search-banner)
        if (searchBanner && searchKeywordEl) {
            const hasKeyword = Boolean(state.keyword.trim());
            searchKeywordEl.textContent = hasKeyword ? `"${state.keyword.trim()}"` : '';
            searchBanner.classList.toggle('is-visible', hasKeyword);
        }

        /*
         * Khi chưa có bài nào, public-pages.js đã hiển thị khối thông báo trong
         * #news-article-list. Bộ đếm và trạng thái trống chỉ dành cho trường hợp
         * đã có dữ liệu nhưng bộ lọc/từ khóa không khớp.
         */
        const hasData = articleRecords.length > 0;

        // Cập nhật bộ đếm số lượng bài viết (#news-result-count)
        if (resultCountEl) {
            if (!hasData) {
                resultCountEl.textContent = '';
            } else if (totalMatched === 0) {
                resultCountEl.textContent = 'Không có bài viết nào';
            } else if (totalMatched > ITEMS_PER_PAGE) {
                const displayEnd = Math.min(endIndex, totalMatched);
                resultCountEl.textContent = `Hiển thị ${startIndex + 1}–${displayEnd} / ${totalMatched} bài viết`;
            } else {
                resultCountEl.textContent = `Hiển thị ${totalMatched} bài viết`;
            }
        }

        // Hiển thị trạng thái trống (#news-empty-state) khi có dữ liệu nhưng không khớp bộ lọc
        if (emptyStateEl) {
            emptyStateEl.classList.toggle('is-visible', hasData && totalMatched === 0);
        }

        renderPagination(totalMatched);
        updateFilterControlsUI();
    };

    /* ----------------------------------------------------------------------
       Áp dụng từ khóa tìm kiếm và đồng bộ giữa các ô nhập liệu
       ---------------------------------------------------------------------- */
    const applyKeyword = (rawKeyword, { syncHeader = true, syncUrl = true } = {}) => {
        const cleaned = (rawKeyword || '').trim();
        state.keyword = cleaned;
        state.currentPage = 1;

        if (localSearchInput && localSearchInput.value !== cleaned) {
            localSearchInput.value = cleaned;
        }
        if (syncHeader && headerSearchInput && headerSearchInput.value !== cleaned) {
            headerSearchInput.value = cleaned;
        }

        // Kiểm tra xem từ khóa có trùng khớp với chip chủ đề nào ở sidebar không
        const matchedChip = tagChips().find(
            (chip) => normalizeText(chip.dataset.tag) === normalizeText(cleaned)
        );
        state.activeTag = matchedChip ? matchedChip.dataset.tag : '';

        if (syncUrl) {
            syncUrlQuery(cleaned);
        }

        renderArticles();
    };

    /* ======================================================================
       GẮN SỰ KIỆN TƯƠNG TÁC
       ====================================================================== */

    // 1. Lọc theo nút chuyên mục (.news-cat-btn – danh sách do public-pages.js dựng từ API)
    document.addEventListener('click', (event) => {
        const btn = event.target.closest('#news-category-tabs .news-cat-btn');
        if (!btn) return;
        state.category = btn.dataset.category || 'all';
        state.currentPage = 1;
        renderArticles();
    });

    // 2. Lọc nhanh theo ô nhập trong thanh công cụ (#news-local-search)
    if (localSearchInput) {
        localSearchInput.addEventListener('input', (e) => {
            applyKeyword(e.target.value, { syncHeader: true, syncUrl: true });
        });
    }

    // 3. Xử lý trực tiếp khi gửi form tìm kiếm trên Header ngay tại trang Tin tức
    if (headerSearchForm && headerSearchInput) {
        headerSearchForm.addEventListener('submit', (e) => {
            const keyword = headerSearchInput.value.trim();
            if (!keyword) return;

            e.preventDefault();
            applyKeyword(keyword, { syncHeader: false, syncUrl: true });
            scrollToNewsFeed();
        });
    }

    // 4. Lọc theo các chip "Chủ đề quan tâm" ở cột phải (.news-tag-chip – dựng từ API)
    document.addEventListener('click', (event) => {
        const chip = event.target.closest('.news-tag-chip');
        if (!chip) return;
        const tagValue = chip.dataset.tag || '';
        const isSameTag = state.activeTag === tagValue;

        if (isSameTag) {
            state.activeTag = '';
            applyKeyword('', { syncHeader: true, syncUrl: true });
        } else {
            state.activeTag = tagValue;
            applyKeyword(tagValue, { syncHeader: true, syncUrl: true });
            scrollToNewsFeed();
        }
    });

    // 5. Nút "Xóa bộ lọc" trên banner tìm kiếm (#news-clear-search)
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            applyKeyword('', { syncHeader: true, syncUrl: true });
        });
    }

    // 6. Nút "Xem tất cả tin bài" khi không tìm thấy kết quả (#news-reset-all)
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            state.category = 'all';
            applyKeyword('', { syncHeader: true, syncUrl: true });
        });
    }

    /* ======================================================================
       KHỞI TẠO TRẠNG THÁI BAN ĐẦU TỪ THAM SỐ URL (?q=... hoặc ?category=...)
       ====================================================================== */
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q') || '';
    const initialCategory = urlParams.get('category');

    if (initialCategory) state.category = initialCategory;

    applyKeyword(initialQuery, { syncHeader: true, syncUrl: false });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewsPage);
} else {
    initNewsPage();
}

/*
 * public-pages.js thay danh sách tĩnh bằng dữ liệu từ API. Khi đó phát sự kiện
 * portal:content-rendered để bộ lọc/tìm kiếm ở trên lập lại chỉ mục và render lại.
 */
const initNewsDynamicRefresh = () => {
    const articleList = document.getElementById('news-article-list');
    if (!articleList || articleList.dataset.newsDynamicBound === 'true') return;
    articleList.dataset.newsDynamicBound = 'true';
    const handler = () => {
        // main.js nạp trước public-pages.js nên hàm khởi tạo đã sẵn sàng ở đây
        initNewsPage();
    };
    articleList.addEventListener('portal:content-rendered', handler);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewsDynamicRefresh);
} else {
    initNewsDynamicRefresh();
}





/* ==========================================================================
   CHI TIẾT TIN TỨC
   Nội dung bài viết (tiêu đề, sapo, ảnh, nội dung HTML, tin liên quan) do
   public-pages.js tải từ API đã xuất bản. Tệp này chỉ khởi tạo tiện ích đọc.
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('article-body')) return;
    initReadingProgress();
    initArticleTools();
});



/* ==========================================================================
   Thanh tiến trình đọc cho trang chuyên đề (education-detail.html)
   ========================================================================== */
function initEducationReadingProgress() {
    let progressBar = document.getElementById('reading-progress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'reading-progress';
        progressBar.className = 'reading-progress';
        document.body.prepend(progressBar);
    }

    const container = document.getElementById('edd-article-container');
    if (!container || container.dataset.progressBound === 'true') return;
    container.dataset.progressBound = 'true';

    window.addEventListener('scroll', () => {
        const rect = container.getBoundingClientRect();
        const distance = window.scrollY - (rect.top + window.scrollY);
        const total = container.offsetHeight - window.innerHeight;
        const percentage = Math.max(0, Math.min(100, (distance / (total || 1)) * 100));
        progressBar.style.width = `${percentage}%`;
    }, { passive: true });
}

/* ==========================================================================
   Điều chỉnh cỡ chữ cho trang chuyên đề (education-detail.html)
   ========================================================================== */
function initEducationFontControls() {
    const bodyContainer = document.getElementById('edd-body');
    const btnDec = document.getElementById('edd-font-dec');
    const btnReset = document.getElementById('edd-font-reset');
    const btnInc = document.getElementById('edd-font-inc');
    if (!bodyContainer) return;

    let fontStep = 0; // -1: nhỏ, 0: mặc định, 1: lớn
    const applyFontStep = () => {
        bodyContainer.classList.toggle('edd-body--font-md', fontStep === 1);
        bodyContainer.classList.toggle('edd-body--font-sm', fontStep === -1);
    };

    if (btnInc) btnInc.addEventListener('click', () => { fontStep = 1; applyFontStep(); });
    if (btnReset) btnReset.addEventListener('click', () => { fontStep = 0; applyFontStep(); });
    if (btnDec) btnDec.addEventListener('click', () => { fontStep = -1; applyFontStep(); });
}

/* ==========================================================================
   Đổ danh sách Tin đọc nhiều & Tin liên quan
   ========================================================================== */
/* Tin đọc nhiều (demo) đã loại bỏ: dữ liệu lấy từ API. */


/* Tin liên quan (demo) đã loại bỏ: dữ liệu lấy từ API. */


/**
 * education.js - Xử lý tương tác chuyên mục, tìm kiếm và lọc dữ liệu cho trang education.html
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

const initEducationPage = () => {
    const gridList = document.getElementById('ed-grid-list');
    if (!gridList) return;

    const cards = Array.from(gridList.querySelectorAll('.ed-card'));
    const tabButtons = Array.from(document.querySelectorAll('.ed-tab-btn'));
    const searchInput = document.getElementById('ed-search-input');
    const resetBtn = document.getElementById('ed-reset-btn');
    const emptyState = document.getElementById('ed-empty-state');
    const emptyResetBtn = document.getElementById('ed-empty-reset');
    const resultCountEl = document.getElementById('ed-result-count');

    const state = {
        topic: 'all',
        keyword: ''
    };

    /* ----------------------------------------------------------------------
       Chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chữ thường) để tìm kiếm linh hoạt
       ---------------------------------------------------------------------- */
    const normalizeText = (str) => {
        return (str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Lập chỉ mục nội dung tìm kiếm cho từng thẻ chuyên đề
    const cardRecords = cards.map((el) => {
        const title = el.querySelector('.ed-card__title')?.textContent || '';
        const desc = el.querySelector('.ed-card__desc')?.textContent || '';
        const tag = el.querySelector('.ed-card__tag')?.textContent || '';
        const audience = el.querySelector('.ed-card__audience')?.textContent || '';

        return {
            element: el,
            topic: el.dataset.topic || 'all',
            searchableText: normalizeText(`${title} ${desc} ${tag} ${audience}`)
        };
    });

    /* ----------------------------------------------------------------------
       Đồng bộ trạng thái giao diện các nút chuyên mục (Tabs)
       ---------------------------------------------------------------------- */
    const updateTabsUI = () => {
        tabButtons.forEach((btn) => {
            const isSelected = (btn.dataset.topic || 'all') === state.topic;
            btn.classList.toggle('is-active', isSelected);
            btn.setAttribute('aria-selected', String(isSelected));
        });
    };

    /* ----------------------------------------------------------------------
       Hàm lọc và hiển thị danh sách chuyên đề
       ---------------------------------------------------------------------- */
    const renderCards = () => {
        if (!cards.length) {
            if (emptyState) emptyState.classList.remove('is-visible');
            if (resultCountEl) resultCountEl.textContent = '';
            return;
        }
        const normalizedKeyword = normalizeText(state.keyword);

        const matchedRecords = cardRecords.filter((item) => {
            const matchesTopic = state.topic === 'all' || item.topic === state.topic;
            const matchesKeyword = !normalizedKeyword || item.searchableText.includes(normalizedKeyword);
            return matchesTopic && matchesKeyword;
        });

        const totalMatched = matchedRecords.length;
        const visibleSet = new Set(matchedRecords.map((r) => r.element));

        cards.forEach((cardEl) => {
            cardEl.classList.toggle('is-filtered-out', !visibleSet.has(cardEl));
        });

        // Cập nhật số lượng kết quả hiển thị
        if (resultCountEl) {
            if (totalMatched === 0) {
                resultCountEl.textContent = 'Không tìm thấy chuyên đề phù hợp';
            } else if (totalMatched === cards.length) {
                resultCountEl.textContent = `Hiển thị toàn bộ ${totalMatched} chuyên đề tuyên truyền - giáo dục`;
            } else {
                resultCountEl.textContent = `Hiển thị ${totalMatched} / ${cards.length} chuyên đề phù hợp`;
            }
        }

        // Hiển thị hoặc ẩn thông báo trống
        if (emptyState) {
            emptyState.classList.toggle('is-visible', totalMatched === 0);
        }

        updateTabsUI();
    };

    /* ----------------------------------------------------------------------
       Xử lý sự kiện tương tác
       ---------------------------------------------------------------------- */

    // 1. Chuyển đổi tab chuyên mục
    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            state.topic = btn.dataset.topic || 'all';
            renderCards();
        });
    });

    // 2. Tìm kiếm theo từ khóa nhập vào ô input
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.keyword = e.target.value;
            renderCards();
        });
    }

    // 3. Nút đặt lại bộ lọc
    const handleReset = () => {
        state.topic = 'all';
        state.keyword = '';
        if (searchInput) searchInput.value = '';
        renderCards();
    };

    if (resetBtn) resetBtn.addEventListener('click', handleReset);
    if (emptyResetBtn) emptyResetBtn.addEventListener('click', handleReset);

    /* ----------------------------------------------------------------------
       Khởi tạo ban đầu (Hỗ trợ đọc tham số ?topic= nếu có trên URL)
       ---------------------------------------------------------------------- */
    const urlParams = new URLSearchParams(window.location.search);
    const initialTopic = urlParams.get('topic');
    if (initialTopic && tabButtons.some((b) => b.dataset.topic === initialTopic)) {
        state.topic = initialTopic;
    }

    renderCards();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEducationPage);
} else {
    initEducationPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.getElementById('ed-grid-list');
        if (host) host.addEventListener('portal:content-rendered', initEducationPage);
    });
} else {
    const edHost = document.getElementById('ed-grid-list');
    if (edHost) edHost.addEventListener('portal:content-rendered', initEducationPage);
}





/**
 * education-detail.js - Kho dữ liệu chuyên sâu và xử lý tương tác cho trang chi tiết tuyên truyền (education-detail.html)
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */


document.addEventListener('DOMContentLoaded', () => {
    /* Nội dung chuyên đề do public-pages.js tải từ API; ở đây chỉ gắn tiện ích đọc. */
    if (!document.getElementById('edd-article-container')) return;
    initEducationReadingProgress();
    initEducationFontControls();
});

/* ==========================================================================
   Công cụ đọc cho trang tin tức (news-detail.html): thanh tiến trình đọc,
   tăng giảm cỡ chữ, sao chép liên kết và in bài viết.
   Lưu ý: KHÔNG khai báo lại tên hàm này ở nơi khác trong file, nếu không
   phiên bản đứng sau sẽ ghi đè và làm hỏng trang bài viết tin tức.
   ========================================================================== */
function initReadingProgress() {
    let progressBar = document.getElementById('reading-progress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'reading-progress';
        progressBar.className = 'reading-progress';
        document.body.prepend(progressBar);
    }

    const articleContainer =
        document.getElementById('article-body') ||
        document.getElementById('edd-article-container');
    if (!articleContainer) return;

    window.addEventListener('scroll', () => {
        const rect = articleContainer.getBoundingClientRect();
        const containerHeight = articleContainer.offsetHeight;
        const windowHeight = window.innerHeight;
        const scrollTop = window.scrollY;
        const containerTop = rect.top + scrollTop;

        const distance = scrollTop - containerTop;
        const total = containerHeight - windowHeight;
        let percentage = (distance / total) * 100;

        percentage = Math.max(0, Math.min(100, percentage));
        progressBar.style.width = `${percentage}%`;
    }, { passive: true });
}

function initArticleTools() {
    const article = document.getElementById('article-body');
    if (!article || article.dataset.toolsBound === 'true') return;
    article.dataset.toolsBound = 'true';

    let fontLevel = 0;
    const setFontLevel = (level) => {
        fontLevel = Math.max(-1, Math.min(1, level));
        article.classList.toggle('article-content--font-md', fontLevel > 0);
        article.classList.toggle('article-content--font-sm', fontLevel < 0);
    };

    const increase = document.getElementById('font-increase');
    const reset = document.getElementById('font-reset');
    const decrease = document.getElementById('font-decrease');
    const copyLink = document.getElementById('copy-link-btn');
    const printArticle = document.getElementById('print-article-btn');

    if (increase) increase.addEventListener('click', () => setFontLevel(fontLevel + 1));
    if (reset) reset.addEventListener('click', () => setFontLevel(0));
    if (decrease) decrease.addEventListener('click', () => setFontLevel(fontLevel - 1));
    if (printArticle) printArticle.addEventListener('click', () => window.print());

    if (copyLink) {
        copyLink.addEventListener('click', async () => {
            let toast = document.querySelector('.article-copy-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'article-copy-toast';
                toast.setAttribute('role', 'status');
                toast.setAttribute('aria-live', 'polite');
                document.body.appendChild(toast);
            }

            try {
                if (!navigator.clipboard || !navigator.clipboard.writeText) {
                    throw new Error('Clipboard API is unavailable');
                }
                await navigator.clipboard.writeText(window.location.href);
                toast.textContent = 'Đã sao chép liên kết bài viết.';
            } catch (error) {
                toast.textContent = 'Không thể sao chép liên kết trên trình duyệt này.';
            }

            toast.classList.add('is-shown');
            window.setTimeout(() => toast.classList.remove('is-shown'), 2200);
        });
    }
}

/* ==========================================================================
   Điều chỉnh cỡ chữ (Phóng to / Thu nhỏ / Mặc định)
   ========================================================================== */
/* Đã gộp vào phiên bản initReadingProgress/initArticleTools phía trên. */

/* ==========================================================================
   Hiển thị danh sách chuyên đề liên quan ở Sidebar
   ========================================================================== */
/* Danh sách chuyên đề liên quan do public-pages.js dựng từ dữ liệu API. */





/**
 * laws.js - Xử lý lọc theo loại văn bản, lọc theo lĩnh vực, tìm kiếm và đặt lại cho trang laws.html
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

const initLawsPage = () => {
    const docListContainer = document.getElementById('lw-doc-list');
    if (!docListContainer) return;

    const cards = Array.from(docListContainer.querySelectorAll('.lw-doc-card'));
    const tabButtons = Array.from(document.querySelectorAll('.lw-tab-btn'));
    const topicSelect = document.getElementById('lw-topic-select');
    const searchInput = document.getElementById('lw-search-input');
    const resetBtn = document.getElementById('lw-reset-btn');
    const emptyState = document.getElementById('lw-empty-state');
    const emptyResetBtn = document.getElementById('lw-empty-reset');
    const resultCountEl = document.getElementById('lw-result-count');

    const state = {
        docType: 'all',
        topic: 'all',
        keyword: ''
    };

    /* ----------------------------------------------------------------------
       Chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chuyển chữ thường) để tìm kiếm linh hoạt
       ---------------------------------------------------------------------- */
    const normalizeText = (str) => {
        return (str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Lập chỉ mục nội dung tìm kiếm cho từng thẻ văn bản pháp luật
    const cardRecords = cards.map((el) => {
        const title = el.querySelector('.lw-doc-card__title')?.textContent || '';
        const desc = el.querySelector('.lw-doc-card__desc')?.textContent || '';
        const code = el.querySelector('.lw-doc-code')?.textContent || '';
        const type = el.querySelector('.lw-doc-type')?.textContent || '';
        const meta = el.querySelector('.lw-doc-card__meta')?.textContent || '';

        return {
            element: el,
            docType: el.dataset.doctype || 'all',
            topic: el.dataset.topic || 'all',
            searchableText: normalizeText(`${code} ${type} ${title} ${desc} ${meta}`)
        };
    });

    /* ----------------------------------------------------------------------
       Cập nhật trạng thái hiển thị của các nút tab loại văn bản
       ---------------------------------------------------------------------- */
    const updateTabsUI = () => {
        tabButtons.forEach((btn) => {
            const isSelected = (btn.dataset.doctype || 'all') === state.docType;
            btn.classList.toggle('is-active', isSelected);
            btn.setAttribute('aria-selected', String(isSelected));
        });
    };

    /* ----------------------------------------------------------------------
       Hàm lọc và hiển thị danh sách văn bản pháp luật
       ---------------------------------------------------------------------- */
    const renderDocs = () => {
        if (!cards.length) {
            if (emptyState) emptyState.classList.remove('is-visible');
            if (resultCountEl) resultCountEl.textContent = '';
            return;
        }
        const normalizedKeyword = normalizeText(state.keyword);

        const matchedRecords = cardRecords.filter((item) => {
            /* Tab “Luật / Bộ luật” gộp hai loại văn bản (luat, bo-luat) */
            const itemType = item.docType === 'bo-luat' ? 'luat' : item.docType;
            const matchesDocType = state.docType === 'all' || itemType === state.docType;
            const matchesTopic = state.topic === 'all' || item.topic === state.topic;
            const matchesKeyword = !normalizedKeyword || item.searchableText.includes(normalizedKeyword);

            return matchesDocType && matchesTopic && matchesKeyword;
        });

        const totalMatched = matchedRecords.length;
        const visibleSet = new Set(matchedRecords.map((r) => r.element));

        cards.forEach((cardEl) => {
            cardEl.classList.toggle('is-filtered-out', !visibleSet.has(cardEl));
        });

        // Cập nhật bộ đếm kết quả
        if (resultCountEl) {
            if (totalMatched === 0) {
                resultCountEl.textContent = 'Không tìm thấy văn bản pháp luật phù hợp';
            } else if (totalMatched === cards.length) {
                resultCountEl.textContent = `Hiển thị toàn bộ ${totalMatched} văn bản quy phạm pháp luật`;
            } else {
                resultCountEl.textContent = `Hiển thị ${totalMatched} / ${cards.length} văn bản phù hợp`;
            }
        }

        // Hiển thị hoặc ẩn thông báo trống
        if (emptyState) {
            emptyState.classList.toggle('is-visible', totalMatched === 0);
        }

        updateTabsUI();
    };

    /* ----------------------------------------------------------------------
       Gắn các sự kiện tương tác
       ---------------------------------------------------------------------- */

    // 1. Lọc theo tab loại văn bản
    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            state.docType = btn.dataset.doctype || 'all';
            renderDocs();
        });
    });

    // 2. Lọc theo danh mục lĩnh vực quy định (Dropdown select)
    if (topicSelect) {
        topicSelect.addEventListener('change', (e) => {
            state.topic = e.target.value;
            renderDocs();
        });
    }

    // 3. Tìm kiếm theo số hiệu hoặc từ khóa (Input search)
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.keyword = e.target.value;
            renderDocs();
        });
    }

    // 4. Đặt lại toàn bộ bộ lọc
    const handleReset = () => {
        state.docType = 'all';
        state.topic = 'all';
        state.keyword = '';
        if (searchInput) searchInput.value = '';
        if (topicSelect) topicSelect.value = 'all';
        renderDocs();
    };

    if (resetBtn) resetBtn.addEventListener('click', handleReset);
    if (emptyResetBtn) emptyResetBtn.addEventListener('click', handleReset);

    /* ----------------------------------------------------------------------
       Khởi tạo ban đầu
       ---------------------------------------------------------------------- */
    renderDocs();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLawsPage);
} else {
    initLawsPage();
}

// Lập lại chỉ mục bộ lọc khi public-pages.js thay danh sách tĩnh bằng dữ liệu API
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.getElementById('lw-doc-list');
        if (host) host.addEventListener('portal:content-rendered', initLawsPage);
    });
} else {
    const lwHost = document.getElementById('lw-doc-list');
    if (lwHost) lwHost.addEventListener('portal:content-rendered', initLawsPage);
}





/**
 * law-detail.js - Xử lý nạp dữ liệu chi tiết văn bản pháp luật, trình xem PDF và in ấn
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */


document.addEventListener('DOMContentLoaded', () => {
    /* Nội dung demo đã loại bỏ: dữ liệu do public-pages.js tải từ API. */
});

/* ==========================================================================
   Kết xuất danh sách văn bản liên quan
   ========================================================================== */
/* Văn bản liên quan (demo) đã loại bỏ: dữ liệu lấy từ API. */







/**
 * agencies.js - Xử lý lọc theo nhóm, địa bàn, tìm kiếm và đặt lại cho trang agencies.html
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

const initAgenciesPage = () => {
    const gridContainer = document.getElementById('ag-grid-list');
    if (!gridContainer) return;

    const cards = Array.from(gridContainer.querySelectorAll('.ag-card'));
    const tabButtons = Array.from(document.querySelectorAll('.ag-tab-btn'));
    const areaSelect = document.getElementById('ag-area-select');
    const searchInput = document.getElementById('ag-search-input');
    const resetBtn = document.getElementById('ag-reset-btn');
    const emptyState = document.getElementById('ag-empty-state');
    const emptyResetBtn = document.getElementById('ag-empty-reset');
    const resultCountEl = document.getElementById('ag-result-count');

    const state = {
        group: 'all',
        area: 'all',
        keyword: ''
    };

    /* ----------------------------------------------------------------------
       Chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chuyển chữ thường) để tìm kiếm linh hoạt
       ---------------------------------------------------------------------- */
    const normalizeText = (str) => {
        return (str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Lập chỉ mục nội dung tìm kiếm cho từng thẻ cơ quan, đơn vị
    const cardRecords = cards.map((el) => {
        const title = el.querySelector('.ag-card__title')?.textContent || '';
        const desc = el.querySelector('.ag-card__desc')?.textContent || '';
        const badge = el.querySelector('.ag-card__badge')?.textContent || '';
        const meta = el.querySelector('.ag-card__meta')?.textContent || '';

        return {
            element: el,
            group: el.dataset.group || 'all',
            area: el.dataset.area || 'all',
            searchableText: normalizeText(`${badge} ${title} ${desc} ${meta}`)
        };
    });

    /* ----------------------------------------------------------------------
       Cập nhật trạng thái giao diện các nút tab nhóm đơn vị
       ---------------------------------------------------------------------- */
    const updateTabsUI = () => {
        tabButtons.forEach((btn) => {
            const isSelected = (btn.dataset.group || 'all') === state.group;
            btn.classList.toggle('is-active', isSelected);
            btn.setAttribute('aria-selected', String(isSelected));
        });
    };

    /* ----------------------------------------------------------------------
       Hàm lọc và hiển thị danh sách cơ quan, đơn vị
       ---------------------------------------------------------------------- */
    const renderAgencies = () => {
        if (!cards.length) {
            if (emptyState) emptyState.classList.remove('is-visible');
            if (resultCountEl) resultCountEl.textContent = '';
            return;
        }
        const normalizedKeyword = normalizeText(state.keyword);

        const matchedRecords = cardRecords.filter((item) => {
            const matchesGroup = state.group === 'all' || item.group === state.group;
            const matchesArea = state.area === 'all' || item.area === state.area;
            const matchesKeyword = !normalizedKeyword || item.searchableText.includes(normalizedKeyword);

            return matchesGroup && matchesArea && matchesKeyword;
        });

        const totalMatched = matchedRecords.length;
        const visibleSet = new Set(matchedRecords.map((r) => r.element));

        cards.forEach((cardEl) => {
            cardEl.classList.toggle('is-filtered-out', !visibleSet.has(cardEl));
        });

        // Cập nhật bộ đếm kết quả
        if (resultCountEl) {
            if (totalMatched === 0) {
                resultCountEl.textContent = 'Không tìm thấy cơ quan, đơn vị phù hợp';
            } else if (totalMatched === cards.length) {
                resultCountEl.textContent = `Hiển thị toàn bộ ${totalMatched} cơ quan, đơn vị`;
            } else {
                resultCountEl.textContent = `Hiển thị ${totalMatched} / ${cards.length} cơ quan, đơn vị phù hợp`;
            }
        }

        // Hiển thị hoặc ẩn trạng thái trống
        if (emptyState) {
            emptyState.classList.toggle('is-visible', totalMatched === 0);
        }

        updateTabsUI();
    };

    /* ----------------------------------------------------------------------
       Gắn các sự kiện tương tác
       ---------------------------------------------------------------------- */

    // 1. Lọc theo tab nhóm đơn vị
    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            state.group = btn.dataset.group || 'all';
            renderAgencies();
        });
    });

    // 2. Lọc theo dropdown phạm vi/địa bàn
    if (areaSelect) {
        areaSelect.addEventListener('change', (e) => {
            state.area = e.target.value;
            renderAgencies();
        });
    }

    // 3. Tìm kiếm theo từ khóa hoặc chức năng (Input search)
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.keyword = e.target.value;
            renderAgencies();
        });
    }

    // 4. Đặt lại toàn bộ bộ lọc
    const handleReset = () => {
        state.group = 'all';
        state.area = 'all';
        state.keyword = '';
        if (searchInput) searchInput.value = '';
        if (areaSelect) areaSelect.value = 'all';
        renderAgencies();
    };

    if (resetBtn) resetBtn.addEventListener('click', handleReset);
    if (emptyResetBtn) emptyResetBtn.addEventListener('click', handleReset);

    /* ----------------------------------------------------------------------
       Khởi tạo ban đầu
       ---------------------------------------------------------------------- */
    renderAgencies();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAgenciesPage);
} else {
    initAgenciesPage();
}

// Lập lại chỉ mục bộ lọc khi public-pages.js thay danh sách tĩnh bằng dữ liệu API
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.getElementById('ag-grid-list');
        if (host) host.addEventListener('portal:content-rendered', initAgenciesPage);
    });
} else {
    const agHost = document.getElementById('ag-grid-list');
    if (agHost) agHost.addEventListener('portal:content-rendered', initAgenciesPage);
}






/**
 * agency-detail.js - Xử lý nạp dữ liệu chi tiết cơ quan, đơn vị và điều hướng liên quan
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */


document.addEventListener('DOMContentLoaded', () => {
    /* Nội dung demo đã loại bỏ: dữ liệu do public-pages.js tải từ API. */
});

/* ==========================================================================
   Kết xuất danh sách đơn vị liên quan ở sidebar
   ========================================================================== */
/* Đơn vị liên quan (demo) đã loại bỏ: dữ liệu lấy từ API. */







/**
 * statistics.js - Cập nhật số liệu thực tế giai đoạn 2019 - 2026 
 * theo báo cáo của CATP và Ban Chỉ đạo phòng, chống tội phạm TP.HCM
 */


const initStatisticsPage = () => {
    /* Số liệu, kỳ báo cáo và các chỉ số KPI do public-pages.js tải từ API. */
    const printBtn = document.getElementById('st-print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStatisticsPage);
} else {
    initStatisticsPage();
}





/**
 * contact.js - Xử lý biểu mẫu liên hệ, gửi yêu cầu, kiểm tra ẩn danh và sinh mã tiếp nhận
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('ct-contact-form');
    const successBox = document.getElementById('ct-success-box');
    const anonymousCheckbox = document.getElementById('ct-anonymous');
    const fullNameInput = document.getElementById('ct-fullname');
    const nameRequiredMark = document.getElementById('ct-name-req');
    const ticketCodeEl = document.getElementById('ct-ticket-code');

    if (!contactForm) return;

    // 1. Xử lý tùy chọn Ẩn danh (Bật/tắt bắt buộc nhập họ tên)
    if (anonymousCheckbox && fullNameInput && nameRequiredMark) {
        anonymousCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                fullNameInput.removeAttribute('required');
                fullNameInput.value = '';
                fullNameInput.disabled = true;
                fullNameInput.placeholder = 'Đã chọn chế độ ẩn danh';
                nameRequiredMark.classList.add('is-hidden');
            } else {
                fullNameInput.setAttribute('required', 'true');
                fullNameInput.disabled = false;
                fullNameInput.placeholder = 'Nhập họ và tên của bạn';
                nameRequiredMark.classList.remove('is-hidden');
            }
        });
    }

    // 2. Gửi biểu mẫu lên máy chủ (POST /api/public/submissions)
    const submitBtn = document.getElementById('ct-submit-btn');
    const errorBox = document.getElementById('ct-form-error');
    const subjectInput = document.getElementById('ct-subject');
    const emailInput = document.getElementById('ct-email');
    const phoneInput = document.getElementById('ct-phone');
    let submitting = false;

    const showError = (message) => {
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const clearError = () => { if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; } };

    contactForm.addEventListener('input', clearError);

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        if (!contactForm.checkValidity()) {
            contactForm.reportValidity();
            return;
        }
        if (submitting) return;

        const isAnonymous = !!(anonymousCheckbox && anonymousCheckbox.checked);
        const content = (document.getElementById('ct-message') || {}).value || '';
        const consent = document.getElementById('ct-consent');

        if (content.trim().length < 10) {
            showError('Vui lòng mô tả nội dung chi tiết hơn (tối thiểu 10 ký tự).');
            return;
        }
        if (consent && !consent.checked) {
            showError('Vui lòng đồng ý với việc xử lý thông tin cá nhân để tiếp tục gửi yêu cầu.');
            return;
        }

        submitting = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            const label = submitBtn.querySelector('span');
            if (label) label.textContent = 'Đang gửi…';
        }

        try {
            const data = await window.PortalAPI.post('/api/public/submissions', {
                formType: contactForm.dataset.formType || 'contact',
                subject: (subjectInput && subjectInput.value.trim()) || '',
                name: isAnonymous ? '' : ((fullNameInput && fullNameInput.value.trim()) || ''),
                email: (emailInput && emailInput.value.trim()) || '',
                phone: (phoneInput && phoneInput.value.trim()) || '',
                content: content.trim(),
                isAnonymous: isAnonymous,
                consent: true,
            });

            if (ticketCodeEl) {
                ticketCodeEl.textContent = `Mã tiếp nhận: ${data.ticketCode}`;
            }
            const lookupCode = document.getElementById('ct-lookup-code');
            if (lookupCode) lookupCode.value = data.ticketCode;
            const lookupContact = document.getElementById('ct-lookup-contact');
            if (lookupContact) lookupContact.value = isAnonymous ? '' : ((emailInput && emailInput.value.trim()) || (phoneInput && phoneInput.value.trim()) || '');

            contactForm.classList.add('is-hidden');
            if (successBox) {
                successBox.classList.add('is-visible');
                successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (err) {
            if (err && err.isConflict && err.payload && err.payload.ticketCode) {
                showError(`Yêu cầu này đã được tiếp nhận trước đó. Mã tiếp nhận: ${err.payload.ticketCode}.`);
            } else {
                showError(err.message || 'Không gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.');
            }
        } finally {
            submitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                const label = submitBtn.querySelector('span');
                if (label) label.textContent = 'Gửi thông tin';
            }
        }
    });

    // 3. Tra cứu trạng thái hồ sơ theo mã tiếp nhận
    const lookupForm = document.getElementById('ct-lookup-form');
    const lookupResult = document.getElementById('ct-lookup-result');
    const lookupError = document.getElementById('ct-lookup-error');
    const STATUS_LABEL = {
        new: 'Mới tiếp nhận', assigned: 'Đã phân công đơn vị xử lý',
        in_progress: 'Đang xử lý', answered: 'Đã phản hồi',
        closed: 'Đã kết thúc xử lý', rejected: 'Không đủ điều kiện tiếp nhận',
    };

    if (lookupForm) {
        lookupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            lookupError.hidden = true;
            lookupResult.hidden = true;

            const code = (document.getElementById('ct-lookup-code').value || '').trim();
            const contact = (document.getElementById('ct-lookup-contact').value || '').trim();
            if (!code) {
                lookupError.textContent = 'Vui lòng nhập mã tiếp nhận.';
                lookupError.hidden = false;
                return;
            }

            const btn = lookupForm.querySelector('button[type="submit"]');
            const label = btn && btn.querySelector('span');
            if (btn) btn.disabled = true;
            if (label) label.textContent = 'Đang tra cứu…';

            try {
                const data = await window.PortalAPI.get('/api/public/submissions/lookup' +
                    window.PortalAPI.qs({ code: code, contact: contact }));

                const timeline = (data.timeline || []).map((s) =>
                    `<li class="ct-lookup__step"><span class="ct-lookup__dot" aria-hidden="true"></span>
                        <span class="ct-lookup__step-body"><strong>${window.CMS ? window.CMS.util.escape(s.note || s.action) : s.note || s.action}</strong>
                        <span class="ct-lookup__step-time">${new Date(s.at).toLocaleString('vi-VN')}</span></span></li>`).join('');

                lookupResult.innerHTML = `
                    <dl class="ct-lookup__summary">
                        <dt>Mã tiếp nhận</dt><dd>${data.ticketCode}</dd>
                        <dt>Trạng thái</dt><dd><strong>${STATUS_LABEL[data.status] || data.status}</strong></dd>
                        <dt>Tiêu đề</dt><dd>${data.subject || '—'}</dd>
                        <dt>Ngày gửi</dt><dd>${new Date(data.createdAt).toLocaleString('vi-VN')}</dd>
                    </dl>
                    ${data.publicResponse ? `<div class="ct-lookup__answer"><strong>Phản hồi của cơ quan chức năng</strong><p>${data.publicResponse}</p></div>` : ''}
                    ${timeline ? `<ol class="ct-lookup__timeline">${timeline}</ol>` : ''}`;
                lookupResult.hidden = false;
            } catch (err) {
                lookupError.textContent = err.message || 'Không tra cứu được thông tin hồ sơ.';
                lookupError.hidden = false;
            } finally {
                if (btn) btn.disabled = false;
                if (label) label.textContent = 'Tra cứu';
            }
        });
    }
});





/**
 * support.js - Xử lý tính năng tra cứu cơ sở y tế, lọc theo quận/huyện và loại hình dịch vụ
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('sup-search-input');
    const typeSelect = document.getElementById('sup-type-select');
    const searchBtn = document.getElementById('sup-search-btn');
    const centersList = document.getElementById('sup-centers-list');

    if (!centersList) return;

    const centerItems = centersList.querySelectorAll('.sup-center-item');

    const filterCenters = () => {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const selectedType = typeSelect ? typeSelect.value : 'all';

        let visibleCount = 0;

        centerItems.forEach(item => {
            const itemType = item.getAttribute('data-type');
            const itemDistrict = item.getAttribute('data-district');
            const itemText = item.textContent.toLowerCase();

            // Kiểm tra điều kiện loại hình dịch vụ
            const matchType = (selectedType === 'all' || itemType === selectedType);

            // Kiểm tra điều kiện từ khóa (quận/huyện hoặc tên cơ sở)
            const matchQuery = (query === '' || itemDistrict.includes(query) || itemText.includes(query));

            if (matchType && matchQuery) {
                item.classList.remove('is-hidden');
                visibleCount++;
            } else {
                item.classList.add('is-hidden');
            }
        });

        // Xử lý hiển thị thông báo nếu không tìm thấy kết quả phù hợp
        let noResultMsg = document.getElementById('sup-no-result');
        if (!noResultMsg) {
            noResultMsg = document.createElement('div');
            noResultMsg.id = 'sup-no-result';
            noResultMsg.className = 'sup-no-result';
            noResultMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Không tìm thấy cơ sở y tế hoặc điểm tư vấn phù hợp với từ khóa của bạn.';
            centersList.appendChild(noResultMsg);
        }
        noResultMsg.classList.toggle('is-visible', visibleCount === 0);
    };

    // Lắng nghe sự kiện click nút tra cứu
    if (searchBtn) {
        searchBtn.addEventListener('click', filterCenters);
    }

    // Lắng nghe sự kiện thay đổi trên thẻ select loại hình
    if (typeSelect) {
        typeSelect.addEventListener('change', filterCenters);
    }

    // Lắng nghe sự kiện gõ phím trên ô tìm kiếm (hỗ trợ tìm kiếm thời gian thực)
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                filterCenters();
            }
        });
        searchInput.addEventListener('input', filterCenters);
    }
});





/**
 * events.js - Xử lý bộ lọc, tìm kiếm thời gian thực, điều hướng trang chi tiết và Modal sự kiện
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */


document.addEventListener('DOMContentLoaded', () => {
    /* Nội dung demo đã loại bỏ: dữ liệu do public-pages.js tải từ API. */
});





/**
 * event-detail.js - Xử lý hiển thị nội dung động, lịch trình, danh sách liên quan và form đăng ký sự kiện
 * Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh
 */

/* (khối dữ liệu demo đã loại bỏ: nội dung lấy từ API) */;

/* ==========================================================================
   Đồng bộ ID giữa trang danh sách sự kiện (events.html) và trang chi tiết.
   events.html mở modal theo các khóa slug (data-event-id), vì vậy khi người
   dùng bấm "Xem trang chi tiết" thì event-detail.html?id=<slug> phải hiển thị
   đúng nội dung. Các slug chưa có bản ghi đầy đủ sẽ được ánh xạ sang bản ghi
   gần nhất để không bao giờ rơi vào trạng thái trắng trang.
   ========================================================================== */
/* (khối dữ liệu demo đã loại bỏ: nội dung lấy từ API) */;

document.addEventListener('DOMContentLoaded', () => {
    /* Nội dung demo đã loại bỏ: dữ liệu do public-pages.js tải từ API. */
});
