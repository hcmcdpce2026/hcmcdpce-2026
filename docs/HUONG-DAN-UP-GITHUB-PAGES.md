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

### 2. Xuất toàn bộ dữ liệu PUBLIC và tệp được tham chiếu

Trong VS Code, mở terminal tại thư mục dự án (thư mục có `package.json`). Có thể để server local tiếp tục chạy và dùng terminal thứ hai:

```powershell
if (-not (Test-Path -LiteralPath .\package.json)) { throw "Mở terminal tại đúng thư mục dự án có package.json." }
npm.cmd run export:static-public
if ($LASTEXITCODE -ne 0) { throw "Export thất bại. Không stage hoặc push; xử lý lỗi rồi chạy lại." }
```

Lệnh export tạo/cập nhật `public-data/public.json`, bao gồm dữ liệu PUBLIC của bài viết, danh mục, văn bản pháp luật, sự kiện, cơ quan, thống kê, cơ sở hỗ trợ, banner và thông báo; sau đó tự kiểm tra snapshot cùng các tệp media. Export chỉ được xem là thành công khi cả hai bước đều kết thúc với mã `0`.

Exporter chép ảnh, PDF và tệp `/uploads/...` được nội dung PUBLIC tham chiếu vào `public-data/media/`, rồi sửa đường dẫn trong snapshot. Đây là các tệp gắn với nội dung công khai, không phải toàn bộ `uploads/`: tệp nháp, tệp không được nội dung tham chiếu và dữ liệu riêng tư không được đưa lên Pages. Nếu exporter báo thiếu tệp hoặc kết thúc với mã lỗi khác `0`, phải xử lý trước; không tiếp tục commit.

### 3. Đối chiếu dữ liệu và kiểm tra mọi đường dẫn ảnh/tệp

```powershell
$json = Get-Content .\public-data\public.json -Raw
$snapshot = $json | ConvertFrom-Json

# Tìm mọi media được nhắc đến trong snapshot và xác nhận tệp tồn tại trên máy.
$mediaRefs = @([regex]::Matches($json, 'public-data/media/[^"\s<>?#)]+') |
    ForEach-Object { $_.Value } | Sort-Object -Unique)
$missingMedia = @($mediaRefs | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path (Get-Location).Path $_) -PathType Leaf)
})
if ($missingMedia.Count -gt 0) {
    $missingMedia
    throw "Có ảnh/tệp được tham chiếu nhưng không có trong public-data/media. Chưa được commit hoặc push."
}

[pscustomobject]@{
    Articles = @($snapshot.articles).Count
    Categories = @($snapshot.categories).Count
    LegalDocuments = @($snapshot.legalDocuments).Count
    Events = @($snapshot.events).Count
    Agencies = @($snapshot.agencies).Count
    StatisticsPeriods = @($snapshot.statistics).Count
    SupportFacilities = @($snapshot.supportFacilities).Count
    Banners = @($snapshot.banners).Count
    Notifications = @($snapshot.notifications).Count
    ReferencedMediaFiles = $mediaRefs.Count
}

# Đối chiếu nội dung vừa xuất với những gì bạn định đăng.
$snapshot.articles | Select-Object title, slug, publishedAt
$snapshot.legalDocuments | Select-Object title, docNumber, fileUrl
$mediaRefs
```

Các số lượng là bản đối chiếu, không phải số cố định: xác nhận bài mới/chỉnh sửa và văn bản cần đăng thật sự xuất hiện trong danh sách. Ảnh/PDF/tệp đính kèm phải có đường dẫn `public-data/media/...`; danh sách `$missingMedia` phải rỗng. Nếu nội dung hoặc media mong đợi không có, kiểm tra trạng thái công khai và tệp đính kèm trong CMS rồi export lại.

### 4. Stage và xác nhận Git sẽ chứa snapshot cùng mọi media

Kiểm tra repository và nhánh:

```powershell
git status --short
git branch --show-current
git remote -v
```

Stage snapshot cùng toàn bộ thư mục media:

