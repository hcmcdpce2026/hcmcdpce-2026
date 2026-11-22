# Kiến trúc hệ thống

- HTTP server Node.js thuần.
- SQLite qua `node:sqlite`.
- Ba phân hệ: PUBLIC, CMS, WORKSPACE.
- API JSON và static PUBLIC snapshot.
- Session cookie HttpOnly/SameSite với CSRF cho cookie writes.
- RBAC và data scope cho tài khoản CMS/Workspace.
- Static export chỉ đưa dữ liệu công khai đã được duyệt.
