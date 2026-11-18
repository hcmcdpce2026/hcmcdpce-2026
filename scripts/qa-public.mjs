/* QA PUBLIC: trang chủ, tin tức, chi tiết, thống kê, pháp luật, cơ quan. */
export default async function run(page) {
  const log = [];
  page.on('pageerror', (e) => log.push('ERR ' + e.message.slice(0, 160)));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) log.push(`API ${r.status()} ${r.url().replace('http://localhost:8099', '')}`);
  });

  const out = {};

  await page.goto('http://localhost:8099/pages/public/news.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#news-article-list .news-article', { timeout: 20000 });
  out.news = await page.evaluate(() => ({
    count: document.querySelectorAll('#news-article-list .news-article').length,
    firstTitle: (document.querySelector('.news-article__title a') || {}).textContent,
    countLabel: (document.getElementById('news-result-count') || {}).textContent,
  }));
  await page.screenshot({ path: 'artifacts/public-news.png' }).catch(() => { });

  const href = await page.evaluate(() => (document.querySelector('.news-article__title a') || {}).getAttribute('href'));
  await page.goto('http://localhost:8099/pages/public/' + href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const t = document.getElementById('art-title');
    return t && !/Tăng cường phối hợp liên ngành/.test(t.textContent);
  }, { timeout: 20000 }).catch(() => log.push('detail: title not updated'));
  out.detail = await page.evaluate(() => ({
    title: (document.getElementById('art-title') || {}).textContent,
    bodyLen: (document.getElementById('article-body') || { innerText: '' }).innerText.length,
    docTitle: document.title,
  }));

  await page.goto('http://localhost:8099/pages/public/statistics.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  out.stats = await page.evaluate(() => ({
    metrics: document.querySelectorAll('.stat-metric').length,
    text: (document.querySelector('.stat-metrics, #stat-data-host') || { innerText: '' }).innerText.slice(0, 200),
  }));

  await page.goto('http://localhost:8099/pages/public/laws.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  out.laws = await page.evaluate(() => document.querySelectorAll('.law-item').length);

  await page.goto('http://localhost:8099/pages/public/agencies.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  out.agencies = await page.evaluate(() => document.querySelectorAll('.agency-card').length);

  return { out, log };
}
