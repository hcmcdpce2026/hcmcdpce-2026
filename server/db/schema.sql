-- =============================================================================
-- CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH
-- Schema cơ sở dữ liệu (SQLite) – phiên bản 1.1.0
-- Mọi bảng nghiệp vụ có: id, created_at, updated_at, created_by, data_source,
-- is_seed_data để phân biệt Seed Data / Operational Data / Production Data.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 0. META – phiên bản schema & migration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- 1. TỔ CHỨC, NGƯỜI DÙNG, VAI TRÒ, QUYỀN
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    short_name      TEXT,
    type            TEXT NOT NULL,
    parent_id       TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    management_level TEXT,
    address         TEXT,
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    head_name       TEXT,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_org_parent ON organizations(parent_id);

CREATE TABLE IF NOT EXISTS roles (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    system_key      TEXT NOT NULL,               -- cms | workspace
    description     TEXT,
    data_scope      TEXT NOT NULL DEFAULT 'own', -- own | unit | all
    is_system       INTEGER NOT NULL DEFAULT 0,
    data_source     TEXT NOT NULL DEFAULT 'seed',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_code_system ON roles(system_key, code);

CREATE TABLE IF NOT EXISTS permissions (
    code            TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    group_code      TEXT NOT NULL DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id         TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    code                TEXT,
    username            TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    password_algo       TEXT NOT NULL DEFAULT 'scrypt',
    full_name           TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    position            TEXT,
    system_key          TEXT NOT NULL,           -- cms | workspace
    role_id             TEXT REFERENCES roles(id) ON DELETE SET NULL,
    org_id              TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'active', -- active | locked | pending
    must_change_password INTEGER NOT NULL DEFAULT 0,
    failed_attempts     INTEGER NOT NULL DEFAULT 0,
    locked_until        TEXT,
    last_login_at       TEXT,
    last_login_ip       TEXT,
    data_source         TEXT NOT NULL DEFAULT 'seed',
    is_seed_data        INTEGER NOT NULL DEFAULT 0,
    environment         TEXT NOT NULL DEFAULT 'development',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    created_by          TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_system ON users(system_key, status);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    csrf_token      TEXT NOT NULL,
    user_agent      TEXT,
    ip              TEXT,
    created_at      TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    revoked_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL,
    ip          TEXT,
    success     INTEGER NOT NULL DEFAULT 0,
    reason      TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_username ON login_attempts(username, created_at);

-- -----------------------------------------------------------------------------
-- 2. NỘI DUNG – CHUYÊN MỤC, BÀI VIẾT, PHIÊN BẢN, TÀI NGUYÊN, BANNER
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    parent_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
    description     TEXT,
    group_key       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    data_source     TEXT NOT NULL DEFAULT 'seed',
    is_seed_data    INTEGER NOT NULL DEFAULT 1,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);

CREATE TABLE IF NOT EXISTS system_categories (
    id              TEXT PRIMARY KEY,
    category_type   TEXT NOT NULL CHECK (category_type IN (
        'category_group', 'doc_type', 'legal_field', 'agency_type',
        'management_level', 'facility_type', 'organization_type', 'contact_topic', 'event_status'
    )),
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT,
    updated_by      TEXT,
    UNIQUE (category_type, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_categories_type_name
    ON system_categories(category_type, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_system_categories_status_order
    ON system_categories(category_type, status, sort_order, name);

CREATE TABLE IF NOT EXISTS articles (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    excerpt         TEXT,
    body            TEXT,
    thumbnail       TEXT,
    category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    author_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name     TEXT,
    source          TEXT,
    tags            TEXT,                            -- JSON array
    seo_title       TEXT,
    seo_description TEXT,
    views           INTEGER NOT NULL DEFAULT 0,
    submitted_at    TEXT,
    submitted_by    TEXT,
    reviewed_at     TEXT,
    reviewed_by     TEXT,
    review_note     TEXT,
    published_at    TEXT,
    archived_at     TEXT,
    origin          TEXT NOT NULL DEFAULT 'cms',     -- cms | workspace | public
    origin_ref      TEXT,                            -- id nhiệm vụ / yêu cầu gốc
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);

CREATE TABLE IF NOT EXISTS article_revisions (
    id          TEXT PRIMARY KEY,
    article_id  TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    title       TEXT,
    body        TEXT,
    status      TEXT,
    note        TEXT,
    user_id     TEXT,
    user_name   TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_article ON article_revisions(article_id, created_at);

CREATE TABLE IF NOT EXISTS media (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'document', -- image | document | video
    ext             TEXT,
    mime            TEXT,
    size            INTEGER NOT NULL DEFAULT 0,
    folder          TEXT,
    alt             TEXT,
    stored_path     TEXT,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);

CREATE TABLE IF NOT EXISTS banners (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    image_url   TEXT,
    link_url    TEXT,
    position    TEXT NOT NULL DEFAULT 'home-top',
    status      TEXT NOT NULL DEFAULT 'active',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    starts_at   TEXT,
    ends_at     TEXT,
    data_source TEXT NOT NULL DEFAULT 'seed',
    is_seed_data INTEGER NOT NULL DEFAULT 1,
    environment TEXT NOT NULL DEFAULT 'development',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    created_by  TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'other',
    org_id          TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    uploader_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    issued_at       TEXT,
    format          TEXT,
    size            INTEGER NOT NULL DEFAULT 0,
    access          TEXT NOT NULL DEFAULT 'internal', -- public | internal | restricted
    folder          TEXT,
    summary         TEXT,
    file_url        TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);

CREATE TABLE IF NOT EXISTS doc_versions (
    id          TEXT PRIMARY KEY,
    doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version     TEXT NOT NULL,
    note        TEXT,
    user_id     TEXT,
    created_at  TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- 3. TIẾP NHẬN TỪ CÔNG DÂN (FORM PUBLIC) → CMS → WORKSPACE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id              TEXT PRIMARY KEY,
    ticket_code     TEXT NOT NULL UNIQUE,
    form_type       TEXT NOT NULL DEFAULT 'contact', -- contact | report | feedback | support
    status          TEXT NOT NULL DEFAULT 'new',     -- new | assigned | in_progress | answered | closed | rejected
    priority        TEXT NOT NULL DEFAULT 'normal',
    subject         TEXT,
    topic_code      TEXT,
    full_name       TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    is_anonymous    INTEGER NOT NULL DEFAULT 0,
    content         TEXT NOT NULL,
    attachment_name TEXT,
    assigned_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    assigned_user_id TEXT,
    task_id         TEXT,
    response        TEXT,
    public_response TEXT,
    is_public_result INTEGER NOT NULL DEFAULT 0,
    ip              TEXT,
    user_agent      TEXT,
    dedupe_hash     TEXT,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sub_dedupe ON submissions(dedupe_hash);

CREATE TABLE IF NOT EXISTS submission_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id   TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    action          TEXT NOT NULL,
    from_status     TEXT,
    to_status       TEXT,
    note            TEXT,
    user_id         TEXT,
    user_name       TEXT,
    created_at      TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- 4. WORKSPACE – NHIỆM VỤ, LỊCH, BÁO CÁO, ĐỀ XUẤT NỘI DUNG, THÔNG BÁO
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT,
    owner_org_id    TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    assigner_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    assignee_ids    TEXT,                          -- JSON array user id
    partner_org_ids TEXT,                          -- JSON array org id
    start_date      TEXT,
    due_date        TEXT,
    priority        TEXT NOT NULL DEFAULT 'normal',
    status          TEXT NOT NULL DEFAULT 'new',   -- new|doing|review|done|overdue|paused|cancelled
    progress        INTEGER NOT NULL DEFAULT 0,
    source_type     TEXT NOT NULL DEFAULT 'internal',  -- internal | submission | article_request
    source_id       TEXT,
    result_note     TEXT,
    completed_at    TEXT,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(owner_org_id);

CREATE TABLE IF NOT EXISTS task_items (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    assignee_id TEXT,
    due_date    TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_comments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     TEXT,
    user_name   TEXT,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_history (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     TEXT,
    user_name   TEXT,
    action      TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_documents (
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, doc_id)
);

CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'meeting',
    start_at        TEXT NOT NULL,
    end_at          TEXT,
    location        TEXT,
    org_id          TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
    participants    TEXT,                           -- JSON array user id
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'monthly',
    org_id          TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    author_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    period          TEXT,
    status          TEXT NOT NULL DEFAULT 'draft',  -- draft|ready|sent|pending|approved|revision|rejected
    content         TEXT,
    results         TEXT,
    issues          TEXT,
    proposals       TEXT,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    submitted_at    TEXT,
    reviewed_at     TEXT,
    reviewed_by     TEXT,
    review_note     TEXT,
    public_summary  TEXT,
    is_public       INTEGER NOT NULL DEFAULT 0,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE TABLE IF NOT EXISTS report_documents (
    report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (report_id, doc_id)
);

-- Đề xuất nội dung từ WORKSPACE → CMS
CREATE TABLE IF NOT EXISTS proposals (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    summary         TEXT,
    body            TEXT,
    category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
    org_id          TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    author_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'submitted', -- submitted|in_review|revision|approved|rejected|published
    review_note     TEXT,
    reviewed_by     TEXT,
    reviewed_at     TEXT,
    article_id      TEXT REFERENCES articles(id) ON DELETE SET NULL,
    published_at    TEXT,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);

-- Yêu cầu phối hợp CMS → WORKSPACE
CREATE TABLE IF NOT EXISTS collaboration_requests (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT,
    direction       TEXT NOT NULL DEFAULT 'cms-ws',  -- cms-ws | ws-cms
    ref_type        TEXT,                            -- article | report | document | submission
    ref_id          TEXT,
    from_user_id    TEXT,
    to_org_id       TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'received',-- received|processing|completed|cancelled
    due_date        TEXT,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    completed_at    TEXT,
    data_source     TEXT NOT NULL DEFAULT 'operational',
    is_seed_data    INTEGER NOT NULL DEFAULT 0,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    system_key  TEXT NOT NULL DEFAULT 'shared',
    type        TEXT NOT NULL DEFAULT 'info',
    title       TEXT NOT NULL,
    body        TEXT,
    href        TEXT,
    to_user_id  TEXT,
    audience    TEXT NOT NULL DEFAULT 'all',
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(to_user_id, is_read);

CREATE TABLE IF NOT EXISTS activity_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    system_key  TEXT NOT NULL,
    user_id     TEXT,
    user_name   TEXT,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    target_name TEXT,
    detail      TEXT,
    result      TEXT NOT NULL DEFAULT 'success',
    ip          TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON activity_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TEXT NOT NULL,
    updated_by  TEXT
);

-- -----------------------------------------------------------------------------
-- 5. PUBLIC – VĂN BẢN PHÁP LUẬT, CƠ QUAN CÔNG KHAI, THỐNG KÊ, SỰ KIỆN CÔNG KHAI
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_documents (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL,
    title           TEXT NOT NULL,
    slug            TEXT,
    doc_number      TEXT,
    doc_type        TEXT NOT NULL,
    legal_field     TEXT,
    issued_at       TEXT,
    effective_at    TEXT,
    expiry_at       TEXT,
    effect_status   TEXT NOT NULL DEFAULT 'in_effect',   -- in_effect | expired | replaced | amended
    issuer          TEXT,
    summary         TEXT,
    content         TEXT,
    file_url        TEXT,
    is_public       INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'active',      -- active | inactive
    data_source     TEXT NOT NULL DEFAULT 'seed',
    is_seed_data    INTEGER NOT NULL DEFAULT 1,
    environment     TEXT NOT NULL DEFAULT 'development',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    created_by      TEXT
);

CREATE TABLE IF NOT EXISTS public_agencies (
    id          TEXT PRIMARY KEY,
    org_id      TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    slug        TEXT,
    short_name  TEXT,
    logo_url    TEXT,
    role_type   TEXT NOT NULL,
    management_level TEXT,                               -- thanh-pho | so-nganh | quan-huyen | phuong-xa
    address     TEXT,
    phone       TEXT,
    email       TEXT,
    website     TEXT,
    description TEXT,
    functions_text TEXT,                                 -- chức năng, nhiệm vụ
    structure   TEXT,                                    -- cơ cấu tổ chức
    head_name   TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'active',
    data_source TEXT NOT NULL DEFAULT 'seed',
    is_seed_data INTEGER NOT NULL DEFAULT 1,
    environment TEXT NOT NULL DEFAULT 'development',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_events (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    slug        TEXT,
    category    TEXT,
    event_type  TEXT,
    start_at    TEXT,
    end_at      TEXT,
    location    TEXT,
    organizer   TEXT,
    co_organizer TEXT,
    summary     TEXT,
    content     TEXT,
    image_url   TEXT,
    status      TEXT NOT NULL DEFAULT 'upcoming',         -- upcoming | ongoing | past | inactive
    publish_status TEXT NOT NULL DEFAULT 'published',    -- draft | published | hidden
    data_source TEXT NOT NULL DEFAULT 'seed',
    is_seed_data INTEGER NOT NULL DEFAULT 1,
    environment TEXT NOT NULL DEFAULT 'development',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statistics_periods (
    id          TEXT PRIMARY KEY,
    period_key  TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    scope       TEXT,
    note        TEXT,
    source_type TEXT NOT NULL DEFAULT 'seed',   -- verified | seed | operational
    is_seed_data INTEGER NOT NULL DEFAULT 1,
    data_source TEXT NOT NULL DEFAULT 'seed',
    environment TEXT NOT NULL DEFAULT 'development',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statistics_items (
    id          TEXT PRIMARY KEY,
    period_id   TEXT NOT NULL REFERENCES statistics_periods(id) ON DELETE CASCADE,
    metric_key  TEXT NOT NULL,
    label       TEXT NOT NULL,
    value       REAL NOT NULL DEFAULT 0,
    unit        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS support_facilities (
    id          TEXT PRIMARY KEY,
    code        TEXT,
    name        TEXT NOT NULL,
    type        TEXT,
    managing_org TEXT,                                   -- đơn vị quản lý trực tiếp (chuỗi tự do)
    org_id      TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    ward        TEXT,
    city        TEXT,
    address     TEXT,
    latitude    REAL,
    longitude   REAL,
    phone       TEXT,
    email       TEXT,
    website     TEXT,
    hours       TEXT,
    contact_person TEXT,
    services    TEXT,                                    -- JSON array
    audience    TEXT,
    scope       TEXT,
    conditions  TEXT,
    procedures  TEXT,
    cost_note   TEXT,
    description TEXT,
    image_url   TEXT,
    source      TEXT,
    verified_at TEXT,
    status      TEXT NOT NULL DEFAULT 'active',          -- active | inactive
    publish_status TEXT NOT NULL DEFAULT 'published',    -- pending | published | rejected
    data_source TEXT NOT NULL DEFAULT 'seed',
    is_seed_data INTEGER NOT NULL DEFAULT 1,
    environment TEXT NOT NULL DEFAULT 'development',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
