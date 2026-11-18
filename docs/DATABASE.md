# Cơ sở dữ liệu và quản lý dữ liệu

## Tổng quan

Ứng dụng dùng SQLite qua `node:sqlite` của Node.js. Mặc định database ở `server/data/portal.sqlite`; có thể đổi bằng `DB_FILE`. Kết nối chung được tạo tại `server/lib/db.js`, bật WAL, khóa ngoại và `busy_timeout`.

Schema được khai báo trong `server/db/schema.sql`. Mã ứng dụng dùng prepared statements và lưu thời gian ở dạng ISO 8601. Các tên cột thường theo `snake_case`; mapper chuyển thành đối tượng `camelCase` cho API.

## Nhóm bảng

### Cấu hình, tài khoản và quyền

| Bảng | Mục đích |
|---|---|
| `schema_migrations` | Ghi nhận schema đã áp dụng |
| `organizations` | Cơ quan, đơn vị và quan hệ cha-con |
| `roles`, `permissions`, `role_permissions` | Vai trò và quyền theo phân hệ |
| `users` | Tài khoản đăng nhập và cán bộ tham chiếu |
| `sessions` | Phiên đăng nhập; lưu hash token |
| `login_attempts` | Nhật ký thử đăng nhập |
| `settings` | Cấu hình hệ thống dạng key-value |

### Nội dung và PUBLIC

| Bảng | Mục đích |
|---|---|
| `categories` | Chuyên mục |
| `articles`, `article_revisions` | Bài viết và lịch sử phiên bản |
| `media`, `banners` | Tài nguyên và banner |
| `legal_documents` | Văn bản pháp luật |
| `public_agencies`, `public_events` | Danh mục cơ quan và sự kiện công khai |
| `statistics_periods`, `statistics_items` | Kỳ và chỉ số thống kê |
| `support_facilities` | Cơ sở hỗ trợ |

### Tiếp nhận và Workspace

| Bảng | Mục đích |
|---|---|
| `submissions`, `submission_events` | Yêu cầu từ PUBLIC và dòng thời gian xử lý |
| `tasks`, `task_items`, `task_comments`, `task_history`, `task_documents` | Nhiệm vụ và trao đổi |
| `documents`, `doc_versions` | Tài liệu nội bộ và phiên bản |
| `events` | Lịch công tác nội bộ |
| `reports`, `report_documents` | Báo cáo và tài liệu đính kèm |
| `proposals` | Đề xuất nội dung gửi CMS |
| `collaboration_requests` | Yêu cầu phối hợp giữa các phân hệ |
| `notifications` | Thông báo |
| `activity_logs` | Nhật ký thao tác |

## Quan hệ dữ liệu chính

```text
organizations ── users, tasks, documents, reports
categories ── articles, proposals
articles ── article_revisions
submissions ── submission_events, tasks
tasks ── task_items, task_comments, task_history, task_documents
reports ── report_documents
proposals ── articles (sau khi được CMS duyệt/xuất bản)
statistics_periods ── statistics_items
users ── sessions, login_attempts, activity_logs
```

`submissions.task_id` nối yêu cầu đã được CMS phân công tới nhiệm vụ Workspace. Đề xuất Workspace được liên kết với bài viết bằng `proposals.article_id` và `articles.origin`/`origin_ref`. Xem khóa ngoại và chỉ mục chính xác trong `server/db/schema.sql`.

## Khởi tạo và migration

```bash
npm run db:migrate
npm run db:seed
```

- `db:migrate` áp dụng `schema.sql` và bổ sung tương thích schema được hỗ trợ bởi `server/db/migrate.js`; có thể chạy lặp lại.
- `db:seed` thêm các tổ chức, quyền, vai trò, tài khoản và cấu hình hệ thống còn thiếu. Mặc định không thêm nội dung nghiệp vụ mẫu.
- Chạy `db:seed` trước lần khởi động server đầu tiên để script CLI có thể tạo `server/data/credentials.local.txt` khi tạo tài khoản mới.
- Server cũng bảo đảm schema và dữ liệu hệ thống tối thiểu khi khởi động. Tuy nhiên, cơ chế tự seed của server không ghi tệp bàn giao mật khẩu.

