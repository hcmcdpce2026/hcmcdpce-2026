# Kiến trúc và luồng dữ liệu

## Mục đích

Cổng thông tin gồm PUBLIC, CMS và WORKSPACE trên frontend HTML/CSS/JavaScript thuần, dùng chung API Node.js và SQLite. Không có bước bundling/build frontend và `package.json` không khai báo dependency npm runtime bên ngoài.

## Sơ đồ runtime

```text
Trình duyệt
  ├─ PUBLIC: index.html, pages/public/
  ├─ CMS: pages/cms/
  └─ WORKSPACE: pages/workspace/
        │ HTTP/JSON, cookie hoặc Bearer; CSRF cho request ghi dùng cookie
        ▼
server/index.js
  ├─ routes/auth.js, public.js, cms.js, workspace.js, shared.js
  ├─ auth, permission, validation, mapping, upload
  └─ static file server
        │ prepared statements, foreign keys, WAL
        ▼
server/data/portal.sqlite
```

`server/index.js` đăng ký route tường minh, khởi tạo database và phục vụ frontend cùng origin. `server/db/schema.sql` là schema chuẩn; migration hỗ trợ database cũ. Quyền truy cập được kiểm tra ở backend, không dựa vào việc frontend ẩn nút.

## Thành phần chính

| Thành phần | Trách nhiệm |
|---|---|
| `js/api.js` | HTTP client, session/CSRF, lỗi API và chế độ snapshot |
| `js/main.js`, `js/public-pages.js` | PUBLIC: tải, lọc và dựng nội dung |
| `js/cms.js`, `js/system-categories.js` | CMS và danh mục |
| `js/workspace.js` | Nhiệm vụ và luồng Workspace |
| `server/routes/` | Handler theo phân hệ |
| `server/lib/auth.js`, `security.js` | Session, CSRF, password, rate limit và kiểm tra đầu vào |
| `server/lib/db.js`, `mapper.js` | SQLite và hình dạng dữ liệu API |
| `server/lib/upload.js` | Kiểm tra loại và kích thước tệp |
| `server/db/` | Schema, migration, seed và công cụ dữ liệu |

## Luồng dữ liệu và nguồn chuẩn

SQLite là nguồn chuẩn của dữ liệu vận hành. Mỗi API truy vấn/kiểm tra dữ liệu trước khi frontend kết xuất; snapshot tĩnh chỉ là bản sao PUBLIC chỉ đọc.

| Nghiệp vụ | Bảng chính | Luồng |
|---|---|---|
| Tin tức/tuyên truyền | `articles`, `categories`, `article_revisions`, `media` | CMS lưu bài; `category_id -> categories.group_key` xác định nhóm; PUBLIC chỉ nhận nội dung đã xuất bản |
| Pháp luật | `legal_documents`, `system_categories` | CMS quản lý văn bản và danh mục; API áp dụng điều kiện công khai |
| Sự kiện công khai | `public_events`, `system_categories` | CMS lưu mã trạng thái; API cấp danh sách trạng thái hoạt động và sự kiện công khai |
| Cơ quan/cơ sở hỗ trợ | `public_agencies`, `support_facilities`, `organizations`, `system_categories` | API kiểm tra liên kết và danh mục trước khi trả PUBLIC |
| Thống kê/KPI | `statistics_periods`, `statistics_items`, các bảng nội dung công khai | API chọn kỳ và `/api/public/summary` tính số liệu trực tiếp từ database |
| Phản ánh | `submissions`, `submission_events`, `tasks` | PUBLIC gửi; CMS phân loại/chuyển xử lý; Workspace thực hiện task |
| Nhiệm vụ và báo cáo | `tasks`, `task_items`, `task_comments`, `task_history`, `reports` | Workspace xử lý theo vai trò, đơn vị và trạng thái |
| Đề xuất nội dung | `proposals`, `articles` | Workspace gửi; CMS duyệt; bài đã xuất bản mới đến PUBLIC |

Chi tiết endpoint ở `API.md`; bảng/cột/khóa/constraint ở `DATABASE.md` và `DATA_DICTIONARY.md`.

## Xác thực và quyền

- Tài khoản/session được phân biệt CMS và Workspace; shared API dùng guard riêng.
- Cookie session là `HttpOnly`, `SameSite=Lax`; `Secure` khi bật `COOKIE_SECURE`.
- Request ghi dùng cookie phải có CSRF token; Bearer token không dựa trên cookie.
- Backend kiểm tra hệ thống, quyền, phạm vi dữ liệu (`own`, `unit`, `all`) và trạng thái nghiệp vụ.
- Mật khẩu băm bằng `scrypt`; SQL dùng prepared statements.

## Khởi động và seed

Server gọi `initialize({ seed: true })`; khi `users` trống, seed tạo dữ liệu hệ thống/tài khoản cần thiết. Kiểm thử database tạm rỗng xác nhận khởi động không tạo nội dung nghiệp vụ demo như bài viết, task, phản ánh hoặc báo cáo. Không xem `data_source='seed'` là bằng chứng đủ để xóa bản ghi.

## PUBLIC tĩnh và giới hạn triển khai

`npm run export:static-public` sinh `public-data/public.json` và media công khai được tham chiếu. GitHub Pages chỉ đọc snapshot: không có API, đăng nhập, CMS, Workspace hoặc thao tác ghi.

Snapshot public hiện có tại `public-data/public.json` và được GitHub Pages deploy qua artifact public-only. Backend/production vẫn cần cấu hình riêng.

SQLite/WAL, rate limit trong bộ nhớ và upload local phù hợp một instance. Mở rộng ngang cần thiết kế lại lưu session/rate limit, database và object storage. Chi tiết bảo mật/vận hành ở `SECURITY.md` và `DEPLOYMENT.md`.
