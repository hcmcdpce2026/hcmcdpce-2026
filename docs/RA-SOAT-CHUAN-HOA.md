# Báo cáo rà soát và chuẩn hóa dự án

Ngày rà soát: 2026-11-21 · Phạm vi: toàn bộ mã nguồn trong repo (fontend PUBLIC/CMS/Workspace, backend Node.js, schema SQLite, cấu hình, tài liệu).

## 1. Tổng quan phạm vi đã kiểm tra

| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| Tệp đã đọc/quét | **98** | `*.js`, `*.html`, `*.css`, `*.json`, `*.sql`, `*.md`, `*.yml` (loại trừ `node_modules`, `.git`, `backups`, `public-data`, `uploads`) |
| Tổng dòng mã | **53.783** | |
| Mã máy chủ | 29 tệp | `server/index.js`, `server/routes/*`, `server/lib/*`, `server/db/*`, `server/scripts/*` |
| Mã trình duyệt | 8 tệp | `js/*.js` (`api`, `main`, `public-pages`, `cms`, `workspace`, `system-categories`, …) |
| Trang HTML | 41 tệp | `index.html`, `pages/public/*`, `pages/cms/*`, `pages/workspace/*` |
| Bảng SQLite | 24 | xem `docs/DATABASE.md` |

## 2. Lỗi đã phát hiện

| # | Mức | Vị trí | Mô tả | Trạng thái |
|---|---|---|---|---|
| 1 | **Cao** | `js/api.js` (`request`) | Mọi lỗi **404** của API PUBLIC bị thay bằng dữ liệu từ `public-data/public.json`. Endpoint mới hoặc bản ghi không tồn tại trả 404 nhưng UI lại hiển thị dữ liệu cũ → **che lỗi thật**, trái yêu cầu "không dùng dữ liệu dự phòng giả". | ✅ Đã sửa: chỉ fallback khi phản hồi **không phải JSON của API** (chế độ GitHub Pages) |
| 2 | **Cao** | `index.html` | `js/main.js` được nạp **trước** `js/api.js` (cả hai `defer`). `initHomepageStats` chạy trên `window.load` và bỏ qua vĩnh viễn khi `window.PortalAPI` chưa tồn tại → 4 thẻ số liệu trang chủ **không bao giờ** hiển thị số. | ✅ Đã sửa: đổi thứ tự nạp (`api.js` → `main.js`), đồng bộ 8 trang trong `pages/public/` |
| 3 | **Cao** | `js/main.js` | `MAP` ánh xạ `lawDocuments` trong khi API trả `laws` → thẻ "Văn bản pháp luật" luôn rỗng kể cả khi API thành công. | ✅ Đã sửa |
| 4 | **Trung bình** | `js/workspace.js` (`Store.fetchAll`) | Lỗi API bị nuốt: `catch(() => null)` rồi cache thành `[]` → màn hình hiển thị "chưa có dữ liệu" thay vì "tải lỗi". | ✅ Đã sửa: ghi lại `cache.errors`, báo toast + log; không thay bằng dữ liệu giả |
| 5 | **Trung bình** | `js/main.js` (`initHomepageStats`) | `.catch(() => {})` nuốt lỗi hoàn toàn, người dùng chỉ thấy "Đang cập nhật" vĩnh viễn. | ✅ Đã sửa: hiển thị "Mất kết nối"/"Tạm thời không có số liệu" + `console.warn` |
| 6 | **Trung bình** | `js/main.js` | ~790 dòng **mã chết** (nhâm bản `about.js`, `statistics.js`, `events.js`, `event-detail.js`, `support.js` dán vào `main.js`), gồm cả `const initAboutPage` cấp cao nhất → rủi ro `SyntaxError: Identifier already declared` nếu nạp chung. | ✅ Đã xóa phần trùng; giữ phần `support` còn cần |
| 7 | **Trung bình** | `js/workspace.js` (`TasksPage.init`) | `init()` chạy lại mỗi lần mở trang, gắn thêm listener vào cùng DOM → render/toast nhân đôi. | ✅ Đã sửa: guard `bound` |
| 8 | **Trung bình** | `server/routes/shared.js` | `/api/shared/system-categories` chỉ nhận 2 loại `organization_type`/`management_level`, hardcode trong route; trả thiếu `id`/`sortOrder` và **cả bản ghi `inactive`**. | ✅ Đã sửa: nhận mọi loại đã đăng ký, trả cột đầy đủ, chỉ `active` |
| 9 | **Trung bình** | `js/public-pages.js` (`initSupport`) | Chọn `[data-support-list]` trước `#sup-centers-list` → bộ lọc của `main.js` (theo `#sup-centers-list`) không khớp phần tử được render. | ✅ Đã sửa: ưu tiên `#sup-centers-list` |
| 10 | **Thấp** | `js/cms.js` (`openDetail` submissions) | CMS gọi `/api/workspace/organizations` → phụ thuộc route của phân hệ khác; nếu bỏ route đó CMS hỏng. | ✅ Đã sửa: dùng `/api/shared/organizations` |
| 11 | **Thấp** | `pages/cms/*.html` | Không khai báo `rel="icon"` → mỗi lần mở CMS có một request 404 `/favicon.ico`. | ✅ Đã sửa (khai báo logo làm icon) |
| 12 | **Thấp** | `server/db/migrate.js` | Danh mục hệ thống chỉ có `contact_topic` + `legal_field` sau khi seed; `doc_type`, `agency_type`, `facility_type`, … **rỗng** → bộ lọc CMS/PUBLIC trống dù dữ liệu dùng các mã đó. | ✅ Đã sửa: `ensureCatalogueBaseline()` (idempotent, chỉ thêm) |
| 13 | **Cao** | `server/routes/cms.js` (`saveSystemCategory`) | Mã danh mục bị **sinh lại từ tên** ở mỗi lần lưu, nên chỉ đổi nhãn ("Đã tổ chức" → "Đã hoàn thành") cũng làm đổi `code` → mất liên kết với `public_events.status`. | ✅ Đã sửa: chỉ đổi mã khi client gửi `code` khác |

