# Hướng dẫn sử dụng

Tài liệu dùng cho người dân, cán bộ CMS và cán bộ Workspace. Chức năng hiển thị phụ thuộc quyền tài khoản.

PUBLIC trên GitHub Pages chỉ đọc snapshot tĩnh; CMS, Workspace, đăng nhập và gửi phản ánh cần backend đang hoạt động. Không gửi mật khẩu, cookie phiên, CSRF token hoặc dữ liệu cá nhân qua kênh hỗ trợ chưa được phê duyệt.

## 1. Người dân - PUBLIC

### Tìm tin tức và tài liệu

1. Mở trang chủ do đơn vị cung cấp.
2. Chọn Tin tức, Tuyên truyền - Giáo dục, Pháp luật, Sự kiện, Cơ quan - Đơn vị, Thống kê hoặc Hỗ trợ.
3. Dùng search/bộ lọc của trang.
4. Mở mục cần xem để xem chi tiết.

Nếu trang trống, có thể chưa có nội dung nhập hoặc chưa có bài được xuất bản.

### Gửi phản ánh

1. Mở trang Liên hệ.
2. Chọn loại biểu mẫu phù hợp.
3. Nhập tiêu đề và nội dung ít nhất 10 ký tự.
4. Ghi họ tên/email/điện thoại nếu không gửi ẩn danh.
5. Đọc và xác nhận consent xử lý dữ liệu.
6. Gửi và lưu mã tiếp nhận.

Không gửi lặp cùng nội dung. Hệ thống có thể nhận diện trùng và trả lại mã đã cấp.

### Tra cứu yêu cầu

1. Mở phần tra cứu trên trang Liên hệ.
2. Nhập mã tiếp nhận.
3. Nếu hồ sơ yêu cầu xác minh, nhập đúng email hoặc số điện thoại đã dùng.
4. Xem trạng thái và phản hồi công khai.

Giữ mã tiếp nhận kín. Không gửi thông tin cá nhân cho kênh không xác thực.

## 2. Cán bộ CMS

### Đăng nhập

Mở:

```text
/pages/cms/login.html
```

Dùng tài khoản CMS, không dùng tài khoản Workspace. Đăng xuất sau khi dùng xong trên máy chung.

### Tạo bài

1. Mở Quản lý nội dung.
2. Chọn Tạo bài viết.
3. Nhập tiêu đề tối thiểu 10 ký tự.
4. Chọn chuyên mục đang hoạt động.
5. Kiểm tra slug: chữ thường, số, dấu gạch nối và không trùng.
6. Nhập mô tả ngắn.
7. Nhập nội dung ít nhất 40 ký tự nếu gửi duyệt/xuất bản.
8. Chọn ảnh/media được phép công khai.
9. Lưu nháp.

### Quy trình xuất bản

Trạng thái thường gặp:

```text
draft -> submitted -> approved -> published
             |             |
             -> revision   -> rejected
```

Người có quyền `submit` gửi duyệt. Người có quyền review kiểm tra và từ chối/yêu cầu sửa/approve. Người có quyền publish xuất bản.

Chỉ bài `published` xuất hiện PUBLIC local/API hoặc snapshot tĩnh.

### Chọn và xóa nhiều mục

- **Chuyên mục bài viết:** chọn tất cả chuyên mục đang hiển thị theo bộ lọc hoặc chọn từng mục. Máy chủ giữ lại chuyên mục còn bài viết hoặc chuyên mục con; hãy xử lý các mục con trước.
- **Danh mục hệ thống:** chọn các mục đang hiển thị theo loại/trạng thái/từ khóa. Danh mục còn được dữ liệu khác sử dụng sẽ không bị xóa; hãy chuyển sang trạng thái ngừng sử dụng nếu cần.
- **Thư viện tài nguyên:** chọn các tệp trên trang hiện tại rồi xóa. Tệp đang được bài viết dùng làm ảnh đại diện hoặc nhúng trong nội dung sẽ được giữ lại.
- **Nội dung công khai:** chọn các bản ghi đang hiển thị trong nhóm hiện tại. Khi xóa kỳ số liệu, toàn bộ chỉ số thuộc kỳ đó cũng bị xóa.

Các thao tác đều yêu cầu xác nhận; nếu một số mục bị máy chủ từ chối, giao diện báo kết quả từng phần.

### Tiếp nhận submission

