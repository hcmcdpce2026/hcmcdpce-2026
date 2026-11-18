import { loadQaCredentials } from './qa-credentials.mjs';
export default async function run(page) {
  const fs = await import('node:fs');
  const creds = loadQaCredentials();
  

  const log = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) log.push('NAV ' + f.url().replace('http://localhost:8099/pages/cms/', ''));
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/')) log.push(`  API ${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:8099/api', '')}`);
  });
  page.on('pageerror', (e) => log.push('  ERR ' + e.message.slice(0, 160)));

  await page.waitForFunction(() => !!(window.CMS && window.PortalAPI), { timeout: 30000 });
  await page.fill('#login-username', 'cms.nguyenvandat');
  await page.fill('#login-password', creds['cms.nguyenvandat']);
  await page.click('#login-submit');
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'artifacts/cms-login-flow.png', fullPage: false }).catch((e) => log.push('SHOT ERR ' + e.message));

  return { finalUrl: page.url().replace('http://localhost:8099', ''), log };
}
