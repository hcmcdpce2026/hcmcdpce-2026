# Báo cáo bàn giao

**Trạng thái: chưa hoàn tất điều kiện bàn giao production.** Báo cáo ghi nhận mã nguồn và database local được kiểm tra; không phải chứng nhận bảo mật hay xác nhận đã triển khai production.

## Tóm tắt công việc đã hoàn tất

- Chuẩn hóa luồng API PUBLIC, xử lý lỗi thay vì hiển thị fallback dữ liệu cũ, tính KPI từ database và dùng chung registry danh mục.
- Sửa các liên kết giữa PUBLIC/CMS/Workspace, xử lý lỗi tải Workspace, bổ sung trạng thái sự kiện từ danh mục.
- Tự động sinh thứ tự hiển thị ở CMS/Workspace; thẻ bài viết được gợi ý từ tiêu đề/nội dung nhưng vẫn cho phép chỉnh tay.
- Kiểm tra API, nhóm loại nội dung, empty database, seed khi khởi động và backup restore trên bản sao cô lập; loại bỏ ba runner PowerShell cũ có thể dừng mọi tiến trình Node hoặc xóa dữ liệu.

## Phạm vi và xử lý dữ liệu

- Đối chiếu tài liệu kiến trúc, API, database, triển khai, bảo mật, kiểm thử và chuẩn hóa hiện có.
- Kiểm kê database SQLite; chạy dry-run dọn dữ liệu test/demo.
- Tạo và xác minh backup SQLite trước khi xem xét dọn dữ liệu.
- Trong bước bàn giao này không reset, purge, seed hoặc sửa database vận hành.
- Không commit hoặc push. Các thay đổi đang có trong worktree được giữ nguyên để rà soát.

### Kết quả dọn dữ liệu

Dry-run không tìm thấy bản ghi nào thỏa quy tắc nhận diện test/demo. Một lần quét riêng không tìm thấy marker văn bản `demo`, `test-` hoặc `kiểm thử`; dry-run purge nội dung cũng có **0** dòng `data_source='demo'`.

Không xem bản ghi có `data_source='seed'` là dữ liệu có thể xóa. Một số bản ghi là vai trò/tài khoản hệ thống; một số bản ghi nội dung có thể là dữ liệu nghiệp vụ. Chưa đủ căn cứ xác minh nguồn nên giữ nguyên. Không xóa dòng database hay media đã tải lên.

## Backup và kiểm kê database

Backup được tạo trước khi xem xét dọn:

```text
backups/portal-pre-handover-20261121T052502Z.sqlite
SHA-256: 021134b91ae16efa48d4e0d9187e5acd71db8291449f3e20604b1d8e0205f58e
```

Backup đạt SQLite integrity check. Có 37 bảng và 791 dòng; số dòng từng bảng khớp database nguồn. Đã khôi phục bản sao vào database tạm riêng, khởi động server, xác nhận health/API summary và đối chiếu số dòng: **37 bảng, 791 dòng, không sai khác, integrity=ok**. Database nguồn và backup không bị sửa. `backups/` được Git ignore. Chưa diễn tập phục hồi trên môi trường production.

Tại thời điểm kiểm kê, database có nội dung vận hành gồm 10 bài viết, 39 danh mục, 15 bản ghi media, 21 tổ chức và 2 kỳ thống kê. Database còn có dữ liệu gắn nhãn `seed`; các bản ghi đó được giữ do chưa xác minh được nguồn.

## Bằng chứng chạy thực tế

