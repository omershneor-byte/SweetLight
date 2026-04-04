const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', err => console.log('PAGEERROR:', err.stack || err.message));
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  await page.goto('http://127.0.0.1:2001', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'עיצוב מסגרת' }).click();
  await page.getByText('התחל ממסגרת נקייה').click();
  await page.waitForTimeout(1500);
  console.log('BODY', await page.locator('body').innerText());
  await page.screenshot({ path: 'C:\\Users\\Omer Shneor\\MISGAROT V2\\MisgarotV2_23_03_26\\tmp-editor-empty.png', fullPage: true });
  await browser.close();
})().catch(err=>{ console.error(err); process.exit(1); });
