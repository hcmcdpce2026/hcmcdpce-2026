# Triển khai và vận hành

> **Tình trạng hiện tại:** production chưa được xác minh và snapshot PUBLIC tĩnh đang thiếu. Backup lần bàn giao đã được restore trên bản sao tạm, chưa kiểm tra khôi phục trong production. Xem `HANDOVER.md`. Hướng dẫn dưới đây là quy trình mục tiêu, không phải bằng chứng hệ thống đã triển khai.

## 1. Mô hình đề xuất

```text
Internet
  -> HTTPS Reverse Proxy
  -> HTTP loopback 127.0.0.1:8099
  -> Node.js server
  -> SQLite/WAL
```

Khuyến nghị:

- một service Node.js;
- một database riêng;
- một ổ đĩa có backup;
- reverse proxy TLS;
- không mở port Node ra Internet.

## 2. Chuẩn bị

- Node.js 22.5.0 trở lên;
- quyền ghi database và upload;
- quyền đọc `.env`;
- tên miền và chứng chỉ TLS;
- tài khoản dịch vụ không có quyền quản trị;
- thư mục backup riêng, không public.

Kiểm tra:

```powershell
node --version
node -e "require('node:sqlite'); console.log('node:sqlite OK')"
npm.cmd --version
```

## 3. Cấu hình môi trường

Tạo `.env`:

```powershell
Copy-Item .env.example .env
```

Cấu hình production tối thiểu:

```ini
APP_ENV=production
HOST=127.0.0.1
PORT=8099
DB_FILE=/var/lib/hcmc-portal/portal.sqlite
COOKIE_SECURE=true
CORS_ORIGIN=
SESSION_TTL_MINUTES=480
MAX_LOGIN_ATTEMPTS=5
LOCK_MINUTES=15
RATE_LIMIT_DISABLED=false
```

Nếu tách frontend và API, đặt `CORS_ORIGIN` chính xác. Không dùng wildcard với cookie. Nếu cùng origin, để trống.

Không commit `.env`, database, credential và log.

## 4. Khởi tạo

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

Đối với Linux:

```bash
npm run db:migrate
npm run db:seed
npm start
```

Chạy seed trên database trống để tạo `server/data/credentials.local.txt` khi tài khoản seed mới được sinh. Chuyển credential qua kênh an toàn và xóa tệp bàn giao sau khi đã đổi mật khẩu.

Health check:

```text
http://127.0.0.1:8099/api/public/health
```

## 5. Systemd mẫu

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
ReadWritePaths=/var/lib/hcmc-portal /opt/hcmc-portal/uploads
EnvironmentFile=/opt/hcmc-portal/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Điều chỉnh đường dẫn, user và quyền. Không để tài khoản service có quyền sửa mã nguồn ngoài phạm vi deploy.

## 6. Reverse proxy Nginx

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

Chỉ proxy tin cậy được đặt header `X-Forwarded-*`. Tải ứng dụng không chấp nhận header IP tùy ý từ Internet.

## 7. Windows Server

1. Cài Node.js 22.x.
2. Cấp service account quyền hạn chế.
3. Tạo `.env` và database riêng.
4. Chạy migration/seed.
5. Dùng Task Scheduler/Service manager để tự khởi động.
6. Chèn IIS ARR/URL Rewrite, Caddy hoặc reverse proxy tương đương trước port Node.
7. Giới hạn Firewall port Node.

Không chạy lệnh reset, purge hoặc test ghi dữ liệu trên môi trường production. Runner cũ có thể dừng Node/xóa database đã được loại bỏ; dùng suite cô lập để kiểm thử.

## 8. Kiểm tra sau deploy

- health trả HTTP 200;
- PUBLIC tải;
- CMS và Workspace đăng nhập bằng tài khoản riêng;
- cookie `Secure` xuất hiện qua HTTPS;
- lỗi sai phân hệ/thiếu quyền trả 403;
- request ghi thiếu CSRF bị từ chối;
- bài chưa xuất bản không hiển thị PUBLIC;
- `.env` không truy cập qua HTTP;
- database không truy cập qua static server;
- upload danh sách file/MIME hoạt động.

## 9. Sao lưu

Trước bảo trì:

```powershell
node server/scripts/data-tool.js export all --out backups/pre-maintenance
```

Với SQLite, dừng service hoặc dùng SQLite backup API. Không copy từng tệp `.sqlite`, `-wal`, `-shm` như nhau nếu không quản lý nhất quán.

Sao lưu nên gồm:

- database;
- `uploads`;
- `.env` được mã hóa/giới hạn;
- cấu hình reverse proxy;
- mã nguồn/commit SHA.

Không để thư mục backup trong web root.

## 10. Khôi phục

1. Dừng Node.
2. Ghi lại trạng thái hiện tại.
3. Khôi phục database/mã nguồn/asset đã xác thực.
4. Chạy migration.
5. Khởi động service.
6. Kiểm tra health và luồng chính.
7. Ghi nhật ký thời gian, người thực hiện và backup sử dụng.

## 11. Nâng cấp

1. Bắt bảo trì.
2. Sao lưu database và cấu hình.
3. Giữ commit rollback.
4. Cập nhật source.
5. Chạy migration, không chạy reset.
6. Khởi động và chạy smoke test.
7. Chỉ mở lại cho người dùng khi kết quả đạt.

## 12. GitHub Pages

Pages không chạy backend. Quy trình:

1. CMS local nhập và xuất bản;
2. chạy `npm run export:static-public`;
3. kiểm tra `public-data/public.json` và media;
4. commit/push;
5. GitHub Pages deploy snapshot.

Trang tĩnh không có đăng nhập, submit, CMS, Workspace hoặc API ghi.

## 13. Checklist trước bàn giao/phát hành

- [ ] Rà `git status` và danh sách staged; chỉ đưa đúng mã/tài liệu đã được duyệt.
- [ ] Chạy `npm.cmd run check`, `npm.cmd run test:isolated` và `npm.cmd run test:content-types` trên môi trường cô lập.
- [ ] Xác nhận `.env`, database, credential, upload và backup không bị đưa vào Git hoặc web root.
- [ ] Kiểm tra cấu hình HTTPS, `COOKIE_SECURE=true`, host, CORS và quyền service trên môi trường đích.
- [ ] Xác nhận credential seed đã được đổi và chuyển qua kênh an toàn.
- [ ] Kiểm tra backup; diễn tập restore trên bản sao riêng trước khi thay đổi database thật.
- [ ] Với GitHub Pages, chỉ export nội dung đã được duyệt; kiểm tra snapshot/media và chạy `check:static-public:git`.
- [ ] Sau deploy, kiểm tra health, PUBLIC, CMS, Workspace, quyền truy cập, upload và log.
- [ ] Ghi lại commit, backup, người thực hiện, kết quả và các hạng mục chưa xác nhận trong `HANDOVER.md`.

Trạng thái lần bàn giao gần nhất và các giới hạn cụ thể nằm trong `HANDOVER.md`; checklist này không chứng minh đã triển khai production.

## 14. Giới hạn vận hành

- SQLite phù hợp một instance ghi;
- rate limit trong bộ nhớ không đồng bộ nhiều instance;
- upload local disk không chia sẻ object storage;
- session và lock đều lưu database/tại tiến trình;
- không có MFA;
- không có quét virus upload;
- không có encryption-at-rest tầng ứng dụng.
