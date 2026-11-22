# Tài liệu API

API Public: `/api/public/*`

- Articles, categories, legal documents, agencies, events, support facilities, statistics, media, submissions.

API CMS: `/api/cms/*`

- Nội dung, chuyên mục, danh mục hệ thống, media, workflow, submissions, public catalog.

API Workspace: `/api/workspace/*`

- Tasks, reports, proposals, collaboration, documents, organizations, users, calendar, notifications.

Mọi request ghi bằng cookie yêu cầu CSRF token. Public write submission không yêu cầu session.
