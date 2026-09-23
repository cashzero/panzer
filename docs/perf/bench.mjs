// Battlefield frame-time benchmark. Run with the Vite dev server running.
// Install Playwright outside the repo if necessary and point NODE_PATH to that
// installation's node_modules. Uses the local Edge channel with the real GPU.
//   node docs/perf/bench.mjs <label> [--profile]
// Writes <label>.json (+ <label>-<scenario>.png, and <label>.cpuprofile with
// --profile) next to this script. Numbers depend on this machine and browser.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const {chromium} = createRequire(import.meta.url)('playwright');
const output = fileURLToPath(new URL('./', import.meta.url));
const label = process.argv[2] ?? 'current';
const profile = process.argv.includes('--profile');
const base = process.env.PERF_URL ?? 'http://127.0.0.1:3000';
const viewport = {width: Number(process.env.PERF_WIDTH ?? 1600), height: Number(process.env.PERF_HEIGHT ?? 900)};

const browser = await chromium.launch({headless: true, channel: 'msedge', args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist']});
try {
  const page = await browser.newPage({viewport, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    // Count WebGL draws per frame; triangles assume TRIANGLES mode.
    const stat = window.__glStat = {calls: 0, tris: 0};
    const P = WebGL2RenderingContext.prototype;
    const wrap = (name, tris) => { const f = P[name]; P[name] = function (...a) { stat.calls++; stat.tris += tris(a); return f.apply(this, a); }; };
    const tri = (mode, count) => (mode === 4 ? count / 3 : 0);
    wrap('drawElements', a => tri(a[0], a[1]));
    wrap('drawArrays', a => tri(a[0], a[2]));
    wrap('drawElementsInstanced', a => tri(a[0], a[1]) * a[4]);
    wrap('drawArraysInstanced', a => tri(a[0], a[2]) * a[3]);
    // Headless has no pointer lock; keep the free-look path reachable.
    Object.defineProperty(Document.prototype, 'pointerLockElement', {get() { return null; }, configurable: true});
  });
  const wait = ms => page.waitForTimeout(ms);
  const store = (src, arg) => page.evaluate(([s, a]) => new Function('store', 'a', s)(window.__store, a), [src, arg]);
  const measure = (name, ms = 5000) => page.evaluate(([name, ms]) => new Promise(resolve => {
    const frames = []; let last = performance.now(); const start = last;
    const c0 = window.__glStat.calls, t0 = window.__glStat.tris;
    const tick = now => {
      frames.push(now - last); last = now;
      if (now - start < ms) return requestAnimationFrame(tick);
      const sorted = [...frames].sort((a, b) => a - b);
      const n = frames.length;
      resolve({scenario: name, fps: +(1000 * n / (now - start)).toFixed(1),
        p50ms: +sorted[Math.floor(n * 0.5)].toFixed(1), p95ms: +sorted[Math.floor(n * 0.95)].toFixed(1),
        drawCallsPerFrame: Math.round((window.__glStat.calls - c0) / n),
        kTrianglesPerFrame: Math.round((window.__glStat.tris - t0) / n / 1000)});
    };
    requestAnimationFrame(tick);
  }), [name, ms]);

  await page.goto(`${base}/`);
  // Same module URL as the app, so this is the live store instance.
  await page.evaluate(async () => { window.__store = (await import('/src/store.ts')).useGameStore; });
  await store(`store.getState().deployOob();`);
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderFps, null, {timeout: 60000});
  await wait(6000);
  // Keep the player alive and the view deterministic for the whole run.
  await store(`const p = store.getState().playerTank; store.setState({playerTank: {...p, health: 1e7, maxHealth: 1e7}});`);

  const results = [];
  const scenario = async (name, setup, ms) => {
    await setup();
    await wait(1500);
    results.push(await measure(name, ms));
    await page.screenshot({path: `${output}${label}-${name}.png`});
  };
  await scenario('third-person', async () => {}, 5000);
  const cdp = profile ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', {interval: 200});
    await cdp.send('Profiler.start');
    await wait(5000);
    const {profile: cpu} = await cdp.send('Profiler.stop');
    fs.writeFileSync(`${output}${label}.cpuprofile`, JSON.stringify(cpu));
  }
  await scenario('facing-enemies', () => store(`const st = store.getState(); const p = st.playerTank;
    const e = [...st.enemies].sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position))[0];
    store.setState({playerTank: {...p, rotation: Math.atan2(e.position.x - p.position.x, e.position.z - p.position.z), turretRotation: 0}});`), 5000);
  await scenario('gunner', () => store(`store.setState({viewMode: 'gunner'});`), 5000);
  await store(`store.setState({viewMode: 'third-person'});`);
  await scenario('driving', () => page.keyboard.down('KeyW'), 4000);
  await page.keyboard.up('KeyW');

  const scene = await page.evaluate(() => ({textures: document.querySelector('canvas')?.dataset.renderTextures,
    renderer: (() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()}));
  const report = {label, date: new Date().toISOString(), viewport, ...scene, results, errors: [...new Set(errors)].slice(0, 20)};
  fs.writeFileSync(`${output}${label}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.table(results);
  console.log(`renderer: ${scene.renderer}`);
  if (report.errors.length) console.log(`console errors:\n${report.errors.join('\n')}`);
} finally { await browser.close(); }
