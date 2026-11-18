import { loadQaCredentials } from './qa-credentials.mjs';
/* QA: đăng nhập Workspace, kiểm tra dashboard, nhiệm vụ, báo cáo. */
import fs from 'node:fs';

const creds = loadQaCredentials();

export default async function run(page) {
  const log = [];
  page.on('pageerror', (e) => log.push('ERR ' + e.message.slice(0, 180)));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) log.push(`API ${r.status()} ${r.url().replace('http://localhost:8099', '')}`);
  });

  await page.goto('http://localhost:8099/pages/workspace/login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.Workspace && window.PortalAPI), { timeout: 25000 });
  await page.fill('#ws-login-username', 'ws.nguyenvandat');
  await page.fill('#ws-login-password', creds['ws.nguyenvandat']);
  await page.click('#ws-login-submit');

  await page.waitForURL(/dashboard\.html/, { timeout: 25000 });
  await page.waitForSelector('.ws-app', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/ws-dashboard.png' }).catch(() => { });

  const dash = await page.evaluate(() => ({
    title: document.title,
    user: (document.querySelector('.ws-user__name') || {}).textContent || '',
    hasBootError: /Không tải được dữ liệu/.test(document.body.innerText),
    bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
  }));

  // Trang nhiệm vụ
  await page.goto('http://localhost:8099/pages/workspace/tasks.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ws-tasks', { timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'artifacts/ws-tasks.png' }).catch(() => { });
  const tasks = await page.evaluate(() => ({
    rows: document.querySelectorAll('#ws-tasks tbody tr').length,
    firstRow: (document.querySelector('#ws-tasks tbody tr') || {}).innerText || '',
  }));

  // Trang báo cáo
  await page.goto('http://localhost:8099/pages/workspace/reports.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ws-reports', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const reports = await page.evaluate(() => ({
    rows: document.querySelectorAll('#ws-reports tbody tr').length,
  }));

  return { log, dash, tasks, reports };
}
