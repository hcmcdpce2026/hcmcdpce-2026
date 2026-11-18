import { loadQaCredentials } from './qa-credentials.mjs';
/* QA tổng: mở tất cả trang của 3 phân hệ, ghi nhận lỗi JS và lỗi API. */
import fs from 'node:fs';

const creds = loadQaCredentials();

const PUBLIC_PAGES = [
  '', 'pages/public/about.html', 'pages/public/news.html', 'pages/public/education.html',
  'pages/public/laws.html', 'pages/public/statistics.html', 'pages/public/agencies.html',
  'pages/public/events.html', 'pages/public/support.html', 'pages/public/contact.html',
];

const CMS_PAGES = [
  'dashboard.html', 'content-list.html', 'content-editor.html?id=new', 'categories.html',
  'media-library.html', 'publishing-workflow.html', 'submissions.html', 'activity-log.html',
];

const WS_PAGES = [
  'dashboard.html', 'tasks.html', 'organizations.html', 'users.html', 'permissions.html',
  'documents.html', 'reports.html', 'calendar.html', 'notifications.html', 'activity-log.html',
];

export default async function run(page) {
  const report = { public: [], cms: [], workspace: [] };

  await page.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded' });
  const publicDetailPages = await page.evaluate(async () => {
    const readList = async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
      const payload = await response.json();
      return payload.data || [];
    };
    const [articles, education, laws, agencies, events] = await Promise.all([
      readList('/api/public/articles?limit=50'),
      readList('/api/public/articles?limit=50&group=education'),
      readList('/api/public/legal-documents'),
      readList('/api/public/agencies'),
      readList('/api/public/events'),
    ]);
    const detailUrl = (page, item) => `${page}${item ? `?id=${encodeURIComponent(item.id)}` : ''}`;
    return [
      detailUrl('pages/public/news-detail.html', articles[0]),
      detailUrl('pages/public/law-detail.html', laws[0]),
      detailUrl('pages/public/agency-detail.html', agencies[0]),
      detailUrl('pages/public/event-detail.html', events[0]),
      detailUrl('pages/public/education-detail.html', education[0]),
    ];
  });

  const visit = async (url, bucket) => {
    const errors = [];
    const apiErrors = [];
    const onErr = (e) => errors.push(e.message.slice(0, 140));
    const onRes = (r) => {
      if (r.url().includes('/api/') && r.status() >= 400) {
        apiErrors.push(`${r.status()} ${r.url().replace('http://localhost:8099', '')}`);
      }
    };
    page.on('pageerror', onErr);
    page.on('response', onRes);
    try {
      await page.goto('http://localhost:8099/' + url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1200);
      const info = await page.evaluate(() => ({
        title: document.title,
        chars: document.body.innerText.trim().length,
        titleOk: /CỔNG THÔNG TIN ĐIỆN TỬ VỀ PHÒNG, CHỐNG MA TÚY TẠI THÀNH PHỐ HỒ CHÍ MINH/.test(document.title),
        titleUpper: document.title === document.title.toUpperCase(),
        unloaded: /Đang tải dữ liệu|Đang cập nhật\.\.\./.test(document.body.innerText),
      }));
      report[bucket].push({ url, ...info, errors, apiErrors });
    } catch (e) {
      report[bucket].push({ url, fatal: e.message.slice(0, 120), errors, apiErrors });
    }
    page.off('pageerror', onErr);
    page.off('response', onRes);
  };

  for (const p of [...PUBLIC_PAGES, ...publicDetailPages]) await visit(p, 'public');

  // Đăng nhập CMS
  await page.goto('http://localhost:8099/pages/cms/login.html?stay=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.CMS && window.PortalAPI), { timeout: 20000 });
  await page.fill('#login-username', 'cms.nguyenvandat');
  await page.fill('#login-password', creds['cms.nguyenvandat']);
  await Promise.all([page.waitForURL(/dashboard\.html/, { timeout: 20000 }).catch(() => { }), page.click('#login-submit')]);
  await page.waitForTimeout(1500);
  for (const p of CMS_PAGES) await visit('pages/cms/' + p, 'cms');

  // Chuyển sang Workspace
  await page.goto('http://localhost:8099/pages/workspace/login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.Workspace && window.PortalAPI), { timeout: 20000 });
  await page.fill('#ws-login-username', 'ws.nguyenvandat');
  await page.fill('#ws-login-password', creds['ws.nguyenvandat']);
  await Promise.all([page.waitForURL(/dashboard\.html/, { timeout: 20000 }).catch(() => { }), page.click('#ws-login-submit')]);
  await page.waitForTimeout(1500);
  const workspaceDetailPages = await page.evaluate(async () => {
    const readList = async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
      const payload = await response.json();
      return payload.data || [];
    };
    const [tasks, organizations, reports] = await Promise.all([
      readList('/api/workspace/tasks'),
      readList('/api/workspace/organizations'),
      readList('/api/workspace/reports'),
    ]);
    const detailUrl = (page, item) => `${page}${item ? `?id=${encodeURIComponent(item.id)}` : ''}`;
    return [
      detailUrl('task-detail.html', tasks[0]),
      detailUrl('organization-detail.html', organizations[0]),
      detailUrl('report-editor.html', reports[0]),
    ];
  });
  for (const p of [...WS_PAGES, ...workspaceDetailPages]) await visit('pages/workspace/' + p, 'workspace');

  const summarize = (list) => ({
    total: list.length,
    failed: list.filter((x) => x.fatal || x.errors.length || x.apiErrors.length || x.chars < 200).length,
    titleIssues: list.filter((x) => !x.titleOk || !x.titleUpper).map((x) => x.url + ' :: ' + x.title.slice(0, 90)),
    problems: list.filter((x) => x.fatal || x.errors.length || x.apiErrors.length || x.chars < 200)
      .map((x) => ({ url: x.url, fatal: x.fatal, errors: x.errors, apiErrors: x.apiErrors, chars: x.chars })),
  });

  return { public: summarize(report.public), cms: summarize(report.cms), workspace: summarize(report.workspace) };
}
