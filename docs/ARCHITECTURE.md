# Kiến trúc hệ thống

## Tổng quan

Ứng dụng là một web app nhiều phân hệ. Frontend HTML/CSS/JavaScript được phục vụ cùng origin với API bởi máy chủ Node.js; dữ liệu lưu trong một cơ sở dữ liệu SQLite. Không có bundler hoặc bước build.

```text
Trình duyệt
  ├─ PUBLIC: index.html + pages/public/*
  ├─ CMS: pages/cms/*
  └─ Workspace: pages/workspace/*
          │ fetch JSON, cookie phiên, CSRF
          ▼
Node.js HTTP server: server/index.js
  ├─ /api/auth/*
  ├─ /api/public/*
  ├─ /api/cms/*
  ├─ /api/workspace/*
  ├─ /api/shared/*
  └─ HTML/CSS/JS/ảnh tĩnh
          │
          ▼
SQLite: server/data/portal.sqlite
```

## Phân hệ và luồng dữ liệu

| Phân hệ | Trách nhiệm | Dữ liệu chính |
|---|---|---|
| PUBLIC | Cung cấp nội dung công khai, nhận yêu cầu, tra cứu mã | Bài đã xuất bản, danh mục công khai, hồ sơ tiếp nhận |
| CMS | Quản lý nội dung và quy trình xuất bản; xử lý tiếp nhận | Sáu nhóm nội dung (xem dưới), phiên bản, chuyên mục, tài nguyên, đề xuất |
| Workspace | Điều phối nhiệm vụ, báo cáo, lịch, tài liệu và tài khoản nghiệp vụ | Nhiệm vụ, báo cáo, đơn vị, người dùng, vai trò |
| Shared | Thông tin người dùng/đơn vị, thông báo, thiết lập và thống kê tổng hợp | Dữ liệu dùng chung giữa CMS và Workspace |

Hai luồng liên thông quan trọng:

```text
PUBLIC gửi yêu cầu
  → submissions
  → CMS phân loại/phản hồi
  → CMS tạo task Workspace (liên kết submission.task_id)
  → Workspace cập nhật kết quả
  → CMS quyết định phản hồi/công khai
  → PUBLIC tra cứu bằng mã tiếp nhận

Workspace tạo proposal
  → CMS xem xét
  → tạo/cập nhật article có origin=workspace
  → CMS xuất bản
  → PUBLIC chỉ đọc article đã xuất bản
```

Việc tạo yêu cầu phối hợp cũng có thể nối CMS và Workspace; lịch sử được lưu trong bảng nghiệp vụ và `activity_logs`.

## Sáu nhóm nội dung

CMS là một hệ thống thống nhất (cùng tài khoản, phân quyền, quy trình duyệt), nhưng mỗi nhóm
nội dung có mô hình dữ liệu và form nhập riêng:

| Nhóm | Nơi quản lý | Bảng | Trang công khai |
|---|---|---|---|
| Tin tức | `content-list.html` (lọc `group=news`) | `articles` + `categories` | `news.html`, trang chủ |
| Tuyên truyền - Giáo dục | `content-list.html` (lọc `group=education`) | `articles` + `categories` | `education.html`, trang chủ |
| Sự kiện | `public-catalog.html` → tab Sự kiện | `public_events` | `events.html` |
| Pháp luật | `public-catalog.html` → tab Pháp luật | `legal_documents` | `laws.html` |
| Cơ quan - Đơn vị | `public-catalog.html` → tab Cơ quan | `public_agencies` | `agencies.html` |
| Cơ sở y tế - Tư vấn | `public-catalog.html` → tab Cơ sở y tế | `support_facilities` | `support.html` |

Nhóm của một bài viết được xác định bằng `categories.group_key` của chuyên mục được gán
(`articles.category_id`) — không dò từ khóa trong tiêu đề hay nội dung.

Mỗi trang công khai chỉ đọc đúng nguồn dữ liệu của mình qua `/api/public/*`; bộ lọc trên các
trang danh mục được dựng từ chính dữ liệu CMS (danh mục chuyên mục, loại hình, cấp quản lý,
lĩnh vực pháp luật), không khai báo tĩnh trong HTML.

### Hệ thống đang chạy

- `server/db/schema.sql` khai báo đầy đủ trường cho cả sáu nhóm; `server/lib/db.js`
  (`ensureContentTypeColumns`) và `server/db/migrate.js` bổ sung cột cho database cũ.
- `js/public-pages.js` kết xuất dữ liệu công khai; `js/main.js` chỉ giữ tương tác giao diện.
- `server/db/content-types.js` chỉ dọn dữ liệu demo cũ đã được đánh dấu; không tạo dữ liệu.

## Thành phần mã nguồn

### Frontend

- `index.html`, `pages/public/`, `pages/cms/`, `pages/workspace/`: 38 trang HTML gồm trang chủ.
- `css/style.css`: token thiết kế, kiểu dùng chung.
- `css/main.css`, `css/responsive.css`: giao diện công khai và responsive.
- `css/cms.css`, `css/workspace.css`: bố cục riêng từng hệ thống.
- `css/login.css`: kiểu dùng chung cho hai trang đăng nhập.
- `js/api.js`: giao tiếp API, cookie/CSRF và lỗi mạng.
- `js/main.js`, `js/public-pages.js`: tương tác PUBLIC.
- `js/cms.js`, `js/workspace.js`: điều khiển các giao diện nghiệp vụ.