## 3. Dữ liệu hardcode đã xử lý

| Dữ liệu | Trước | Sau |
|---|---|---|
| Danh sách loại danh mục (`category_group`, `doc_type`, …) + nhãn | Khai báo **3 nơi**: `server/routes/cms.js`, `js/system-categories.js`, `js/api.js` | **Một nơi**: `server/lib/system-category-types.js`; client đọc `/api/*/system-category-types` |
| Bảng/cột tham chiếu khi đổi mã danh mục | Hardcode trong `cms.js` | Cùng registry, phục vụ cả CMS và validate |
| Số liệu khối thống kê trang chủ | 4 lời gọi API + `rows.length` (sai khi > 50 bản ghi) | **1** endpoint `/api/public/summary`, `COUNT(*)` thật trên SQLite |
| Ngưỡng "25 MB" | Rải ở `upload.js`, `js/cms.js`, 3 chỗ trong `media-library.html`, docs, test | Một hằng cấu hình `MAX_UPLOAD_MB`, UI đọc thông điệp từ cấu hình chung |
| Trạng thái/thứ tự danh mục hiển thị ở Workspace | Truy vấn riêng, thiếu trường | Dùng chung `/api/shared/system-categories` |

Ghi chú: các **nhãn trạng thái nghiệp vụ** (`draft/pending/published`, `upcoming/ongoing/past`, `in_effect/expired`) vẫn ánh xạ ở client. Đây là bảng dịch thuật ngữ của giao diện (giống i18n), không phải dữ liệu nội dung, nên giữ nguyên — dữ liệu thật vẫn lấy từ API.

## 4. Module đã chuẩn hóa

