# Xóa dữ liệu PUBLIC đã xuất (public.json và media)

Hướng dẫn dùng Windows, PowerShell và VS Code để **gỡ bản xuất tĩnh** của phân hệ PUBLIC (`public-data/`) mà không làm hỏng dữ liệu gốc, CMS, Workspace hay API.

## Hiểu đúng: xóa "bản xuất" không phải xóa "dữ liệu"

| Loại | Đường dẫn | Vai trò | Xóa được? |
|---|---|---|---|
| **Dữ liệu gốc** | `server/data/portal.sqlite` | Nguồn sự thật: bài viết, chuyên mục, văn bản pháp luật, sự kiện, cơ quan, thống kê, cơ sở hỗ trợ, banner | **Không** — xóa là mất nội dung |
| **Tệp gốc** | `uploads/` | Ảnh, PDF, tài liệu do CMS tải lên | **Không** — xóa là mất tệp đính kèm |
| **Bản xuất tĩnh** | `public-data/public.json` | Snapshot JSON sinh ra từ SQLite, dùng cho GitHub Pages / chế độ offline | **Được** — tạo lại bằng một lệnh |
| **Bản sao media** | `public-data/media/*` | Bản sao của media được nội dung PUBLIC tham chiếu | **Được** — exporter chép lại từ `uploads/` |
| **Mã server** | `server/routes/public.js` | Code API `/api/public/*` | **Không** — đây là mã nguồn, không phải dữ liệu |

```text
server/data/portal.sqlite ─┐
                           ├─ export:static-public ─→ public-data/public.json
uploads/ ──────────────────┘                       └─→ public-data/media/*
```

Chiều mũi tên là một chiều. Xóa đích (`public-data/`) **không** ảnh hưởng nguồn; chạy lại `npm.cmd run export:static-public` là dựng lại y nguyên từ database và `uploads/`.

> **Lưu ý về `server/routes/public.js`:** đây là file route của API công khai, không phải file dữ liệu xuất. Nếu bạn cần gỡ *dữ liệu* thì không được xóa file này. Nếu mục đích thật sự là tắt API PUBLIC, đó là thay đổi kiến trúc (bỏ mount route trong `server/index.js`) — hãy tách thành task riêng.

## Chuẩn bị

1. Mở terminal tại thư mục dự án (thư mục có `package.json`).
2. Xem hiện trạng trước khi xóa:

```powershell
if (-not (Test-Path -LiteralPath .\package.json)) { throw "Mở terminal tại đúng thư mục dự án có package.json." }
Get-ChildItem -LiteralPath .\public-data -Recurse -Force |
    Select-Object FullName, Length | Format-Table -AutoSize
```

3. (Khuyến nghị) Ghi lại số lượng của bản xuất hiện tại để đối chiếu sau khi xuất lại:

```powershell
if (Test-Path -LiteralPath .\public-data\public.json) {
    $s = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
    [pscustomobject]@{
        GeneratedAt  = $s.generatedAt
        Articles     = @($s.articles).Count
        Legal        = @($s.legalDocuments).Count
        Events       = @($s.events).Count
        Agencies     = @($s.agencies).Count
        Media        = @(Get-ChildItem -LiteralPath .\public-data\media -File -Force).Count
    }
}
```

## Cách 1 (khuyến nghị): chỉ xóa nội dung, giữ thư mục

Cách này an toàn nhất: `public-data/media/` vẫn tồn tại, `.gitignore` đã whitelist thư mục này nên không cần sửa gì thêm.

```powershell
# 1. Xóa snapshot JSON
Remove-Item -LiteralPath .\public-data\public.json -Force -ErrorAction SilentlyContinue

# 2. Xóa toàn bộ bản sao media (giữ lại thư mục rỗng)
if (Test-Path -LiteralPath .\public-data\media) {
    Get-ChildItem -LiteralPath .\public-data\media -Force |
        Remove-Item -Recurse -Force
}

# 3. Kiểm chứng: chỉ còn thư mục media rỗng
Get-ChildItem -LiteralPath .\public-data -Recurse -Force | Select-Object FullName
```

Kết quả mong đợi: chỉ in ra `...\public-data\media`, không còn `public.json` và không còn tệp nào bên trong `media`.

## Cách 2: xóa luôn thư mục `public-data/`

Dùng khi muốn dọn sạch hoàn toàn (ví dụ chuyển sang deploy bằng API thay vì snapshot tĩnh).

```powershell
Remove-Item -LiteralPath .\public-data -Recurse -Force -ErrorAction SilentlyContinue
```

Lệnh exporter sẽ tạo lại thư mục bằng `fs.mkdirSync(..., { recursive: true })` ở lần chạy kế tiếp. Tuy nhiên **hai điều cần biết**:

- `npm.cmd run check:static-public` (và `check:static-public:git`) sẽ **báo lỗi** cho tới khi export lại — "Không tìm thấy public-data/public.json". Đó là hành vi đúng, không phải sự cố.
- Nếu vô tình chạm vào `.gitignore`, đừng để rule `media/` nuốt mất `public-data/media/`: repo đang whitelist bằng `!public-data/media/` và `!public-data/media/**`.

## Cách 3: dọn media mồ côi (không cần xóa toàn bộ)

Khi chỉ muốn gỡ những tệp trong `public-data/media/` không còn được `public.json` tham chiếu, dùng chế độ xem trước rồi mới xóa:

