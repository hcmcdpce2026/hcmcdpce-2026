# Từ điển dữ liệu (Data Dictionary)

Tài liệu được sinh ở chế độ chỉ đọc từ schema SQLite hiện tại; không chứa giá trị của bản ghi. `server/db/schema.sql` vẫn là nguồn schema chuẩn. Quy tắc kiểm tra request nằm trong route tương ứng và `docs/API.md`.

**Kiểm kê:** 37 bảng. Trường có thể khác giữa các môi trường; cần rà migration trước khi áp dụng tài liệu này cho database khác.

## Chú giải

- `PK` = khóa chính; `FK` = khóa ngoại; `UNIQUE` = chỉ mục/ràng buộc duy nhất.
- `Bắt buộc` phản ánh `NOT NULL` hoặc khóa chính của SQLite; `Mặc định` là biểu thức default trong SQLite.
- `CHECK` là ràng buộc database, không bao gồm toàn bộ quy tắc kiểm tra ở API/nghiệp vụ.
- Chỉ liệt kê `data_source` và `is_seed_data` tại các bảng có trường đó; nhãn nguồn không đủ để kết luận bản ghi có thể xóa.

## Nền tảng và kiểm soát truy cập

### schema_migrations

Các bản ghi migration schema đã áp dụng.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `applied_at` | TEXT | Có | - | - |

### organizations

Đơn vị tổ chức và quan hệ cha-con.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (code) | - |
| `name` | TEXT | Có | - | - |
| `short_name` | TEXT | Không | - | - |
| `type` | TEXT | Có | - | 'unit' |
| `parent_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `address` | TEXT | Không | - | - |
| `phone` | TEXT | Không | - | - |
| `email` | TEXT | Không | - | - |
| `website` | TEXT | Không | - | - |
| `head_name` | TEXT | Không | - | - |
| `description` | TEXT | Không | - | - |
| `status` | TEXT | Có | - | 'active' |
| `sort_order` | INTEGER | Có | - | 0 |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |
| `management_level` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_organizations_2`.

### roles

Vai trò ứng dụng và phạm vi dữ liệu.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (system_key, code) | - |
| `name` | TEXT | Có | - | - |
| `system_key` | TEXT | Có | UNIQUE (system_key, code) | - |
| `description` | TEXT | Không | - | - |
| `data_scope` | TEXT | Có | - | 'own' |
| `is_system` | INTEGER | Có | - | 0 |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |

**Chỉ mục duy nhất:** `uq_role_code_system`.

### permissions

Danh mục quyền.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `code` | TEXT | Có | PK | - |
| `name` | TEXT | Có | - | - |
| `group_code` | TEXT | Có | - | 'general' |

### role_permissions

Ánh xạ vai trò với quyền.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `role_id` | TEXT | Có | PK (1); FK REFERENCES roles.id (ON DELETE CASCADE) | - |
| `permission_code` | TEXT | Có | PK (2); FK REFERENCES permissions.code (ON DELETE CASCADE) | - |

### users

Tài khoản CMS và Workspace.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Không | - | - |
| `username` | TEXT | Có | UNIQUE (username) | - |
| `password_hash` | TEXT | Có | - | - |
| `password_algo` | TEXT | Có | - | 'scrypt' |
| `full_name` | TEXT | Có | - | - |
| `email` | TEXT | Không | - | - |
| `phone` | TEXT | Không | - | - |
| `position` | TEXT | Không | - | - |
| `system_key` | TEXT | Có | - | - |
| `role_id` | TEXT | Không | FK REFERENCES roles.id (ON DELETE SET NULL) | - |
| `org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `status` | TEXT | Có | - | 'active' |
| `must_change_password` | INTEGER | Có | - | 0 |
| `failed_attempts` | INTEGER | Có | - | 0 |
| `locked_until` | TEXT | Không | - | - |
| `last_login_at` | TEXT | Không | - | - |
| `last_login_ip` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_users_2`.

### sessions

