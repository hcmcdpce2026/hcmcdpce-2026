# Triển khai và vận hành

Tài liệu dành cho người cài đặt và vận hành. Hệ thống hiện là một tiến trình Node.js phục vụ cả frontend tĩnh và API, lưu dữ liệu trong SQLite. Không có bước build hoặc cài dependency ngoài.

## Mô hình triển khai

```text
Trình duyệt ── HTTPS ──> Reverse proxy ── HTTP nội bộ ──> Node.js ──> SQLite
```

Khuyến nghị một instance trên một máy chủ có ổ đĩa bền vững. Không chạy nhiều instance cùng ghi vào một tệp SQLite. Khi đặt sau reverse proxy, giới hạn truy cập trực tiếp vào cổng Node.js và chỉ tin cậy header IP do proxy tin cậy gửi.

## Chuẩn bị môi trường

- Node.js `22.5.0` trở lên.
- Mã nguồn dự án và quyền ghi cho thư mục chứa database.
- Một database riêng cho mỗi môi trường.
- Tên miền và HTTPS trước khi cho người dùng đăng nhập.

Không cần `npm install`. Kiểm tra Node và SQLite:

```bash
node --version
node -e "require('node:sqlite'); console.log('node:sqlite OK')"
```

## Khởi tạo lần đầu

Tại thư mục gốc:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Chỉnh `.env` theo môi trường, sau đó chạy migration và seed trước khi chạy server:

```bash
npm run db:migrate
npm run db:seed
npm start
```

Seed CLI tạo tệp `server/data/credentials.local.txt` khi tạo tài khoản mới. Chuyển thông tin đó qua kênh an toàn rồi xóa tệp. Tránh khởi chạy server trước bước seed trên database trống nếu cần lấy tệp bàn giao; cơ chế seed tự động của server không ghi tệp này.

Health check: `http://127.0.0.1:8099/api/public/health`. Cổng và host có thể cấu hình qua `PORT` và `HOST`. Khi reverse proxy cùng máy, thường giới hạn `HOST=127.0.0.1`.

## Cấu hình môi trường

Tham khảo danh sách biến đầy đủ trong `.env.example` và `../README.md`. Các điểm production quan trọng:

```ini
APP_ENV=production
HOST=127.0.0.1
PORT=8099
DB_FILE=/var/lib/hcmc-portal/portal.sqlite
COOKIE_SECURE=true
CORS_ORIGIN=
```

- Giữ `.env` ngoài Git và giới hạn quyền đọc.
- `COOKIE_SECURE=true` chỉ hoạt động đúng khi người dùng truy cập qua HTTPS.
- Để `CORS_ORIGIN` trống nếu giao diện và API cùng origin. Nếu tách origin, khai báo origin cụ thể; không dùng wildcard với cookie.
- Không bật `RATE_LIMIT_DISABLED` ngoài môi trường kiểm thử cô lập.
- Đặt `DB_FILE` trên ổ đĩa bền vững, không phải thư mục tạm.

## Linux với systemd và Nginx

Tạo user dịch vụ riêng, thư mục ứng dụng và thư mục dữ liệu; chỉ cấp quyền ghi database cho dịch vụ.

Ví dụ unit systemd (điều chỉnh đường dẫn/user):