```powershell
if (-not (Test-Path -LiteralPath .\public-data\public.json)) { throw "Chưa có public.json để đối chiếu." }
$json = Get-Content .\public-data\public.json -Raw
$refs = @(
    [regex]::Matches($json, 'public-data/media/([^"\s<>?#)]+)') |
        ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
)
$orphans = @(Get-ChildItem -LiteralPath .\public-data\media -File -Force |
    Where-Object { $refs -notcontains $_.Name })

$orphans | Select-Object Name, Length | Format-Table -AutoSize
if ($orphans.Count -gt 0) {
    # Bỏ dấu # ở dòng dưới để thực sự xóa
    # $orphans | Remove-Item -Force
}
```

## Cách 4: xóa trên Git (đã từng commit bản xuất)

Xóa file trên máy **không** làm GitHub Pages mất dữ liệu; phải commit việc xóa thì Pages mới cập nhật.

```powershell
git status --short
git add -A -- public-data
git status --short
```

Danh sách staged phải gồm các dòng `D  public-data/...` (deleted). Kiểm tra lần cuối trước khi commit:

```powershell
git diff --cached --name-only | Select-String -Pattern '(\.env|\.sqlite|credentials|^uploads/|^backups/)'
```

Nếu lệnh trên in ra bất kỳ dòng nào, **dừng lại** và `git reset` — bạn đang stage nhầm dữ liệu nhạy cảm.

```powershell
git commit -m "Go bo du lieu PUBLIC da xuat"
git push origin main
```

Sau khi push:

- GitHub Action `Validate public snapshot` chỉ chạy khi `public-data/**` thay đổi và sẽ **fail** vì thiếu snapshot. Bỏ qua bằng cách giữ nguyên trạng thái "đã dọn" và chấp nhận workflow đỏ, hoặc xuất lại rồi commit như bước dưới.
- Nếu Pages là môi trường công khai đang chạy thật, hãy xuất lại và push trong cùng đợt để Pages không bị trắng dữ liệu.

## Xuất lại sau khi xóa

```powershell
npm.cmd run export:static-public
if ($LASTEXITCODE -ne 0) { throw "Export thất bại. Chưa commit hoặc push." }
npm.cmd run check
```

`package.json` định nghĩa `export:static-public` gồm hai bước liên tiếp: chạy exporter rồi chạy `check-static-public.js`. Chỉ khi exit code là `0` mới coi là thành công.

Kết quả mong đợi (số liệu theo bản xuất trước đó: 9 bài viết, 2 văn bản pháp luật, 3 sự kiện, 1 cơ quan, 16 media):

```text
Đã xuất dữ liệu PUBLIC tĩnh: public-data/public.json
  Bài viết đã xuất bản: 9
  Văn bản pháp luật: 2
  Cơ quan: 1
  Sự kiện: 3
  Tệp công khai đã sao chép: 16
Snapshot PUBLIC hợp lệ: 9 bài viết, 2 văn bản pháp luật, 16 media tồn tại và không rỗng.
```

Đối chiếu `generatedAt` để chắc chắn là bản mới:

```powershell
(Get-Content .\public-data\public.json -Raw | ConvertFrom-Json).generatedAt
```

## Những gì KHÔNG được làm

| Hành động | Hậu quả |
|---|---|
| Xóa `server/routes/public.js` | API `/api/public/*` hỏng, toàn bộ trang PUBLIC trắng dữ liệu |
| Xóa `server/data/portal.sqlite` | Mất nội dung CMS/Workspace; `db:reset` cũng không khôi phục bài tự viết |
| Xóa `uploads/` | Export lần sau báo `Không tìm thấy tệp được nội dung công khai tham chiếu` |
| `git add .` thay vì `git add -A -- public-data` | Rất dễ stage `.env`, `.sqlite`, credentials |
| Xóa `public-data/public.json` **đang** là nguồn duy nhất của Pages mà chưa xuất lại | Trang công khai mất nội dung |

## Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Không tìm thấy public-data/public.json. Hãy chạy export dữ liệu PUBLIC trước.` | Đã xóa snapshot, chưa export lại | `npm.cmd run export:static-public` |
| `Không tìm thấy tệp được nội dung công khai tham chiếu: ...\uploads\...` | Tệp gốc trong `uploads/` đã bị xóa hoặc dời | Khôi phục tệp, hoặc trong CMS bỏ/thay media của nội dung đó rồi export lại |
| Exporter báo thiếu thư mục `media` | Đã xóa cả `public-data/` | Không cần làm gì, exporter tự tạo lại |
| `Các tệp PUBLIC sau chưa được Git theo dõi/stage` | Quên `git add` trước `check:static-public:git` | `git add -A -- public-data` rồi chạy lại |
| GitHub Action đỏ sau khi push việc xóa | Workflow chạy khi `public-data/**` thay đổi | Export lại rồi commit/push, hoặc chỉnh `on.push.paths` của workflow |
| Trang PUBLIC trên Pages mất dữ liệu | Snapshot đã bị xóa/commit lên nhánh deploy | Chạy lại `npm.cmd run export:static-public`, commit và push |

## Danh sách kiểm tra nhanh

1. [ ] Đã xác nhận `server/data/portal.sqlite` và `uploads/` còn nguyên.
2. [ ] Đã xóa `public-data/public.json` và nội dung `public-data/media/`.
3. [ ] Đã chạy `npm.cmd run export:static-public` với exit code `0`.
4. [ ] `generatedAt` trong `public.json` là thời điểm mới.
5. [ ] `git status --short` không chứa `.env`, `.sqlite`, `credentials`, `uploads/`, `backups/`.
6. [ ] Đã mở `http://localhost:8099/` kiểm tra bài viết và ảnh hiển thị đúng.
