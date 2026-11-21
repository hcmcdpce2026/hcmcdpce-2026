# Chuyên trang điện tử phòng, chống ma túy TP. Hồ Chí Minh

**PUBLIC · CMS · WORKSPACE · Node.js · SQLite**

Repository chứa toàn bộ cổng thông tin: giao diện công khai cho người dân, CMS dành cho cán bộ biên tập/quản trị nội dung, Workspace dành cho cán bộ phối hợp công việc và API Node.js dùng chung một cơ sở dữ liệu SQLite.

> **Trạng thái tài liệu:** mô tả mã nguồn hiện có, không phải chứng nhận bảo mật hoặc cam kết đủ điều kiện triển khai production. Cần hoàn tất cấu hình HTTPS, phân quyền, sao lưu và đánh giá dữ liệu cá nhân trước khi sử dụng chính thức.

## Mục lục

- [Phân hệ](#phân-hệ)
- [Kiến trúc tóm tắt](#kiến-trúc-tóm-tắt)
- [Yêu cầu và khởi động](#yêu-cầu-và-khởi-động)
- [Trạng thái bàn giao](#trạng-thái-bàn-giao)
- [URL và tài khoản](#url-và-tài-khoản)
- [Luồng nội dung](#luồng-nội-dung)
- [Xuất PUBLIC sang GitHub Pages](#xuất-public-sang-github-pages)
- [Cấu hình](#cấu-hình)
- [Cơ sở dữ liệu](#cơ-sở-dữ-liệu)
- [Kiểm thử](#kiểm-thử)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Bảo mật và vận hành](#bảo-mật-và-vận-hành)
- [Tài liệu chi tiết](#tài-liệu-chi-tiết)

## Phân hệ

| Phân hệ | Người dùng | Chức năng chính |
|---|---|---|
| PUBLIC | Người dân, khách truy cập | Tin tức, tuyên truyền - giáo dục, pháp luật, thống kê, cơ quan - đơn vị, sự kiện, hỗ trợ, gửi phản ánh và tra cứu mã tiếp nhận |
| CMS | Cán bộ nội dung, biên tập, kiểm duyệt | Bài viết, chuyên mục, danh mục công khai, media, quy trình xuất bản, phản ánh, đề xuất và nhật ký |
| WORKSPACE | Cán bộ/đơn vị tham gia phối hợp | Nhiệm vụ, mục công việc, bình luận, báo cáo, lịch, tài liệu, tổ chức, người dùng, vai trò và thông báo |
| API | Frontend và công cụ vận hành | Xác thực, phiên, CSRF, phân quyền, CRUD nghiệp vụ, truy vấn PUBLIC và xuất snapshot tĩnh |

Không có `npm install` bắt buộc cho ứng dụng hiện tại vì `package.json` không khai báo dependency bên ngoài. Mã frontend là HTML/CSS/JavaScript thuần; backend chạy bằng Node.js HTTP module và `node:sqlite`.

## Kiến trúc tóm tắt

```text
Trình duyệt
  ├── index.html và pages/public/*
  ├── pages/cms/*
  └── pages/workspace/*
           │ HTTP/JSON, cookie hoặc Bearer, CSRF
           ▼
server/index.js
  ├── routes/auth.js
  ├── routes/public.js
  ├── routes/cms.js
  ├── routes/workspace.js
  └── routes/shared.js
           │ prepared statements
           ▼
server/data/portal.sqlite
```

Frontend và API được phục vụ cùng origin trên cổng mặc định `8099`. Chỉ server mới quyết định quyền truy cập; việc giao diện ẩn nút không thay thế kiểm tra quyền, phân hệ và trạng thái nghiệp vụ ở backend.

## Yêu cầu và khởi động

Yêu cầu:

- Node.js **22.5.0 trở lên**;
- Git for Windows nếu cần commit/push;
- trình duyệt hiện đại;
- quyền ghi thư mục `server/data` và thư mục chứa `uploads`.

Kiểm tra:

```powershell
node --version
npm.cmd --version
git --version
```

Khởi tạo lần đầu hoặc tạo lại schema:

```powershell
Copy-Item .env.example .env  # không chạy nếu đã có .env
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

Trong khi server chạy, truy cập:

| Phân hệ | URL |
|---|---|
| PUBLIC | <http://localhost:8099/> |
| CMS | <http://localhost:8099/pages/cms/login.html> |
| WORKSPACE | <http://localhost:8099/pages/workspace/login.html> |
| Health check | <http://localhost:8099/api/public/health> |

Giữ terminal server đang mở. `npm.cmd dev` hiện là alias tương đương `node server/index.js`.

## Trạng thái bàn giao

Theo lần kiểm tra ngày 2026-11-21, database vận hành đã được sao lưu và bản sao đã qua restore drill cô lập; không có dữ liệu test/demo đủ căn cứ để xóa. Snapshot GitHub Pages `public-data/public.json` hiện thiếu và môi trường production chưa được xác minh. Xem [`docs/HANDOVER.md`](docs/HANDOVER.md) trước khi phát hành.

## URL và tài khoản

Tài khoản seed được tạo theo phân hệ `cms` hoặc `workspace`. Khi chạy `db:seed` CLI, tài khoản mới có thể được ghi vào `server/data/credentials.local.txt`. Không commit, chụp màn hình công khai hoặc gửi tệp qua kênh không an toàn.

Tài khoản seed CMS và Workspace chỉ sử dụng tại đúng hệ thống:

- `/api/cms/*` và `/pages/cms/*` yêu cầu phiên CMS;
- `/api/workspace/*` và `/pages/workspace/*` yêu cầu phiên Workspace;
- `/api/shared/*` yêu cầu phiên hợp lệ của một trong hai phân hệ.

Đăng xuất trên máy dùng chung, đổi mật khẩu khởi tạo theo quy trình vận hành và xóa tệp credential sau khi đã bàn giao.

## Luồng nội dung

### PUBLIC → CMS → WORKSPACE

```text
Người dân gửi yêu cầu
  → lưu submissions
  → CMS tiếp nhận, phân loại, phản hồi
  → CMS chuyển thành task
  → Workspace xử lý và cập nhật kết quả
  → CMS phê duyệt phản hồi công khai nếu đủ điều kiện
```

### WORKSPACE → CMS → PUBLIC

```text
Workspace tạo đề xuất
  → CMS xem xét
  → CMS tạo/cập nhật bài viết hoặc yêu cầu sửa
  → CMS xuất bản
  → PUBLIC chỉ nhận bài trạng thái published
```

Bài viết yêu cầu:

- tiêu đề tối thiểu 10 ký tự;
- mô tả bắt buộc khi gửi duyệt/xuất bản;
- nội dung tối thiểu 40 ký tự khi gửi duyệt/xuất bản;
- chuyên mục hợp lệ để xác định nhóm PUBLIC.

## Xuất PUBLIC sang GitHub Pages

GitHub Pages chỉ chạy mã tĩnh. Nó không chạy Node.js, SQLite, CMS, Workspace hoặc API ghi dữ liệu.

Sau khi đăng nhập CMS, lưu và xuất bản nội dung, chạy:

```powershell
npm.cmd run export:static-public
```

Lệnh ghi/cập nhật:

- `public-data/public.json`;
- `public-data/media/*` cho media công khai còn tồn tại trong `uploads`.

Exporter chỉ lấy bài `published`, danh mục hoạt động và danh mục công khai được phép. Nó không xuất tài khoản, phiên, nhật ký, submission cá nhân hoặc dữ liệu Workspace. Lệnh export tự kiểm tra snapshot và mọi media được tham chiếu; sau `git add public-data/`, chạy `npm.cmd run check:static-public:git` để xác nhận chúng nằm trong Git index. GitHub Actions sẽ báo lỗi nếu snapshot hoặc media được tham chiếu chưa có trong commit.

Kiểm tra trước khi commit:

```powershell
git status --short
git diff --stat
git add public-data/
npm.cmd run check:static-public:git
git diff --cached --stat
git diff --cached --name-only
git commit -m "Cap nhat noi dung cong khai"
git push origin main
```

Chỉ commit snapshot và media. Dừng commit nếu danh sách staged chứa `.env`, `.sqlite`, credential, `uploads`, `backups`, thông tin cá nhân hoặc nội dung chưa phê duyệt. Hướng dẫn chi tiết: [docs/PUBLIC-PUBLISHING.md](docs/PUBLIC-PUBLISHING.md).

## Cấu hình

Đọc đầy đủ `.env.example`. Các biến chính:

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `APP_ENV` | `development` | Bật cảnh báo/configuration production |
| `PORT` | `8099` | Cổng HTTP |
| `HOST` | `0.0.0.0` | Địa chỉ lắng nghe |
| `DB_FILE` | `server/data/portal.sqlite` | Đường dẫn SQLite |
| `SESSION_TTL_MINUTES` | `480` | Tuổi thọ phiên, phút |
| `MAX_LOGIN_ATTEMPTS` | `5` | Số lần đăng nhập sai |
| `LOCK_MINUTES` | `15` | Thời gian khóa tạm |
| `COOKIE_SECURE` | `false` | Bật `true` sau HTTPS |
| `CORS_ORIGIN` | trống | Origin cho API cross-origin |
| `SEED_PASSWORD_CMS_ADMIN` | trống | Mật khẩu seed CMS |
| `SEED_PASSWORD_WS_ADMIN` | trống | Mật khẩu seed Workspace |
| `RATE_LIMIT_DISABLED` | `false` | Chỉ dùng cho kiểm thử |
| `MAX_UPLOAD_MB` | `200` | Giới hạn dung lượng mỗi tệp tải lên (MB); `0` = không giới hạn |

Không commit `.env`. Trong production bật HTTPS và đặt `HOST=127.0.0.1` nếu reverse proxy là điểm truy cập duy nhất.

## Cơ sở dữ liệu

Database mặc định là `server/data/portal.sqlite`, chạy trên SQLite/WAL qua `node:sqlite`.

Nhóm bảng chính:

- tài khoản, vai trò, quyền, phiên, lịch sử đăng nhập;
- chuyên mục, bài viết, phiên bản bài, media, banner;
- văn bản, cơ quan, sự kiện, thống kê, cơ sở hỗ trợ;
- submissions, tasks, tài liệu, báo cáo, đề xuất, phối hợp;
- thông báo và activity logs.

Lệnh dữ liệu:

| Lệnh | Tác dụng |
|---|---|
| `npm.cmd run db:migrate` | Tạo/cập nhật schema |
| `npm.cmd run db:seed` | Bổ sung tài khoản/quyền/cấu hình |
| `npm.cmd run db:reset` | **Xóa và tạo lại database** |
| `npm.cmd run data` | Export/import thống kê dữ liệu |
| `npm.cmd run export:static-public` | Xuất snapshot PUBLIC |

Không dùng `db:reset` trên dữ liệu vận hành. Tài liệu chi tiết: [docs/DATABASE.md](docs/DATABASE.md).

## Kiểm thử

Lệnh an toàn và khuyến nghị:

```powershell
npm.cmd run test:isolated
npm.cmd run check
npm.cmd run test:content-types
```

`test:isolated` tạo máy chủ tạm ở cổng `8123`, database tạm và tự xóa sau khi chạy.

Các runner khác có thể ghi dữ liệu hoặc dừng server:

```text
npm test
npm run test:interconnect
npm run test:workspace
npm run test:security
```

Chỉ chạy trên database thử nghiệm và đọc [docs/TESTING.md](docs/TESTING.md) trước.

## Cấu trúc thư mục

```text
.
├── index.html                 Trang PUBLIC
├── pages/public/              Trang công khai
├── pages/cms/                 Giao diện CMS
├── pages/workspace/           Giao diện Workspace
├── css/                       Style theo phân hệ
├── js/                        API client và logic trình duyệt
├── server/
│   ├── index.js               Routing, HTTP và security headers
│   ├── routes/                Handler theo phân hệ
│   ├── lib/                   Auth, DB, upload, HTTP, security
│   ├── db/                    Schema, migration, seed
│   └── scripts/               Kiểm thử và công cụ dữ liệu
├── scripts/                   QA/static scan
├── public-data/               Snapshot PUBLIC cho GitHub Pages
├── docs/                      Tài liệu vận hành/kỹ thuật
├── uploads/                   Tệp runtime (không commit)
└── backups/                   Bản sao runtime (không commit)
```

## Bảo mật và vận hành

- Chạy HTTPS; dùng `COOKIE_SECURE=true`.
- Giới hạn Node chỉ qua reverse proxy tin cậy khi có thể.
- Không commit `.env`, SQLite, credential, log, backup và `uploads`.
- Upload bị giới hạn 200 MB/tệp (đổi bằng `MAX_UPLOAD_MB`) và danh sách định dạng; HTML/SVG/executable bị từ chối.
- Session, password và CSRF được xử lý ở backend.
- SQLite và rate limit trong bộ nhớ phù hợp một instance; không ghép nhiều instance ghi cùng database.
- Bản sao SQLite phải nhất quán; không sao chép riêng `.sqlite` khi WAL đang hoạt động.
- Dọn dữ liệu cá nhân theo chính sách của đơn vị.

Xem [docs/SECURITY.md](docs/SECURITY.md) và [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tài liệu chi tiết

- [Kiến trúc](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Cơ sở dữ liệu](docs/DATABASE.md)
- [Từ điển dữ liệu](docs/DATA_DICTIONARY.md)
- [Triển khai](docs/DEPLOYMENT.md)
- [Bảo mật](docs/SECURITY.md)
- [Kiểm thử](docs/TESTING.md)
- [Hướng dẫn PUBLIC tĩnh](docs/PUBLIC-PUBLISHING.md)
- [Báo cáo bàn giao](docs/HANDOVER.md)
- [Hướng dẫn người dùng](docs/USER-GUIDE.md)
