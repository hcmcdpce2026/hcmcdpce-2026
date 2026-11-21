# Bảo mật

Tài liệu mô tả kiểm soát hiện có và việc cần làm trước production. Nó không thay thế đánh giá bảo mật độc lập, kiểm tra ứng dụng hoặc quy trình pháp lý về dữ liệu cá nhân.

## 1. Tài sản cần bảo vệ

- tài khoản và phiên đăng nhập;
- quyền theo vai trò/vùng dữ liệu;
- database SQLite;
- `.env`, secret, credential;
- submission có thông tin cá nhân;
- nội dung nháp/chưa xuất bản;
- tài liệu báo cáo/nhiệm vụ nội bộ;
- tệp upload và bản sao lưu.

## 2. Xác thực

- mật khẩu dùng `scrypt` có salt;
- hash session token bằng SHA-256 trong SQLite;
- cookie HttpOnly và SameSite=Lax;
- cookie Secure bật khi `COOKIE_SECURE=true`;
- session có thời hạn `SESSION_TTL_MINUTES`;
- tài khoản khóa tạm theo `MAX_LOGIN_ATTEMPTS` và `LOCK_MINUTES`;
- logout, đổi mật khẩu và vô hiệu hóa có thể thu hồi session.

Mật khẩu mới tối thiểu 10 ký tự, có hoa/thường/số/ký tự đặc biệt và khác mật khẩu hiện tại.

Thông báo đăng nhập sai không phân biệt tài khoản tồn tại hay sai mật khẩu.

## 3. Phân quyền

- tài khoản có `system_key=cms|workspace`;
- session bị chặn khỏi API phân hệ còn lại;
- vai trò có `data_scope=own|unit|all`;
- permission được lưu ở `role_permissions`;
- handler kiểm tra quyền ở backend;
- một số nghiệp vụ kiểm tra người tạo, người được giao hoặc đơn vị.

Giao diện ẩn nút không phải ranh giới bảo mật. API cần từ chối request thiếu quyền.

## 4. CSRF và cookie

Khi dùng cookie, request ghi dữ liệu cần `X-CSRF-Token`.

- CSRF token lấy qua `/api/auth/login` hoặc `/api/auth/me`;
- Bearer token không phụ thuộc cookie/CSRF;
- không dùng cookie trên cross-origin ngoài cấu hình CORS chính xác.

## 5. Header HTTP

Server thiết lập:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy`;
- CSP cơ bản;
- HSTS khi `APP_ENV=production`;
- CORS chỉ khi `CORS_ORIGIN` khớp origin request.

CSP hiện cho phép inline script/style để tương thích frontend. Siết CSP cần rà soát toàn bộ trang và loại bỏ inline.

## 6. SQL và đầu vào

- truy vấn SQLite dùng prepared statements;
- body API giới hạn dung lượng;
- text được làm sạch/giới hạn theo trường;
- HTML bài viết/báo cáo dùng allow-list sanitizer;
- route tĩnh chuẩn hóa URL;
- URL giải mã trước khi kiểm tra;
- đường dẫn traversal và backslash bị từ chối;
- thư mục server, data, backup, Git và cấu hình bị chặn.

Đối với upload:

- whitelist MIME/dạng tệp;
- mặc định tối đa 200 MB/tệp, điều chỉnh bằng `MAX_UPLOAD_MB`;
- HTML/SVG/executable bị từ chối;
- PDF/media được kiểm soát header Content-Disposition/CSP.

## 7. Giới hạn tần suất

Login, submit và lookup có giới hạn trong tiến trình Node.

`RATE_LIMIT_DISABLED=true` chỉ dùng môi trường kiểm thử cô lập. Không bật trong production.

Giới hạn trong bộ nhớ không đồng bộ giữa nhiều instance. Khi proxy nhiều app node, cần store tập trung hoặc proxy-level rate limit.

## 8. Upload

Các loại được phép gồm ảnh, Office/PDF/CSV/TXT/ZIP, MP4/webm và mp3/wav/ogg.

Không quét virus và không xác thực malware. Trước production cần:

- antivirus/quarantine;
- giới hạn dung lượng ổ đĩa;
- giới hạn tổng upload;
- domain/quyền truy cập tệp;
- quy trình xóa tệp.

## 9. Dữ liệu cá nhân

`submissions` có họ tên, email, số điện thoại và nội dung. Cần:

- kiểm soát truy cập theo quyền;
- lưu trữ theo chính sách đơn vị;
- không xuất qua PUBLIC/snapshot trừ phản hồi được phép;
- không đưa dữ liệu vào GitHub Pages;
- không gửi qua log/support nếu không cần;
- định nghĩa xóa/sao lưu/quản lý retention.

## 10. Cấu hình production

Trước mở hệ thống:

1. đặt `APP_ENV=production`;
2. bật HTTPS và `COOKIE_SECURE=true`;
3. đặt host loopback sau reverse proxy;
4. giữ `.env` ngoài Git với quyền đọc hạn chế;
5. thay và trao credential seed qua kênh an toàn;
6. xóa/khóa tài khoản không còn sử dụng;
7. rà soát vai trò và scope;
8. bảo vệ database, backup, upload;
9. xác định log retention;
10. thực hiện diễn tập sao lưu/phục hồi.

## 11. Phản hồi sự cố

1. Cô lập server hoặc khóa tài khoản bị ảnh hưởng.
2. Thu hồi session, đổi secret/password.
3. Giữ log/database để điều tra.
4. Không chạy reset/clean-test nếu làm mất bằng chứng.
5. Xác định bản ghi và người dùng bị ảnh hưởng.
6. Thông báo theo quy trình.
7. Khôi phục từ backup đã xác thực nếu cần.

## 12. Hạn chế đã biết

- không có MFA;
- không quét virus upload;
- không mã hóa SQLite tầng ứng dụng;
- không có rate limit phân tán;
- CSP inline cần siết dần;
- WAL và backup cần quy trình nhất quán;
- GitHub Pages không chạy backend nên không phù hợp dữ liệu cá nhân.
- log SQLite không bất biến.