Phiên xác thực.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `user_id` | TEXT | Có | FK REFERENCES users.id (ON DELETE CASCADE) | - |
| `token_hash` | TEXT | Có | UNIQUE (token_hash) | - |
| `csrf_token` | TEXT | Có | - | - |
| `user_agent` | TEXT | Không | - | - |
| `ip` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |
| `last_seen_at` | TEXT | Có | - | - |
| `expires_at` | TEXT | Có | - | - |
| `revoked_at` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_sessions_2`.

### login_attempts

Lịch sử đăng nhập và trạng thái khóa tạm.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | INTEGER | Có | PK | - |
| `username` | TEXT | Có | - | - |
| `ip` | TEXT | Không | - | - |
| `success` | INTEGER | Có | - | 0 |
| `reason` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |

### settings

Thiết lập ứng dụng.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `key` | TEXT | Có | PK | - |
| `value` | TEXT | Không | - | - |
| `updated_at` | TEXT | Có | - | - |
| `updated_by` | TEXT | Không | - | - |

## Nội dung công khai

### categories

Chuyên mục biên tập và khóa nhóm nội dung công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `name` | TEXT | Có | - | - |
| `slug` | TEXT | Có | UNIQUE (slug) | - |
| `parent_id` | TEXT | Không | FK REFERENCES categories.id (ON DELETE SET NULL) | - |
| `description` | TEXT | Không | - | - |
| `group_key` | TEXT | Có | - | 'news' |
| `status` | TEXT | Có | - | 'active' |
| `sort_order` | INTEGER | Có | - | 0 |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_categories_2`.

### system_categories

Danh mục hệ thống được quản lý.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `category_type` | TEXT | Có | UNIQUE (category_type, name); (category_type, code) | - |
| `code` | TEXT | Có | UNIQUE (category_type, code) | - |
| `name` | TEXT | Có | UNIQUE (category_type, name) | - |
| `description` | TEXT | Không | - | - |
| `sort_order` | INTEGER | Có | - | 0 |
| `status` | TEXT | Có | - | 'active' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |
| `updated_by` | TEXT | Không | - | - |

**Ràng buộc CHECK:**
- `category_type IN (<br>        'category_group', 'doc_type', 'legal_field', 'agency_type',<br>        'management_level', 'facility_type', 'organization_type', 'contact_topic'<br>      )`
- `status IN ('active', 'inactive')`

**Chỉ mục duy nhất:** `uq_system_categories_type_name`, `sqlite_autoindex_system_categories_2`.

### articles

