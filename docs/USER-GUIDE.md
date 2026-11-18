# Hướng dẫn sử dụng

Hướng dẫn này dành cho người dân, cán bộ CMS và cán bộ Workspace. Các nút/thao tác có thể khác theo quyền của tài khoản; nếu một chức năng không xuất hiện hoặc bị từ chối, liên hệ quản trị hệ thống.

## Người dân — PUBLIC

### Tra cứu thông tin

1. Mở địa chỉ cổng thông tin do đơn vị vận hành cung cấp.
2. Dùng thanh điều hướng để mở Tin tức, Tuyên truyền - Giáo dục, Pháp luật, Thống kê, Cơ quan - Đơn vị, Hoạt động - Sự kiện hoặc Hỗ trợ.
3. Dùng tìm kiếm/bộ lọc nếu trang có hỗ trợ; chọn một mục để xem chi tiết.

Nếu trang hiển thị thông báo chưa có nội dung, điều đó thường có nghĩa chưa có dữ liệu được nhập hoặc xuất bản, không nhất thiết là lỗi tải trang.

### Gửi phản ánh hoặc yêu cầu

1. Mở trang Liên hệ và chọn loại nội dung phù hợp.
2. Nhập nội dung rõ ràng; cung cấp thông tin liên hệ nếu cần nhận phản hồi.
3. Chỉ chọn ẩn danh khi phù hợp. Đọc thông báo về xử lý dữ liệu cá nhân và xác nhận đồng ý trước khi gửi.
4. Gửi biểu mẫu và lưu lại mã tiếp nhận hiển thị sau khi gửi.

Không gửi nhiều lần cùng một nội dung liên tiếp. Hệ thống có thể nhận diện yêu cầu trùng và trả về mã đã cấp.

### Tra cứu kết quả

1. Mở phần tra cứu trạng thái hồ sơ trên trang Liên hệ.
2. Nhập mã tiếp nhận.
3. Nhập email hoặc số điện thoại đã dùng khi gửi nếu hồ sơ yêu cầu xác minh.
4. Xem trạng thái, dòng thời gian và phản hồi nếu cơ quan đã cho phép công khai.

Giữ kín mã tiếp nhận và thông tin liên hệ. Kết quả nội bộ không được hiển thị công khai.

## Cán bộ CMS

### Đăng nhập và phiên làm việc

Mở `/pages/cms/login.html`, dùng tài khoản CMS được cấp và không chia sẻ phiên đăng nhập. Đăng xuất khi dùng xong, đặc biệt trên máy dùng chung. Nếu quên mật khẩu hoặc tài khoản bị khóa, liên hệ quản trị CMS theo quy trình của đơn vị.

### Soạn và xuất bản bài viết

1. Mở danh sách nội dung hoặc trình biên tập.
2. Tạo bài, nhập tiêu đề/nội dung, chọn chuyên mục và các trường cần thiết.
3. Lưu nháp để tiếp tục chỉnh sửa hoặc gửi duyệt nếu đã sẵn sàng.
4. Người có quyền kiểm duyệt xem nội dung và có thể duyệt, yêu cầu chỉnh sửa hoặc từ chối.
5. Người có quyền xuất bản phát hành nội dung; chỉ bài đã xuất bản được hiển thị trên PUBLIC.
6. Nếu cần gỡ nội dung công khai, dùng thao tác thu hồi theo quyền. Xóa bài đang công khai có thể bị từ chối cho đến khi thu hồi.

Các trạng thái nội dung thường gặp gồm nháp, chờ duyệt, đã duyệt, đã xuất bản, cần chỉnh sửa, từ chối và lưu trữ. Không bỏ qua bước kiểm duyệt nếu quy trình của đơn vị yêu cầu.

### Tiếp nhận yêu cầu PUBLIC

1. Mở khu vực tiếp nhận và chọn hồ sơ.
2. Đọc nội dung và dòng thời gian; phân công đơn vị/mức độ ưu tiên nếu có quyền.
3. Có thể chuyển yêu cầu thành nhiệm vụ Workspace để xử lý nghiệp vụ.
4. Cập nhật tiến độ xử lý và phản hồi nội bộ.
5. Chỉ nhập phản hồi công khai và bật công khai kết quả khi đã được phê duyệt.

Thông tin cá nhân của người gửi chỉ được xem/sử dụng cho mục đích xử lý được giao.

