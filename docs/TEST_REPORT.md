# Báo cáo kiểm thử

Ngày báo cáo: 2026-11-22

## Kết quả gần nhất

| Lệnh | Kết quả |
|---|---|
| `npm.cmd run check` | PASS |
| `npm.cmd run test:isolated` | PASS: API 139/139; security 28/28; Workspace 13/13 |
| `npm.cmd run test:content-types` | PASS: 32/32 |
| `npm.cmd run test:article-tags` | PASS: 4/4 |
| `npm.cmd run export:static-public` | PASS, sau khi lọc media private |
| `npm.cmd run check:static-public` | PASS |

## Xác nhận finding bảo mật còn lại

- Scope Workspace: helper `canAccessTask`, `canAccessReport`, `canAccessProposal` được áp dụng trước trả dữ liệu/chỉnh sửa; suite cô lập Workspace PASS.
- XSS public: dữ liệu tra cứu được escape bằng `escapeHtml` và timeline không còn trả internal CMS note.
- Private media: URL không tồn tại/trực tiếp private được 404; static export sao chép đúng 20 media public/tham chiếu public.
- Login: wrong-system và unknown user đều trả thông báo chung 401.
- Logout: request không CSRF bị chặn 403.
- Database workflow: trigger trực tiếp chặn task/report/proposal với trạng thái không hợp lệ (`blocked`).
- Cookie: production mặc định Secure khi không cấu hình false.

## Phạm vi

- 40 trang Public/CMS/Workspace và trang HTML trong repository.
- Frontend: HTML, CSS, JavaScript public/CMS/Workspace.
- Backend: Node HTTP, auth, CSRF, API, upload, static serving.
- Database: schema, migration, seed, transaction và static export.
- Bảo mật: scope Workspace, escape public lookup, private upload, IP proxy trust, cookie Secure.

## Hạn chế

- Chưa có Playwright runner ổn định trong `package.json`.
- Chưa quét secret toàn bộ Git history.
- Chưa diễn tập restore trên production.
- Backup SQLite cần chạy khi server đã được dừng hoặc database đã checkpoint WAL.