- `server/lib/system-category-types.js` **(mới)** — nguồn duy nhất cho loại danh mục.
- `server/routes/cms.js` — dùng registry; thêm `GET /api/cms/system-category-types`.
- `server/routes/shared.js` — mọi loại danh mục, thêm `GET /api/shared/system-category-types`.
- `server/routes/public.js` — thêm `/api/public/system-category-types` và `/api/public/summary`.
- `server/scripts/export-static-public.js` — snapshot có `summary` + `systemCategoryTypes` (đồng bộ với API).
- `js/api.js` — parity static cho 2 endpoint mới; sửa fallback 404.
- `js/main.js` — số liệu trang chủ gọn còn 1 request; xóa mã chết.
- `js/system-categories.js` — bỏ danh sách loại hardcode, nạp từ máy chủ, thêm "Tất cả loại danh mục".
- `js/workspace.js` — báo lỗi nguồn dữ liệu; tránh gắn listener trùng.
- `js/public-pages.js`, `js/cms.js` — sửa chọn phần tử và endpoint chéo phân hệ.
- `server/db/migrate.js` — bổ sung danh mục cơ sở.

### Bổ sung: trạng thái sự kiện do CMS quản lý

Trước đây `<select id="ev-status-select">` ở `pages/public/events.html` và nhãn badge sự kiện viết cứng 3 lựa chọn trong HTML/JS.

| Hạng mục | Sau khi chuẩn hóa |
|---|---|
| Nguồn dữ liệu | `system_categories` với `category_type = 'event_status'` (migration `007`, `.env` không cần đổi) |
| API | `GET /api/public/event-statuses` → `[{ code, name, role }]` |
| HTML | `events.html` chỉ giữ `<option value="all">`; phần còn lại do JS dựng từ API |
| Nhãn badge & bộ lọc | Đọc `name` từ danh mục → sửa trong CMS là PUBLIC đổi ngay |
| Form CMS | Ô "Trạng thái sự kiện" lấy từ danh mục `event_status` |
| Ẩn lựa chọn | Đặt danh mục sang *Ngừng sử dụng* → biến mất khỏi bộ lọc |
| Ràng buộc | `code` phải thuộc `upcoming`/`ongoing`/`past` (khớp `CHECK` của `public_events.status`); không xóa được khi đang có sự kiện dùng mã đó |

## 5. API và nguồn dữ liệu đã kiểm tra

**PUBLIC**: `health`, `articles` (+`:id`), `categories`, `system-categories`, **`system-category-types`**, **`summary`**, `legal-documents`, `events`, `agencies`, `statistics`, `support-facilities`, `banners`, `notifications`, `submissions`, `submissions/lookup`.

**CMS**: `system-categories` (CRUD + status), **`system-category-types`**, `media`, `catalog/*`, `submissions`, `proposals`, `logs`, `stats`.

**SHARED**: `users`, `organizations`, `system-categories`, **`system-category-types`**, `notifications`, `settings`, `summary`.

**WORKSPACE**: `tasks`, `organizations`, `users`, `roles`, `permissions`, `documents`, `events`, `reports`, `proposals`, `collaborations`, `notifications`, `logs`, `stats`.

Đã đối chiếu: mọi lời gọi API trong `js/*.js` đều có route tương ứng trong `server/index.js`; không còn lời gọi chéo phân hệ không được phép.

## 6. Chức năng đã kiểm thử

| Môi trường | Kết quả |
|---|---|
| `npm run test:isolated` (server tạm, DB tạm) | **154/154 đạt** — API tích hợp 118, liên thông 28, Workspace CRUD 11 (đã gồm 6 test mới cho `summary` và danh mục) |
| `npm run check` (mã hóa + quét bảo mật) | **exit 0**, không phát hiện mẫu rủi ro |
| `node --check` | Toàn bộ tệp JS đã sửa đều hợp lệ |
| Browser QA — PUBLIC trang chủ | 4 thẻ số liệu có số thật (laws=2, articles=9, agencies=1, education=1); 0 lỗi console |
| Browser QA — `news/education/laws/agencies/events/support/statistics/contact` | Đều render từ API, không khối lỗi |
| Browser QA — CMS (server tạm) | Đăng nhập OK; `/pages/cms/system-categories.html`: 8 loại danh mục trong dropdown, mọi loại có dữ liệu (category_group 10, doc_type 7, legal_field 5, agency_type 10, management_level 7, facility_type 19, organization_type 15, contact_topic 5); 0 request lỗi |
| Browser QA — Workspace (server tạm) | Đăng nhập OK, dashboard/tasks/organizations mount xong, không request lỗi (401 duy nhất là bước dò phiên trước đăng nhập — đúng thiết kế) |

