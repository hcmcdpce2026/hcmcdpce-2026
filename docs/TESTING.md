# Kiểm thử

## 1. Nguyên tắc an toàn

Không chạy suite ghi dữ liệu trên production. Một số script:

- tạo bài/task/submission/report;
- thay đổi trạng thái tài khoản;
- ghi upload/log;
- dừng server Node;
- xóa database hoặc dữ liệu kiểm thử.

Luôn xác nhận `DB_FILE` trước khi chạy.

Kết quả kiểm thử chỉ có giá trị với đúng môi trường và thời điểm chạy. Không dùng kết quả trên database tạm để khẳng định production hoạt động; trạng thái lần bàn giao gần nhất được ghi trong `HANDOVER.md`.

## 2. Bảng lệnh

| Lệnh | Phạm vi | Ghi vào |
|---|---|---|
| `npm run test:isolated` | Suite an toàn tổng hợp | Database và server tạm |
| `npm run check` | Encoding và security pattern | Không ghi database |
| `npm run test:content-types` | Sáu nhóm nội dung | Database tạm |
| `npm run test:security` | Path traversal, internal path, wrong auth | Server đang chạy |
| `npm run test:workspace` | CRUD task Workspace | Database server đang chạy |
| `npm test` | Tích hợp API chung | Database server đang chạy |
| `npm run test:interconnect` | PUBLIC-CMS-Workspace | Database server đang chạy |
| `npm run test:clean` | Liệt kê dữ liệu test còn sót | Database server đang chạy |

## 3. Suite cô lập khuyến nghị

```powershell
npm.cmd run test:isolated
```

Runner thực hiện:

1. tạo thư mục SQLite tạm;
2. migrate và seed dữ liệu tạm;
3. chạy server tạm ở cổng `8123`;
4. chạy test API, liên thông, security và Workspace CRUD;
5. dọn database, WAL/SHM và thư mục tạm;
6. bảo toàn file credential vận hành nếu đã tồn tại.

Đây là cách chạy mặc định khi muốn xác nhận toàn bộ suite mà không chạm database hiện tại.

## 4. Kiểm thử API trên server riêng

Tạo `.env` database tạm, migrate/seed:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

Terminal thứ hai:

```powershell
npm.cmd test
```

Có thể đặt:

```powershell
$env:API_BASE="http://127.0.0.1:8099"
npm.cmd test
```

`test-api.js` cần credential CMS/Workspace. Credential lấy theo thứ tự nội bộ của script; không đặt mật khẩu thật trong mã nguồn hoặc log.

## 5. Kiểm thử liên thông

```powershell
npm.cmd run test:interconnect
```

Suite tạo submission PUBLIC, kiểm tra CMS, tạo task Workspace, rồi kiểm tra kết quả/deal proposal. Chạy trên database sạch/kiểm thử.

## 6. Kiểm thử bảo mật

```powershell
npm.cmd run test:security
```

Kiểm tra:

- path traversal encoded;
- backslash traversal;
- truy cập `.env`/SQLite/credential/package;
- route nội bộ không cần auth;
- API CMS/Workspace sai phân hệ;
- request sai định dạng không làm treo server.

## 7. Kiểm thử sáu nhóm nội dung

```powershell
npm.cmd run test:content-types
```

Bộ kiểm thử chạy fixture cho:

- tin tức;
- tuyên truyền - giáo dục;
- sự kiện;
- pháp luật;
- cơ quan;
- cơ sở hỗ trợ.

Database tạm tự được xóa sau runner.

## 8. Kiểm tra tĩnh

```powershell
npm.cmd run check
```

Chạy:

- `scripts/check-encoding.js`;
- `scripts/security-scan.js`.

Kết quả tĩnh không thay thế kiểm thử runtime. Rà lại mọi cảnh báo và xác nhận điều đó là pattern đã chấp nhận hay thật sự cần sửa.

`npm run check` không quét toàn bộ lịch sử commit để tìm secret và không chứng nhận bảo mật.

## 9. Dọn dữ liệu test

Sau khi đã chạy suite ghi database:

```powershell
npm.cmd run test:clean
```

Mặc định chỉ báo cáo. Khi đã xem và xác nhận:

```powershell
node server/scripts/clean-test-data.js --yes
```

Không dựa vào ngày giờ để dọn. Dọn bởi marker/nội dung tiêu đề do runner sinh ra.

## 10. QA trình duyệt

Các script `scripts/qa-*.mjs` cần môi trường browser automation tùy workspace. Server chạy phải ở base URL phù hợp.

Credential được lấy từ:

- `server/data/qa-creds.json`;
- `server/data/credentials.local.txt`;
- `QA_CREDENTIALS_JSON`.

Không đặt mật khẩu thật trong repository.

Checklist thủ công:

- PUBLIC: trang chủ, danh mục, chi tiết, search/filter, form, lookup;
- CMS: login, lưu nháp, submit, approve, publish, unpublish;
- Workspace: task, progress, submit, report, document, event;
- liên thông: submission/task/proposal và PUBLIC;
- bảo mật: session hết hạn, sai phân hệ, thiếu CSRF, quyền;
- responsive: mobile/tablet/desktop;
- lỗi: loading, rỗng, network, validation.

## 11. Lệnh có thể xóa dữ liệu

- `npm.cmd run db:reset` xóa và tạo lại database. Chỉ dùng với database thử nghiệm.
- `node server/scripts/clean-test-data.js --yes` xóa candidate đã được xác nhận. Luôn xem dry-run trước.
- Các runner PowerShell cũ có thể dừng mọi tiến trình Node hoặc xóa database vận hành đã được loại bỏ. Dùng `npm.cmd run test:isolated` để kiểm thử an toàn.

## 12. Khi suite thất bại

1. ghi lại lệnh và API base;
2. xác nhận database thực tế;
3. lưu terminal output;
4. kiểm tra `server/data/server.err.log`;
5. chạy lại trên database cô lập;
6. phân loại lỗi data/config/code;
7. dọn dữ liệu test nếu cần.
