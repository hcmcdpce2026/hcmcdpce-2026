# Security Review

Ngày rà soát: 2026-11-22

| Mức | Khu vực | Trạng thái | Confidence |
|---|---|---|---|
| Critical | Không xác nhận finding Critical | Đã rà soát toàn bộ endpoint và suite security | 10/10 |
| High | Scope nhiệm vụ/báo cáo Workspace | Đã thêm kiểm tra object scope và suite cô lập | 10/10 |
| High | Public submission lookup XSS | Đã escape dữ liệu và timeline công khai | 10/10 |
| High | Media private | Đã chặn `/uploads`, static export và stale private | 10/10 |
| Medium | IP forwarded | Chỉ tin cậy proxy khi `TRUSTED_PROXY_IPS` khớp | 10/10 |
| Medium | Cookie production | Production mặc định Secure và development opt-in | 10/10 |
| Medium | Shared user directory | Đã giới hạn quyền và scope đơn vị/cá nhân | 10/10 |
| Medium | Submission lookup timeline | Không trả internal CMS note ra public | 10/10 |
| Low | Đăng xuất CSRF | Logout yêu cầu CSRF/session hợp lệ | 10/10 |
| Low | Xóa media | Database và filesystem gắn transaction | 10/10 |

## Biện pháp còn bắt buộc trước production

- Đổi credential seed và đăng nhập test.
- Cấu hình `APP_ENV=production`, `COOKIE_SECURE=true`, `TRUSTED_PROXY_IPS`.
- Chạy secret scan trên toàn bộ Git history.
- Diễn tập restore và kiểm tra backup encrypted/offsite.
