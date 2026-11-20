# Kiến trúc hệ thống

## 1. Mục tiêu

Tài liệu mô tả cách frontend, API, SQLite và các luồng nghiệp vụ liên thông trong repository. Kiến trúc ưu tiên triển khai đơn giản: không bundler, không framework backend, không container bắt buộc và không dependency npm bên ngoài.

## 2. Sơ đồ tổng thể

```text
Trình duyệt
├── PUBLIC       index.html, pages/public/*
├── CMS          pages/cms/*
└── WORKSPACE    pages/workspace/*
         │
         ▼
server/index.js
├── Route matching
├── Cookie/Bearer session
├── CSRF
├── Permission guard
├── Static file server
└── API route modules
         │
         ▼
SQLite (WAL)
server/data/portal.sqlite
```

## 3. Thành phần chính

| Thành phần | Trách nhiệm |
|---|---|
| `server/index.js` | Nạp `.env`, mở database, đăng ký route, áp dụng security headers và phục vụ tệp |
| `server/routes/` | Handler AUTH, PUBLIC, CMS, WORKSPACE, shared |
| `server/lib/http.js` | JSON response, đọc body, cookie, gửi tệp |
| `server/lib/auth.js` | Phiên, đăng nhập, khóa tài khoản, CSRF, phân quyền |
| `server/lib/security.js` | Băm mật khẩu, giới hạn tần suất, làm sạch/kiểm tra đầu vào |
| `server/lib/db.js` | Mở SQLite, bật WAL/foreign key/busy timeout |
| `server/lib/mapper.js` | Chuyển database row sang hình dạng API |
| `server/lib/upload.js` | Kiểm tra loại/kích thước tệp upload |
| `server/db/schema.sql` | Schema duy nhất, bao gồm 37 bảng nghiệp vụ và hệ thống |
| `server/db/migrate.js` | Bổ sung tương thích cho database cũ |
| `server/db/seed.js` | Tạo quyền, vai trò, tài khoản và dữ liệu cấu hình |

## 4. Frontend

- `js/api.js`: wrapper fetch, cookie/CSRF, Bearer token và xử lý lỗi.
- `js/main.js`: tương tác PUBLIC chung.
- `js/public-pages.js`: tải JSON PUBLIC và kết xuất danh mục/chi tiết.
- `js/cms.js`: thao tác CMS.
- `js/workspace.js`: thao tác Workspace.
- `css/main.css`, `css/responsive.css`: PUBLIC và responsive.
- `css/cms.css`, `css/workspace.css`, `css/login.css`: giao diện nghiệp vụ.

Trang HTML không build ra bundle. Tệp được trình duyệt tải trực tiếp, gọi API cùng origin hoặc đọc snapshot tĩnh tùy môi trường.

## 5. Route và xử lý request

1. `server/index.js` chuẩn hóa method/path.
2. Route `/api/*` được khớp từ danh sách đăng ký tường minh.
3. Route ghi dữ liệu yêu cầu session; cookie yêu cầu CSRF.
4. Handler kiểm tra phân hệ, quyền và phạm vi dữ liệu.
5. SQLite xử lý bằng prepared statements.
6. `http.js` trả JSON có `success`, `data` hoặc `error`.
7. Route tĩnh giải mã và chuẩn hóa path, chặn thư mục/tệp nhạy cảm.

Route bắt lỗi. Tệp server, `.env`, Git metadata, database, credential và thư mục công cụ không được phục vụ công khai.

## 6. Xác thực

Phiên đăng nhập lưu:

- hash SHA-256 của session token trong SQLite;
- CSRF token riêng;
- user-agent và IP;
- thời gian tạo/cập nhật/hết hạn;
- trạng thái thu hồi.

Cookie `hcm_portal_session` dùng `HttpOnly`, `SameSite=Lax`, và `Secure` khi cấu hình. Bearer token có thể được API client dùng cho môi trường phù hợp; Bearer không phụ thuộc CSRF cookie.

Mật khẩu được băm bằng `scrypt`, có salt riêng. Sai mật khẩu và tài khoản khóa tạm được ghi trong `login_attempts`/bản ghi người dùng.

## 7. Phân quyền

RBAC gồm:

- `users.role_id`;
- `roles.system_key`;
- `roles.data_scope`: `own`, `unit` hoặc `all`;
- `role_permissions`;
- permission code trong từng handler.

Backend luôn kiểm tra lại:

- tài khoản có hệ thống đúng không;
- session còn hiệu lực không;
- permission hiện có không;
- người dùng có thuộc đơn vị/phạm vi bản ghi không;
- trạng thái nghiệp vụ cho phép hành động không.

## 8. Sáu nhóm nội dung PUBLIC

| Nhóm | Cấu trúc dữ liệu | Trang |
|---|---|---|
| Tin tức | `articles` thuộc `categories.group_key=news` | `news.html`, trang chủ |
| Tuyên truyền - Giáo dục | `articles` thuộc `categories.group_key=education` | `education.html`, trang chủ |
| Sự kiện | `public_events` | `events.html` |
| Pháp luật | `legal_documents` | `laws.html` |
| Cơ quan - đơn vị | `public_agencies` | `agencies.html` |
| Cơ sở hỗ trợ | `support_facilities` | `support.html` |

Bài thuộc nhóm hay không được quyết định bằng `category_id -> categories.group_key`, không bằng từ khóa trong nội dung.

## 9. Luồng liên thông

### Phản ánh PUBLIC

```text
submissions
  -> submission_events
  -> CMS tiếp nhận
  -> tasks
  -> task_items/task_comments/task_history
  -> kết quả và phản hồi
```

`submissions.task_id` liên kết sang task được CMS phân công. Tiếp nhận công khai phải xóa dữ liệu nhạy cảm khỏi trả lời công khai.

### Đề xuất nội dung

```text
Workspace proposals
  -> CMS review
  -> articles origin=workspace
  -> article revisions
  -> published article
  -> PUBLIC
```

## 10. Đóng gói static PUBLIC

Script `server/scripts/export-static-public.js` đọc database và tạo `public-data/public.json` cộng media được tham chiếu. Dữ liệu chỉ gồm nội dung công khai đã xuất bản/được công bố.

PUBLIC trên GitHub Pages sẽ đọc snapshot thay vì gọi Node.js API. Các nút gửi form hoặc đăng nhập không hoạt động trên host tĩnh.

## 11. Vòng đời dữ liệu

Database khởi tạo hai giai đoạn:

1. `db:migrate` hoặc server khởi động áp dụng schema/migration.
2. `db:seed` bổ sung hệ thống ban đầu hoặc server bảo đảm seed tối thiểu.

Seed không còn là nguồn dữ liệu demo bài viết/cơ quan/sự kiện. Nội dung vận hành phải nhập qua CMS/Workspace.

## 12. Ranh giới triển khai

Kiến trúc hiện phù hợp một instance:

- SQLite dùng chung trên một ổ đĩa;
- rate limit lưu trong bộ nhớ;
- phiên lưu trong SQLite;
- upload lưu trên local disk;
- static export được tạo thủ công.

Mở rộng ngang cần thay thế hoặc bổ sung đồng bộ session/rate limit, object storage và cơ sở dữ liệu phù hợp.
