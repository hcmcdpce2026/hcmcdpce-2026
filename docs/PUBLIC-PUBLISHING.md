# Xuất nội dung PUBLIC lên GitHub Pages

## Phạm vi

GitHub Pages chỉ phục vụ tệp tĩnh. Nó không chạy Node.js, SQLite, API ghi dữ liệu, CMS hoặc Workspace. Tài liệu này chỉ hướng dẫn xuất **nội dung công khai đã được duyệt** cùng media được tham chiếu; không dùng để xóa dữ liệu CMS/Workspace hoặc database nguồn.

GitHub/GitHub Pages nhận tệp trực tiếp tối đa 100 MB. CMS từ chối upload >100 MB; exporter cũng từ chối media công khai >100 MB để không tạo snapshot không thể push hoặc deploy.

Luồng:

```text
CMS và SQLite -> export:static-public -> public-data/ -> GitHub Pages
```

Snapshot hiện được duy trì tại `public-data/public.json` và media công khai tại `public-data/media/`. Không xuất database vận hành lên Pages; chỉ export nội dung công khai sau khi được người có thẩm quyền duyệt.

## Trước khi xuất

1. Mở terminal tại thư mục dự án có `package.json`.
2. Xác nhận server đang dùng đúng database và nội dung được xuất bản đã được duyệt.
3. Rà soát quyền công khai và loại bỏ thông tin cá nhân/nội bộ không được phép phát hành.
4. Sao lưu database trước thay đổi vận hành.

## Tạo và kiểm tra snapshot

```powershell
npm.cmd run export:static-public
if ($LASTEXITCODE -ne 0) { throw "Export hoặc kiểm tra snapshot thất bại; không stage/push." }
```

Lệnh xuất `public-data/public.json` và chỉ sao chép media công khai được nội dung tham chiếu vào `public-data/media/`. Nó không xuất tài khoản, session, phản ánh cá nhân hoặc nội dung Workspace. Không sao chép thủ công toàn bộ `uploads/`.

GitHub/GitHub Pages nhận tệp trực tiếp tối đa 100 MB. Exporter từ chối tệp công khai lớn hơn 100 MB thay vì tạo snapshot có phần không tải được.

Kiểm tra nội dung và tệp:

```powershell
$snapshot = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
$snapshot | Select-Object generatedAt
$snapshot.articles | Select-Object title, slug, publishedAt
$snapshot.legalDocuments | Select-Object title, docNumber, fileUrl

npm.cmd run check:static-public
if ($LASTEXITCODE -ne 0) { throw "Snapshot không hợp lệ." }
```

Đối chiếu số bản ghi với nội dung định phát hành. Nếu exporter báo thiếu media hoặc snapshot chứa thông tin không được duyệt, dừng lại; sửa nguồn trong CMS rồi export lại.

## Đưa đúng tệp vào Git

```powershell
git status --short
git add public-data/
npm.cmd run check:static-public:git
if ($LASTEXITCODE -ne 0) { throw "Snapshot hoặc media chưa được stage đầy đủ." }
git diff --cached --name-only
git diff --cached --stat
```

Chỉ tiếp tục khi mọi thay đổi staged đều nằm trong `public-data/`, snapshot và mọi media được tham chiếu có trong Git index. Không dùng `git add -A` nếu không chủ định đưa cả các thay đổi mã khác vào commit.

Nếu stage nhầm tệp, bỏ stage đúng tệp bằng lệnh không phá hủy:

```powershell
git restore --staged -- "duong-dan-tep"
```

Không commit `.env`, database, credential, log, `uploads/` hoặc `backups/`. Chỉ commit/push khi đã được phê duyệt:

```powershell
git commit -m "Cap nhat noi dung cong khai"
git push origin main
```

Không dùng `--force` để xử lý lỗi push. Kiểm tra GitHub Actions và cấu hình Pages sau khi push.

## Kiểm tra sau phát hành

1. Xác nhận workflow xác thực snapshot và workflow Pages đã thành công.
2. Lấy URL Pages từ cấu hình repository **Settings → Pages**; không giả định URL theo tên tài khoản.
3. Mở trang, kiểm tra bài viết, hình ảnh và PDF thực tế.
4. Nếu snapshot online chưa cập nhật, so sánh `generatedAt` của bản local với `public-data/public.json` online và kiểm tra trạng thái deploy.

## Giới hạn và xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Thiếu `public-data/public.json` | Chạy exporter sau khi xác nhận nguồn và quyền công khai |
| Bài không có trong snapshot | Kiểm tra trạng thái xuất bản, chuyên mục và quyền công khai |
| Media không tồn tại | Khôi phục/thay tệp trong CMS hoặc bỏ tham chiếu; không upload toàn bộ thư mục `uploads/` |
| Git check thất bại | Stage `public-data/` và chạy lại `check:static-public:git` |
| Workflow đỏ hoặc trang chưa cập nhật | Không coi là hoàn tất; đọc log Actions và xác minh lại snapshot/media |
| Cần CMS/API ghi dữ liệu trên Internet | GitHub Pages không đáp ứng; cần triển khai backend riêng an toàn |

Tài liệu triển khai backend: `DEPLOYMENT.md`.

## Gỡ snapshot PUBLIC

Phần này chỉ gỡ bản xuất tĩnh; **không** xóa dữ liệu CMS/Workspace, `server/data/portal.sqlite` hoặc tệp gốc `uploads/`.

Trạng thái hiện tại: `public-data/public.json` được duy trì bởi exporter. Nếu cần gỡ một snapshot về sau, trước tiên kiểm tra đúng các đường dẫn:

```powershell
Get-ChildItem -LiteralPath .\public-data -Force -Recurse |
    Select-Object FullName, Length
```

Sau khi xác nhận snapshot/media là bản sao có thể dựng lại:

```powershell
$snapshot = Join-Path (Get-Location).Path 'public-data\public.json'
if (Test-Path -LiteralPath $snapshot -PathType Leaf) {
    Remove-Item -LiteralPath $snapshot -Force
}

$mediaDir = Join-Path (Get-Location).Path 'public-data\media'
if (Test-Path -LiteralPath $mediaDir -PathType Container) {
    Get-ChildItem -LiteralPath $mediaDir -Force |
        Remove-Item -Recurse -Force
}
```

Lệnh trên chỉ tác động đến snapshot và các bản sao nằm trong `public-data/media/`; không chạy tương tự trên `uploads/`, database, backup hoặc thư mục dự án. Xóa local không gỡ bản đã commit khỏi GitHub Pages. Nếu cần thu hồi snapshot đã public, kiểm tra stage, commit và deploy theo quy trình đã được phê duyệt; dữ liệu cũ vẫn có thể tồn tại trong lịch sử Git hoặc cache.

Để tạo snapshot lại, cần xác nhận nội dung được phép công khai rồi chạy `npm.cmd run export:static-public`. Kiểm tra đầu ra và media trước khi stage; không export database vận hành nếu chưa được duyệt.
