# Hướng dẫn đăng bài CMS và cập nhật lên GitHub Pages

Hướng dẫn này dùng Windows, PowerShell và Visual Studio Code. Quy trình gồm hai phần:

1. Tạo và xuất bản bài viết bằng CMS chạy trên máy tính.
2. Xuất dữ liệu PUBLIC tĩnh rồi commit/push lên GitHub để GitHub Pages hiển thị bài.

> GitHub Pages chỉ phục vụ trang PUBLIC tĩnh. CMS, đăng nhập, API ghi dữ liệu, biểu mẫu và Workspace vẫn cần máy chủ Node.js. Nội dung trong `public-data/` và media được xuất ra sẽ công khai nếu repository là Public. Chỉ xuất bản thông tin đã được phép công khai.

## A. Chuẩn bị máy tính

### 1. Mở đúng thư mục dự án

Mở thư mục dự án trong VS Code. Thư mục gốc phải có các tệp/thư mục như `package.json`, `index.html`, `server` và `pages`.

Mở **Terminal → New Terminal** trong VS Code. Nếu dự án nằm ở đường dẫn mặc định của máy này, chạy:

```powershell
Set-Location "D:\V5-HCMC-Drug-Prevention-Portal-Complete"
```

Nếu dự án nằm ở nơi khác, thay đường dẫn trên bằng đường dẫn thư mục thật của bạn. Xác nhận đang ở đúng chỗ:

```powershell
Get-Location
Test-Path .\package.json
```

Lệnh thứ hai phải trả về `True`.

### 2. Kiểm tra Node.js và Git

```powershell
node --version
npm.cmd --version
git --version
```

Dự án cần Node.js phiên bản `22.5.0` trở lên. Nếu máy chưa có Git, cài Git for Windows rồi đóng/mở lại VS Code.

### 3. Khởi động CMS local

Nếu database và tài khoản CMS đã được tạo, chỉ cần chạy:

```powershell
npm.cmd start
```

Giữ terminal này mở để máy chủ tiếp tục chạy. Nếu đây là lần khởi tạo dự án trên máy mới, chỉ chạy các lệnh sau khi xác nhận chưa có database cần giữ:

