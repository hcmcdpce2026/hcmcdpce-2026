/**
 * Trợ lý ảo PUBLIC (chatbot) – route điều phối.
 *
 *   POST /api/public/chat          { message, history? } → { answer, sources, suggestions, ... }
 *   GET  /api/public/chat/suggestions                    → câu hỏi gợi ý
 *
 * Không yêu cầu đăng nhập, nhưng giới hạn tần suất theo IP và không lưu nội
 * dung hội thoại. Trả lời được tổng hợp từ tri thức biên soạn + dữ liệu công
 * khai trong SQLite (xem server/lib/chatbot/engine.js).
 */
'use strict';

const http = require('../lib/http');
const sec = require('../lib/security');
const { getDb } = require('../lib/db');
const chatbot = require('../lib/chatbot/engine');

/** Đọc DB an toàn: chatbot vẫn chạy (tri thức tĩnh) nếu DB lỗi */
function safeDb() {
  try {
    return getDb();
  } catch (err) {
    console.warn(`[chatbot] Không mở được cơ sở dữ liệu: ${err && err.message ? err.message : err}`);
    return null;
  }
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'bot') && typeof item.text === 'string')
    .slice(-chatbot.MAX_HISTORY)
    .map((item) => ({ role: item.role, text: sec.cleanText(item.text, 300) }));
}

async function chat(req, res, _ctx) {
  const ip = sec.clientIp(req);
  const limit = sec.rateLimit(`chat:${ip}`, Number(process.env.CHATBOT_RATE_LIMIT || 30), 5 * 60_000);
  if (!limit.allowed) {
    return http.tooMany(res, 'Bạn đã gửi quá nhiều câu hỏi. Vui lòng thử lại sau ít phút.', limit.resetAt - Date.now());
  }

  const body = req.body || (await http.readJson(req, 64 * 1024));
  const message = sec.cleanText(body && (body.message || body.q), chatbot.MAX_MESSAGE);
  if (!message) return http.badRequest(res, 'Vui lòng nhập câu hỏi.');

  const agentEnabled = process.env.CHATBOT_ENABLED !== 'false';
  if (!agentEnabled) {
    return http.ok(res, {
      answer: 'Trợ lý ảo đang tạm ngưng hoạt động. Bạn vui lòng gửi câu hỏi qua trang Liên hệ hoặc gọi số tư vấn 0982.120.908.',
      sources: [],
      suggestions: [],
      disabled: true,
    });
  }

  const started = Date.now();
  const result = chatbot.answer({
    message,
    history: sanitizeHistory(body && body.history),
    db: safeDb(),
  });

  return http.ok(res, {
    ...result,
    elapsedMs: Date.now() - started,
  }, {}, {
    'Cache-Control': 'no-store',
  });
}

async function chatSuggestions(_req, res) {
  http.ok(res, { suggestions: chatbot.suggestions() }, {}, {
    'Cache-Control': 'public, max-age=300',
  });
}

module.exports = { chat, chatSuggestions };
