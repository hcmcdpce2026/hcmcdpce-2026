# Backup và Restore SQLite

## Backup

Chạy:

```powershell
npm.cmd run db:backup
```

Lệnh kiểm tra WAL checkpoint, copy database và ghi SHA-256 trong thư mục `backups/`.

## Restore

1. Dừng server Node.
2. Sao lưu database hiện tại ngoài thư mục dự án.
3. Chạy:

```powershell
npm.cmd run db:restore -- <đường-dẫn-bản-sao.sqlite>
```

4. Khởi động server.
5. Chạy `GET /api/public/health`.
6. Kiểm tra CMS/Workspace và chạy migration nếu cần.

Không restore khi server vẫn đang ghi dữ liệu.