Bài viết tin tức và tuyên truyền - giáo dục.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `title` | TEXT | Có | - | - |
| `slug` | TEXT | Có | UNIQUE (slug) | - |
| `excerpt` | TEXT | Không | - | - |
| `body` | TEXT | Không | - | - |
| `thumbnail` | TEXT | Không | - | - |
| `category_id` | TEXT | Không | FK REFERENCES categories.id (ON DELETE SET NULL) | - |
| `status` | TEXT | Có | - | 'draft' |
| `author_id` | TEXT | Không | FK REFERENCES users.id (ON DELETE SET NULL) | - |
| `author_name` | TEXT | Không | - | - |
| `source` | TEXT | Không | - | - |
| `tags` | TEXT | Không | - | - |
| `seo_title` | TEXT | Không | - | - |
| `seo_description` | TEXT | Không | - | - |
| `views` | INTEGER | Có | - | 0 |
| `submitted_at` | TEXT | Không | - | - |
| `submitted_by` | TEXT | Không | - | - |
| `reviewed_at` | TEXT | Không | - | - |
| `reviewed_by` | TEXT | Không | - | - |
| `review_note` | TEXT | Không | - | - |
| `published_at` | TEXT | Không | - | - |
| `archived_at` | TEXT | Không | - | - |
| `origin` | TEXT | Có | - | 'cms' |
| `origin_ref` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_articles_2`.

### article_revisions

Lịch sử phiên bản bài viết.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `article_id` | TEXT | Có | FK REFERENCES articles.id (ON DELETE CASCADE) | - |
| `title` | TEXT | Không | - | - |
| `body` | TEXT | Không | - | - |
| `status` | TEXT | Không | - | - |
| `note` | TEXT | Không | - | - |
| `user_id` | TEXT | Không | - | - |
| `user_name` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |

### media

Metadata của media đã tải lên.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `name` | TEXT | Có | - | - |
| `url` | TEXT | Có | - | - |
| `type` | TEXT | Có | - | 'document' |
| `ext` | TEXT | Không | - | - |
| `mime` | TEXT | Không | - | - |
| `size` | INTEGER | Có | - | 0 |
| `folder` | TEXT | Không | - | - |
| `alt` | TEXT | Không | - | - |
| `stored_path` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

### banners

Banner công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `title` | TEXT | Có | - | - |
| `image_url` | TEXT | Không | - | - |
| `link_url` | TEXT | Không | - | - |
| `position` | TEXT | Có | - | 'home-top' |
| `status` | TEXT | Có | - | 'active' |
| `sort_order` | INTEGER | Có | - | 0 |
| `starts_at` | TEXT | Không | - | - |
| `ends_at` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

### legal_documents

Văn bản pháp luật công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | - | - |
| `title` | TEXT | Có | - | - |
| `doc_number` | TEXT | Không | - | - |
| `doc_type` | TEXT | Có | - | 'luat' |
| `issued_at` | TEXT | Không | - | - |
| `effective_at` | TEXT | Không | - | - |
| `issuer` | TEXT | Không | - | - |
| `summary` | TEXT | Không | - | - |
| `content` | TEXT | Không | - | - |
| `file_url` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |
| `slug` | TEXT | Không | - | - |
| `legal_field` | TEXT | Không | - | - |
| `expiry_at` | TEXT | Không | - | - |
| `effect_status` | TEXT | Có | - | 'in_effect' |
| `is_public` | INTEGER | Có | - | 1 |
| `status` | TEXT | Có | - | 'active' |

### public_agencies

Cơ quan, đơn vị công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `name` | TEXT | Có | - | - |
| `short_name` | TEXT | Không | - | - |
| `role_type` | TEXT | Có | - | 'coordination' |
| `address` | TEXT | Không | - | - |
| `phone` | TEXT | Không | - | - |
| `email` | TEXT | Không | - | - |
| `website` | TEXT | Không | - | - |
| `description` | TEXT | Không | - | - |
| `sort_order` | INTEGER | Có | - | 0 |
| `status` | TEXT | Có | - | 'active' |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `logo_url` | TEXT | Không | - | - |
| `slug` | TEXT | Không | - | - |
| `management_level` | TEXT | Không | - | - |
| `functions_text` | TEXT | Không | - | - |
| `structure` | TEXT | Không | - | - |
| `head_name` | TEXT | Không | - | - |

### public_events

Sự kiện công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `title` | TEXT | Có | - | - |
| `category` | TEXT | Không | - | - |
| `start_at` | TEXT | Không | - | - |
| `end_at` | TEXT | Không | - | - |
| `location` | TEXT | Không | - | - |
| `organizer` | TEXT | Không | - | - |
| `summary` | TEXT | Không | - | - |
| `content` | TEXT | Không | - | - |
| `image_url` | TEXT | Không | - | - |
| `status` | TEXT | Có | - | 'upcoming' |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `slug` | TEXT | Không | - | - |
| `event_type` | TEXT | Không | - | - |
| `co_organizer` | TEXT | Không | - | - |
| `publish_status` | TEXT | Có | - | 'published' |

### statistics_periods

Kỳ báo cáo thống kê công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `period_key` | TEXT | Có | UNIQUE (period_key) | - |
| `label` | TEXT | Có | - | - |
| `scope` | TEXT | Không | - | - |
| `note` | TEXT | Không | - | - |
| `source_type` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `data_source` | TEXT | Có | - | 'seed' |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_statistics_periods_2`.

### statistics_items

Chỉ số thuộc một kỳ thống kê.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `period_id` | TEXT | Có | FK REFERENCES statistics_periods.id (ON DELETE CASCADE) | - |
| `metric_key` | TEXT | Có | - | - |
| `label` | TEXT | Có | - | - |
| `value` | REAL | Có | - | 0 |
| `unit` | TEXT | Không | - | - |
| `sort_order` | INTEGER | Có | - | 0 |