```ini
[Unit]
Description=HCMC Drug Prevention Portal
After=network.target

[Service]
Type=simple
User=hcmcportal
Group=hcmcportal
WorkingDirectory=/opt/hcmc-portal
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/hcmc-portal
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Đặt `.env` trong thư mục ứng dụng với quyền phù hợp và `DB_FILE=/var/lib/hcmc-portal/portal.sqlite`. Xác nhận `ReadWritePaths` khớp thư mục database.

Nginx cần chuyển tiếp tới Node trên loopback, bật TLS ở proxy và chuyển tiếp các header cần thiết:

```nginx
location / {
    proxy_pass http://127.0.0.1:8099;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Chỉ cho phép proxy truy cập cổng Node. Ứng dụng dùng `X-Forwarded-For` để xác định IP; không để client Internet gửi trực tiếp header này tới app.

## Windows Server

1. Cài Node.js 22.x.
2. Đặt mã nguồn ở thư mục ứng dụng; đặt database và backup ở thư mục dữ liệu riêng.
3. Tạo `.env`, chạy `npm run db:migrate` và `npm run db:seed`.
4. Chạy `node server/index.js` dưới một tài khoản dịch vụ không có quyền quản trị, dùng Task Scheduler hoặc service manager để tự khởi động lại.
5. Đặt IIS ARR/URL Rewrite, Caddy hoặc reverse proxy tương đương trước ứng dụng để cung cấp HTTPS.
6. Giới hạn truy cập trực tiếp vào port Node và kiểm tra quyền NTFS đối với `.env`, database, log và tệp bàn giao.

Không dùng script khởi động phát triển trong production nếu chưa đọc nội dung; một số script tiện ích có thể dừng tiến trình Node đang chạy.

## Kiểm tra sau triển khai

1. Xác nhận service đang chạy và health check trả HTTP `200`.
2. Kiểm tra trang PUBLIC, đăng nhập CMS/Workspace bằng tài khoản đã bàn giao.
3. Kiểm tra request ghi có CSRF, quyền sai phân hệ trả `403`, nội dung chưa xuất bản không xuất hiện công khai.
4. Xác nhận HTTPS, cookie `Secure`, database trên ổ đĩa bền vững và `.env` không thể tải qua HTTP.
5. Kiểm tra log và thực hiện thử quy trình backup/restore trên bản sao.

## Sao lưu, khôi phục và nâng cấp

Xuất logic trước bảo trì:

```bash
node server/scripts/data-tool.js export all --out backups/pre-maintenance
```

Đây là dữ liệu có thể chứa thông tin cá nhân; bảo vệ thư mục backup và kiểm tra quyền truy cập. Sao chép trực tiếp SQLite chỉ khi ứng dụng đã dừng hoặc dùng phương pháp backup SQLite nhất quán. Không chỉ sao chép `.sqlite` trong lúc WAL đang có dữ liệu chưa checkpoint.

Quy trình nâng cấp:

1. Thông báo bảo trì và xác nhận có thể khôi phục từ backup.
2. Xuất dữ liệu hoặc tạo bản backup nhất quán; dừng service.
3. Cập nhật mã nguồn theo quy trình phát hành của đơn vị.
4. Chạy `npm run db:migrate`; không chạy reset.
5. Khởi động service, kiểm tra health check, đăng nhập và các luồng chính.
6. Nếu lỗi, dừng service và khôi phục database/mã nguồn theo kế hoạch rollback đã thử.

## Khả năng triển khai và giới hạn

- GitHub Pages chỉ phục vụ tệp tĩnh, không chạy Node.js/SQLite hoặc các chức năng ghi; không phù hợp làm deployment đầy đủ.
- Có thể dùng CMS trên máy phát triển rồi xuất riêng dữ liệu PUBLIC đã được phê duyệt cho GitHub Pages:

  1. Lưu và xuất bản nội dung trong CMS local.
  2. Tại thư mục dự án, chạy `npm run export:static-public`.
  3. Kiểm tra thư mục `public-data/`, sau đó commit/push các tệp dữ liệu và ảnh/tệp trong đó cùng mã nguồn.
  4. GitHub Pages phục vụ phiên bản mới; các trang PUBLIC tự dùng snapshot khi API không tồn tại.

  Lệnh chỉ xuất bài viết đã xuất bản, chuyên mục đang hoạt động, văn bản, cơ quan, sự kiện được công bố, thống kê, cơ sở hỗ trợ, banner và thông báo PUBLIC. Tệp được nội dung tham chiếu từ `/uploads/` sẽ được sao chép vào `public-data/media/`; nếu thiếu tệp, lệnh xuất dừng và báo lỗi. Lệnh không xuất tài khoản, nhật ký, phản ánh của người dân, hay dữ liệu Workspace. Chỉ đưa nội dung đã được duyệt công khai lên GitHub; nếu repository public, các tệp snapshot và media đều có thể được tải công khai.

  Mỗi lần cập nhật, chạy lại lệnh và cập nhật cả `public-data/public.json` lẫn các media mới. Việc xuất không tự đẩy lên GitHub. Trên host tĩnh, đăng nhập CMS, gửi biểu mẫu và các chức năng cần ghi vào máy chủ không hoạt động; chúng cần backend đang chạy. Dùng Node.js để kiểm tra local trước khi xuất, vì `file://` không cho trình duyệt tải JSON theo cách đáng tin cậy.
- PaaS chỉ phù hợp nếu có ổ đĩa bền vững và cấu hình đúng `DB_FILE`; ổ đĩa tạm sẽ làm mất dữ liệu khi thay instance.
- SQLite và rate limit trong tiến trình hiện hướng tới một instance. Mở rộng ngang cần thiết kế lại lưu trữ và trạng thái dùng chung.
