/**
 * smoke-chatbot.js – Kiểm thử API trợ lý ảo (chatbot) của PUBLIC.
 *
 * Kiểm tra:
 *   - endpoint gợi ý hoạt động;
 *   - câu hỏi kiến thức trả lời từ tri thức biên soạn + gợi ý câu hỏi tiếp theo;
 *   - câu hỏi khẩn cấp được đánh dấu urgent;
 *   - nguồn (sources) chỉ chứa liên kết nội bộ hợp lệ;
 *   - kiểm tra đầu vào: rỗng → 400; quá dài → cắt còn 500 ký tự; history sai kiểu bị bỏ qua.
 *
 * Chạy khi máy chủ đang hoạt động: node server/scripts/smoke-chatbot.js
 */
'use strict';

const BASE = process.env.API_BASE || 'http://localhost:8099';

const step = (name, ok, info) => console.log(`  ${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);

async function ask(message, extra) {
  const res = await fetch(`${BASE}/api/public/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ message, ...(extra || {}) }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* không phải JSON */ }
  return { status: res.status, data: json && json.data, error: json && json.error };
}

(async () => {
  let failed = 0;
  const check = (name, ok, info) => { if (!ok) failed += 1; step(name, ok, info); };

  console.log('TRỢ LÝ ẢO (CHATBOT) – KIỂM THỬ API\n');

  const sug = await fetch(`${BASE}/api/public/chat/suggestions`);
  const sugJson = await sug.json().catch(() => null);
  check('GET /api/public/chat/suggestions', sug.status === 200
    && Array.isArray(sugJson && sugJson.data && sugJson.data.suggestions)
    && sugJson.data.suggestions.length > 0);

  const empty = await ask('');
  check('Câu hỏi rỗng bị từ chối (400)', empty.status === 400, empty.error);

  const kb = await ask('Ma túy là gì và được phân loại như thế nào?');
  check('Trả lời câu hỏi kiến thức', kb.status === 200 && !!kb.data.answer && kb.data.answer.length > 80);
  check('Có câu hỏi gợi ý tiếp theo', Array.isArray(kb.data.suggestions) && kb.data.suggestions.length > 0);
  check('Có tuyên bố miễn trừ trách nhiệm', typeof kb.data.disclaimer === 'string' && kb.data.disclaimer.length > 0);

  const support = await ask('Thủ tục đăng ký cai nghiện tự nguyện gồm những gì?');
  check('Câu hỏi về cai nghiện có nội dung quy trình',
    support.status === 200 && /cai nghiện/i.test(support.data.answer) && support.data.answer.includes('•'));

  const emergency = await ask('Người nhà bị quá liều ma túy, đang khó thở');
  check('Tình huống khẩn cấp được đánh dấu', emergency.status === 200 && emergency.data.urgent === true);
  check('Khẩn cấp nhắc số 115', /115/.test(emergency.data.answer));

  const sourcesOk = (support.data.sources || []).every((s) =>
    typeof s.title === 'string' && (!s.url || s.url.startsWith('/pages/public/')));
  check('Nguồn trích dẫn là liên kết nội bộ hợp lệ', sourcesOk);

  const history = await ask('còn cơ sở ở Bình Thạnh thì sao?', {
    history: [{ role: 'user', text: 'Cơ sở hỗ trợ cai nghiện ở TP Hồ Chí Minh' }, { role: 'bot', text: '...' }],
  });
  check('Câu hỏi nối tiếp có ngữ cảnh', history.status === 200 && !!history.data.answer);

  const long = await ask('a'.repeat(2000));
  check('Câu hỏi dài vẫn xử lý được (không 5xx)', long.status === 200, `status ${long.status}`);

  const badHistory = await ask('Cai nghiện tự nguyện', { history: 'không phải mảng' });
  check('history sai kiểu bị bỏ qua', badHistory.status === 200);

  const unknown = await ask('asdfgh qwerty zxcvbn thuật toán lượng tử');
  check('Câu hỏi ngoài phạm vi trả lời an toàn',
    unknown.status === 200 && /chưa tìm thấy|Liên hệ|tư vấn/.test(unknown.data.answer));

  console.log(failed ? `\nCÓ ${failed} MỤC KHÔNG ĐẠT` : '\nTẤT CẢ ĐẠT');
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error('Lỗi kiểm thử chatbot:', err.message);
  process.exitCode = 1;
});
