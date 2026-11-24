/**
 * chatbot.js – Widget "Trợ lý ảo" của Chuyên trang PUBLIC.
 *
 * - Tự dựng nút nổi + khung hội thoại (không cần sửa HTML của từng trang).
 * - Gọi POST /api/public/chat qua lớp PortalAPI (tự có timeout/chuẩn hóa lỗi).
 * - Mọi nội dung trả về đều được escape trước khi chèn vào DOM.
 * - Lịch sử hội thoại chỉ lưu trong sessionStorage của phiên trình duyệt,
 *   không gửi thông tin định danh và có thể xóa bằng nút “Cuộc trò chuyện mới”.
 */
(function () {
    'use strict';
    if (window.PortalChatbot || !window.PortalAPI) return;

    const api = window.PortalAPI;
    const STORAGE_KEY = 'hcm-portal-chat';
    const MAX_TURNS = 40;

    const esc = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /* Đường dẫn tới gốc site: index.html ở gốc, các trang khác nằm trong /pages/... */
    const ROOT = (() => {
        const path = window.location.pathname.replace(/\\/g, '/');
        if (/\/(pages|cms|workspace)\//.test(path)) return new URL('../../', window.location.href);
        return new URL('./', window.location.href);
    })();

    const resolveUrl = (url) => {
        if (!url) return '';
        try { return new URL(String(url).replace(/^\//, ''), ROOT).href; } catch (_) { return ''; }
    };

    /** Lịch sử gửi kèm để bot hiểu câu hỏi nối tiếp (tối đa 6 lượt gần nhất) */
    let history = [];
    let isOpen = false;
    let isBusy = false;
    let greeted = false;

    /* ------------------------------- Lưu trữ -------------------------------- */

    function loadHistory() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed)) history = parsed.filter((m) => m && typeof m.text === 'string').slice(-MAX_TURNS);
        } catch (_) { history = []; }
    }

    function saveHistory() {
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_TURNS))); } catch (_) { /* bị chặn */ }
    }

    /* ------------------------------- Giao diện ------------------------------- */

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'chatbot-fab';
    fab.setAttribute('aria-label', 'Mở trợ lý ảo hỏi đáp về phòng, chống ma túy');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'chatbot-panel');
    fab.innerHTML = '<span class="chatbot-fab__icon" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 3C6.9 3 3 6.4 3 10.6c0 2.3 1.2 4.4 3.2 5.8-.2 1-.7 2-1.5 2.9-.2.2 0 .6.3.6 1.9-.2 3.4-1 4.5-1.9.8.2 1.6.3 2.5.3 5.1 0 9-3.4 9-7.7S17.1 3 12 3z"/></svg></span>'
        + '<span class="chatbot-fab__label">Hỏi đáp</span>';

    const panel = document.createElement('section');
    panel.id = 'chatbot-panel';
    panel.className = 'chatbot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'chatbot-title');
    panel.hidden = true;
    panel.innerHTML = `
        <header class="chatbot-header">
            <div class="chatbot-header__avatar" aria-hidden="true">
                <img src="${new URL('assets/icons/logo.jpg', ROOT).href}" alt="" width="24" height="24">
            </div>
            <div class="chatbot-header__info">
                <h2 class="chatbot-header__title" id="chatbot-title">Trợ lý ảo phòng, chống ma túy</h2>
                <p class="chatbot-header__status"><span aria-hidden="true"></span> Trả lời từ dữ liệu công khai của Chuyên trang</p>
            </div>
            <div class="chatbot-header__actions">
                <button type="button" class="chatbot-icon-btn" data-chatbot-action="reset" title="Cuộc trò chuyện mới" aria-label="Bắt đầu cuộc trò chuyện mới">
                    <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                </button>
                <button type="button" class="chatbot-icon-btn" data-chatbot-action="close" title="Đóng" aria-label="Đóng khung trò chuyện">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </div>
        </header>
        <div class="chatbot-body" id="chatbot-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="chatbot-suggestions" id="chatbot-suggestions"></div>
        <form class="chatbot-form" id="chatbot-form" autocomplete="off">
            <label class="chatbot-visually-hidden" for="chatbot-input">Nhập câu hỏi cho trợ lý ảo</label>
            <textarea id="chatbot-input" class="chatbot-input" rows="1" maxlength="500"
                placeholder="Nhập câu hỏi về phòng, chống ma túy…"></textarea>
            <button type="submit" class="chatbot-send" aria-label="Gửi câu hỏi">
                <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
            </button>
        </form>
        <p class="chatbot-footnote">
            Thông tin tham khảo, không thay thế tư vấn chuyên môn.
            Khẩn cấp: <a href="tel:113">113</a> · Tư vấn: <a href="tel:0982120908">0982.120.908</a>
        </p>
    `;

    const messagesEl = panel.querySelector('#chatbot-messages');
    const suggestionsEl = panel.querySelector('#chatbot-suggestions');
    const formEl = panel.querySelector('#chatbot-form');
    const inputEl = panel.querySelector('#chatbot-input');

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    /* ------------------------------- Hiển thị -------------------------------- */

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(role, text, extra) {
        const wrap = document.createElement('div');
        wrap.className = `chatbot-msg chatbot-msg--${role}`;
        if (extra && extra.urgent) wrap.classList.add('chatbot-msg--urgent');

        const bubble = document.createElement('div');
        bubble.className = 'chatbot-bubble';
        /* innerHTML chỉ dựng từ dữ liệu đã escape; xuống dòng thành <br> */
        bubble.innerHTML = esc(text).replace(/\n/g, '<br>');

        const sources = extra && Array.isArray(extra.sources) ? extra.sources : [];
        if (sources.length) {
            const box = document.createElement('div');
            box.className = 'chatbot-sources';
            const title = document.createElement('p');
            title.className = 'chatbot-sources__title';
            title.textContent = 'Nguồn trên Chuyên trang';
            box.appendChild(title);
            sources.slice(0, 4).forEach((source) => {
                const href = resolveUrl(source.url);
                const item = document.createElement(href ? 'a' : 'div');
                item.className = 'chatbot-source';
                if (href) {
                    item.href = href;
                    item.target = '_self';
                }
                item.innerHTML = `<span class="chatbot-source__label">${esc(source.label || '')}</span>`
                    + `<span class="chatbot-source__title">${esc(source.title || '')}</span>`
                    + (source.excerpt ? `<span class="chatbot-source__excerpt">${esc(source.excerpt)}</span>` : '');
                box.appendChild(item);
            });
            wrap.appendChild(bubble);
            wrap.appendChild(box);
        } else {
            wrap.appendChild(bubble);
        }

        messagesEl.appendChild(wrap);
        scrollToBottom();
        return wrap;
    }

    function addTyping() {
        const wrap = document.createElement('div');
        wrap.className = 'chatbot-msg chatbot-msg--bot chatbot-msg--typing';
        wrap.id = 'chatbot-typing';
        wrap.innerHTML = '<div class="chatbot-bubble"><span class="chatbot-dots">'
            + '<i></i><i></i><i></i></span></div>';
        messagesEl.appendChild(wrap);
        scrollToBottom();
        return wrap;
    }

    function renderSuggestions(list) {
        suggestionsEl.innerHTML = '';
        const items = Array.isArray(list) ? list.filter(Boolean).slice(0, 3) : [];
        if (!items.length) {
            suggestionsEl.hidden = true;
            return;
        }
        suggestionsEl.hidden = false;
        items.forEach((suggestion) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chatbot-chip';
            btn.textContent = suggestion;
            btn.addEventListener('click', () => send(suggestion));
            suggestionsEl.appendChild(btn);
        });
    }

    function setBusy(state) {
        isBusy = state;
        formEl.classList.toggle('is-busy', state);
        inputEl.disabled = false;
        panel.querySelector('.chatbot-send').disabled = state;
    }

    function toggle(open) {
        isOpen = typeof open === 'boolean' ? open : !isOpen;
        panel.hidden = !isOpen;
        fab.setAttribute('aria-expanded', String(isOpen));
        fab.classList.toggle('is-hidden', isOpen);
        fab.hidden = isOpen; /* Không để nút nổi nằm dưới khung chat khi đang mở */
        document.body.classList.toggle('chatbot-open', isOpen);
        if (isOpen) {
            if (!greeted) {
                greeted = true;
                if (!history.length) {
                    addMessage('bot', 'Xin chào! Tôi là trợ lý ảo của Chuyên trang điện tử về phòng, chống ma túy tại TP. Hồ Chí Minh. '
                        + 'Bạn có thể hỏi tôi về kiến thức ma túy, kỹ năng phòng ngừa, cai nghiện – Methadone, pháp luật, '
                        + 'cơ sở hỗ trợ hoặc cách gửi tin báo.');
                    renderSuggestions(['Ma túy là gì và được phân loại như thế nào?', 'Thủ tục đăng ký cai nghiện tự nguyện gồm những gì?', 'Tôi phát hiện tụ điểm ma túy, cần báo cho ai?']);
                }
            }
            window.setTimeout(() => { inputEl.focus({ preventScroll: true }); scrollToBottom(); }, 60);
        }
    }

    /* -------------------------------- Gửi tin -------------------------------- */

    async function send(rawText) {
        const text = String(rawText == null ? inputEl.value : rawText).trim();
        if (!text || isBusy) return;
        inputEl.value = '';
        inputEl.style.height = '';
        renderSuggestions([]);
        addMessage('user', text);
        history.push({ role: 'user', text });
        saveHistory();

        setBusy(true);
        const typing = addTyping();
        try {
            const data = await api.post('/api/public/chat', {
                message: text.slice(0, 500),
                history: history.slice(-6).map((m) => ({ role: m.role, text: String(m.text).slice(0, 300) })),
            }, { timeout: 25000 });
            typing.remove();
            const answer = (data && data.answer) || 'Xin lỗi, hiện chưa có câu trả lời cho câu hỏi này.';
            addMessage('bot', answer, { sources: data && data.sources, urgent: data && data.urgent });
            history.push({ role: 'bot', text: answer.slice(0, 400) });
            saveHistory();
            renderSuggestions(data && data.suggestions);
        } catch (err) {
            typing.remove();
            const message = err && err.isNetwork
                ? 'Không kết nối được máy chủ để lấy câu trả lời. Vui lòng kiểm tra đường truyền và thử lại, hoặc gọi 0982.120.908 để được tư vấn.'
                : (err && err.message) || 'Có lỗi khi lấy câu trả lời. Vui lòng thử lại sau.';
            addMessage('bot', message);
            renderSuggestions(['Thủ tục đăng ký cai nghiện tự nguyện gồm những gì?', 'Điều trị Methadone có mất phí không?']);
        } finally {
            setBusy(false);
        }
    }

    /* ------------------------------- Sự kiện --------------------------------- */

    fab.addEventListener('click', () => toggle());
    panel.querySelector('[data-chatbot-action="close"]').addEventListener('click', () => {
        toggle(false);
        fab.focus({ preventScroll: true });
    });
    panel.querySelector('[data-chatbot-action="reset"]').addEventListener('click', () => {
        history = [];
        saveHistory();
        messagesEl.innerHTML = '';
        greeted = true;
        addMessage('bot', 'Đã bắt đầu cuộc trò chuyện mới. Bạn muốn tìm hiểu nội dung gì?');
        renderSuggestions(['Ma túy là gì và được phân loại như thế nào?', 'Làm sao nhận biết một người nghi sử dụng ma túy?', 'Số liệu thống kê công tác phòng, chống ma túy']);
        inputEl.focus({ preventScroll: true });
    });

    formEl.addEventListener('submit', (event) => {
        event.preventDefault();
        send();
    });

    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            send();
        }
    });

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isOpen) {
            toggle(false);
            fab.focus({ preventScroll: true });
        }
    });

    /* Khôi phục hội thoại của phiên hiện tại khi mở trang khác */
    loadHistory();
    if (history.length) {
        greeted = true;
        history.forEach((m) => addMessage(m.role === 'user' ? 'user' : 'bot', m.text));
    }

    window.PortalChatbot = { open: () => toggle(true), close: () => toggle(false), send };
})();
