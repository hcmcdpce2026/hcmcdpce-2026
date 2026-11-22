# Checklist bàn giao

## Mã nguồn

- [x] Kiểm kê HTML/CSS/JavaScript/backend/database/docs.
- [x] Chạy syntax check cho module chính.
- [x] Chạy isolated API/integration/security/Workspace suite.
- [x] Chạy content-type suite.
- [x] Chạy static export/check.
- [ ] Chạy Playwright QA với môi trường browser chính thức.

## Bảo mật

- [x] Escape dữ liệu tra cứu công khai.
- [x] Kiểm tra scope task/report/proposal Workspace.
- [x] Chặn private upload khỏi static serving.
- [x] Lọc private media khỏi static export.
- [x] Thêm trusted proxy IP.
- [ ] Thiết lập MFA nếu đơn vị yêu cầu.
- [ ] Quét secret toàn Git history.

## Dữ liệu

- [x] Có lệnh backup SQLite.
- [x] Có lệnh restore SQLite.
- [ ] Diễn tập restore trên production.
- [ ] Xác nhận retention backup.

## Triển khai

- [ ] Đặt HTTPS.
- [ ] Đặt `COOKIE_SECURE=true`.
- [ ] Đặt `TRUSTED_PROXY_IPS`.
- [ ] Đổi credential seed.
- [ ] Cấu hình CORS nếu tách origin.
- [ ] Cấu hình reverse proxy và log retention.
