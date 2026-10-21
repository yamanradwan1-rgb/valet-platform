/**
 * Capture real CSS viewport evidence for the immutable #313 baseline.
 * Usage: node capture-reference.mjs
 * Only local file:// fixture; no Dashboard credentials or API traffic.
 * Requires installed Microsoft Edge and Node 22+ native WebSocket.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const baseline=resolve(here,'../../baseline/current-analytics.html');
const edge=String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const profile=join(here,`.cdp-edge-${process.pid}`);
if (!existsSync(edge)) throw Error('Microsoft Edge missing at expected host path');
if (!existsSync(baseline)) throw Error('Missing issue-313 baseline HTML');
const cases=[
  {width:1440,height:900,lang:'en',theme:'light'},
  {width:1440,height:900,lang:'ar',theme:'dark'},
  {width:768,height:900,lang:'ar',theme:'light'},
  {width:390,height:844,lang:'ar',theme:'dark'},
  {width:320,height:800,lang:'en',theme:'light'},
];
const edgeProcess=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--remote-allow-origins=*','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws,serial=0;
const pending=new Map();
async function send(method,params={}) {
  const id=++serial;
  return await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`CDP ${method} timeout`));},6000);
    pending.set(id,{resolve:x=>{clearTimeout(timeout);resolve(x);},reject:e=>{clearTimeout(timeout);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const reply=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails));
  return reply.result?.value;
}
function imageMetrics(png){return {width:png.readUInt32BE(16),height:png.readUInt32BE(20),bytes:png.length};}
try {
  let port;
  for(let i=0;i<80;i++) {
    const file=join(profile,'DevToolsActivePort');
    if(existsSync(file)) {port=Number(readFileSync(file,'utf8').split(/\r?\n/)[0]);break;}
    if(edgeProcess.exitCode!==null) throw Error(`Edge exited ${edgeProcess.exitCode} before debugger was ready`);
    await sleep(100);
  }
  if(!port) throw Error('Edge did not expose DevToolsActivePort');
  const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page=pages.find(p=>p.type==='page');
  if(!page) throw Error('No Edge CDP page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    const task=pending.get(msg.id);
    if(!task)return;
    pending.delete(msg.id);
    if(msg.error)task.reject(Error(JSON.stringify(msg.error)));
    else task.resolve(msg.result);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const reports=[];
  for(const setting of cases) {
    const {width,height,lang,theme}=setting;
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false,screenWidth:width,screenHeight:height});
    await send('Page.navigate',{url:`${pathToFileURL(baseline).href}?lang=${lang}&theme=${theme}`});
    let ready=false;
    for(let i=0;i<60;i++){
      ready=await evaluate("document.body && document.body.dataset.baselineReady === 'true'").catch(()=>false);
      if(ready)break;
      await sleep(80);
    }
    if(!ready) throw Error(`Baseline script did not initialize for ${width} ${lang} ${theme}`);
    await sleep(160);
    const layout=await evaluate(`(() => {
      const selectors=['.shell','.sidebar','.topbar','.content','.content-inner','.page','.header','.headerActions','#frozen-kpi-grid','#frozen-chart-grid','.chartPanel'];
      const rects=Object.fromEntries(selectors.map(s=>{const node=document.querySelector(s),b=node.getBoundingClientRect();return [s,{x:+b.x.toFixed(1),y:+b.y.toFixed(1),width:+b.width.toFixed(1),height:+b.height.toFixed(1),scrollWidth:node.scrollWidth}]}));
      return {innerWidth:innerWidth,innerHeight:innerHeight,clientWidth:document.documentElement.clientWidth,documentScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.dataset.theme,numberKpiCards:document.querySelectorAll('[data-testid="analytics-metric-card"]').length,numberChartPanels:document.querySelectorAll('[data-testid="analytics-chart-panel"]').length,metricLabels:[...document.querySelectorAll('[data-testid="analytics-card-label"]')].map(x=>x.textContent),rects};
    })()`);
    const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
    const png=Buffer.from(image.data,'base64');
    const name=`static-${width}-${lang}-${theme}.png`;
    writeFileSync(join(here,name),png);
    const result={case:setting,screenshot:name,screenshotDimensions:imageMetrics(png),layout};
    writeFileSync(join(here,`geometry-${width}-${lang}-${theme}.json`),JSON.stringify(result,null,2)+'\n');
    if(width<=390) {
      // The real shell scrolls inside .content. Expand the simulated viewport
      // temporarily to capture the full KPI → insertion point → charts layout.
      const completeHeight=await evaluate('Math.ceil(document.querySelector(".content-inner").scrollHeight + document.querySelector(".topbar").getBoundingClientRect().height + 60)');
      await send('Emulation.setDeviceMetricsOverride',{width,height:completeHeight,deviceScaleFactor:1,mobile:false,screenWidth:width,screenHeight:completeHeight});
      await sleep(120);
      const full=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
      const fullPng=Buffer.from(full.data,'base64');
      const fullName=`full-${width}-${lang}-${theme}.png`;
      writeFileSync(join(here,fullName),fullPng);
      result.fullPageScreenshot={name:fullName,...imageMetrics(fullPng)};
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false,screenWidth:width,screenHeight:height});
    }
    reports.push(result);
    console.log(`${name}: CSS ${layout.innerWidth}x${layout.innerHeight}, image ${result.screenshotDimensions.width}x${result.screenshotDimensions.height}, overflow ${layout.documentScrollWidth>width}, KPI ${layout.numberKpiCards}, chart ${layout.numberChartPanels}`);
    if(layout.innerWidth!==width||layout.numberKpiCards!==4||layout.numberChartPanels!==2||layout.documentScrollWidth>width) throw Error(`Visual geometry assertion failed ${name}`);
  }
  writeFileSync(join(here,'capture-manifest.json'),JSON.stringify({source:'synthetic standalone HTML, NOT live authenticated Dashboard',sourceSha:'459e9c42dfff5b2aeb11ee9165a7d1a4338a7783',method:'Chromium CDP Emulation.setDeviceMetricsOverride deviceScaleFactor=1, Page.captureScreenshot',results:reports.map(x=>({case:x.case,screenshot:x.screenshot,cssViewport:x.layout.innerWidth,screenshotDimensions:x.screenshotDimensions,fullPageScreenshot:x.fullPageScreenshot}))},null,2)+'\n');
} finally {
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}ws.close();}
  if(edgeProcess.exitCode===null)edgeProcess.kill();
}