| Kiểm tra | Kết quả |
|---|---|
| Server/API với SQLite tạm mới tạo | **Đạt.** Tám danh sách PUBLIC trả 0 bản ghi; các số `articles`, `laws`, `agencies`, `educationTopics` của summary đều bằng 0. Kiểm tra trực tiếp database xác nhận khởi động không tạo nội dung nghiệp vụ cho articles, categories, public events, agencies, statistics, support facilities, tasks, reports, submissions hoặc proposals. |
| Dry-run dọn dữ liệu test/demo | **Không có bản ghi đủ điều kiện; không xóa.** |
| Dry-run `data_source='demo'` | **0 dòng đủ điều kiện.** |
| `npm.cmd run check:static-public` | **Không đạt do thiếu snapshot:** `public-data/public.json` chưa tồn tại. Theo lựa chọn bàn giao, giữ snapshot thiếu; không export database vận hành, không commit/push dữ liệu này. |
| Kiểm tra tĩnh trong bước bàn giao | `npm.cmd run check` **đạt**; kiểm tra mã hóa 86 tệp và quét mẫu rủi ro 110 tệp, không có mẫu mức cao. Đây không phải quét secret trên toàn bộ Git history. |
| Kiểm thử gợi ý thẻ bài viết | `npm.cmd run test:article-tags` **đạt**, xác minh 4 thẻ. |
| Kiểm thử API và content type | Trong lần bàn giao, `npm.cmd run test:isolated` và `npm.cmd run test:content-types` đều **exit 0**. Output được ẩn để tránh lộ credential seed; lần chạy trước ghi nhận lần lượt 121/121 và 31/31. Không phải kiểm chứng triển khai production. |
| Diễn tập restore | **Đạt trên bản sao tạm:** mở được server, health HTTP 200, summary hợp lệ, số dòng giữ nguyên, integrity `ok`. |
| Quét nội dung bí mật trên toàn bộ Git history | **Chưa thực hiện.** Kiểm tra tên tệp trong history tìm thấy `.env.example` là tên nhạy cảm duy nhất; kiểm tra tên tệp không tương đương quét nội dung commit để tìm secret. |

## Trạng thái repository

- Nhánh hiện tại: `main`; có remote-tracking branch `origin/main`.
- Có 19 tệp đã sửa/chưa theo dõi từ hai phần việc trước (gồm mã, test và `docs/API.md`), cùng các tài liệu bổ sung trong bước bàn giao này. Các thay đổi được giữ nguyên, chưa commit.
- `package.json` không khai báo dependency npm runtime bên ngoài và không có bước build production.
- Snapshot PUBLIC hiện chưa thể kiểm tra hoặc phát hành vì thiếu tệp JSON.
- Thống kê dòng gồm tệp Git đang theo dõi và tệp mới chưa bị ignore; loại trừ `.git`, `node_modules`, database, credential, `.env`, backup, upload và media nhị phân: 11 Markdown / 2.631 dòng; 98 tệp mã/cấu hình / 59.445 dòng; tổng 109 tệp / 62.076 dòng.

## Việc còn phải xử lý

1. **PUBLIC tĩnh:** chỉ export snapshot từ nguồn dữ liệu được duyệt; kiểm tra nội dung và media trước khi public. Hiện chưa thể xác nhận GitHub Pages.
2. **Credential:** ở lần rà soát trước, tệp credential local không khớp database vận hành. Lần bàn giao này không đọc, in, reset hoặc thay credential. Quản trị viên được ủy quyền cần xử lý qua quy trình khôi phục tài khoản.
3. **Production:** kiểm tra HTTPS, cookie Secure, proxy trust, quyền service, biến môi trường, giám sát, retention và khả năng phục hồi trên môi trường triển khai thật.
4. **Secret trong Git history:** chạy công cụ quét nội dung được phê duyệt trên toàn bộ history; nếu phát hiện thì thu hồi/đổi secret tương ứng.
5. **Rà soát thay đổi:** review worktree chưa commit trước phát hành; lần này không commit hoặc push.
6. **Nguồn dữ liệu seed:** xác minh bản ghi nội dung mang nhãn `seed` trước mọi lần dọn sau này.

## Tài liệu bàn giao

- Luồng và kiến trúc: `ARCHITECTURE.md`
- Trường, kiểu, khóa và constraint: `DATA_DICTIONARY.md`
- Checklist triển khai: `DEPLOYMENT.md`
- Hướng dẫn chi tiết: `API.md`, `DATABASE.md`, `SECURITY.md`, `TESTING.md`, `USER-GUIDE.md`, `PUBLIC-PUBLISHING.md`