### support_facilities

Cơ sở hỗ trợ công khai.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `name` | TEXT | Có | - | - |
| `type` | TEXT | Không | - | - |
| `address` | TEXT | Không | - | - |
| `phone` | TEXT | Không | - | - |
| `hours` | TEXT | Không | - | - |
| `description` | TEXT | Không | - | - |
| `status` | TEXT | Có | - | 'active' |
| `data_source` | TEXT | Có | - | 'seed' |
| `is_seed_data` | INTEGER | Có | - | 1 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `code` | TEXT | Không | - | - |
| `managing_org` | TEXT | Không | - | - |
| `org_id` | TEXT | Không | - | - |
| `ward` | TEXT | Không | - | - |
| `city` | TEXT | Không | - | - |
| `latitude` | REAL | Không | - | - |
| `longitude` | REAL | Không | - | - |
| `email` | TEXT | Không | - | - |
| `website` | TEXT | Không | - | - |
| `contact_person` | TEXT | Không | - | - |
| `services` | TEXT | Không | - | - |
| `audience` | TEXT | Không | - | - |
| `scope` | TEXT | Không | - | - |
| `conditions` | TEXT | Không | - | - |
| `procedures` | TEXT | Không | - | - |
| `cost_note` | TEXT | Không | - | - |
| `image_url` | TEXT | Không | - | - |
| `source` | TEXT | Không | - | - |
| `verified_at` | TEXT | Không | - | - |
| `publish_status` | TEXT | Có | - | 'published' |

## Nghiệp vụ CMS và Workspace

### documents

Tài liệu nội bộ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (code) | - |
| `name` | TEXT | Có | - | - |
| `type` | TEXT | Có | - | 'other' |
| `org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `uploader_id` | TEXT | Không | FK REFERENCES users.id (ON DELETE SET NULL) | - |
| `issued_at` | TEXT | Không | - | - |
| `format` | TEXT | Không | - | - |
| `size` | INTEGER | Có | - | 0 |
| `access` | TEXT | Có | - | 'internal' |
| `folder` | TEXT | Không | - | - |
| `summary` | TEXT | Không | - | - |
| `file_url` | TEXT | Không | - | - |
| `status` | TEXT | Có | - | 'active' |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_documents_2`.

### doc_versions

Phiên bản tài liệu nội bộ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `doc_id` | TEXT | Có | FK REFERENCES documents.id (ON DELETE CASCADE) | - |
| `version` | TEXT | Có | - | - |
| `note` | TEXT | Không | - | - |
| `user_id` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |

### submissions

Phản ánh công khai và tiếp nhận.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `ticket_code` | TEXT | Có | UNIQUE (ticket_code) | - |
| `form_type` | TEXT | Có | - | 'contact' |
| `status` | TEXT | Có | - | 'new' |
| `priority` | TEXT | Có | - | 'normal' |
| `subject` | TEXT | Không | - | - |
| `full_name` | TEXT | Không | - | - |
| `email` | TEXT | Không | - | - |
| `phone` | TEXT | Không | - | - |
| `address` | TEXT | Không | - | - |
| `is_anonymous` | INTEGER | Có | - | 0 |
| `content` | TEXT | Có | - | - |
| `attachment_name` | TEXT | Không | - | - |
| `assigned_org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `assigned_user_id` | TEXT | Không | - | - |
| `task_id` | TEXT | Không | - | - |
| `response` | TEXT | Không | - | - |
| `public_response` | TEXT | Không | - | - |
| `is_public_result` | INTEGER | Có | - | 0 |
| `ip` | TEXT | Không | - | - |
| `user_agent` | TEXT | Không | - | - |
| `dedupe_hash` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |
| `topic_code` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_submissions_2`.

### submission_events