### Đề xuất và danh mục

CMS xem xét đề xuất từ Workspace tại khu vực quy trình. Có thể chấp thuận, yêu cầu bổ sung, từ chối hoặc xuất bản theo quyền. Nội dung đề xuất chưa được CMS xuất bản không xuất hiện trên PUBLIC.

Danh mục văn bản, cơ quan, sự kiện, thống kê và cơ sở hỗ trợ được quản lý bởi người dùng có quyền phù hợp. Chỉ công khai số liệu/nội dung đã được đơn vị xác minh.

## Cán bộ Workspace

### Đăng nhập

Mở `/pages/workspace/login.html`, dùng tài khoản Workspace do đơn vị cấp. Tài khoản CMS không dùng được tại Workspace.

### Nhiệm vụ

1. Mở danh sách nhiệm vụ và chọn nhiệm vụ được giao.
2. Đọc mô tả, hạn xử lý, đơn vị, người phối hợp và tài liệu liên quan.
3. Cập nhật tiến độ/ghi chú; nội dung cập nhật được lưu vào lịch sử.
4. Khi hoàn tất, gửi kết quả để người có quyền xem xét.
5. Nếu được yêu cầu bổ sung, cập nhật kết quả rồi gửi lại.

Quyền cập nhật phụ thuộc vai trò, phạm vi dữ liệu và việc người dùng có được giao nhiệm vụ hay không.

### Báo cáo, lịch và tài liệu

- **Báo cáo:** tạo hoặc cập nhật báo cáo, lưu bản nháp, gửi duyệt; chỉ người có quyền mới duyệt và công khai tóm tắt.
- **Lịch công tác:** xem lịch và tạo/cập nhật/hủy sự kiện nếu có quyền.
- **Tài liệu:** xem tài liệu trong phạm vi được phép; phân loại truy cập trước khi lưu. Thao tác xóa có thể là lưu trữ thay vì xóa vật lý.
- **Đề xuất nội dung:** gửi nội dung cho CMS, theo dõi phản hồi và cập nhật khi được yêu cầu.
- **Thông báo:** đọc thông báo công việc; đánh dấu đã đọc theo chức năng trên giao diện.

### Quản lý người dùng và quyền

Chỉ người có quyền quản trị mới tạo/cập nhật tài khoản, đặt lại mật khẩu, quản lý đơn vị/vai trò. Cấp quyền theo nhiệm vụ tối thiểu cần thiết; không dùng chung tài khoản.

Tài khoản mới hoặc được đặt lại mật khẩu có thể phải đổi mật khẩu khi đăng nhập. Mật khẩu mới cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.

## Xử lý sự cố thường gặp

| Tình huống | Cách xử lý |
|---|---|
| Không mở được trang | Kiểm tra địa chỉ và thông báo bộ phận vận hành xác nhận server hoạt động |
| Đăng nhập thất bại | Kiểm tra đúng khu vực CMS/Workspace, tên tài khoản và trạng thái tài khoản; liên hệ quản trị nếu bị khóa |
| Phiên hết hạn | Đăng nhập lại; lưu công việc trước khi rời trang |
| Không thấy dữ liệu | Kiểm tra bộ lọc, phân quyền và trạng thái xuất bản; dữ liệu trống có thể là trạng thái khởi tạo bình thường |
| Không tải được dữ liệu | Thử tải lại; nếu tiếp tục, gửi URL và thời điểm lỗi cho bộ phận hỗ trợ, không gửi mật khẩu/token |
| Thao tác bị từ chối | Kiểm tra vai trò/phạm vi quyền hoặc liên hệ quản trị |
| Mất mã tiếp nhận | Liên hệ đầu mối xử lý qua kênh chính thức; không công khai thông tin cá nhân |

## Nguyên tắc sử dụng

- Chỉ nhập nội dung và số liệu đã được phép xử lý/công khai.
- Không đưa mật khẩu, token, dữ liệu cá nhân hoặc nội dung nhạy cảm vào ảnh chụp màn hình/log gửi hỗ trợ.
- Kiểm tra người nhận và phạm vi công khai trước khi xuất bản, gửi phản hồi hoặc chia sẻ tài liệu.
- Tuân thủ quy trình lưu trữ và bảo vệ dữ liệu của cơ quan, đơn vị.
