// Run with Vite running. Install Playwright outside the repo if necessary and
// point NODE_PATH to that installation's node_modules. No browser UI state used.
//   node docs/references/panther_a/capture.mjs <label>
// Writes <label>.png (overlay), <label>-model.png and <label>-bounds.json. The
// "after" label also captures oblique, elevation, depression and traverse views.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const {chromium} = createRequire(import.meta.url)('playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const label = process.argv[2] ?? 'after';
const base = process.env.PANTHER_QA_URL ?? 'http://127.0.0.1:3000';
// Parts that must exist before the scene counts as loaded (one per slot).
const required = ['panther-welded-hull', 'left-batched-track-shoes', 'right-batched-track-shoes', 'panther-turret-shell', 'kwk42-barrel'];
const browser = await chromium.launch({headless: true, ...(process.env.PANTHER_QA_BROWSER ? {executablePath: process.env.PANTHER_QA_BROWSER} : {channel: 'msedge'})});
try {
  const page = await browser.newPage({viewport: {width: 1800, height: 2100}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  const loaded = names => Object.values(window.pantherQA ?? {}).length > 0 && Object.values(window.pantherQA).every(v => { const b = v.measure().bounds; return names.every(n => n in b); });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.goto(`${base}/docs/references/panther_a/compare.html`);
  await page.waitForFunction(() => Object.keys(window.pantherQA ?? {}).length === 4);
  await page.waitForFunction(loaded, required);
  await page.locator('#reference').evaluate(img => img.decode());
  await settle();
  await page.screenshot({path: `${output}${label}.png`});
  // World bounds of every named node plus world vertices of the sloped polyhedra.
  const capture = await page.evaluate(() => window.pantherQA.side.measure());
  fs.writeFileSync(`${output}${label}-bounds.json`, `${JSON.stringify(capture, null, 2)}\n`);
  await page.locator('#reference').evaluate(el => el.remove());
  await settle();
  await page.screenshot({path: `${output}${label}-model.png`});
  if (label === 'after') {
    await page.setViewportSize({width: 1200, height: 800});
    for (const [name, params] of [['front-quarter', ''], ['rear-quarter', '&rear'], ['top-quarter', '&top'], ['elevation', '&elevation=18'], ['depression', '&elevation=-8'], ['traverse', '&traverse=90'], ['traverse-rear', '&traverse=180&rear']]) {
      await page.goto(`${base}/docs/references/panther_a/compare.html?mode=perspective${params}`);
      await page.waitForFunction(loaded, required);
      await settle();
      await page.screenshot({path: `${output}${name}.png`});
    }
  }
  // Software WebGL (headless Chromium without a GPU) reports ReadPixels stalls.
  // R3F 9 still constructs THREE.Clock (deprecated in three r183), and the
  // browser's automatic favicon request 404s on this dev server. The generic
  // console 404 line is ignored only because each failing URL is checked below.
  const missing = errors.filter(e => /^HTTP \d+:/.test(e) && !/\/favicon\.ico$/.test(e));
  if (missing.length) throw Error(missing.join('\n'));
  const ignored = [/THREE\.Clock: This module has been deprecated/, /GPU stall due to ReadPixels/, /^HTTP \d+:/, /Failed to load resource: the server responded with a status of 404/];
  const relevant = errors.filter(e => !ignored.some(re => re.test(e)));
  if (relevant.length) throw Error(relevant.join('\n'));
  console.log(`Captured production-renderer views for '${label}'; ${Object.keys(capture.bounds).length} measured parts; no browser errors.`);
} finally { await browser.close(); }
