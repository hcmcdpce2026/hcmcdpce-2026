import { loadQaCredentials } from './qa-credentials.mjs';
/* QA: đăng nhập CMS và kiểm tra dashboard tải dữ liệu từ API. */
import fs from 'node:fs';

export default async function run(page, ui) {
  // Chặn CDN bên ngoài (môi trường kiểm thử không có Internet) để trang tải nhanh
  await page.route('**://cdnjs.cloudflare.com/**', (r) => r.abort());
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort());

  const creds = loadQaCredentials();

  const netLog = [];
  const errors = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/')) netLog.push(`${res.status()} ${res.request().method()} ${res.url().replace('http://localhost:8099', '')}`);
  });
  page.on('pageerror', (err) => errors.push(String(err.message)));

  await page.goto('http://localhost:8099/pages/cms/login.html?stay=1', { waitUntil: 'domcontentloaded' });
  await page.fill('#login-username', 'cms.nguyenvandat');
  await page.fill('#login-password', creds['cms.nguyenvandat']);
  await page.click('#login-submit');

  await page.waitForURL(/dashboard\.html/, { timeout: 20000 });
  await page.waitForSelector('.cms-stat-card', { timeout: 20000 });
  await page.waitForTimeout(1000);

  try {
    await page.screenshot({ path: 'artifacts/cms-dashboard.png', fullPage: false });
  } catch (e) { /* bỏ qua lỗi chụp */ }

  const state = await page.evaluate(() => ({
    url: location.href,
    hasStats: !!document.querySelector('.cms-stat-card'),
    statValues: Array.from(document.querySelectorAll('.cms-stat-card__value')).map((n) => n.textContent.trim()),
    retry: !!document.getElementById('cms-boot-retry'),
    mainText: (document.querySelector('.cms-main__inner') || {}).innerText || '',
    userName: (document.querySelector('.cms-user__name') || {}).textContent,
    title: document.title,
  }));

  return { netLog, errors, state };
}
