/* QA: gửi biểu mẫu liên hệ trên PUBLIC → có mã tiếp nhận → tra cứu lại. */
export default async function run(page) {
  const log = [];
  page.on('pageerror', (e) => log.push('ERR ' + e.message.slice(0, 180)));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) log.push(`API ${r.status()} ${r.url().replace('http://localhost:8099', '')}`);
  });

  await page.goto('http://localhost:8099/pages/public/contact.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.PortalAPI, { timeout: 20000 });
  await page.selectOption('#ct-topic', 'gop-y-cong-thong-tin');
  await page.fill('#ct-subject', 'Kiểm thử biểu mẫu liên hệ trực tuyến');
  await page.fill('#ct-fullname', 'Công dân kiểm thử');
  await page.fill('#ct-phone', '0900000009');
  await page.fill('#ct-email', `qa${Date.now()}@example.com`);
  await page.fill('#ct-message', 'Nội dung góp ý kiểm thử tự động: đề nghị bổ sung tài liệu tuyên truyền cho phụ huynh học sinh.');
  await page.click('#ct-submit-btn');

  await page.waitForSelector('#ct-success-box.is-visible', { timeout: 20000 });
  const ticket = (await page.textContent('#ct-ticket-code')).replace('Mã tiếp nhận:', '').trim();

  await page.fill('#ct-lookup-code', ticket);
  await page.fill('#ct-lookup-contact', '0900000009');
  await page.click('#ct-lookup-form button[type="submit"]');
  await page.waitForSelector('#ct-lookup-result:not([hidden])', { timeout: 20000 });

  const result = await page.evaluate(() => ({
    summary: document.querySelector('.ct-lookup__summary').innerText.replace(/\s+/g, ' '),
    steps: document.querySelectorAll('.ct-lookup__step').length,
  }));

  await page.screenshot({ path: 'artifacts/public-contact.png' }).catch(() => { });
  return { ticket, result, log };
}