Lịch sử xử lý phản ánh.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | INTEGER | Có | PK | - |
| `submission_id` | TEXT | Có | FK REFERENCES submissions.id (ON DELETE CASCADE) | - |
| `action` | TEXT | Có | - | - |
| `from_status` | TEXT | Không | - | - |
| `to_status` | TEXT | Không | - | - |
| `note` | TEXT | Không | - | - |
| `user_id` | TEXT | Không | - | - |
| `user_name` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |

### tasks

Nhiệm vụ được giao.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (code) | - |
| `title` | TEXT | Có | - | - |
| `description` | TEXT | Không | - | - |
| `owner_org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `assigner_id` | TEXT | Không | FK REFERENCES users.id (ON DELETE SET NULL) | - |
| `assignee_ids` | TEXT | Không | - | - |
| `partner_org_ids` | TEXT | Không | - | - |
| `start_date` | TEXT | Không | - | - |
| `due_date` | TEXT | Không | - | - |
| `priority` | TEXT | Có | - | 'normal' |
| `status` | TEXT | Có | - | 'new' |
| `progress` | INTEGER | Có | - | 0 |
| `source_type` | TEXT | Có | - | 'internal' |
| `source_id` | TEXT | Không | - | - |
| `result_note` | TEXT | Không | - | - |
| `completed_at` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_tasks_2`.

### task_items

Các mục checklist của nhiệm vụ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `task_id` | TEXT | Có | FK REFERENCES tasks.id (ON DELETE CASCADE) | - |
| `title` | TEXT | Có | - | - |
| `done` | INTEGER | Có | - | 0 |
| `assignee_id` | TEXT | Không | - | - |
| `due_date` | TEXT | Không | - | - |
| `sort_order` | INTEGER | Có | - | 0 |

### task_comments

Trao đổi trong nhiệm vụ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `task_id` | TEXT | Có | FK REFERENCES tasks.id (ON DELETE CASCADE) | - |
| `user_id` | TEXT | Không | - | - |
| `user_name` | TEXT | Không | - | - |
| `body` | TEXT | Có | - | - |
| `created_at` | TEXT | Có | - | - |

### task_history

Lịch sử trạng thái và thay đổi nhiệm vụ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `task_id` | TEXT | Có | FK REFERENCES tasks.id (ON DELETE CASCADE) | - |
| `user_id` | TEXT | Không | - | - |
| `user_name` | TEXT | Không | - | - |
| `action` | TEXT | Có | - | - |
| `detail` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |

### task_documents

Tệp đính kèm và liên kết của nhiệm vụ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `task_id` | TEXT | Có | PK (1); FK REFERENCES tasks.id (ON DELETE CASCADE) | - |
| `doc_id` | TEXT | Có | PK (2); FK REFERENCES documents.id (ON DELETE CASCADE) | - |

### events

