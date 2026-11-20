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
| `categories` | Chuyên mục; `group_key` quyết định nhóm nội dung (`news`, `education`, `law`, `event`, `agency`, `support`, `statistics`) |
| `articles`, `article_revisions` | Bài viết và lịch sử phiên bản — dùng cho nhóm Tin tức và Tuyên truyền - Giáo dục |
| `media`, `banners` | Tài nguyên và banner |
| `legal_documents` | Văn bản pháp luật (số hiệu, lĩnh vực, ngày ban hành/hiệu lực/hết hiệu lực, tình trạng hiệu lực) |
| `public_agencies`, `public_events` | Hồ sơ cơ quan, đơn vị và sự kiện công khai |
| `statistics_periods`, `statistics_items` | Kỳ và chỉ số thống kê |
| `support_facilities` | Cơ sở y tế, cơ sở cai nghiện và điểm tư vấn |

### Sáu nhóm nội dung và trường phân biệt

Mỗi nhóm có mô hình dữ liệu riêng, không dùng chung cấu trúc “bài viết”:

| Nhóm | Bảng | Trường tiêu biểu |
|---|---|---|
| Tin tức | `articles` + `categories` (`group_key='news'`) | `title`, `slug`, `thumbnail`, `excerpt`, `body`, `author_name`, `published_at`, `category_id`, `tags`, `status` |
| Tuyên truyền - Giáo dục | `articles` + `categories` (`group_key='education'`) | như trên, cộng `source` (chủ đề/đối tượng) và `tags` |
| Sự kiện | `public_events` | `title`, `slug`, `event_type`, `start_at`, `end_at`, `location`, `organizer`, `co_organizer`, `status`, `publish_status` |
| Pháp luật | `legal_documents` | `code`, `doc_number`, `doc_type`, `legal_field`, `issued_at`, `effective_at`, `expiry_at`, `effect_status`, `issuer`, `file_url`, `is_public` |
| Cơ quan - Đơn vị | `public_agencies` | `name`, `slug`, `role_type`, `management_level`, `org_id`, `functions_text`, `structure`, `head_name`, `status` |
| Cơ sở y tế - Tư vấn | `support_facilities` | `code`, `type`, `managing_org`, `address`, `ward`, `latitude`, `longitude`, `services`, `audience`, `verified_at`, `status`, `publish_status` |

Quan hệ giữa nhóm: `support_facilities.org_id` → `organizations.id` (đơn vị quản lý trực tiếp),
`public_agencies.org_id` → `organizations.id`. Một cơ quan có thể quản lý nhiều cơ sở, nhưng
cơ quan và địa điểm cung cấp dịch vụ là hai bản ghi khác nhau.

Trạng thái công khai: `legal_documents.is_public`, `public_events.publish_status`,
`support_facilities.publish_status`. Bản ghi `inactive` hoặc chưa `published` không được
API công khai trả về.

### Tiếp nhận và Workspace

| Bảng | Mục đích |
|---|---|
| `submissions`, `submission_events` | Yêu cầu từ PUBLIC (gồm mã nhóm liên hệ `topic_code`) và dòng thời gian xử lý |
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
- `db:seed` thêm quyền, vai trò, tài khoản và cấu hình hệ thống còn thiếu. Không tự tạo tổ chức, danh mục nghiệp vụ hoặc nội dung mẫu; các danh mục và đơn vị được quản lý trong CMS/Workspace.
- `system_categories` lưu các lựa chọn nghiệp vụ do CMS quản lý, gồm nhóm liên hệ `contact_topic` và lĩnh vực pháp luật `legal_field`. Migration khởi tạo các lựa chọn đang có trên biểu mẫu; các nhóm nghiệp vụ khác chỉ được đưa vào từ giá trị đã có bản ghi sử dụng. Giá trị địa bàn cũ của cơ sở hỗ trợ được gộp vào địa chỉ trước khi bỏ cột `district`.
- Chạy `db:seed` trước lần khởi động server đầu tiên để script CLI có thể tạo `server/data/credentials.local.txt` khi tạo tài khoản mới.
- Server cũng bảo đảm schema và dữ liệu hệ thống tối thiểu khi khởi động. Tuy nhiên, cơ chế tự seed của server không ghi tệp bàn giao mật khẩu.

### Kiểm thử sáu nhóm nội dung

Kiểm thử tự động cho sáu nhóm chạy với fixture trên database tạm; runner xóa database
tạm khi hoàn tất và không ghi dữ liệu vào database đang vận hành:

```bash
npm run test:content-types
```

`npm run demo:purge` chỉ báo cáo dữ liệu demo cũ đã được đánh dấu `data_source = 'demo'`;
thêm `-- --yes` để xóa các bản ghi legacy đó. Không còn lệnh nạp dữ liệu demo vào database ứng dụng.

### Trạng thái mặc định và reset

Nội dung công khai không có dữ liệu mẫu mặc định; do đó trạng thái rỗng trên PUBLIC là bình thường cho đến khi dữ liệu được nhập và xuất bản.

`npm run db:reset` xoá database rồi chỉ tạo lại quyền, vai trò, tài khoản và cấu hình hệ thống; lệnh này không nạp dữ liệu demo. **Chỉ chạy reset trên database thử nghiệm có thể xoá, không chạy trên dữ liệu thật.**

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
