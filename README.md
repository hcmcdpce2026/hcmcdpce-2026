<div align="center">

# Chuyên trang điện tử về phòng, chống ma túy tại Thành phố Hồ Chí Minh

**PUBLIC · CMS · WORKSPACE**

</div>

Cổng thông tin phục vụ người dân và cán bộ: đăng tải thông tin, quản lý nội dung, tiếp nhận yêu cầu và phối hợp xử lý công việc. Ứng dụng gồm giao diện HTML/CSS/JavaScript, máy chủ Node.js và cơ sở dữ liệu SQLite.

> **Lưu ý triển khai:** Đây là mã nguồn ứng dụng. Trước khi sử dụng chính thức cần cấu hình HTTPS, đổi và bàn giao tài khoản theo quy trình an toàn, bảo vệ database và sao lưu, rà soát quyền truy cập, dữ liệu cá nhân và nội dung được phép công khai.

## Mục lục

- [Tổng quan các phân hệ](#tổng-quan-các-phân-hệ)
- [Kiến trúc và luồng nghiệp vụ](#kiến-trúc-và-luồng-nghiệp-vụ)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt và chạy local](#cài-đặt-và-chạy-local)
- [Đăng bài bằng CMS](#đăng-bài-bằng-cms)
- [Đưa nội dung PUBLIC lên GitHub Pages](#đưa-nội-dung-public-lên-github-pages)
- [Cấu hình và dữ liệu](#cấu-hình-và-dữ-liệu)
- [Lệnh thường dùng](#lệnh-thường-dùng)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Bảo mật và giới hạn vận hành](#bảo-mật-và-giới-hạn-vận-hành)
- [Tài liệu chi tiết](#tài-liệu-chi-tiết)

## Tổng quan các phân hệ

| Phân hệ | Đối tượng | Chức năng chính |
|---|---|---|
| **PUBLIC** | Người dân và khách truy cập | Tin tức, tuyên truyền - giáo dục, pháp luật, thống kê, cơ quan - đơn vị, sự kiện, thông tin hỗ trợ; gửi yêu cầu và tra cứu hồ sơ |
| **CMS** | Cán bộ biên tập và quản trị nội dung | Soạn, duyệt và xuất bản bài; quản lý chuyên mục, media và danh mục công khai; tiếp nhận yêu cầu, xem đề xuất và nhật ký |
| **WORKSPACE** | Cán bộ cơ quan, đơn vị | Nhiệm vụ, báo cáo, lịch, tài liệu, tài khoản, vai trò, thông báo và đề xuất nội dung |
| **API/Backend** | Các giao diện ứng dụng | Xác thực, phân quyền, nghiệp vụ liên thông, đọc/ghi dữ liệu và phục vụ tài nguyên tĩnh |

Nội dung công khai không tự xuất hiện khi cài đặt. Bài viết cần được nhập trong CMS và xuất bản trước khi PUBLIC hiển thị.

## Kiến trúc và luồng nghiệp vụ

```text
Trình duyệt: PUBLIC / CMS / WORKSPACE
                  │ HTTP + JSON + phiên + CSRF
                  ▼
             Node.js server
                  │
                  ▼
             SQLite database
```

- **PUBLIC → CMS → WORKSPACE:** người dân gửi yêu cầu; CMS tiếp nhận và có thể chuyển thành nhiệm vụ; cán bộ xử lý và cập nhật kết quả.
- **WORKSPACE → CMS → PUBLIC:** Workspace gửi đề xuất; CMS xem xét, biên tập và xuất bản; chỉ nội dung đã xuất bản được hiển thị công khai.
- Các thay đổi cần xác thực, quyền phù hợp và (khi dùng cookie) token CSRF. Quyền ở giao diện không thay thế kiểm tra quyền tại máy chủ.
- Hệ thống hiện có **39 tệp HTML** (trang chủ và các trang trong `pages/`), không có bước build frontend và không khai báo package npm bên ngoài.
- Cơ sở dữ liệu mặc định là `server/data/portal.sqlite`; ứng dụng dùng `node:sqlite`.

## Yêu cầu hệ thống

- Node.js **22.5.0 trở lên**.
- npm đi kèm Node.js.
- Git for Windows nếu muốn đưa mã nguồn hoặc dữ liệu lên GitHub.
- Trình duyệt hiện đại.

Kiểm tra phiên bản trong terminal:

```powershell
node --version
npm.cmd --version
git --version
```

Không cần chạy `npm install` cho cấu hình hiện tại vì `package.json` không khai báo dependency npm bên ngoài.

## Cài đặt và chạy local

Mở thư mục gốc dự án trong VS Code, chọn **Terminal → New Terminal**, rồi kiểm tra:

```powershell
Get-Location
Test-Path .\package.json
```

`Test-Path` cần trả về `True`. Nếu chưa có `.env`, tạo tệp từ mẫu một lần:

```powershell
Copy-Item .env.example .env
```

Không chạy lệnh trên để ghi đè cấu hình `.env` hiện có. Khởi tạo schema và dữ liệu hệ thống:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
```

Sau đó chạy máy chủ:

```powershell
npm.cmd start
```

Giữ terminal đang chạy máy chủ mở. Truy cập các địa chỉ local:

| Khu vực | URL mặc định |
|---|---|
| PUBLIC | <http://localhost:8099/> |
| CMS | <http://localhost:8099/pages/cms/login.html> |
| WORKSPACE | <http://localhost:8099/pages/workspace/login.html> |
| Health check | <http://localhost:8099/api/public/health> |

`db:seed` tạo dữ liệu hệ thống và tài khoản ban đầu khi cần; mật khẩu phát sinh có thể được ghi vào `server/data/credentials.local.txt`. Đây là tệp nhạy cảm: không commit, không gửi công khai và chuyển thông tin đăng nhập qua kênh an toàn. Không chạy lệnh reset trên database có dữ liệu cần giữ.

## Đăng bài bằng CMS

1. Đăng nhập CMS tại <http://localhost:8099/pages/cms/login.html>.
2. Mở **Quản lý nội dung → Tạo bài viết**.
3. Nhập tiêu đề, chọn chuyên mục đang hoạt động, điền mô tả và nội dung. Slug được tự tạo từ tiêu đề và có thể chỉnh sửa.
4. Chọn **Lưu nháp** để lưu bản đang soạn.
5. Người có quyền xuất bản chọn **Xuất bản**; nếu quy trình yêu cầu kiểm duyệt, chọn **Gửi duyệt** để người có quyền xử lý.
6. Kiểm tra bài trên PUBLIC. Chỉ bài trạng thái **Đã xuất bản** được đưa vào snapshot tĩnh.

CMS yêu cầu tiêu đề có ít nhất 10 ký tự; mô tả ngắn là bắt buộc khi xuất bản; nội dung cần ít nhất 40 ký tự khi gửi duyệt/xuất bản. Chọn đúng chuyên mục để bài xuất hiện ở khu vực phù hợp. Hướng dẫn chi tiết xuất bản và cập nhật GitHub Pages ở [docs/HUONG-DAN-UP-GITHUB-PAGES.md](docs/HUONG-DAN-UP-GITHUB-PAGES.md).

## Đưa nội dung PUBLIC lên GitHub Pages

GitHub Pages chỉ phục vụ trang tĩnh; **không** chạy Node.js, SQLite, CMS, đăng nhập, API ghi, gửi biểu mẫu hoặc Workspace. CMS local vẫn có thể dùng để nhập bài; sau khi xuất bản, tạo snapshot công khai rồi đẩy snapshot lên GitHub:

```powershell
npm.cmd run export:static-public
```

Lệnh xuất tạo/cập nhật `public-data/public.json` và sao chép các media công khai được nội dung tham chiếu vào `public-data/media/`. Nó không xuất tài khoản, nhật ký, phản ánh của người dân hoặc dữ liệu Workspace. Kiểm tra kết quả:

```powershell
$snapshot = Get-Content .\public-data\public.json -Raw | ConvertFrom-Json
$snapshot.articles | Select-Object title, slug, publishedAt
Get-ChildItem .\public-data\media -ErrorAction SilentlyContinue
```

Sau khi xác nhận nội dung và tệp công khai, commit/push riêng snapshot:

```powershell
git status --short
git add public-data/
git diff --cached --name-only
git commit -m "Cap nhat noi dung cong khai"
git push origin main
```

Trước khi commit, kiểm tra không có `.env`, database, credentials, uploads, backup hoặc dữ liệu cá nhân trong danh sách staged. Website chỉ cập nhật sau khi GitHub Pages triển khai xong. Hướng dẫn từ tạo repository lần đầu đến bật Pages và xử lý lỗi nằm trong [hướng dẫn GitHub Pages](docs/HUONG-DAN-UP-GITHUB-PAGES.md).

## Cấu hình và dữ liệu

Máy chủ đọc `.env` ở thư mục gốc. Các giá trị mẫu nằm trong `.env.example`.

| Biến | Mặc định | Mục đích |
|---|---|---|
| `APP_ENV` | `development` | Môi trường chạy |
| `PORT` | `8099` | Cổng HTTP |
| `HOST` | `0.0.0.0` | Địa chỉ lắng nghe |
| `DB_FILE` | `server/data/portal.sqlite` | Đường dẫn database |
| `SESSION_TTL_MINUTES` | `480` | Thời hạn phiên |
| `MAX_LOGIN_ATTEMPTS` | `5` | Số lần đăng nhập sai trước khi khóa tạm |
| `LOCK_MINUTES` | `15` | Thời gian khóa tạm |
| `COOKIE_SECURE` | `false` | Bật `true` khi triển khai qua HTTPS |
| `CORS_ORIGIN` | *(để trống)* | Origin được phép khi frontend/API khác origin |
| `SEED_PASSWORD_*` | *(để trống)* | Mật khẩu tài khoản seed nếu được cấu hình |

Không commit `.env`, database, credentials hoặc dữ liệu người dùng. Sao lưu database trước bảo trì; không sao chép riêng tệp SQLite khi server đang chạy nếu chưa dùng quy trình backup nhất quán.

## Lệnh thường dùng

| Lệnh | Tác dụng | Lưu ý |
|---|---|---|
| `npm.cmd start` | Chạy máy chủ | Giữ terminal mở |
| `npm.cmd run db:migrate` | Tạo/cập nhật schema | Không xóa nội dung |
| `npm.cmd run db:seed` | Bổ sung dữ liệu hệ thống ban đầu | Không phải công cụ reset |
| `npm.cmd run export:static-public` | Xuất snapshot PUBLIC và media | Chỉ đưa dữ liệu đã duyệt lên host tĩnh |
| `npm.cmd run check` | Kiểm tra mã hóa và quét tĩnh | Không thay thế kiểm thử runtime |
| `npm.cmd run test:isolated` | **Kiểm thử tích hợp trên database tạm** | Khuyến nghị dùng: không chạm database vận hành |
| `npm.cmd test` | Kiểm thử tích hợp API | Ghi vào database **đang cấu hình** — chỉ dùng khi chắc chắn |
| `npm.cmd run test:interconnect` | Kiểm thử luồng liên thông | Ghi dữ liệu vào database đang cấu hình |
| `npm.cmd run test:clean` | Báo cáo dữ liệu do kiểm thử để lại | Thêm `--yes` để xoá; mặc định chỉ báo cáo |
| `npm.cmd run data` | Công cụ nhập/xuất/kiểm tra dữ liệu | Xem [docs/DATABASE.md](docs/DATABASE.md) |
| `npm.cmd run db:reset` | Đặt lại database | **Thao tác phá hủy dữ liệu** |
| `node server/db/seed.js --reset --with-demo` | Tạo lại DB và nạp dữ liệu demo | **Chỉ dùng với database thử nghiệm có thể xóa** |

Không chạy các lệnh reset hoặc kiểm thử ghi dữ liệu trên môi trường production. Đọc [docs/TESTING.md](docs/TESTING.md) trước khi chạy runner; một số script có thể dừng tiến trình Node hoặc xóa database thử nghiệm.

> **Quan trọng:** `npm run test` và `npm run test:interconnect` thao tác qua HTTP tới máy chủ đang chạy, nên **dữ liệu kiểm thử sẽ nằm trong database mà máy chủ đó dùng**. Hãy dùng `npm run test:isolated` — lệnh này dựng máy chủ tạm trên cổng riêng với tệp SQLite tạm, chạy cùng bộ kiểm thử rồi xoá sạch, không ảnh hưởng dữ liệu thật.
>
> Nếu đã lỡ chạy bộ kiểm thử trên database vận hành, dùng `npm run test:clean` để xem danh sách bản ghi kiểm thử, sau đó `node server/scripts/clean-test-data.js --yes` để xoá.

## Cấu trúc dự án

```text
.
├── index.html                     Trang chủ PUBLIC
├── assets/
│   ├── icons/                     Logo và biểu tượng
│   ├── images/                    Hình ảnh giao diện
│   └── liblaw/                    Nơi lưu văn bản pháp luật đã duyệt công khai
├── css/                            CSS chung, PUBLIC, CMS, Workspace, đăng nhập
├── js/                             API client và logic các phân hệ
├── pages/
│   ├── public/                     Các trang công khai
│   ├── cms/                        Đăng nhập và giao diện CMS
│   └── workspace/                  Đăng nhập và giao diện Workspace
├── server/
│   ├── index.js                    HTTP server, API và phục vụ tệp tĩnh
│   ├── routes/                     Route auth, PUBLIC, CMS, Workspace, shared
│   ├── lib/                        Auth, bảo mật, database, HTTP, mapper
│   ├── db/                         Schema, migration, seed
│   ├── scripts/                    API tests, công cụ dữ liệu, export snapshot
│   └── data/                       Database, log và tệp runtime (không đưa lên Git)
├── scripts/                        Kiểm tra và QA giao diện
├── docs/                           Tài liệu kỹ thuật và hướng dẫn
└── public-data/                    Snapshot PUBLIC cho host tĩnh (được tạo khi export)
```

## Bảo mật và giới hạn vận hành

- Dùng HTTPS và đặt `COOKIE_SECURE=true` khi triển khai chính thức; không để cổng Node.js lộ trực tiếp nếu đã có reverse proxy.
- Thay mật khẩu khởi tạo, cấp quyền tối thiểu cần thiết, bảo vệ `.env`, database, log và bản sao lưu.
- Không đưa thông tin cá nhân, phản ánh nội bộ, nội dung nháp, database hoặc credential vào repository public.
- SQLite và rate limit trong bộ nhớ phù hợp một instance trên ổ đĩa bền vững; không dùng chung một tệp SQLite cho nhiều máy chủ ghi đồng thời.
- Upload được kiểm soát bởi chính sách tập trung tại `server/lib/upload.js`: chỉ nhận ảnh (JPG, PNG, WEBP, GIF, AVIF, BMP, ICO), tài liệu (PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, ZIP), video (MP4, WEBM, M4V, OGV) và âm thanh (MP3, WAV, OGG); **tối đa 25 MB mỗi tệp**. Tệp HTML, SVG và mọi tệp thực thi bị từ chối vì chúng được phục vụ cùng origin và có thể dẫn tới stored XSS.
- Tệp trong `uploads/` được phục vụ với `X-Content-Type-Options: nosniff`; loại không phải media (ảnh/video/âm thanh/PDF) bị ép tải xuống và sandbox bằng Content-Security-Policy.
- Upload vẫn bị giới hạn thực tế bởi dung lượng ổ đĩa, proxy và thời gian xử lý phía máy chủ.
- GitHub Pages chỉ phù hợp cho bản PUBLIC tĩnh. CMS, Workspace và các thao tác cần ghi dữ liệu phải chạy trên backend Node.js.
- Font và biểu tượng từ CDN cần kết nối Internet để tải đầy đủ.

Đây là mô tả kiến trúc và cấu hình hiện tại, không phải chứng nhận bảo mật. Cần rà soát hệ thống, quyền, cấu hình máy chủ và quy trình sao lưu trước khi đưa vào sử dụng chính thức.

## Tài liệu chi tiết

- [Kiến trúc hệ thống](docs/ARCHITECTURE.md)
- [Đặc tả API](docs/API.md)
- [Cơ sở dữ liệu, nhập/xuất và sao lưu](docs/DATABASE.md)
- [Triển khai và vận hành](docs/DEPLOYMENT.md)
- [Bảo mật](docs/SECURITY.md)
- [Kiểm thử](docs/TESTING.md)
- [Hướng dẫn sử dụng PUBLIC, CMS và Workspace](docs/USER-GUIDE.md)
- [Đăng bài CMS và cập nhật GitHub Pages từng bước](docs/HUONG-DAN-UP-GITHUB-PAGES.md)