1. Mở danh sách phản ánh.
2. Xem nội dung, người gửi và dòng thời gian.
3. Phân loại/mức độ ưu tiên nếu có quyền.
4. Giao đơn vị hoặc chuyển thành nhiệm vụ Workspace.
5. Cập nhật tiến độ và phản hồi nội bộ.
6. Chỉ công khai phản hồi đã được duyệt.

Không xem dữ liệu cá nhân ngoài phạm vi công việc.

### Danh mục PUBLIC

Có thể quản lý:

- văn bản pháp luật;
- cơ quan/đơn vị;
- sự kiện;
- thống kê;
- cơ sở hỗ trợ;
- chuyên mục và danh mục hệ thống.

Chỉ công bố nội dung đã xác minh.

### Đề xuất từ Workspace

CMS xem xét đề xuất:

- duyệt;
- yêu cầu sửa;
- từ chối;
- xuất bản thành bài.

Đề xuất chưa xuất bản không hiển thị PUBLIC.

## 3. Cán bộ Workspace

### Đăng nhập

Mở:

```text
/pages/workspace/login.html
```

Tài khoản CMS không truy cập Workspace trừ khi có tài khoản riêng thuộc hệ thống đó.

### Cơ quan, đơn vị

Trong danh sách cơ quan, đơn vị, có thể chọn từng mục hoặc chọn tất cả trên trang hiện tại rồi xóa hàng loạt. Đơn vị còn người dùng hoặc đơn vị trực thuộc sẽ được máy chủ từ chối xóa; kết quả từng phần được thông báo sau thao tác.

### Nhiệm vụ

1. Mở danh sách nhiệm vụ.
2. Chọn task được giao.
3. Xem mô tả, deadline, đơn vị và tài liệu.
4. Cập nhật tiến độ/mục công việc/bình luận.
5. Gửi kết quả để duyệt.
6. Khi có yêu cầu sửa, cập nhật và gửi lại.

Quyền phụ thuộc vai trò, đơn vị và trạng thái task.

### Báo cáo

1. Tạo/cập nhật báo cáo.
2. Lưu nháp.
3. Gửi duyệt.
4. Người duyệt phê duyệt/từ chối/yêu cầu sửa.
5. Chỉ công khai tóm tắt nếu đủ điều kiện.

### Lịch công tác

- xem lịch theo trang;
- tạo/cập nhật/hủy sự kiện nếu có quyền;
- kiểm tra trùng lịch, địa điểm, người tham gia và tài liệu.

### Tài liệu

- xem tài liệu trong scope;
- phân loại trạng thái/truy cập;
- lưu phiên bản;
- không chia sẻ tài liệu nội bộ ra công khai.

### Đề xuất nội dung

1. Tạo đề xuất Workspace.
2. Gửi CMS review.
3. Theo dõi review_note.
4. Chỉnh sửa và gửi lại khi cần.

### Quản trị

Chỉ tài khoản quản trị mới quản lý:

- người dùng;
- đơn vị;
- vai trò;
- reset mật khẩu;
- phân quyền.

Cấp quyền tối thiểu cần thiết. Không dùng chung tài khoản.

## 4. Mật khẩu

Mật khẩu mới cần:

- tối thiểu 10 ký tự;
- chữ hoa;
- chữ thường;
- số;
- ký tự đặc biệt;
- khác mật khẩu hiện tại.

Không gửi mật khẩu qua email không an toàn hoặc qua ticket hỗ trợ.

## 5. Sự cố

| Tình huống | Cách xử lý |
|---|---|
| Không mở trang | Kiểm tra URL, server/health và mạng |
| Đăng nhập thất bại | Kiểm tra phân hệ, username và trạng thái khóa |
| Phiên hết hạn | Lưu công việc và đăng nhập lại |
| Không thấy dữ liệu | Kiểm tra bộ lọc, quyền và trạng thái xuất bản |
| Thiếu quyền | Liên hệ quản trị kiểm tra role/scope |
| Request lỗi CSRF | Tải lại trang/đăng nhập lại |
| Mất mã tiếp nhận | Liên hệ kênh chính thức; xác minh thông tin cá nhân |
| Tải media lỗi | Kiểm tra tệp tồn tại, định dạng và dung lượng |

Khi gửi hỗ trợ, không cung cấp mật khẩu, session cookie, CSRF token, database hoặc thông tin cá nhân không cần thiết.