### Dữ liệu mẫu và reset

Nội dung công khai không có dữ liệu mẫu mặc định; do đó trạng thái rỗng trên PUBLIC là bình thường cho đến khi dữ liệu được nhập và xuất bản.

Chỉ trên database thử nghiệm có thể xóa:

```bash
node server/db/seed.js --reset --with-demo
```

Lệnh trên xóa dữ liệu hiện có rồi nạp lại phần hệ thống và dữ liệu demo. `npm run db:reset` cũng reset toàn bộ database nhưng chỉ nạp phần hệ thống. **Không chạy các lệnh reset trên dữ liệu thật.**

Seed có thể tạo mật khẩu từ các biến `SEED_PASSWORD_*` trong `.env`; nếu để trống, mật khẩu được sinh tự động. Tệp bàn giao có mật khẩu rõ, phải được bảo vệ và xóa sau khi chuyển giao.

## Công cụ CSV/JSON

`server/scripts/data-tool.js` hỗ trợ các lệnh:

```bash
node server/scripts/data-tool.js stats
node server/scripts/data-tool.js export all --out backups/pre-change
node server/scripts/data-tool.js export articles --out backups/articles
node server/scripts/data-tool.js import articles data/articles.csv --dry-run
node server/scripts/data-tool.js import articles data/articles.csv
node server/scripts/data-tool.js purge-seed --confirm
```

- `export` ghi cả CSV và JSON cho mỗi bảng được chọn.
- `import` chỉ nhận bảng trong danh sách cho phép; tệp phải có cột `id`. Dùng `--dry-run` trước khi nhập thật.
- Import cập nhật bản ghi trùng ID hoặc thêm mới trong transaction; một số khóa ngoại được kiểm tra và dòng sai bị bỏ qua, có thông báo.
- `purge-seed` cần `--confirm`, từ chối nếu phát hiện dữ liệu vận hành tại một số bảng được bảo vệ. Hãy sao lưu và kiểm tra quan hệ trước khi xóa.
- `npm run data` gọi công cụ này; chạy không đối số để xem cú pháp.

Không nhập dữ liệu cá nhân hoặc nội dung chưa được phê duyệt vào môi trường dùng chung ngoài quy trình được đơn vị cho phép.

## Sao lưu và khôi phục

### Xuất dữ liệu logic

```bash
node server/scripts/data-tool.js export all --out backups/pre-maintenance
```

Giữ thư mục sao lưu ngoài web root và giới hạn quyền đọc vì dữ liệu có thể chứa thông tin cá nhân.

### Sao lưu tệp SQLite

Ưu tiên dừng ứng dụng trước khi sao chép tệp database. Nếu sao chép khi server đang chạy, SQLite WAL có thể đang chứa giao dịch chưa được checkpoint; không chỉ sao chép riêng `.sqlite`. Dùng công cụ SQLite có hỗ trợ backup/`VACUUM INTO` hoặc quy trình backup được quản trị viên xác nhận.

### Khôi phục

1. Dừng tiến trình ứng dụng.
2. Giữ bản sao tệp hiện tại để có thể quay lui.
3. Khôi phục bản sao đã kiểm tra vào đường dẫn `DB_FILE`.
4. Chạy `npm run db:migrate`, khởi động lại ứng dụng và kiểm tra `/api/public/health`, đăng nhập, API và dữ liệu.
5. Ghi lại thời điểm và nguồn bản sao đã dùng.

Thực hiện diễn tập khôi phục định kỳ; bản sao chưa thử khôi phục không được xem là đã xác nhận.

## Dữ liệu cá nhân

`submissions` có thể chứa họ tên, email, số điện thoại và nội dung phản ánh. Giới hạn truy cập theo quyền, không đưa dữ liệu cá nhân vào tài liệu/log chia sẻ, và áp dụng chính sách lưu trữ/xóa dữ liệu của đơn vị vận hành. PUBLIC chỉ trả phản hồi hồ sơ khi được đánh dấu công khai.