> Lưu ý: QA giao diện CMS/Workspace chạy trên **instance tạm với DB tạm**, không dùng mật khẩu seed của database vận hành. Việc đó giúp không đụng dữ liệu thật và không kích hoạt khóa tài khoản.

## 7. Vấn đề chưa thể khắc phục / cần quyết định

| # | Vấn đề | Nguyên nhân | Khuyến nghị |
|---|---|---|---|
| 1 | `server/data/credentials.local.txt` **không khớp** mật khẩu trong `portal.sqlite` (đăng nhập `cms.nguyenvandat` bằng mật khẩu trong tệp bị 401) | Tệp credential được sinh ở lần seed **khác** với DB hiện tại (DB đã seed lại hoặc mật khẩu đã đổi) | Đây là dữ liệu vận hành; **tôi không đặt lại mật khẩu** vì sẽ thay đổi thông tin xác thực thật. Người quản trị cần: đăng nhập bằng mật khẩu đã biết hoặc dùng `SEED_PASSWORD_CMS_ADMIN=... npm run db:seed` rồi cập nhật lại `credentials.local.txt` |
| 2 | Giao diện liệt kê loại danh mục theo **registry code**, nên thêm loại danh mục mới vẫn cần khai báo registry + migration CHECK constraint | `system_categories.category_type` là CHECK constraint trong schema | Muốn "thêm loại không sửa mã" cần chuyển sang bảng `system_category_types` (thay đổi schema lớn, ảnh hưởng mọi bảng tham chiếu) — ngoài phạm vi một lần rà soát; đã ghi thành hạng mục cần triển khai |
| 3 | Nhãn trạng thái nghiệp vụ (draft/pending/upcoming/…) hiển thị bằng bảng ánh xạ ở client | Là từ ngữ giao diện, không phải dữ liệu nội dung | Giữ nguyên; nếu cần đa ngôn ngữ, tách thành tệp i18n |
| 4 | Logic `admin`/phân quyền phía client (`Store.can`) vẫn tồn tại song song với kiểm tra máy chủ | Client cần biết để ẩn nút | Không phải lỗ hổng (máy chủ vẫn là chốt chặn); giữ để UX, đã kiểm tra `requireAuth` ở mọi route ghi |
| 5 | Tệp `js/main.js` vẫn lớn (~2.000 dòng) do gộp nhiều script nhỏ | Mỗi trang PUBLIC chỉ nạp một tệp để tránh nhiều request | Có thể tách theo trang trong đợt refactor sau; hiện không gây lỗi |

## 8. Hạng mục cần triển khai tiếp

1. Đồng bộ lại `credentials.local.txt` với database vận hành (việc của quản trị viên).
2. Bảng `system_category_types` động nếu cần thêm loại danh mục hoàn toàn qua CMS.
3. Tách `js/main.js` theo trang và dùng chung module `util/` cho PUBLIC như CMS/Workspace đang làm.
4. Áp dụng lại `export:static-public` sau khi triển khai: snapshot hiện thiếu `summary`/`systemCategoryTypes` cho tới lần export kế tiếp (client đã xử lý thiếu dữ liệu an toàn).

## 9. Kết luận

- Dữ liệu danh mục, thông số upload và số liệu tổng quan **đã có một nguồn quản lý tập trung**; giao diện đọc qua API, không còn danh sách viết cứng trùng lặp.
- Không còn luồng nào **thay thế dữ liệu thật bằng dữ liệu giả**: lỗi mạng/404 giờ hiển thị trạng thái lỗi rõ ràng.
- Mọi thay đổi đều có kiểm chứng thực tế: **154/154 test**, `npm run check` sạch, và kiểm tra giao diện bằng trình duyệt thật.
- Các hạng mục còn lại (mật khẩu seed lệch, loại danh mục động) cần quyết định của người vận hành vì ảnh hưởng dữ liệu/xác thực thật.