```powershell
git add public-data/
if ($LASTEXITCODE -ne 0) { throw "Không stage được public-data/." }
npm.cmd run check:static-public:git
if ($LASTEXITCODE -ne 0) { throw "Snapshot hoặc media chưa được Git theo dõi/stage đầy đủ." }

# Snapshot và mọi media được tham chiếu phải có trong Git index.
$gitFiles = @(git -c core.quotepath=false ls-files -- public-data/)
if ($gitFiles -notcontains 'public-data/public.json') {
    throw "public-data/public.json chưa được Git theo dõi/stage."
}
$gitMedia = @($gitFiles | Where-Object { $_ -like 'public-data/media/*' })
$notInGit = @($mediaRefs | Where-Object { $gitMedia -notcontains $_ })
if ($notInGit.Count -gt 0) {
    $notInGit
    throw "Các tệp trên chưa được Git theo dõi/stage. Kiểm tra .gitignore và chạy lại git add public-data/."
}

# Không còn thay đổi public-data chưa được stage.
git diff --quiet -- public-data/
if ($LASTEXITCODE -ne 0) { throw "Còn thay đổi chưa được stage trong public-data/. Kiểm tra ignore rule và chạy git add public-data/ lại." }

# Quy trình này chỉ dành cho dữ liệu PUBLIC; dừng nếu đang stage nhầm tệp khác.
$staged = @(git -c core.quotepath=false diff --cached --name-only)
$unexpected = @($staged | Where-Object { $_ -notlike 'public-data/*' })
if ($unexpected.Count -gt 0) {
    $unexpected
    throw "Có tệp ngoài public-data đang được stage. Bỏ stage hoặc xác nhận riêng trước khi commit."
}

git status --short --untracked-files=all
git diff --cached --name-only
git diff --cached --stat
```

Trước khi commit, kiểm tra danh sách trên: `public-data/public.json` và các ảnh/PDF mới phải được stage. `$notInGit` và `$unexpected` phải rỗng. `git ls-files` xác nhận mọi media đang được snapshot tham chiếu đã nằm trong Git index, kể cả tệp đã được commit từ lần trước. Nếu còn tệp không được nhận, kiểm tra ignore rule trên một tệp cụ thể:

```powershell
git check-ignore -v --no-index -- .\public-data\media\TEN-TEP-THAT
```

`.gitignore` phải tiếp tục bỏ qua `uploads/` và media vận hành, nhưng cho phép theo dõi `public-data/media/`. Nếu lệnh trên in ra quy tắc đang bỏ qua tệp, sửa đúng ignore rule rồi chạy lại `git add public-data/` và toàn bộ bước kiểm tra. Nếu có tệp khác không muốn đưa lên, bỏ stage đúng tệp đó:

```powershell
git restore --staged -- "duong-dan-tep"
```

Không dùng `git add -A` cho lần cập nhật bài viết này nếu không định đưa cả các thay đổi mã nguồn khác lên GitHub. Không commit `.env`, database `server/data/*.sqlite*`, `uploads`, credential, backup hoặc log.

Thư mục `media/` và `uploads/` dùng khi vận hành vẫn bị loại trừ; riêng `public-data/media/` chứa bản sao công khai cho Pages và được Git theo dõi. Tệp không được tham chiếu trong snapshot sẽ không tự động được export. Quy trình này chỉ dành để đưa dữ liệu và media lên Pages; nếu cần triển khai thay đổi mã nguồn/giao diện, thực hiện một lần triển khai riêng và rà soát các tệp đó trước khi commit.

### 5. Commit và push

```powershell
git commit -m "Cap nhat noi dung cong khai"
if ($LASTEXITCODE -ne 0) { throw "Commit thất bại; chưa push dữ liệu." }
$branch = (git branch --show-current).Trim()
git push origin $branch
if ($LASTEXITCODE -ne 0) { throw "Push thất bại. Đọc lỗi Git và không cho rằng nội dung đã lên GitHub." }

# Xác nhận nhánh GitHub trỏ đúng commit vừa push.
$localCommit = (git rev-parse HEAD).Trim()
$remoteLine = git ls-remote origin "refs/heads/$branch"
if (-not $remoteLine) { throw "Không đọc được nhánh remote origin/$branch." }
$remoteCommit = ($remoteLine -split '\s+')[0]
if ($localCommit -ne $remoteCommit) { throw "Commit trên GitHub chưa khớp commit local." }
"Đã xác nhận origin/$branch = $remoteCommit"
```

Không tiếp tục nếu push báo lỗi hoặc mã commit local và remote không khớp. Repository này thường dùng nhánh `main`; lệnh trên tự lấy nhánh hiện tại.

### 6. Kiểm tra website sau khi push

1. Mở repository trên GitHub và chọn **Actions**.
2. Xác nhận workflow **Validate public snapshot** thành công, sau đó chờ workflow triển khai GitHub Pages hoàn tất thành công. Nếu kiểm tra snapshot thất bại, không coi lần up đó là hoàn tất.
3. Sau khi workflow thành công, chạy kiểm tra dưới đây trong PowerShell. Đổi `$siteBase` nếu repository dùng URL Pages hoặc tên miền riêng khác:

