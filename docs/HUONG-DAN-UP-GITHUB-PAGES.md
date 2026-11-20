# Đưa bài viết, hình ảnh và tệp văn bản lên GitHub Pages

Hướng dẫn dùng Windows, PowerShell và VS Code cho repository đã được tải về máy và đã cấu hình remote GitHub.

## Hiểu luồng đăng bài

Bài tạo trong CMS local được lưu trong database SQLite trên máy. GitHub Pages không đọc database này và không chạy CMS; cần xuất dữ liệu PUBLIC cùng các tệp được tham chiếu rồi commit/push lên GitHub.

```text
CMS local → Xuất snapshot → public-data/ → Git commit/push → GitHub Pages
```

Chỉ bài đã xuất bản mới được xuất. Bản nháp, tài khoản, session và dữ liệu nội bộ không được đưa lên Pages.

## Mỗi lần đăng bài mới

### 1. Xuất bản nội dung và đính kèm tệp trong CMS

1. Đăng nhập CMS tại `http://localhost:8099/pages/cms/login.html`.
2. Mở nội dung cần đăng, hoàn tất nội dung và chọn hình ảnh/tệp được phép công khai.
3. Gửi duyệt nếu quy trình yêu cầu, sau đó chọn **Xuất bản**.
4. Mở trang local `http://localhost:8099/` để kiểm tra bài và trang chi tiết.

Bài còn ở trạng thái nháp, chưa được duyệt, bị lưu trữ hoặc có chuyên mục không hoạt động sẽ không xuất hiện trong snapshot.

Với văn bản pháp luật, văn bản phải được đặt ở trạng thái công khai và có tệp PDF đính kèm trong CMS. Bản ghi cần tham chiếu đến tệp tải lên; không chỉ dán một đường dẫn máy tính như `C:\...`.

### 2. Xuất dữ liệu công khai

Trong VS Code, mở terminal tại thư mục dự án (thư mục có `package.json`). Có thể để server local tiếp tục chạy và dùng terminal thứ hai:

```powershell
Test-Path .\package.json
npm.cmd run export:static-public
```

`Test-Path` cần trả về `True`. Lệnh export tạo/cập nhật:

- `public-data/public.json`
- `public-data/media/` chứa bản sao của ảnh, PDF và media được snapshot tham chiếu đến

Exporter chép các tệp `/uploads/...` được nội dung công khai tham chiếu vào `public-data/media/`, đồng thời đổi đường dẫn trong snapshot sang vị trí mới. Nếu export báo thiếu tệp, xử lý lỗi trước; đừng tiếp tục commit snapshot chưa được tạo thành công.

### 3. Kiểm tra bài đã được xuất

```powershell
$snapshot = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
$snapshot.articles | Select-Object title, slug, publishedAt
$snapshot.legalDocuments | Select-Object title, docNumber, fileUrl
$snapshot.legalDocuments | Select-Object title, fileUrl, @{Name='FileExists'; Expression={ Test-Path -LiteralPath $_.fileUrl }}
```

Đối chiếu bài mới và văn bản cần đăng. Với văn bản có tệp, `fileUrl` phải có đường dẫn `public-data/media/...` và `FileExists` phải là `True`. Nếu không, kiểm tra trạng thái công khai, tệp đính kèm và chạy export lại.

### 4. Chỉ stage dữ liệu cần đưa lên Pages

Kiểm tra repository và nhánh:

```powershell
git status --short
git branch --show-current
git remote -v
```

Stage snapshot cùng media được export:

```powershell
git add public-data/
git diff --cached --name-only
```

Trước khi commit, danh sách staged cần giới hạn trong `public-data/` — gồm `public-data/public.json` và các tệp ảnh/PDF trong `public-data/media/`. Nếu tệp media không xuất hiện trong `git status`, kiểm tra ignore rule:

```powershell
git check-ignore -v .\public-data\media
```

`.gitignore` cần tiếp tục bỏ qua `uploads/` và media vận hành, nhưng cho phép theo dõi `public-data/media/`. Nếu thấy tệp khác không muốn đưa lên, bỏ stage tệp đó:

```powershell
git restore --staged -- "duong-dan-tep"
```

Không dùng `git add -A` cho lần cập nhật bài viết này nếu không định đưa cả các thay đổi mã nguồn khác lên GitHub. Không commit `.env`, database `server/data/*.sqlite*`, `uploads`, credential, backup hoặc log.

