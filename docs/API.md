# Tài liệu API

Base URL mặc định ở local: `http://localhost:8099`; có thể đổi bằng `PORT` và `HOST`. Production phải dùng HTTPS sau reverse proxy tin cậy. Danh sách route thực tế được đăng ký tường minh trong `server/index.js`.

## 1. Quy ước chung

API trả JSON UTF-8.

Phản hồi thành công:

```json
{
  "success": true,
  "data": {}
}
```

Danh sách có thể kèm phân trang:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1
  }
}
```

Phản hồi lỗi:

```json
{
  "success": false,
  "error": "Thông báo",
  "field": "optional"
}
```

| Mã | Ý nghĩa |
|---|---|
| 200 | Thành công |
| 201 | Tạo mới |
| 204 | Thành công không có body |
| 400 | Tham số/JSON không hợp lệ |
| 401 | Chưa đăng nhập hoặc phiên hết hạn |
| 403 | Thiếu quyền, sai phân hệ hoặc CSRF |
| 404 | Route hoặc bản ghi không tồn tại |
| 409 | Xung đột/trùng dữ liệu |
| 413 | Request body hoặc tệp vượt giới hạn |
| 429 | Giới hạn tần suất |
| 500 | Lỗi máy chủ |

## 2. Xác thực và phiên

Cookie mặc định: `hcm_portal_session`.

Cookie dùng:

```text
HttpOnly
SameSite=Lax
Secure khi COOKIE_SECURE=true
```

Request ghi dữ liệu bằng cookie phải gửi:

```text
X-CSRF-Token: <csrfToken>
```

Request Bearer:

```text
Authorization: Bearer <token>
```

Bearer không dựa cookie nên không yêu cầu CSRF token. Tài khoản CMS không được gọi API Workspace, ngược lại.

## 3. Auth

| Method | Endpoint | Yêu cầu |
|---|---|---|
| POST | `/api/auth/login` | `username`, `password`, `system=cms|workspace` |
| POST | `/api/auth/logout` | Phiên hiện tại |
| GET | `/api/auth/me` | Phiên hiện tại |
| POST | `/api/auth/change-password` | `currentPassword`, `newPassword` |
| GET | `/api/auth/permissions` | Phiên hiện tại |

Đăng nhập thành công trả user, session expiration, CSRF token và Bearer token. Đổi mật khẩu cần mật khẩu hiện tại và mật khẩu mới đạt chính sách:

- ít nhất 10 ký tự;
- có chữ hoa;
- có chữ thường;
- có số;
- có ký tự đặc biệt;
- khác mật khẩu hiện tại.

Sau đổi mật khẩu, session hiện tại và các session khác có thể bị thu hồi.

Ví dụ:

```powershell
$body = @{
  username = "cms-admin"
  # Nhập mật khẩu tạm thời; không lưu nội dung này thành file/script.
  password = Read-Host "Mat khau CMS"
  system = "cms"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8099/api/auth/login" `
  -Method POST -ContentType "application/json" -Body $body
```

Không ghi mật khẩu, Bearer token, cookie phiên hoặc CSRF token vào Git, log hay ticket hỗ trợ. Ví dụ này gửi mật khẩu qua request body local; chỉ dùng với môi trường tin cậy và HTTPS ở môi trường triển khai.

## 4. PUBLIC

Các endpoint đọc không cần đăng nhập.

| Method | Endpoint | Query/chức năng |
|---|---|---|
| GET | `/api/public/health` | Trạng thái server/database |
| GET | `/api/public/articles` | `page`, `limit`, `categoryId/category`, `search/q`, `group`, `featured` |
| GET | `/api/public/articles/:id` | Chi tiết theo ID hoặc slug |
| GET | `/api/public/categories` | Chuyên mục đang hoạt động |
| GET | `/api/public/system-categories` | Danh mục hệ thống theo `type` (chỉ bản ghi `active`) |
| GET | `/api/public/system-category-types` | Danh sách loại danh mục `{ type, label }` do máy chủ khai báo |
| GET | `/api/public/event-statuses` | Bộ lọc trạng thái sự kiện `{ code, name, role }` do CMS quản lý |
| GET | `/api/public/summary` | Số liệu đếm dữ liệu đang công khai: `laws`, `articles`, `agencies`, `educationTopics` (chuyên mục tuyên truyền có bài đã xuất bản) |
| GET | `/api/public/legal-documents` | `id`, `type`, `field`, `issuer`, `year`, `effectStatus`, `search` |
| GET | `/api/public/events` | `id`, `type`, `status`, `search` |
| GET | `/api/public/agencies` | `id`, taxonomy loại hình/cấp quản lý |
| GET | `/api/public/statistics` | Kỳ và chỉ số |
| GET | `/api/public/support-facilities` | `id`, `type`, `service`, `audience`, `search` |
| GET | `/api/public/banners` | Banner đang hoạt động |
| GET | `/api/public/notifications` | Thông báo công khai |
| POST | `/api/public/submissions` | Gửi phản ánh/yêu cầu |
| GET | `/api/public/submissions/lookup` | `code`, `contact` |

### Gửi submission

Trường được hỗ trợ:

```json
{
  "formType": "contact",
  "subject": "Tiêu đề",
  "name": "Người gửi",
  "email": "nguoi@example.com",
  "phone": "0900000000",
  "content": "Nội dung phản ánh ít nhất 10 ký tự.",
  "isAnonymous": false,
  "consent": true
}
```

Quy tắc:

- `formType` là một trong `contact/report/support/feedback`;
- nội dung tối thiểu 10 ký tự;
- nếu không ẩn danh cần họ tên;
- cần email hoặc điện thoại;
- dữ liệu cá nhân/consent phải hợp lệ;
- gửi trùng trong ngày có thể trả mã tiếp nhận cũ;
- tra cứu cần mã và thông tin liên hệ nếu hồ sơ không ẩn danh;
- phản hồi chỉ công khai khi được đánh dấu cho phép.

## 5. CMS

Tất cả route yêu cầu phiên CMS.

| Nhóm | Endpoint |
|---|---|
| Tổng quan | `GET /api/cms/stats` |
| Bài viết | `GET/POST /api/cms/articles`, `GET/PUT/DELETE /api/cms/articles/:id` |
| Quy trình bài | `POST /api/cms/articles/:id/:action` |
| Chuyên mục | `GET/POST /api/cms/categories`, `PUT/DELETE /api/cms/categories/:id`, `POST /api/cms/categories/:id/reorder` |
| Danh mục hệ thống | `GET/POST /api/cms/system-categories`, `PUT/DELETE/PATCH /api/cms/system-categories/:id`, `GET /api/cms/system-category-types` |
| Media | `GET/POST /api/cms/media`, `DELETE /api/cms/media/:id` |
| Danh mục PUBLIC | `GET/POST/PUT/DELETE /api/cms/catalog/:kind...` |
| Quy trình | `GET /api/cms/workflow` |
| Submission | `GET/PUT /api/cms/submissions/:id`, `POST .../:id/assign` |
| Đề xuất | `GET /api/cms/proposals`, `POST /api/cms/proposals/:id/review` |
| Phối hợp | `POST /api/cms/collaborations` |
| Nhật ký | `GET /api/cms/logs` |

Hành động bài:

```text
submit | approve | reject | revise | publish | unpublish | archive
```

Giá trị `kind` catalog:

```text
legal-documents
agencies
events
statistics
support-facilities
```

## 6. WORKSPACE

Tất cả route yêu cầu phiên Workspace.

| Nhóm | Endpoint chính |
|---|---|
| Tổng quan | `GET /api/workspace/stats` |
| Nhiệm vụ | `GET/POST /api/workspace/tasks`, `GET/PUT /api/workspace/tasks/:id`, `POST /api/workspace/tasks/:id/:action` |
| Mục/bình luận nhiệm vụ | `/items`, `/comments` |
| Tổ chức | `GET/POST/PUT/DELETE /api/workspace/organizations...` |
| Người dùng | `GET/POST/PUT /api/workspace/users...`, `POST /.../:id/reset-password` |
| Vai trò/quyền | `/api/workspace/roles`, `/api/workspace/permissions` |
| Tài liệu | `GET/POST/PUT/DELETE /api/workspace/documents...` |
| Lịch | `GET/POST/PUT/DELETE /api/workspace/events...` |
| Báo cáo | `GET/POST/PUT /api/workspace/reports...`, `POST /.../:id/:action` |
| Đề xuất | `GET/POST /api/workspace/proposals` |
| Phối hợp | `GET/PUT /api/workspace/collaborations...` |
| Thông báo | `GET /api/workspace/notifications`, `POST /.../:id/read` |
| Nhật ký | `GET /api/workspace/logs` |

Hành động task:

```text
progress | submit | complete | revision | pause | resume | cancel
```

Hành động báo cáo:

```text
send | approve | revision | reject | publish
```

## 7. Shared

Yêu cầu phiên hợp lệ của CMS hoặc Workspace.

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/shared/users` | Danh bạ người dùng |
| GET | `/api/shared/organizations` | Danh sách đơn vị |
| GET | `/api/shared/system-categories` | Danh mục nghiệp vụ theo `type` (mọi loại đã đăng ký, chỉ `active`) |
| GET | `/api/shared/system-category-types` | Danh sách loại danh mục `{ type, label }` |
| GET | `/api/shared/notifications` | Thông báo và unread count |
| POST | `/api/shared/notifications/read` | Đánh dấu đã đọc |
| GET | `/api/shared/settings` | Cấu hình |
| GET | `/api/shared/summary` | Tóm tắt liên phân hệ |

## 8. Upload và media

Upload đi qua `server/lib/upload.js`. Chính sách mặc định:

- tối đa 200 MB/tệp (đổi bằng biến `MAX_UPLOAD_MB`; `0` = không giới hạn, trần 1024 MB);
- cho phép ảnh JPG/JPEG/PNG/WEBP/GIF/AVIF/BMP/ICO;
- cho phép tài liệu PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/CSV/TXT/ZIP;
- cho phép media MP4/WEBM/M4V/OGV/MP3/WAV/OGG;
- từ chối HTML, SVG và định dạng thực thi.

Tệp được phục vụ `nosniff`; file không media có thể được ép tải xuống. Không tin tưởng phần mở rộng; server kiểm tra MIME/dấu hiệu tệp theo chính sách hiện có.

## 9. Ví dụ curl

Health:

```bash
curl http://localhost:8099/api/public/health
```

Đăng nhập lưu cookie:

```bash
curl -c cookies.txt -X POST http://localhost:8099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<tai-khoan>","password":"<mat-khau>","system":"cms"}'
```

Lấy CSRF từ phản hồi đăng nhập rồi gọi endpoint ghi:

```bash
curl -b cookies.txt -X POST http://localhost:8099/api/cms/proposals \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrf-token>" \
  -d '{"title":"Ví dụ","body":"Nội dung"}'
```
