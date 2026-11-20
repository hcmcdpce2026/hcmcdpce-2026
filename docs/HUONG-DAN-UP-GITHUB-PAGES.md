# Đăng bài CMS và cập nhật GitHub Pages

Tài liệu dùng Windows/PowerShell/VS Code.

GitHub Pages chỉ phục vụ PUBLIC tĩnh. CMS, Workspace, SQLite, API ghi và gửi biểu mẫu cần server Node.js riêng.

## 1. Chuẩn bị

Mở thư mục dự án trong VS Code. Terminal phải ở thư mục có `package.json`.

```powershell
Get-Location
Test-Path .\package.json
node --version
npm.cmd --version
git --version
```

`Test-Path` phải trả `True`. Node cần 22.5.0 trở lên.

## 2. Khởi động CMS local

Nếu đã có `.env` và database:

```powershell
npm.cmd start
```

Nếu là lần khởi tạo mới và chưa có dữ liệu cần giữ:

```powershell
Copy-Item .env.example .env
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

Không ghi đè `.env` hiện có và không chạy `db:reset` trên database vận hành.

Mở CMS:

```text
http://localhost:8099/pages/cms/login.html
```

## 3. Tạo và lưu bài

1. Đăng nhập tài khoản CMS.
2. Mở Quản lý nội dung.
3. Chọn Tạo bài viết.
4. Nhập tiêu đề tối thiểu 10 ký tự.
5. Chọn chuyên mục đúng nhóm PUBLIC.
6. Kiểm tra slug.
7. Nhập mô tả ngắn.
8. Nhập nội dung chính.
9. Chỉ chọn media được phép công khai.
10. Chọn Lưu nháp.

Slug nên dùng chữ thường không dấu, số và dấu gạch nối.

## 4. Gửi duyệt và xuất bản

Nếu cần quy trình kiểm duyệt:

1. Chọn Gửi duyệt.
2. Người có quyền review duyệt hoặc yêu cầu chỉnh sửa.
3. Người có quyền publish xuất bản.

Nếu tài khoản có quyền publish trực tiếp, có thể xuất bản sau khi đã lưu.

Nội dung cần đủ mô tả và ít nhất 40 ký tự để gửi duyệt/xuất bản.

Kiểm tra trên server local:

```text
http://localhost:8099/
```

Mở danh mục và trang chi tiết tương ứng.

## 5. Xuất snapshot PUBLIC

Mở terminal thứ hai tại thư mục gốc:

```powershell
npm.cmd run export:static-public
```

Lệnh tạo/cập nhật:

```text
public-data/public.json
public-data/media/*
```

Exporter chỉ xuất:

- bài published;
- category active;
- legal documents public;
- events public;
- agencies active;
- statistics;
- support facilities public;
- banner/notification công khai phù hợp.

Không xuất submission, tài khoản, session, log hoặc Workspace.

Media được tham chiếu trong `uploads` được sao chép vào `public-data/media`. Nếu tệp thiếu, export báo lỗi thay vì tạo snapshot giả.

## 6. Kiểm tra snapshot

```powershell
Test-Path .\public-data\public.json
$snapshot = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
$snapshot.articles | Select-Object title, slug, publishedAt
Get-ChildItem .\public-data\media -ErrorAction SilentlyContinue
```

Nếu bài mới không có, quay lại CMS xác nhận:

- bài đã published;
- chuyên mục active;
- slug duy nhất;
- bài không bị archive/unpublish.

Chạy lại export sau khi dữ liệu đã chính xác.

## 7. Kiểm tra Git an toàn

```powershell
git status --short
git remote -v
git branch --show-current
```

Chỉ stage dữ liệu PUBLIC:

```powershell
git add public-data/
git status --short
git diff --cached --stat
git diff --cached --name-only
```

Danh sách staged chỉ nên chứa:

```text
public-data/public.json
public-data/media/*
```

Không stage:

- `.env`;
- `server/data/*.sqlite*`;
- `credentials.local.txt`;
- `uploads`;
- `backups`;
- log;
- nội dung nhạy cảm/chưa duyệt.

Bỏ stage tệp nhầm:

```powershell
git restore --staged -- "duong-dan-tep"
```

Nếu bí mật đã từng commit, xóa khỏi lịch sử không làm bí mật an toàn trở lại; cần đổi/thu hồi bí mật.

## 8. Commit và push cập nhật

```powershell
git commit -m "Cap nhat noi dung cong khai"
git push origin main
```

Nếu nhánh không phải `main`, dùng tên nhánh hiện tại.

Nếu `nothing to commit`, kiểm tra nội dung snapshot có thay đổi hay bài chưa được publish.

## 9. Kiểm tra deploy Pages

1. Mở repository trên GitHub.
2. Mở Actions.
3. Chờ workflow Pages hoàn tất.
4. Mở Settings > Pages để lấy URL.
5. Kiểm tra trang chủ, danh sách, trang chi tiết và media.

URL thường có dạng:

```text
https://TEN-TAI-KHOAN.github.io/TEN-REPOSITORY/
```

Không dùng Pages để đăng bài: thao tác CMS nằm local/backend.

## 10. Tải repository lần đầu

Tạo repository GitHub trống, không tạo README/license/.gitignore trùng dự án.

Nếu chưa có Git:

```powershell
git init
git branch -M main
```

Nếu đã là Git repository, không chạy lại `git init`.

Kiểm tra remote:

```powershell
git remote -v
```

Thêm remote:

```powershell
git remote add origin "https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git"
```

Hoặc sửa remote:

```powershell
git remote set-url origin "https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git"
```

Kiểm tra staged trước commit:

```powershell
git add -A
git status --short
git diff --cached --name-only
```

Kiểm tra `.gitignore` loại `.env`, SQLite, credential và backup. Sau đó:

```powershell
git commit -m "Tai du an len GitHub"
git push -u origin main
```

## 11. Bật GitHub Pages

1. Mở Settings > Pages.
2. Chọn Deploy from a branch.
3. Chọn `main` và `/(root)`.
4. Save.
5. Chờ Actions.
6. Mở URL công khai và kiểm tra.

## 12. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `not a git repository` | Chuyển đúng thư mục có `package.json` |
| `origin already exists` | Dùng `git remote -v`, sửa bằng `set-url` nếu sai |
| `src refspec main does not match` | Kiểm tra nhánh và đã có commit |
| `nothing to commit` | Kiểm tra snapshot và thay đổi dữ liệu |
| Export thiếu tệp | Khôi phục/cập nhật media trong CMS rồi export lại |
| Trang không có bài | Chờ deploy, kiểm tra push snapshot và trạng thái published |
| CMS không hoạt động trên Pages | Đúng giới hạn host tĩnh; dùng backend Node riêng |
| Trang trả 404 | Kiểm tra branch/folder Pages và tên thư mục |