Thư mục `media/` và `uploads/` dùng khi vận hành vẫn bị loại trừ; riêng `public-data/media/` chứa bản sao công khai cho Pages và được Git theo dõi.

Nếu vừa thay đổi cách hiển thị tệp trên trang chi tiết văn bản, stage thêm đúng các tệp giao diện đã sửa, ví dụ:

```powershell
git add js/public-pages.js pages/public/law-detail.html
```

Chỉ thêm các tệp mã nguồn khi chúng có thay đổi mong muốn đưa lên website; kiểm tra lại toàn bộ danh sách bằng `git diff --cached --name-only`.

### 5. Commit và push

```powershell
git commit -m "Cap nhat noi dung cong khai"
git push origin main
```

Repository này dùng nhánh `main`. Nếu `git branch --show-current` cho kết quả khác, thay `main` bằng tên nhánh đó.

### 6. Kiểm tra website sau khi push

1. Mở repository trên GitHub và chọn **Actions**.
2. Chờ workflow triển khai GitHub Pages hoàn tất thành công.
3. Mở URL Pages, kiểm tra danh sách bài, trang chi tiết và hình ảnh.

Thời gian cập nhật phụ thuộc vào workflow Pages. Push thành công chưa có nghĩa là deploy đã hoàn tất.

## Lần đầu cấu hình repository

Chỉ làm phần này nếu repository chưa có remote `origin` hoặc GitHub Pages chưa được bật.

Kiểm tra remote:

```powershell
git remote -v
```

Nếu chưa có `origin`, thêm URL repository của bạn:

```powershell
git remote add origin "https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git"
```

Nếu remote sai, cập nhật URL:

```powershell
git remote set-url origin "https://github.com/TEN-TAI-KHOAN/TEN-REPOSITORY.git"
```

Trong GitHub, vào **Settings → Pages**, chọn nguồn triển khai theo cấu hình của repository, lưu lại và kiểm tra workflow trong **Actions**.

## Lỗi thường gặp

| Thông báo/tình huống | Cách xử lý |
|---|---|
| `not a git repository` | Mở terminal tại đúng thư mục dự án có `package.json`. |
| `nothing to commit` | Kiểm tra bài đã xuất bản chưa và snapshot có thay đổi sau khi export không. |
| Không thấy bài trong `public.json` | Kiểm tra trạng thái xuất bản, chuyên mục và chạy lại `npm.cmd run export:static-public`. |
| Export báo thiếu media | Khôi phục tệp media được bài tham chiếu trong CMS/uploads rồi export lại. |
| Bài có hình/PDF trong `public.json` nhưng không có tệp trong `public-data/media/` | Kiểm tra export và ignore rule; thư mục `public-data/media/` phải được Git theo dõi. |
| Trang văn bản báo chưa có PDF dù snapshot đã có `fileUrl` | Đảm bảo đã push cả `public-data/` và phiên bản `js/public-pages.js`, `pages/public/law-detail.html` có chức năng đọc tệp; chờ Pages deploy rồi tải lại trang. |
| Nút PDF mở được nhưng khung xem trước trống | Thử **Mở toàn màn hình** hoặc **Tải file về máy**; khả năng hiển thị trong iframe còn phụ thuộc trình duyệt. |
| `origin already exists` | Kiểm tra `git remote -v`; dùng `git remote set-url origin ...` nếu URL sai. |
| `src refspec main does not match` | Kiểm tra `git branch --show-current` và bảo đảm đã có commit. |
| Push bị từ chối vì remote có commit mới | Không dùng `--force`. Dừng lại, kiểm tra thông báo lỗi và đồng bộ nhánh trước khi thử push lại. |
| Git yêu cầu đăng nhập hoặc báo không có quyền | Đăng nhập GitHub trong VS Code/Git Credential Manager và kiểm tra quyền ghi vào repository. Không dán token vào lệnh hoặc commit token. |
| Push thành công nhưng website chưa đổi | Kiểm tra workflow Pages trong **Actions** và chờ triển khai hoàn tất. |
| Trang vẫn dùng JavaScript/CSS cũ sau deploy | Tải lại mạnh bằng `Ctrl+F5`; khi cập nhật asset đã cache, đổi giá trị `v=` trong URL stylesheet/script của trang đó. |
| CMS không chạy trên GitHub Pages | GitHub Pages chỉ phục vụ trang tĩnh; CMS và API cần server Node.js riêng. |
