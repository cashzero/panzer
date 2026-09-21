// NODE_PATH=/tmp/panzer-visual-qa/node_modules node docs/references/sherman/capture-mantlet.mjs
// Start Vite on port 3000 first. Uses the production renderer, not a proxy model.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const {chromium} = createRequire(import.meta.url)('playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const browser = await chromium.launch({headless:true, args:['--no-sandbox'], ...(process.env.SHERMAN_QA_BROWSER ? {executablePath:process.env.SHERMAN_QA_BROWSER} : {})});
const base = process.env.SHERMAN_QA_URL ?? 'http://127.0.0.1:3000';
try {
  const page = await browser.newPage({viewport:{width:1200,height:800},deviceScaleFactor:1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, params] of [
    ['mantlet-front', '&detail=front'], ['mantlet-side', '&detail=side'],
    ['mantlet-quarter', '&detail=quarter'], ['mantlet-elevation', '&detail=quarter&elevation=25'],
    ['mantlet-depression', '&detail=quarter&elevation=-12'], ['mantlet-full-tank', ''],
    ['turret-ring-side', '&detail=ring-side'], ['turret-ring-rear', '&detail=ring-rear'],
    ['turret-ring-traverse', '&detail=ring-rear&traverse=90'],
  ]) {
    await page.goto(`${base}/docs/references/sherman/compare.html?mode=perspective${params}`);
    await page.waitForFunction(() => Object.values(window.shermanQA ?? {}).some(v => Object.keys(v.measure()).length > 150));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({path:`${output}${name}.png`});
  }
  await page.setViewportSize({width:1200,height:1800});
  await page.goto(`${base}/docs/references/sherman/compare.html`);
  await page.waitForFunction(() => Object.keys(window.shermanQA ?? {}).length === 4 && Object.keys(window.shermanQA.front.measure()).length > 150);
  await page.locator('#reference').evaluate(img => img.decode());
  await page.screenshot({path:`${output}mantlet-overlay.png`});
  const bounds = await page.evaluate(() => window.shermanQA.front.measure());
  fs.writeFileSync(`${output}mantlet-bounds.json`, JSON.stringify(bounds,null,2)+'\n');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Captured front, side, quarter, elevation, depression, full tank and reference overlay; no browser exceptions.');
} finally { await browser.close(); }