```powershell
Copy-Item .env.example .env
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

Không ghi đè `.env` đang có và không chạy `db:reset` trên dữ liệu thật. Mở một terminal VS Code thứ hai tại thư mục gốc để tiếp tục các bước dưới đây.

## B. Tạo và xuất bản bài viết trong CMS

### 1. Đăng nhập

Mở trình duyệt và truy cập:

```text
http://localhost:8099/pages/cms/login.html
```

Đăng nhập bằng tài khoản CMS được cấp. Tài khoản cần quyền tạo nội dung; để tự xuất bản, tài khoản cần quyền `content.publish`. Nếu không có quyền xuất bản trực tiếp, hãy gửi duyệt để người có quyền xử lý.

### 2. Tạo bài

1. Mở mục **Quản lý nội dung**.
2. Chọn **Tạo bài viết**.
3. Nhập **Tiêu đề bài viết**. Tiêu đề cần có ít nhất 10 ký tự.
4. Chọn đúng **Chuyên mục**. Chuyên mục đang hoạt động quyết định nhóm trang PUBLIC sẽ hiển thị bài.
5. Kiểm tra trường **Đường dẫn (slug)**. CMS tự tạo slug từ tiêu đề; có thể sửa nếu cần. Dùng chữ thường không dấu, số và dấu gạch nối; tránh trùng slug.
6. Nhập **Mô tả ngắn**. Mô tả này bắt buộc khi gửi duyệt hoặc xuất bản.
7. Soạn **Nội dung chính**. Nội dung cần có ít nhất 40 ký tự khi gửi duyệt/xuất bản.
8. Điền ảnh đại diện, thẻ, nguồn và thông tin SEO nếu cần. Chỉ dùng ảnh/tệp được phép công khai.
9. Chọn **Lưu nháp** trước để lưu bản đang soạn.

### 3. Xuất bản bài

- Nếu tài khoản có quyền xuất bản trực tiếp, chọn **Xuất bản** và xác nhận.
- Nếu cần kiểm duyệt, chọn **Gửi duyệt**. Người có quyền sẽ duyệt rồi xuất bản bài.
- Chỉ bài ở trạng thái **Đã xuất bản** mới được đưa vào bản PUBLIC tĩnh.

Sau khi xuất bản, mở trang PUBLIC trên máy chủ local:

```text
http://localhost:8099/
```

Chọn mục tin tức/chuyên mục phù hợp và xác nhận bài hiển thị đúng, nội dung, ngày, ảnh và đường dẫn đều chính xác. Nếu chưa thấy bài, kiểm tra trạng thái bài, chuyên mục và quyền xuất bản trong CMS.

## C. Xuất dữ liệu PUBLIC để đưa lên GitHub

Trong terminal thứ hai, tại thư mục gốc dự án, xác nhận đường dẫn:

```powershell
Get-Location
Test-Path .\package.json
```

Chạy lệnh xuất:

```powershell
npm.cmd run export:static-public
```

Lệnh tạo/cập nhật:

```text
public-data\public.json
public-data\media\       (nếu bài công khai tham chiếu tệp tải lên)
```

Snapshot chỉ chứa nội dung công khai, gồm bài viết đã xuất bản và các danh mục PUBLIC được cấu hình; không xuất tài khoản, nhật ký, phản ánh của người dân hoặc dữ liệu Workspace. Tệp tải lên mà nội dung công khai tham chiếu sẽ được sao chép từ `uploads\` sang `public-data\media\`.

Kiểm tra kết quả bằng PowerShell:

```powershell
Test-Path .\public-data\public.json
$snapshot = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
$snapshot.articles | Select-Object title, slug, publishedAt
Get-ChildItem .\public-data\media -ErrorAction SilentlyContinue
```

Nếu `public.json` không có bài mới, hãy quay lại CMS kiểm tra bài đã được xuất bản chưa rồi chạy lại lệnh export. Nếu export báo thiếu tệp, hãy kiểm tra ảnh/tệp đó còn trong `uploads\` và bài viết có đang trỏ tới đúng tệp hay không. Không tự chép toàn bộ `uploads\` lên GitHub; chỉ commit media đã được exporter chọn vào `public-data\media\`.

## D. Cập nhật nội dung lên GitHub (repository đã có sẵn)

Các lệnh sau dùng cho những lần đăng bài sau khi mã nguồn đã được tải lên GitHub và GitHub Pages đã bật.

### 1. Kiểm tra repository và thay đổi

```powershell
git status --short
git remote -v
git branch --show-current
```

Xác nhận remote trỏ tới đúng repository và nhánh là `main`. Nếu nhánh của bạn có tên khác, dùng tên nhánh đó thay `main` ở lệnh push bên dưới.

### 2. Stage chỉ dữ liệu PUBLIC đã xuất

```powershell
git add public-data/
git status --short
git diff --cached --stat
git diff --cached --name-only
```

Kiểm tra danh sách chỉ gồm `public-data\public.json` và các tệp đã duyệt trong `public-data\media\`. Không được đưa lên GitHub `.env`, `server\data\`, database `*.sqlite`, credentials, `uploads\`, `backups\` hoặc dữ liệu cá nhân.

Nếu stage nhầm một tệp, bỏ stage riêng tệp đó bằng lệnh dưới đây, thay đường dẫn bằng đúng tên tệp:

```powershell
git restore --staged -- "duong-dan-tep-can-bo-stage"
```

Không tiếp tục commit khi chưa xác nhận danh sách tệp staged an toàn.

### 3. Commit và push

```powershell
git commit -m "Cap nhat noi dung cong khai"
git push origin main
```

Nếu repository dùng nhánh khác, thay `main` bằng nhánh hiển thị từ `git branch --show-current`. Nếu Git báo `nothing to commit`, kiểm tra snapshot có thay đổi không; có thể bài chưa xuất bản hoặc nội dung đã giống bản đang có.

### 4. Kiểm tra trang sau khi deploy

1. Trên GitHub, mở repository → **Actions** và chờ tiến trình triển khai Pages hoàn tất.
2. Mở URL Pages hiển thị tại **Settings → Pages**.
3. Kiểm tra trang chủ, trang danh sách/chuyên mục, chi tiết bài và ảnh.
4. Với repository thông thường, URL thường có dạng:

   ```text
   https://TEN-TAI-KHOAN.github.io/TEN-REPOSITORY/
   ```

Không truy cập CMS GitHub Pages để đăng bài. CMS chỉ ghi vào database local; thao tác export và push mới chuyển nội dung đã xuất bản lên website tĩnh.

## E. Tải dự án lên GitHub lần đầu

Bỏ qua phần này nếu repository đã có mã nguồn và bạn chỉ đang cập nhật bài.

### 1. Tạo repository trên GitHub

1. Đăng nhập GitHub và chọn **New repository**.
2. Đặt tên repository.
3. Chọn **Public** nếu muốn dùng Pages miễn phí và chấp nhận nội dung công khai.
4. Không chọn tạo README, `.gitignore` hoặc license mới vì dự án đã có các tệp này.
5. Chọn **Create repository** và sao chép địa chỉ HTTPS, dạng:

   ```text
   https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git
   ```

### 2. Khởi tạo Git nếu thư mục chưa phải repository

Tại thư mục gốc dự án, chạy:

```powershell
git status
```

Nếu Git báo `not a git repository`, chạy:

```powershell
git init
git branch -M main
```

Nếu `git status` đã hiện nhánh hiện tại, không chạy lại `git init`.

### 3. Cấu hình remote

Kiểm tra remote:

```powershell
git remote -v
```

Nếu chưa có `origin`, thêm địa chỉ repository của bạn:

```powershell
git remote add origin "https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git"
```

Nếu đã có `origin`, không thêm lần nữa. Chỉ khi địa chỉ hiện tại sai, cập nhật bằng:

```powershell
git remote set-url origin "https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git"
```

Xác nhận lại:

```powershell
git remote -v
```

### 4. Stage và kiểm tra trước commit đầu tiên

Trước khi tải dự án lần đầu, hãy xuất snapshot theo phần C nếu muốn website có sẵn bài viết. Sau đó:

```powershell
git status --short
git add -A
git status --short
git diff --cached --name-only
```

Đọc toàn bộ danh sách staged. `.gitignore` loại database, `.env`, credentials, `uploads\` và backup khỏi Git, nhưng bạn vẫn phải kiểm tra bằng mắt. Nếu thấy tệp nhạy cảm hoặc dữ liệu nội bộ, dừng lại và bỏ stage riêng tệp đó:

```powershell
git restore --staged -- "duong-dan-tep-can-bo-stage"
```

Không tải database, mật khẩu, tệp `.env`, dữ liệu cá nhân hoặc nội dung chưa được phê duyệt. Nếu bí mật đã từng được commit, cần thay/thu hồi bí mật; chỉ xóa ở commit mới không xóa được khỏi lịch sử Git.

### 5. Tạo commit đầu và push

```powershell
git commit -m "Tai du an len GitHub"
git push -u origin main
```

Nếu Git yêu cầu đăng nhập, hoàn tất qua trình duyệt/Git Credential Manager. Không ghi mật khẩu hoặc token GitHub vào mã nguồn hay chia sẻ token.

### 6. Bật GitHub Pages

1. Mở repository → **Settings → Pages**.
2. Trong **Build and deployment**, chọn **Deploy from a branch**.
3. Chọn branch `main`, thư mục `/(root)`, rồi chọn **Save**.
4. Chờ workflow hoàn tất trong tab **Actions**.
5. Mở URL được hiển thị tại **Settings → Pages** và kiểm tra trang PUBLIC.

GitHub Pages không chạy Node.js, SQLite, CMS, đăng nhập, biểu mẫu ghi dữ liệu hay Workspace. Những chức năng này tiếp tục cần máy chủ ứng dụng.

## Xử lý lỗi thường gặp

| Thông báo/tình huống | Cách xử lý |
|---|---|
| `not a git repository` | Dùng `Get-Location`, chuyển về thư mục có `package.json`, rồi kiểm tra lại `git status`. |
| `remote origin already exists` | Chạy `git remote -v`; không thêm origin lần hai. Dùng `git remote set-url origin ...` chỉ khi remote sai. |
| `src refspec main does not match any` | Chạy `git branch --show-current`; kiểm tra đã có commit và dùng đúng tên nhánh. |
| `nothing to commit` | Kiểm tra `public-data\public.json`, trạng thái xuất bản của bài và `git status --short`. |
| Export báo thiếu tệp | Tệp được bài công khai tham chiếu không còn trong `uploads\`; khôi phục/cập nhật tệp trong CMS rồi export lại. |
| Trang Pages chưa có bài | Chờ Actions hoàn tất, kiểm tra đã push `public-data\public.json`, tải lại trang và kiểm tra lại URL Pages. |
| CMS không dùng được trên Pages | Đây là giới hạn của host tĩnh; đăng bài trong CMS local rồi export/push, hoặc triển khai backend Node.js. |
