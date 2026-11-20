# Bảo mật

Tài liệu này mô tả các kiểm soát hiện có và những việc cần đánh giá thêm trước khi triển khai. Đây không phải chứng nhận an toàn hoặc thay thế quy trình kiểm thử bảo mật độc lập.

## Tài sản và ranh giới tin cậy

- Tài khoản cán bộ, phiên đăng nhập và quyền truy cập.
- Nội dung chưa xuất bản, phản ánh của người dân và dữ liệu liên hệ.
- Database SQLite, tệp cấu hình `.env`, thông tin bàn giao tài khoản.
- Ranh giới giữa PUBLIC, CMS và Workspace; ranh giới giữa các đơn vị và phạm vi dữ liệu.

Không coi trình duyệt là ranh giới bảo mật. Mọi kiểm soát quan trọng phải được thực hiện ở máy chủ.

## Kiểm soát hiện có

### Xác thực và phiên

- Mật khẩu băm bằng `scrypt` với salt ngẫu nhiên; so sánh hash bằng phép so sánh an toàn theo thời gian.
- Token phiên được sinh ngẫu nhiên; chỉ hash SHA-256 được lưu trong bảng `sessions`.
- Cookie `hcm_portal_session` có `HttpOnly`, `SameSite=Lax`; bật `Secure` bằng `COOKIE_SECURE=true` khi chạy HTTPS.
- Phiên có thời hạn cấu hình (`SESSION_TTL_MINUTES`) và có thể thu hồi khi đăng xuất, đổi mật khẩu hoặc tài khoản bị vô hiệu hóa.
- Sai mật khẩu được ghi nhận; tài khoản có thể bị khóa tạm theo `MAX_LOGIN_ATTEMPTS` và `LOCK_MINUTES`. Thông báo cho tài khoản không tồn tại và mật khẩu sai được làm giống nhau.

Mật khẩu mới khi đổi mật khẩu cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt. Mật khẩu mới không được trùng mật khẩu hiện tại.

### Phân quyền

- Tài khoản thuộc phân hệ CMS hoặc Workspace; server chặn phiên gọi API của phân hệ còn lại.
- Handler kiểm tra quyền RBAC ở máy chủ; một số nghiệp vụ kiểm tra thêm người tạo, người được giao hoặc phạm vi đơn vị.
- Thay đổi trạng thái bài viết, báo cáo, nhiệm vụ và phản ánh tuân theo các điều kiện được kiểm tra ở backend.

Ẩn nút trên giao diện chỉ phục vụ UX, không thay thế kiểm tra quyền API.

### CSRF, HTTP và đầu vào

- Request ghi dùng cookie phải gửi CSRF token của phiên trong `X-CSRF-Token`.
- Request ghi có body được đọc dưới dạng JSON với giới hạn dung lượng.
- Truy vấn SQLite sử dụng prepared statements.
- Đầu vào văn bản được làm sạch/giới hạn theo trường; nội dung HTML cho bài viết, báo cáo và đề xuất được xử lý bằng bộ lọc allow-list.
- Có header `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` và Content Security Policy.
- Đường dẫn tệp tĩnh được chuẩn hóa; một số thư mục nội bộ bị chặn khỏi truy cập HTTP.
- **Chống path traversal:** URL được **giải mã trước** khi chuẩn hóa (`..%2f`, `..%5c`, `%2e%2e` đều bị từ chối); đường dẫn phải nằm trong thư mục gốc. Lớp phòng ngự thứ hai chặn theo phần mở rộng (`.sqlite`, `.env`, `.pem`, `.key`…) và theo tên tệp (`credentials.local.txt`, `package.json`).
- **Chịu request sai định dạng:** toàn bộ handler được bọc `try/catch`, nên request không phải URL hợp lệ (ví dụ `GET //..%2f.env`) nhận lỗi ngay thay vì để kết nối treo. Kiểm thử hồi quy: `npm run test:security`.

### Giới hạn tần suất và nhật ký

