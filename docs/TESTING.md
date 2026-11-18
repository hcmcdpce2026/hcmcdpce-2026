# Kiểm thử

Tài liệu này liệt kê các bộ kiểm thử và cách chạy an toàn trên môi trường phát triển. Không chạy bài kiểm thử ghi dữ liệu trên production.

## Công cụ trong repository

| Tệp/lệnh | Phạm vi | Ghi chú |
|---|---|---|
| `npm test` (`server/scripts/test-api.js`) | Tích hợp API: xác thực, quyền, CSRF, PUBLIC form và nghiệp vụ | Cần server đang chạy và `server/data/credentials.local.txt` |
| `npm run test:interconnect` (`server/scripts/smoke-interconnect.js`) | Luồng PUBLIC → CMS → Workspace | Ghi các bản ghi kiểm thử vào database được cấu hình |
| `npm run check` | Kiểm tra mã hóa và quét tĩnh bảo mật | Không thay thế kiểm thử runtime |
| `scripts/qa-*.mjs` | Một số kịch bản trình duyệt cho PUBLIC, CMS, Workspace và biểu mẫu | Cần browser automation harness; trang bảo vệ đọc credential từ `server/data/qa-creds.json`, `credentials.local.txt` hoặc `QA_CREDENTIALS_JSON` |
| `server/scripts/run-tests.ps1` | Runner API trên Windows | Dừng tiến trình Node đang chạy và thay đổi dữ liệu/log kiểm thử |
| `scripts/verify-all.ps1` | Tạo lại database, seed và chạy bộ kiểm tra | **Phá hủy database hiện tại và dừng tiến trình Node**; chỉ dùng trên máy/DB disposable |

`package.json` không khai báo framework kiểm thử hoặc dependency bên ngoài; các bài API dùng Node.js tích hợp. Kịch bản trình duyệt có thể cần môi trường browser automation riêng.

## Chuẩn bị môi trường kiểm thử

1. Dùng checkout và database riêng cho kiểm thử; không trỏ `DB_FILE` tới dữ liệu thật.
2. Tạo `.env` với `APP_ENV=development`, đường dẫn database thử nghiệm và `RATE_LIMIT_DISABLED` chỉ khi thật sự cần cho suite.
3. Chạy migration và seed CLI:

```bash
npm run db:migrate
npm run db:seed
```

Seed CLI ghi credential ban đầu vào `server/data/credentials.local.txt`; không chia sẻ tệp đó hoặc bật `TEST_DEBUG` trong log công khai.

## Kiểm thử API

Terminal 1:

```bash
npm start
```

Terminal 2:

```bash
npm test
```

Có thể đổi base URL bằng biến `API_BASE`. Suite đọc credential từ `server/data/credentials.local.txt`. Nó có thể tạo/cập nhật dữ liệu, thay đổi trạng thái tài khoản thử nghiệm hoặc tạo các bản ghi nghiệp vụ; dùng database disposable.

## Kiểm thử liên thông

```bash
npm run test:interconnect
```

Suite tạo yêu cầu PUBLIC, xử lý/chuyển qua CMS sang Workspace, rồi kiểm tra kết quả/đề xuất. Nó ghi dữ liệu vào database đang chạy và cần credential khởi tạo. Sau khi chạy, xóa database thử nghiệm hoặc dọn dữ liệu bằng quy trình được xác nhận.

## Kiểm tra tĩnh

```bash
npm run check
```

Lệnh chạy `scripts/check-encoding.js` và `scripts/security-scan.js`. Đọc toàn bộ cảnh báo; kiểm tra tĩnh không chứng minh ứng dụng an toàn hoặc mọi luồng đúng.

## QA giao diện

Các script `scripts/qa-*.mjs` là kịch bản chạy trong môi trường browser harness, không phải Playwright test runner được cài qua package. Chúng có thể cần server ở `http://localhost:8099`, `server/data/credentials.local.txt`, hoặc `server/data/qa-creds.json`. Kiểm tra đầu script và hướng dẫn harness tại môi trường chạy trước khi dùng.

Không đặt mật khẩu thử nghiệm trực tiếp trong các script QA. Tệp credential nằm trong `server/data/` đã được `.gitignore` loại khỏi Git; nếu dùng `QA_CREDENTIALS_JSON`, chỉ đặt biến trong môi trường cục bộ/CI secret store.

Phạm vi kiểm thử tự động không tương đương với tất cả 38 trang HTML; hãy xác định danh sách trang được script hiện tại mở. Kiểm tra thủ công các trang chi tiết, biểu mẫu, trạng thái rỗng/lỗi và các màn hình sau đăng nhập.

## Kiểm thử thủ công đề xuất

- **PUBLIC:** trang chủ, tìm kiếm/lọc nội dung, trang chi tiết, biểu mẫu, mã tiếp nhận, tra cứu sai/đúng thông tin.
- **CMS:** đăng nhập/đăng xuất, soạn và lưu nháp, gửi duyệt, duyệt/từ chối, xuất bản/thu hồi, tiếp nhận và nhật ký.
- **Workspace:** nhiệm vụ, cập nhật tiến độ/gửi kết quả, báo cáo, lịch, tài liệu, quyền người dùng.
- **Liên thông:** PUBLIC → CMS → Workspace → phản hồi; Workspace proposal → CMS review/publish → PUBLIC.
- **Bảo mật:** phiên hết hạn, sai phân hệ, thiếu quyền, thiếu CSRF, tài khoản bị khóa.
- **Giao diện:** mobile, tablet, desktop; trạng thái loading/rỗng/error; bàn phím, focus và nhãn biểu mẫu.
- **Dữ liệu:** xác nhận dữ liệu chưa xuất bản không hiện ở PUBLIC và số liệu được đánh dấu nguồn phù hợp.

## Runner có thao tác phá hủy

Không chạy `scripts/verify-all.ps1` trừ khi đã xác nhận đang ở môi trường thử nghiệm có thể xóa. Script dừng tiến trình Node, xóa `server/data/portal.sqlite*`, dựng lại database và ghi artifact kết quả. `server/scripts/run-tests.ps1` cũng dừng các tiến trình Node đang chạy và làm sạch một số dữ liệu đăng nhập; tránh dùng khi có server khác đang hoạt động.

Khi suite thất bại, giữ log, xác nhận base URL và database, kiểm tra `server/data/server.err.log`, và chạy lại trên DB riêng sau khi đã phân tích nguyên nhân.
