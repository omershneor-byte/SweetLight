const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', err => console.log('PAGEERROR:', err.stack || err.message));
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  await page.goto('http://127.0.0.1:2001', { waitUntil: 'networkidle' });
  console.log('TITLE', await page.title());
  const texts = await page.locator('button').evaluateAll(btns => btns.slice(0,30).map(b => b.innerText));
  console.log('BUTTONS', JSON.stringify(texts));
  await browser.close();
})().catch(err=>{ console.error(err); process.exit(1); });