- Đăng nhập, gửi phản ánh và tra cứu có giới hạn tần suất trong tiến trình.
- Yêu cầu gửi trùng được nhận diện bằng hash nội dung/liên hệ/ngày; tra cứu hồ sơ yêu cầu mã tiếp nhận và xác minh thông tin liên hệ khi áp dụng.
- Thao tác đăng nhập và nghiệp vụ quan trọng được ghi vào `login_attempts`/`activity_logs`.
- `RATE_LIMIT_DISABLED=true` chỉ dành cho kiểm thử cô lập; không bật trong staging/production.

## Cấu hình vận hành an toàn

Trước khi mở hệ thống cho người dùng:

- Đặt `APP_ENV=production`, bật HTTPS ở reverse proxy và `COOKIE_SECURE=true`.
- Chỉ cho phép truy cập Node.js từ reverse proxy tin cậy; không để cổng nội bộ lộ trực tiếp ra Internet.
- Nếu dùng proxy, chỉ chấp nhận `X-Forwarded-For` từ proxy tin cậy vì ứng dụng dùng header này để xác định IP cho giới hạn tần suất/nhật ký.
- Dùng `.env` riêng cho môi trường, giới hạn quyền đọc; không commit `.env`, khóa hoặc mật khẩu.
- Bảo vệ `server/data/portal.sqlite` và sao lưu; thư mục database không được đặt trong thư mục public.
- Chuyển mật khẩu khởi tạo qua kênh an toàn, buộc đổi mật khẩu theo quy trình và xóa `credentials.local.txt`.
- Giới hạn quyền hệ điều hành của user chạy ứng dụng; lưu log và bản sao lưu ở nơi được kiểm soát.
- Rà soát vai trò, tài khoản không còn sử dụng, CORS và cấu hình proxy trước mỗi lần phát hành.

## Giới hạn cần xử lý trước khi mở rộng

1. Bộ giới hạn tần suất lưu trong bộ nhớ của một tiến trình; không dùng chung giữa nhiều instance.
2. CSP còn cho phép inline script/style để tương thích giao diện hiện tại; cần rà soát trước khi siết chính sách.
3. Chưa có xác thực đa yếu tố (MFA/2FA).
4. Chưa tích hợp quét virus cho tệp/tài nguyên được người dùng đưa vào.
5. SQLite phù hợp triển khai đơn máy chủ; nhiều instance ghi đồng thời cần thiết kế lại lưu trữ/đồng bộ.
6. Nhật ký trong SQLite không phải kho log bất biến; người có quyền truy cập tệp database có thể sửa dữ liệu trực tiếp.
7. Ứng dụng không mã hóa database ở tầng ứng dụng; cần bảo vệ ổ đĩa, quyền hệ điều hành và backup.
8. Trang Support chưa nhúng bản đồ tương tác bên thứ ba: CSP hiện chỉ cho `img-src 'self'`,
   liên kết chỉ đường mở ở tab mới. Muốn nhúng bản đồ phải bổ sung domain bản đồ vào CSP và
   đánh giá lại rủi ro theo dõi người dùng — không tự ý nới lỏng chính sách.

## Phản ứng sự cố

1. Cô lập dịch vụ hoặc vô hiệu hóa tài khoản bị ảnh hưởng.
2. Giữ nguyên log và bản sao database liên quan; không ghi đè bằng reset.
3. Thu hồi phiên, đổi mật khẩu/secret bị lộ và kiểm tra quyền truy cập.
4. Xác định dữ liệu/đối tượng bị ảnh hưởng, thông báo theo quy trình của đơn vị.
5. Khôi phục từ bản sao đã kiểm tra nếu cần; ghi lại hành động khắc phục.

Tham khảo hướng dẫn cấu hình máy chủ và sao lưu tại [`DEPLOYMENT.md`](DEPLOYMENT.md), cùng hướng dẫn dữ liệu tại [`DATABASE.md`](DATABASE.md).
