# Cấu trúc mã nguồn

```text
pages/public/   Giao diện công khai
pages/cms/      Giao diện CMS
pages/workspace/Giao diện Workspace
css/            Style style.css, main.css, cms.css, workspace.css, responsive.css
js/             API client và logic giao diện
server/index.js HTTP server và routing
server/routes/  Handler PUBLIC/CMS/Workspace/Shared/Auth
server/lib/     DB, HTTP, auth, security, mapper, upload
server/db/      Schema, migration, seed
server/scripts/ Test, export, backup, restore
public-data/    Snapshot PUBLIC tĩnh
docs/           Tài liệu kỹ thuật
```

## Luồng dữ liệu

Public/CMS/Workspace gọi API `js/api.js` → `server/index.js` → route handler → SQLite `server/lib/db.js` → mapper/API JSON → trình duyệt.
