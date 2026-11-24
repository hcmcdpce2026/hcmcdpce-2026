# Changelog

## 2026-11-24 (bổ sung)

- **Trợ lý ảo chạy được trên GitHub Pages (chế độ tĩnh):** `js/api.js` tự nhận biết khi không có
  máy chủ (host không phải localhost) và trả lời từ `public-data/public.json` bằng bộ tri thức ngắn
  nhúng sẵn, thay vì báo lỗi kết nối. Trên máy chủ Node vẫn dùng engine đầy đủ.
- `prepare-github-pages.js` copy thêm `js/chatbot.js` và `css/chatbot.css` (trước đó widget bị thiếu tệp trên bản tĩnh).
- Chế độ tĩnh chỉ đọc dữ liệu/snapshot: gửi phản ánh và tra cứu mã tiếp nhận vẫn cần máy chủ Node.
- Harden module trợ lý ảo trên máy chủ: tách từ theo cụm tiếng Việt, trọng số IDF, mức căn cứ
  strong/medium/weak để không trả lời lạc đề; câu hỏi duyệt danh mục (tin tức, sự kiện, văn bản,
  thống kê) trả danh sách nguồn; câu hỏi liệt kê trình bày dạng gạch đầu dòng; thêm mục tri thức
  “Ma túy là gì?” và câu trả lời “các hình thức cai nghiện”.
- Thêm `server/scripts/smoke-chatbot.js` vào bộ `test:isolated`.
- Thêm widget chatbot vào `404.html` (kèm `js/api.js`).
- Sửa `server/scripts/data-tool.js`: `db.transaction()` không tồn tại trên `node:sqlite`, nay dùng
  `BEGIN/COMMIT/ROLLBACK` tường minh.
- `http.ok()` nhận thêm tham số `headers` (dùng cho `Cache-Control` của API trợ lý ảo).

## 2026-11-24

- Thêm trợ lý ảo (chatbot) hỏi đáp trên toàn bộ trang PUBLIC: widget nổi
  (`js/chatbot.js`, `css/chatbot.css`) và API `POST /api/public/chat`,
  `GET /api/public/chat/suggestions`.
- Câu trả lời tổng hợp từ tri thức biên soạn sẵn (`server/lib/chatbot/knowledge.js`)
  và dữ liệu công khai do CMS quản lý (bài viết, văn bản, cơ sở hỗ trợ, sự kiện,
  cơ quan, thống kê) kèm liên kết nguồn; không lưu nội dung hội thoại.
- Thêm biến môi trường `CHATBOT_ENABLED`, `CHATBOT_RATE_LIMIT`; `http.ok()` nhận
  thêm tham số `headers`.

## 2026-11-22

- Thêm kiểm tra scope đối tượng trong Workspace tasks, reports và proposals.
- Escape dữ liệu public submission lookup.
- Chặn truy cập `/uploads` private và lọc private media khỏi static export.
- Production mặc định bật Secure cho session cookie.
- Chỉ tin cậy `X-Forwarded-For` từ proxy đã cấu hình.
- Tách public timeline khỏi ghi chú CMS nội bộ.
- Chuẩn hóa danh mục `media_folder`.
- Bổ sung backup/restore SQLite.
- Cập nhật tài liệu và báo cáo kiểm thử/bảo mật.