### Backend

- `server/index.js`: nạp `.env`, khởi tạo database, đăng ký route, áp dụng header bảo mật và phục vụ tệp tĩnh.
- `server/routes/`: handler cho auth, PUBLIC, CMS, Workspace và shared.
- `server/lib/http.js`: JSON, cookie, đọc body và phục vụ file.
- `server/lib/auth.js`: phiên, đăng nhập, CSRF, quyền và nhật ký.
- `server/lib/security.js`: băm mật khẩu, token, giới hạn tần suất, kiểm tra đầu vào.
- `server/lib/db.js`: kết nối SQLite, bật WAL/foreign keys và khởi tạo schema.
- `server/lib/mapper.js`: chuyển đổi bản ghi database sang đối tượng API.
- `server/db/schema.sql`, `migrate.js`, `seed.js`: schema, migration và dữ liệu hệ thống ban đầu.

## Xử lý request

1. Server chuẩn hóa URL và thêm header bảo mật.
2. Với `/api/*`, tìm route theo method/path, đọc JSON body có giới hạn và gọi handler.
3. Với CMS/Workspace, server chặn phiên thuộc sai hệ thống; handler tiếp tục kiểm tra phiên, CSRF và quyền cần thiết.
4. Với URL khác, server chặn đường dẫn nội bộ, kiểm tra đường dẫn tĩnh và trả file với MIME/cache phù hợp.
5. Lỗi API được chuyển thành JSON; lỗi 5xx không trả stack trace cho client.

Route được đăng ký tường minh trong `server/index.js`. Tệp trong `server/`, `.env`, `.git` và `node_modules` không được phục vụ như tài nguyên tĩnh.

## Xác thực và phân quyền

- Mật khẩu lưu dưới dạng hash `scrypt`; không lưu mật khẩu rõ trong database.
- Token phiên ngẫu nhiên được hash SHA-256 trong bảng `sessions`; cookie chính là `HttpOnly`, `SameSite=Lax`, bật `Secure` khi `COOKIE_SECURE=true`.
- Token phiên có thể thu hồi khi đăng xuất, đổi mật khẩu hoặc tài khoản bị vô hiệu hóa.
- Quyền gắn với vai trò trong `role_permissions`, phân hệ trong tài khoản và phạm vi dữ liệu trong vai trò.
- Giao diện có thể ẩn nút theo quyền, nhưng máy chủ mới là nơi quyết định cho phép hay từ chối request.
- Với cookie, request ghi cần `X-CSRF-Token`; request dùng Bearer token không dựa vào cookie.

Chi tiết và các giới hạn bảo mật được ghi trong [`SECURITY.md`](SECURITY.md).

## Lưu trữ và khởi tạo dữ liệu

`server/lib/db.js` mở `DatabaseSync`, bật `journal_mode=WAL`, foreign keys và `busy_timeout`, rồi áp dụng `schema.sql` nếu cần. Khi server chạy, hệ thống bảo đảm dữ liệu khởi tạo tối thiểu nếu chưa có người dùng.

Để lấy thông tin tài khoản khởi tạo, chạy CLI `npm run db:seed` trước lần chạy server đầu tiên. Lệnh seed CLI tạo tệp bàn giao `server/data/credentials.local.txt` khi có tài khoản mới; cơ chế tự seed của server không xuất tệp bàn giao này.

Seed mặc định chỉ tạo tài khoản và cấu hình hệ thống. Không còn lệnh nạp dữ liệu demo vào database ứng dụng. Bộ kiểm thử sáu nhóm dùng fixture trong database tạm và tự xóa database đó khi hoàn tất. `npm run demo:purge -- --yes` chỉ dành để dọn dữ liệu demo cũ còn sót lại.

## Nguyên tắc thiết kế và giới hạn

- Frontend tĩnh giúp triển khai đơn giản; browser gọi API cùng origin.
- SQLite và bộ giới hạn tần suất trong bộ nhớ phù hợp một instance. Không chạy nhiều server ghi vào cùng database như một hệ thống phân tán.
- Dữ liệu hiển thị trên client có thể được cache trong bộ nhớ của module; client cần nạp lại dữ liệu sau thao tác ghi.
- Font/biểu tượng bên ngoài lấy từ CDN.
- Không có 2FA; xem các hạn chế khác trong `SECURITY.md` trước production.

## Thay đổi kiến trúc

Khi thêm chức năng:

1. Khai báo route trong `server/index.js` và handler trong nhóm `server/routes/` thích hợp.
2. Kiểm tra xác thực, phân hệ, quyền, CSRF và phạm vi bản ghi ở máy chủ.
3. Thêm cột/bảng bằng schema/migration; cập nhật mapper nếu đối tượng API thay đổi.
4. Cập nhật client API/cache và trạng thái loading, rỗng, lỗi.
5. Bổ sung kiểm thử API hoặc luồng liên thông phù hợp; cập nhật `API.md`, `DATABASE.md` hoặc `USER-GUIDE.md`.

Không đổi tên hoặc thay đổi hình dạng API mà không cập nhật tất cả client và tài liệu liên quan.
