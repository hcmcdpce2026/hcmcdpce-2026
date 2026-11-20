/**
 * Ánh xạ bản ghi DB (snake_case) → đối tượng API (camelCase) đúng cấu trúc
 * mà giao diện CMS / WORKSPACE / PUBLIC đang sử dụng.
 */
'use strict';

const parseList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
};

const dt = (value) => (value ? String(value) : null);

function article(r, extra = {}) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt || '',
    summary: r.excerpt || '',
    body: r.body || '',
    content: r.body || '',
    thumbnail: r.thumbnail || '',
    categoryId: r.category_id,
    categoryName: r.category_name || null,
    categorySlug: r.category_slug || null,
    categoryGroup: r.category_group || null,
    categoryStatus: r.category_status || null,
    status: r.status,
    tags: parseList(r.tags),
    authorId: r.author_id,
    authorName: r.author_name || '',
    source: r.source || '',
    seoTitle: r.seo_title || '',
    seoDescription: r.seo_description || '',
    views: r.views || 0,
    submittedAt: dt(r.submitted_at),
    submittedBy: r.submitted_by,
    submittedByName: r.submitted_by_name || null,
    reviewedAt: dt(r.reviewed_at),
    reviewedBy: r.reviewed_by,
    reviewedByName: r.reviewed_by_name || null,
    reviewNote: r.review_note || '',
    publishedAt: dt(r.published_at),
    archivedAt: dt(r.archived_at),
    origin: r.origin || 'cms',
    originRef: r.origin_ref || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isSeedData: !!r.is_seed_data,
    ...extra,
  };
}

function category(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id || null,
    description: r.description || '',
    group: r.group_key,
    status: r.status,
    isActive: r.status !== 'inactive',
    order: r.sort_order,
    articleCount: r.article_count != null ? Number(r.article_count) : undefined,
  };
}

function media(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    type: r.type,
    ext: r.ext,
    mime: r.mime,
    size: r.size,
    folder: r.folder || 'Chưa phân loại',
    alt: r.alt || '',
    uploadedAt: r.created_at,
    uploadedBy: r.created_by,
    uploadedByName: r.uploaded_by_name || null,
    createdAt: r.created_at,
  };
}

function task(r, extra = {}) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    desc: r.description || '',
    description: r.description || '',
    ownerOrgId: r.owner_org_id,
    ownerOrgName: r.owner_org_name || null,
    assignerId: r.assigner_id,
    assignerName: r.assigner_name || null,
    assigneeIds: parseList(r.assignee_ids),
    partnerOrgIds: parseList(r.partner_org_ids),
    startDate: dt(r.start_date),
    assignDate: dt(r.start_date),
    dueDate: dt(r.due_date),
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    sourceType: r.source_type,
    sourceId: r.source_id,
    resultNote: r.result_note || '',
    completedAt: dt(r.completed_at),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...extra,
  };
}

function organization(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    shortName: r.short_name || '',
    type: r.type,
    managementLevel: r.management_level || '',
    parentId: r.parent_id || '',
    address: r.address || '',
    phone: r.phone || '',
    email: r.email || '',
    website: r.website || '',
    headName: r.head_name || r.head || '',
    head: r.head_name || r.head || '',
    description: r.description || '',
    note: r.description || '',
    status: r.status,
    sortOrder: r.sort_order,
    memberCount: r.member_count != null ? Number(r.member_count) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function event(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    start: r.start_at,
    end: r.end_at,
    location: r.location || '',
    orgId: r.org_id,
    ownerId: r.owner_id,
    ownerName: r.owner_name || null,
    participants: parseList(r.participants),
    desc: r.description || '',
    status: r.status,
    createdAt: r.created_at,
  };
}

function document(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    orgId: r.org_id,
    orgName: r.org_name || null,
    uploaderId: r.uploader_id,
    uploaderName: r.uploader_name || null,
    issuedAt: dt(r.issued_at),
    uploadedAt: r.created_at,
    format: r.format || '',
    size: r.size,
    access: r.access,
    folder: r.folder || '',
    summary: r.summary || '',
    fileUrl: r.file_url || '',
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function report(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    orgId: r.org_id,
    orgName: r.org_name || null,
    authorId: r.author_id,
    authorName: r.author_name || null,
    period: r.period || '',
    createdDate: (r.created_at || '').slice(0, 10),
    status: r.status,
    content: r.content || '',
    results: r.results || '',
    issues: r.issues || '',
    proposals: r.proposals || '',
    taskId: r.task_id || '',
    submittedAt: dt(r.submitted_at),
    reviewedAt: dt(r.reviewed_at),
    reviewedBy: r.reviewed_by,
    reviewNote: r.review_note || '',
    publicSummary: r.public_summary || '',
    isPublic: !!r.is_public,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function submission(r) {
  if (!r) return null;
  return {
    id: r.id,
    ticketCode: r.ticket_code,
    formType: r.form_type,
    topicCode: r.topic_code || '',
    topicName: r.topic_name || '',
    status: r.status,
    priority: r.priority,
    subject: r.subject || '',
    name: r.full_name || '',
    fullName: r.full_name || '',
    email: r.email || '',
    phone: r.phone || '',
    address: r.address || '',
    isAnonymous: !!r.is_anonymous,
    content: r.content,
    message: r.content,
    assignedOrgId: r.assigned_org_id,
    assignedOrgName: r.assigned_org_name || null,
    assignedUserId: r.assigned_user_id,
    taskId: r.task_id,
    response: r.response || '',
    publicResponse: r.public_response || '',
    isPublicResult: !!r.is_public_result,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function proposal(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    summary: r.summary || '',
    excerpt: r.summary || '',
    body: r.body || '',
    categoryId: r.category_id,
    categoryName: r.category_name || null,
    orgId: r.org_id,
    orgName: r.org_name || null,
    authorId: r.author_id,
    authorName: r.author_name || null,
    taskId: r.task_id || '',
    status: r.status,
    reviewNote: r.review_note || '',
    reviewedBy: r.reviewed_by,
    reviewedAt: dt(r.reviewed_at),
    articleId: r.article_id,
    publishedAt: dt(r.published_at),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function role(r, perms = []) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    system: r.system_key,
    description: r.description || '',
    scope: r.data_scope,
    dataScope: r.data_scope,
    isSystem: !!r.is_system,
    perms,
    userCount: r.user_count != null ? Number(r.user_count) : undefined,
  };
}

function notification(r) {
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body || '',
    text: r.body || '',
    href: r.href || '#',
    read: !!r.is_read,
    time: r.created_at,
    createdAt: r.created_at,
  };
}

module.exports = {
  parseList, article, category, media, task, organization, event, document,
  report, submission, proposal, role, notification,
};
