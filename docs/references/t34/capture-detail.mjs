// Close-up renders of the gun mount for shape review (Vite must be running).
//   node docs/references/t34/capture-detail.mjs <label>
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium} = createRequire(import.meta.url)('playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const label = process.argv[2] ?? 'detail';
const base = process.env.T34_QA_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({headless: true, ...(process.env.T34_QA_BROWSER ? {executablePath: process.env.T34_QA_BROWSER} : {channel: 'msedge'})});
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}, deviceScaleFactor: 1});
  for (const view of ['side', 'front', 'quarter']) {
    await page.goto(`${base}/docs/references/t34/compare.html?mode=detail&view=${view}`);
    await page.waitForFunction(() => window.t34QA?.detail && 'f34-barrel' in window.t34QA.detail.measure().bounds);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({path: `${output}${label}-${view}.png`});
  }
  console.log(`Captured gun-mount close-ups for '${label}'.`);
} finally { await browser.close(); }
