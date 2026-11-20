# Cơ sở dữ liệu

## 1. Tổng quan

Ứng dụng dùng SQLite qua module cốt lõi `node:sqlite`. Database mặc định:

```text
server/data/portal.sqlite
```

Đường dẫn có thể thay bằng `DB_FILE`. Khi mở database, `server/lib/db.js` thiết lập:

- `journal_mode=WAL`;
- `foreign_keys=ON`;
- `busy_timeout`;
- prepared statements;
- timestamp ISO 8601.

## 2. Schema và migration

Schema tách thành các nhóm trong `server/db/schema.sql`.

Các lệnh:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
```

`db:migrate` áp dụng schema và migration tương thích. `db:seed` bổ sung quyền, vai trò, tài khoản seed, cấu hình và danh mục hệ thống còn thiếu.

Không chạy `db:reset` ngoài database thử nghiệm. Lệnh reset xóa database vận hành.

## 3. Nhóm bảng

### Tổ chức và tài khoản

| Bảng | Vai trò |
|---|---|
| `organizations` | Đơn vị/cơ quan và quan hệ cha-con |
| `roles` | Vai trò CMS hoặc Workspace |
| `permissions` | Danh mục quyền |
| `role_permissions` | Ánh xạ vai trò-quyền |
| `users` | Tài khoản, hệ thống, vai trò, đơn vị và trạng thái |
| `sessions` | Phiên và token hash |
| `login_attempts` | Nhật ký thử đăng nhập |
| `settings` | Cấu hình key-value |

### Nội dung công khai

| Bảng | Vai trò |
|---|---|
| `categories` | Chuyên mục bài viết và `group_key` |
| `system_categories` | Loại văn bản, lĩnh vực, cơ quan, mức quản lý, cơ sở, chủ đề liên hệ |
| `articles` | Bài tin tức/tuyên truyền |
| `article_revisions` | Phiên bản nội dung bài |
| `media` | Thư viện media |
| `banners` | Banner |
| `legal_documents` | Văn bản pháp luật |
| `public_agencies` | Cơ quan/đơn vị công khai |
| `public_events` | Sự kiện công khai |
| `statistics_periods` | Kỳ thống kê |
| `statistics_items` | Chỉ số trong kỳ |
| `support_facilities` | Cơ sở hỗ trợ/tư vấn/cai nghiện |

### Nghiệp vụ

| Bảng | Vai trò |
|---|---|
| `submissions`, `submission_events` | Tiếp nhận và xử lý phản ánh |
| `tasks`, `task_items`, `task_comments`, `task_history`, `task_documents` | Nhiệm vụ |
| `documents`, `doc_versions` | Tài liệu nội bộ |
| `events` | Lịch công tác |
| `reports`, `report_documents` | Báo cáo |
| `proposals` | Đề xuất nội dung |
| `collaboration_requests` | Yêu cầu phối hợp |
| `notifications` | Thông báo |
| `activity_logs` | Nhật ký thao tác |

## 4. Trường dữ liệu của sáu nhóm

| Nhóm | Bảng/trường chính |
|---|---|
| Tin tức | `articles`: title, slug, excerpt, body, thumbnail, author, published_at, tags |
| Tuyên truyền - giáo dục | Cùng `articles`; ngoài ra `categories.group_key=tuyen-truyen-giao-duc` và trường `source` |
| Sự kiện | `public_events`: title, slug, category, start_at, end_at, location, organizer, status, publish_status |
| Pháp luật | `legal_documents`: doc_number, doc_type, legal_field, issuer, issued_at, effective_at, expiry_at, effect_status, file_url, is_public |
| Cơ quan | `public_agencies`: name, role_type, management_level, address, phone, email, functions, structure, head_name |
| Cơ sở hỗ trợ | `support_facilities`: code, type, address, ward, latitude, longitude, services, audience, managing_org, publish_status |

Nhóm bài viết được suy ra từ `articles.category_id -> categories.group_key`, không suy ra từ tiêu đề.

## 5. Quan hệ chính

```text
organizations
  ├── users
  ├── tasks
  ├── documents
  ├── reports
  ├── public_agencies.org_id
  └── support_facilities.org_id

categories -> articles -> article_revisions
submissions -> submission_events
submissions.task_id -> tasks
tasks -> task_items/task_comments/task_history/task_documents
reports -> report_documents
proposals.article_id -> articles
users -> sessions/login_attempts/activity_logs
statistics_periods -> statistics_items
```

## 6. Trạng thái và nguồn dữ liệu

Nhiều bảng có:

- `data_source`: ví dụ `seed`, `operational`, `test`;
- `is_seed_data`;
- `environment`;
- `created_at`, `updated_at`, `created_by`.

`data_source` và `is_seed_data` hỗ trợ phân biệt dữ liệu seed, thử nghiệm và vận hành. Không dùng chúng thay cho quy tắc xác thực/công khai.

## 7. Khởi tạo seed

Seed tạo tài khoản theo biến:

```ini
SEED_PASSWORD_CMS_ADMIN=
SEED_PASSWORD_WS_ADMIN=
```

Nếu để trống, seed sinh mật khẩu và ghi vào `server/data/credentials.local.txt` khi chạy seed CLI. Tệp credential bị `.gitignore`.

Server khởi động có cơ chế bảo đảm schema và dữ liệu hệ thống tối thiểu, nhưng không tạo tệp credential bàn giao.

## 8. Công cụ dữ liệu

Xem cú pháp:

```powershell
npm.cmd run data
```

Ví dụ:

```powershell
node server/scripts/data-tool.js stats
node server/scripts/data-tool.js export all --out backups/pre-maintenance
node server/scripts/data-tool.js export articles --out backups/articles
node server/scripts/data-tool.js import articles data/articles.csv --dry-run
node server/scripts/data-tool.js import articles data/articles.csv
```

Quy tắc:

- export tạo CSV/JSON theo từng bảng;
- import chỉ nhận bảng whitelist;
- dòng import trùng ID được cập nhật, dòng thiếu/cấu trúc sai được báo;
- dùng `--dry-run` trước khi import thật;
- `purge-seed --confirm` chỉ dùng khi đã xác nhận dữ liệu hiện tại.

## 9. Sao lưu

Sao lưu logic:

```powershell
node server/scripts/data-tool.js export all --out backups/pre-maintenance
```

Sao lưu SQLite nhất quán:

1. Dừng server hoặc dùng công cụ backup SQLite hỗ trợ WAL;
2. giữ bản database hiện tại để rollback;
3. lưu SQLite và artifact backup ngoài web root;
4. kiểm tra quyền đọc/ghi;
5. diễn tập khôi phục định kỳ.

Không chỉ sao chép `portal.sqlite` khi WAL chứa giao dịch chưa checkpoint.

## 10. Khôi phục

1. Dừng tiến trình Node.
2. Tạo bản sao của database hiện tại.
3. Khôi phục bản backup vào đường dẫn `DB_FILE`.
4. Chạy migration.
5. Khởi động server.
6. Kiểm tra health, đăng nhập, PUBLIC, CMS, Workspace và dữ liệu.

Bản backup chưa từng thử khôi phục không được coi là có sẵn để phục hồi.

## 11. Dữ liệu cá nhân

`submissions` có thể chứa họ tên, email, điện thoại và nội dung phản ánh. Chỉ cấp quyền cho cán bộ xử lý, không đưa dữ liệu này vào log công khai, screenshot hỗ trợ hoặc snapshot GitHub Pages.