Sự kiện lịch nội bộ.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `title` | TEXT | Có | - | - |
| `type` | TEXT | Có | - | 'meeting' |
| `start_at` | TEXT | Có | - | - |
| `end_at` | TEXT | Không | - | - |
| `location` | TEXT | Không | - | - |
| `org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `owner_id` | TEXT | Không | FK REFERENCES users.id (ON DELETE SET NULL) | - |
| `participants` | TEXT | Không | - | - |
| `description` | TEXT | Không | - | - |
| `status` | TEXT | Có | - | 'active' |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

### reports

Báo cáo Workspace.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (code) | - |
| `name` | TEXT | Có | - | - |
| `type` | TEXT | Có | - | 'monthly' |
| `org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `author_id` | TEXT | Không | FK REFERENCES users.id (ON DELETE SET NULL) | - |
| `period` | TEXT | Không | - | - |
| `status` | TEXT | Có | - | 'draft' |
| `content` | TEXT | Không | - | - |
| `results` | TEXT | Không | - | - |
| `issues` | TEXT | Không | - | - |
| `proposals` | TEXT | Không | - | - |
| `task_id` | TEXT | Không | FK REFERENCES tasks.id (ON DELETE SET NULL) | - |
| `submitted_at` | TEXT | Không | - | - |
| `reviewed_at` | TEXT | Không | - | - |
| `reviewed_by` | TEXT | Không | - | - |
| `review_note` | TEXT | Không | - | - |
| `public_summary` | TEXT | Không | - | - |
| `is_public` | INTEGER | Có | - | 0 |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_reports_2`.

### report_documents

Tệp đính kèm và liên kết báo cáo.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `report_id` | TEXT | Có | PK (1); FK REFERENCES reports.id (ON DELETE CASCADE) | - |
| `doc_id` | TEXT | Có | PK (2); FK REFERENCES documents.id (ON DELETE CASCADE) | - |

### proposals

Đề xuất nội dung từ Workspace.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (code) | - |
| `title` | TEXT | Có | - | - |
| `summary` | TEXT | Không | - | - |
| `body` | TEXT | Không | - | - |
| `category_id` | TEXT | Không | FK REFERENCES categories.id (ON DELETE SET NULL) | - |
| `org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `author_id` | TEXT | Không | FK REFERENCES users.id (ON DELETE SET NULL) | - |
| `task_id` | TEXT | Không | FK REFERENCES tasks.id (ON DELETE SET NULL) | - |
| `status` | TEXT | Có | - | 'submitted' |
| `review_note` | TEXT | Không | - | - |
| `reviewed_by` | TEXT | Không | - | - |
| `reviewed_at` | TEXT | Không | - | - |
| `article_id` | TEXT | Không | FK REFERENCES articles.id (ON DELETE SET NULL) | - |
| `published_at` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_proposals_2`.

### collaboration_requests

Yêu cầu phối hợp giữa các đơn vị.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `code` | TEXT | Có | UNIQUE (code) | - |
| `title` | TEXT | Có | - | - |
| `description` | TEXT | Không | - | - |
| `direction` | TEXT | Có | - | 'cms-ws' |
| `ref_type` | TEXT | Không | - | - |
| `ref_id` | TEXT | Không | - | - |
| `from_user_id` | TEXT | Không | - | - |
| `to_org_id` | TEXT | Không | FK REFERENCES organizations.id (ON DELETE SET NULL) | - |
| `status` | TEXT | Có | - | 'received' |
| `due_date` | TEXT | Không | - | - |
| `task_id` | TEXT | Không | FK REFERENCES tasks.id (ON DELETE SET NULL) | - |
| `completed_at` | TEXT | Không | - | - |
| `data_source` | TEXT | Có | - | 'operational' |
| `is_seed_data` | INTEGER | Có | - | 0 |
| `environment` | TEXT | Có | - | 'development' |
| `created_at` | TEXT | Có | - | - |
| `updated_at` | TEXT | Có | - | - |
| `created_by` | TEXT | Không | - | - |

**Chỉ mục duy nhất:** `sqlite_autoindex_collaboration_requests_2`.

### notifications

Thông báo người dùng.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | TEXT | Có | PK | - |
| `system_key` | TEXT | Có | - | 'shared' |
| `type` | TEXT | Có | - | 'info' |
| `title` | TEXT | Có | - | - |
| `body` | TEXT | Không | - | - |
| `href` | TEXT | Không | - | - |
| `to_user_id` | TEXT | Không | - | - |
| `audience` | TEXT | Có | - | 'all' |
| `is_read` | INTEGER | Có | - | 0 |
| `created_at` | TEXT | Có | - | - |

### activity_logs

Bản ghi nhật ký hoạt động.

| Trường | Kiểu SQLite | Bắt buộc | Khóa / quan hệ | Mặc định |
|---|---|---|---|---|
| `id` | INTEGER | Có | PK | - |
| `system_key` | TEXT | Có | - | - |
| `user_id` | TEXT | Không | - | - |
| `user_name` | TEXT | Không | - | - |
| `action` | TEXT | Có | - | - |
| `target_type` | TEXT | Không | - | - |
| `target_id` | TEXT | Không | - | - |
| `target_name` | TEXT | Không | - | - |
| `detail` | TEXT | Không | - | - |
| `result` | TEXT | Có | - | 'success' |
| `ip` | TEXT | Không | - | - |
| `created_at` | TEXT | Có | - | - |

