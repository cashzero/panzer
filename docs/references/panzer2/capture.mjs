// Run with Vite running. Install Playwright outside the repo if necessary and
// point NODE_PATH to that installation's node_modules. No browser UI state used.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('playwright');
const output=fileURLToPath(new URL('./',import.meta.url));
const label=process.argv[2]??'after';
const browser=await chromium.launch({headless:true,...(process.env.PANZER2_QA_BROWSER?{executablePath:process.env.PANZER2_QA_BROWSER}:{channel:'msedge'})});
try{
  const page=await browser.newPage({viewport:{width:1200,height:1600},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.PANZER2_QA_URL??'http://127.0.0.1:3000'}/docs/references/panzer2/compare.html`);
  await page.waitForFunction(()=>Object.keys(window.panzer2QA??{}).length===4);
  await page.waitForFunction(()=>Object.keys(window.panzer2QA.front.measure()).length>150);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${output}${label}.png`});
  const bounds=await page.evaluate(()=>window.panzer2QA.front.measure());
  fs.writeFileSync(`${output}${label}-bounds.json`,JSON.stringify(bounds,null,2)+'\n');
  await page.locator('#reference').evaluate(el=>el.remove());
  await page.screenshot({path:`${output}${label}-model.png`});
  if(label==='after'){
    await page.setViewportSize({width:1200,height:800});
    for(const [name,params] of [['front-quarter',''],['rear-quarter','&rear'],['elevation','&elevation=20'],['depression','&elevation=-9'],['traverse','&traverse=90']]){
      await page.goto(`${process.env.PANZER2_QA_URL??'http://127.0.0.1:3000'}/docs/references/panzer2/compare.html?mode=perspective${params}`);
      await page.waitForFunction(()=>Object.keys(window.panzer2QA?.perspective?.measure()??{}).length>150);
      await page.screenshot({path:`${output}${name}.png`});
    }
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log(`Captured four production-renderer orthographic views; ${Object.keys(bounds).length} measured parts; no browser exceptions.`);
}finally{await browser.close();}