```powershell
$siteBase = 'https://nvdat2508-dotcom.github.io/hcmcdpcp2026'
$verify = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$localSnapshot = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
$liveSnapshot = Invoke-RestMethod -Uri "$siteBase/public-data/public.json?verify=$verify"
if ($liveSnapshot.generatedAt -ne $localSnapshot.generatedAt) {
    throw "Snapshot trên Pages chưa khớp bản vừa export; kiểm tra lại workflow và deploy."
}

$json = Get-Content .\public-data\public.json -Raw
$mediaRefs = @([regex]::Matches($json, 'public-data/media/[^"\s<>?#)]+') |
    ForEach-Object { $_.Value } | Sort-Object -Unique)
$failedMedia = @()
foreach ($asset in $mediaRefs) {
    try {
        $response = Invoke-WebRequest -Uri "$siteBase/$asset`?verify=$verify" `
            -Method Head -UseBasicParsing -TimeoutSec 20
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
            $failedMedia += "$asset (HTTP $($response.StatusCode))"
        }
    } catch {
        $failedMedia += "$asset ($($_.Exception.Message))"
    }
}
if ($failedMedia.Count -gt 0) {
    $failedMedia
    throw "Có ảnh/tệp không tải được từ Pages. Kiểm tra đường dẫn và deploy."
}
"Snapshot khớp; tất cả $($mediaRefs.Count) ảnh/tệp được tham chiếu trả về HTTP thành công."
```

4. Mở trang công khai để kiểm tra hiển thị thực tế, nhất là ảnh bài viết và liên kết/tệp PDF.

Không coi công việc là hoàn tất chỉ vì `git push` thành công: cần xác nhận hash nhánh remote, workflow **Validate public snapshot** và workflow Pages thành công, `generatedAt` trên website khớp snapshot local và mọi URL media trả về thành công. Nếu lệnh kiểm tra báo lỗi, sửa lỗi rồi chờ deploy lại.

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
| `$missingMedia` không rỗng | Tệp được snapshot tham chiếu không có trong `public-data/media/`; khôi phục tệp nguồn trong CMS/uploads rồi export lại. |
| `$notInGit` không rỗng hoặc media không xuất hiện trong `git ls-files` | Kiểm tra `.gitignore` trên đúng tệp, sau đó chạy `git add public-data/` và kiểm tra lại. |
| Snapshot local có nhưng `$liveSnapshot.generatedAt` khác | Nhánh/workflow/đường dẫn Pages chưa triển khai snapshot mới; kiểm tra hash remote và **Actions**. |
| Kiểm tra website liệt kê `$failedMedia` | Tệp không có ở URL Pages hoặc deploy chưa xong; xác nhận media đã nằm trong Git index, sửa lỗi rồi đợi workflow chạy lại. |
| Trang văn bản báo chưa có PDF dù snapshot đã có `fileUrl` | Đảm bảo đã push cả `public-data/` và phiên bản `js/public-pages.js`, `pages/public/law-detail.html` có chức năng đọc tệp; chờ Pages deploy rồi tải lại trang. |
| Nút PDF mở được nhưng khung xem trước trống | Thử **Mở toàn màn hình** hoặc **Tải file về máy**; khả năng hiển thị trong iframe còn phụ thuộc trình duyệt. |
| `origin already exists` | Kiểm tra `git remote -v`; dùng `git remote set-url origin ...` nếu URL sai. |
| `src refspec main does not match` | Kiểm tra `git branch --show-current` và bảo đảm đã có commit. |
| Push bị từ chối vì remote có commit mới | Không dùng `--force`. Dừng lại, kiểm tra thông báo lỗi và đồng bộ nhánh trước khi thử push lại. |
| Git yêu cầu đăng nhập hoặc báo không có quyền | Đăng nhập GitHub trong VS Code/Git Credential Manager và kiểm tra quyền ghi vào repository. Không dán token vào lệnh hoặc commit token. |
| Push thành công nhưng website chưa đổi | Kiểm tra workflow Pages trong **Actions** và chờ triển khai hoàn tất. |
| Trang vẫn dùng JavaScript/CSS cũ sau deploy | Tải lại mạnh bằng `Ctrl+F5`; khi cập nhật asset đã cache, đổi giá trị `v=` trong URL stylesheet/script của trang đó. |
| CMS không chạy trên GitHub Pages | GitHub Pages chỉ phục vụ trang tĩnh; CMS và API cần server Node.js riêng. |
