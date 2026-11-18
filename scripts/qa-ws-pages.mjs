import { loadQaCredentials } from './qa-credentials.mjs';
/* QA hai trang Workspace có nội dung mỏng: permissions & documents. */
const creds = loadQaCredentials();

export default async function run(page) {
  const log = [];
  page.on('pageerror', (e) => log.push('ERR ' + e.message.slice(0, 160)));

  await page.goto('http://localhost:8099/pages/workspace/login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.Workspace && window.PortalAPI), { timeout: 20000 });
  await page.fill('#ws-login-username', 'ws.nguyenvandat');
  await page.fill('#ws-login-password', creds['ws.nguyenvandat']);
  await Promise.all([page.waitForURL(/dashboard\.html/, { timeout: 20000 }).catch(() => { }), page.click('#ws-login-submit')]);
  await page.waitForTimeout(1500);

  const out = {};
  for (const p of ['permissions.html', 'documents.html']) {
    await page.goto('http://localhost:8099/pages/workspace/' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    out[p] = await page.evaluate(() => ({
      title: document.title,
      chars: document.body.innerText.trim().length,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260),
    }));
  }
  await page.screenshot({ path: 'artifacts/ws-documents.png' }).catch(() => { });
  return { out, log };
}
