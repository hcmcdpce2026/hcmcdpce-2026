# Tài liệu API

Tài liệu này mô tả các route được đăng ký trong `server/index.js`. Base URL mặc định là `http://localhost:8099`; toàn bộ API dùng JSON UTF-8.

## Quy ước

### Phản hồi

Thành công thường có dạng:

```json
{ "success": true, "data": {} }
```

Danh sách có thể kèm phân trang:

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 1 }
}
```

Lỗi:

```json
{ "success": false, "error": "Thông báo lỗi" }
```

Một số lỗi trả thêm thuộc tính ở cấp cao nhất, ví dụ `field` hoặc `ticketCode`. Các mã HTTP thường dùng:

| Mã | Ý nghĩa |
|---|---|
| `200` | Thành công |
| `201` | Tạo mới thành công |
| `204` | Không có nội dung phản hồi |
| `400` | JSON hoặc dữ liệu không hợp lệ |
| `401` | Chưa đăng nhập, phiên hết hạn hoặc không hợp lệ |
| `403` | Sai phân hệ, thiếu quyền hoặc CSRF không hợp lệ |
| `404` | Không tìm thấy route hoặc bản ghi |
| `409` | Trùng lặp hoặc xung đột trạng thái |
| `413` | Request vượt giới hạn dung lượng |
| `429` | Vượt giới hạn tần suất; có thể kèm `Retry-After` |
| `500` | Lỗi xử lý phía máy chủ |

### Xác thực và CSRF

- Phiên được gửi qua cookie `hcm_portal_session` (`HttpOnly`, `SameSite=Lax`) hoặc header `Authorization: Bearer <token>`.
- Đăng nhập trả `csrfToken`; có thể lấy lại qua `GET /api/auth/me`.
- Khi dùng cookie, các request thay đổi dữ liệu phải gửi `X-CSRF-Token`. Bearer token không dùng cookie nên không yêu cầu CSRF.
- Tài khoản CMS chỉ truy cập `/api/cms/*`; tài khoản Workspace chỉ truy cập `/api/workspace/*`.
- Quyền cụ thể được kiểm tra ở handler. Dùng `GET /api/auth/permissions` để xem quyền của phiên hiện tại.
- Gửi `Content-Type: application/json` cho request có body. Body JSON của API bị giới hạn kích thước ở máy chủ.

## Xác thực — `/api/auth`

| Method | Đường dẫn | Yêu cầu |
|---|---|---|
| `POST` | `/api/auth/login` | `username`, `password`, `system` (`cms` hoặc `workspace`) |
| `POST` | `/api/auth/logout` | Phiên hiện tại |
| `GET` | `/api/auth/me` | Phiên hiện tại |
| `POST` | `/api/auth/change-password` | `currentPassword`, `newPassword` |
| `GET` | `/api/auth/permissions` | Phiên hiện tại |

Đăng nhập trả `data.user`, `data.csrfToken`, `data.expiresAt` và `data.token`. Cookie được đặt khi đăng nhập thành công. Tài khoản sai phân hệ hoặc bị khóa sẽ bị từ chối. Đổi mật khẩu yêu cầu mật khẩu hiện tại; mật khẩu mới phải đạt chính sách tối thiểu 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt, không trùng mật khẩu cũ. Các phiên khác của tài khoản bị thu hồi sau khi đổi mật khẩu.

Ví dụ:

```json
{
  "username": "ten-dang-nhap",
  "password": "<mật-khẩu>",
  "system": "cms"
}
```

## PUBLIC — `/api/public`

Các route đọc công khai không yêu cầu đăng nhập. API chỉ trả nội dung phù hợp để công khai (ví dụ bài viết đã xuất bản, danh mục đang hoạt động). Dữ liệu rỗng khi chưa được nhập không đồng nghĩa API lỗi.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/public/health` | Health check |
| `GET` | `/api/public/articles` | Danh sách bài đã xuất bản; hỗ trợ `page`, `limit`, `categoryId`/`category`, `search`/`q`, `group`, `featured=true` |
| `GET` | `/api/public/articles/:id` | Chi tiết bài viết theo ID hoặc slug |
| `GET` | `/api/public/categories` | Chuyên mục đang hoạt động |
| `GET` | `/api/public/legal-documents` | Văn bản; hỗ trợ `id`, `type`, `search` |
| `GET` | `/api/public/events` | Sự kiện công khai; dùng `id` để lấy chi tiết |
| `GET` | `/api/public/agencies` | Cơ quan công khai; dùng `id` để lấy chi tiết |
| `GET` | `/api/public/statistics` | Kỳ và chỉ số thống kê |
| `GET` | `/api/public/support-facilities` | Cơ sở hỗ trợ đang hoạt động |
| `GET` | `/api/public/banners` | Banner đang hoạt động |
| `GET` | `/api/public/notifications` | Thông báo công khai |
| `POST` | `/api/public/submissions` | Gửi phản ánh/yêu cầu |
| `GET` | `/api/public/submissions/lookup?code=...&contact=...` | Tra cứu bằng mã và thông tin liên hệ nếu hồ sơ có thông tin liên hệ |

### Gửi yêu cầu

Các trường được đọc gồm `formType` (`contact`, `report`, `support`, `feedback`), `subject`, `name`/`fullName`, `email`, `phone`, `content`/`message`, `isAnonymous`, `consent`. Nội dung tối thiểu 10 ký tự. Nếu không ẩn danh, cần họ tên và email hoặc điện thoại; email/điện thoại nếu cung cấp sẽ được kiểm tra định dạng. Giao diện yêu cầu đồng ý xử lý dữ liệu cá nhân; API từ chối khi `consent` là `false`.

Ví dụ:

```json
{
  "formType": "contact",
  "subject": "Nội dung cần phản ánh",
  "name": "Người gửi",
  "email": "nguoi-gui@example.com",
  "content": "Nội dung chi tiết dài ít nhất 10 ký tự.",
  "isAnonymous": false,
  "consent": true
}
```

Thành công trả `201` cùng `ticketCode`, `status` và `receivedAt`. Yêu cầu trùng trong cùng ngày có thể trả `409` kèm mã đã tiếp nhận. Tra cứu dùng `code`; khi hồ sơ không ẩn danh và có thông tin liên hệ, `contact` phải khớp email hoặc số điện thoại đã gửi. Phản hồi chỉ được trả công khai khi hồ sơ được đánh dấu công khai.

## CMS — `/api/cms`

Tất cả route CMS yêu cầu phiên thuộc phân hệ CMS; thao tác yêu cầu thêm quyền phù hợp. Danh mục route đầy đủ:

| Method | Đường dẫn | Mục đích |
|---|---|---|
| `GET` | `/api/cms/stats` | Tổng quan CMS |
| `GET`, `POST` | `/api/cms/articles` | Liệt kê, tạo bài |
| `GET`, `PUT`, `DELETE` | `/api/cms/articles/:id` | Xem, sửa, xóa bài |
| `POST` | `/api/cms/articles/:id/:action` | Chuyển trạng thái bài |
| `GET`, `POST` | `/api/cms/categories` | Liệt kê, tạo/cập nhật chuyên mục |
| `PUT`, `DELETE` | `/api/cms/categories/:id` | Cập nhật hoặc xóa chuyên mục |
| `POST` | `/api/cms/categories/:id/reorder` | Sắp xếp chuyên mục |
| `GET`, `POST` | `/api/cms/media` | Liệt kê, thêm tài nguyên |
| `DELETE` | `/api/cms/media/:id` | Xóa tài nguyên |
| `GET` | `/api/cms/catalog/:kind` | Đọc danh mục quản lý |
| `POST` | `/api/cms/catalog/:kind` | Tạo hoặc cập nhật danh mục |
| `PUT`, `DELETE` | `/api/cms/catalog/:kind/:id` | Cập nhật hoặc xóa bản ghi danh mục |
| `GET` | `/api/cms/workflow` | Hàng đợi quy trình |
| `GET` | `/api/cms/submissions` | Danh sách yêu cầu |
| `GET`, `PUT` | `/api/cms/submissions/:id` | Xem hoặc cập nhật yêu cầu |
| `POST` | `/api/cms/submissions/:id/assign` | Chuyển yêu cầu thành nhiệm vụ Workspace |
| `GET` | `/api/cms/proposals` | Danh sách đề xuất Workspace |
| `POST` | `/api/cms/proposals/:id/review` | Duyệt, yêu cầu bổ sung, từ chối hoặc xuất bản |
| `POST` | `/api/cms/collaborations` | Tạo yêu cầu phối hợp |
| `GET` | `/api/cms/logs` | Nhật ký CMS và thao tác dùng chung |

`action` của bài viết gồm `submit`, `approve`, `reject`, `revise`, `publish`, `unpublish`, `archive`. Máy chủ kiểm tra trạng thái chuyển tiếp và quyền; không dùng endpoint này để bỏ qua quy trình. `kind` của catalog là `legal-documents`, `agencies`, `events`, `statistics`, `support-facilities`. Thống kê nhận các chỉ số con trong `items` khi lưu kỳ.

## Workspace — `/api/workspace`

Tất cả route yêu cầu phiên thuộc Workspace và quyền tương ứng. Phạm vi dữ liệu còn có thể giới hạn theo vai trò/đơn vị.

| Method | Đường dẫn | Mục đích |
|---|---|---|
| `GET` | `/api/workspace/stats` | Thống kê Workspace |
| `GET`, `POST` | `/api/workspace/tasks` | Liệt kê, tạo nhiệm vụ |
| `GET`, `PUT` | `/api/workspace/tasks/:id` | Xem, sửa nhiệm vụ |
| `POST` | `/api/workspace/tasks/:id/:action` | Tiến độ, gửi kết quả, duyệt, bổ sung, tạm dừng, tiếp tục, hủy |
| `POST`, `PUT` | `/api/workspace/tasks/:id/items` | Thêm/cập nhật mục công việc |
| `POST` | `/api/workspace/tasks/:id/comments` | Trao đổi trên nhiệm vụ |
| `GET`, `POST` | `/api/workspace/organizations` | Liệt kê, tạo/cập nhật đơn vị |
| `PUT`, `DELETE` | `/api/workspace/organizations/:id` | Cập nhật hoặc xóa đơn vị |
| `GET`, `POST` | `/api/workspace/users` | Liệt kê, tạo/cập nhật người dùng |
| `PUT` | `/api/workspace/users/:id` | Cập nhật người dùng |
| `POST` | `/api/workspace/users/:id/reset-password` | Đặt lại mật khẩu |
| `GET` | `/api/workspace/roles` | Danh sách vai trò |
| `POST`, `PUT` | `/api/workspace/roles`, `/api/workspace/roles/:id` | Tạo/cập nhật vai trò |
| `DELETE` | `/api/workspace/roles/:id` | Xóa vai trò |
| `GET` | `/api/workspace/permissions` | Danh sách quyền |
| `GET`, `POST` | `/api/workspace/documents` | Liệt kê, tạo/cập nhật tài liệu |
| `PUT`, `DELETE` | `/api/workspace/documents/:id` | Cập nhật hoặc lưu trữ tài liệu |
| `GET`, `POST` | `/api/workspace/events` | Liệt kê, tạo/cập nhật sự kiện lịch |
| `PUT`, `DELETE` | `/api/workspace/events/:id` | Cập nhật hoặc hủy sự kiện |
| `GET`, `POST` | `/api/workspace/reports` | Liệt kê, tạo báo cáo |
| `GET`, `PUT` | `/api/workspace/reports/:id` | Xem, cập nhật báo cáo |
| `POST` | `/api/workspace/reports/:id/:action` | Gửi, duyệt, yêu cầu sửa, từ chối hoặc công khai tóm tắt |
| `GET`, `POST` | `/api/workspace/proposals` | Liệt kê, tạo đề xuất nội dung |
| `GET` | `/api/workspace/collaborations` | Liệt kê yêu cầu phối hợp |
| `PUT` | `/api/workspace/collaborations/:id` | Cập nhật yêu cầu phối hợp |
| `GET` | `/api/workspace/notifications` | Thông báo Workspace |
| `POST` | `/api/workspace/notifications/:id/read` | Đánh dấu thông báo đã đọc |
| `GET` | `/api/workspace/logs` | Nhật ký Workspace |

Hành động nhiệm vụ là `progress`, `submit`, `complete`, `revision`, `pause`, `resume`, `cancel`. Hành động báo cáo là `send`, `approve`, `revision`, `reject`, `publish`.

## Dùng chung — `/api/shared`

Yêu cầu phiên hợp lệ của một trong hai hệ thống.

| Method | Đường dẫn | Mục đích |
|---|---|---|
| `GET` | `/api/shared/users` | Danh bạ tài khoản đang hoạt động |
| `GET` | `/api/shared/organizations` | Danh sách đơn vị |
| `GET` | `/api/shared/notifications` | Thông báo phù hợp với phiên hiện tại và `unreadCount` |
| `POST` | `/api/shared/notifications/read` | Đánh dấu thông báo dùng chung là đã đọc |
| `GET` | `/api/shared/settings` | Cấu hình hệ thống |
| `GET` | `/api/shared/summary` | Số liệu tổng hợp giữa các phân hệ |

## Ví dụ gọi API

Health check:

```bash
curl http://localhost:8099/api/public/health
```

Đăng nhập bằng cookie và lưu cookie jar:

```bash
curl -c cookies.txt -X POST http://localhost:8099/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"<tai-khoan>\",\"password\":\"<mat-khau>\",\"system\":\"cms\"}"
```

Lưu `csrfToken` từ trường `data` của phản hồi đăng nhập, rồi gửi cùng cookie khi ghi:

```bash
curl -b cookies.txt -X POST http://localhost:8099/api/cms/articles \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrf-token>" \
  -d "{\"title\":\"Tiêu đề bài viết\",\"body\":\"<p>Nội dung</p>\"}"
```

Không dùng thông tin tài khoản thật trong tài liệu, mã nguồn mẫu hoặc log công khai.
