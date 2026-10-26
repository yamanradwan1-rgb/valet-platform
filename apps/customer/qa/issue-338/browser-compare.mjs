import { setNativeBrowserZoom } from './native-browser-zoom.mjs';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import http from 'node:http';

const require = createRequire(new URL('../../../dashboard/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = resolve(process.env.QA338_EVIDENCE || '/workspace/work/issue338-evidence');
const widths = (process.env.QA338_WIDTHS || '320,390,768,1440').split(',').map(Number);
const files = (await readdir(join(root, 'before'))).filter((file) => file.endsWith('.html') && (!process.env.QA338_FILES || new RegExp(process.env.QA338_FILES).test(file)));
const zoom = process.env.QA338_ZOOM === '200';
const screenshots = zoom ? 'screenshots200' : 'screenshots';
const result = { zoom, cases: 0, geometryFailures: [], styleFailures: [], screenshots: [], errors: [] };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path.startsWith('/brand/')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(await readFile(new URL(`../../public${path}`, import.meta.url)));
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await readFile(join(root, path)));
    }
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: !zoom,
  args: ['--no-sandbox', '--disable-gpu'] });
const colorProperties = new Set(['color', 'background-color', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'caret-color',
  '-webkit-text-fill-color', '-webkit-text-stroke-color', 'border-image-source', 'fill', 'stroke', 'text-decoration-color', 'column-rule-color']);
async function capture(page) {
  return page.evaluate(() => {
    document.getAnimations().forEach((animation) => { animation.pause(); animation.currentTime = 5000; });
    return [...document.querySelectorAll('body *')].map((el) => {
      const box = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return { tag: el.tagName, text: el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.textContent : '',
        box: [box.x, box.y, box.width, box.height],
        style: Object.fromEntries([...css].filter((key) => !key.startsWith('--')).map((key) => [key, css.getPropertyValue(key)])) };
    });
  });
}
try {
  await mkdir(join(root, screenshots), { recursive: true });
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    for (const file of files) {
      const name = `${width}-${file.replace('.html', '')}`;
      const captures = [];
      for (const phase of ['before', 'after']) {
        await page.goto(`${base}/${phase}/${file}`);
        if (zoom) {
          await page.evaluate(() => { document.title = 'VAYLET Guest QA'; });
          setNativeBrowserZoom('VAYLET Guest QA');
          await page.waitForFunction(() => devicePixelRatio === 2);
        }
        await page.evaluate(() => document.fonts.ready);
        captures.push(await capture(page));
        if (width === 390 && /en-(light|dark)-(00FF00|8000FF)-(demo-parked|confirm|controls)\.html/u.test(file)) {
          const png = `${name}-${phase}.png`;
          if (zoom) {
            const cdp = await page.context().newCDPSession(page);
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
            await writeFile(join(root, screenshots, png), Buffer.from(shot.data, 'base64'));
            await cdp.detach();
          } else await page.screenshot({ path: join(root, screenshots, png), fullPage: true });
          result.screenshots.push(png);
        }
      }
      result.cases++;
      if (result.cases % 100 === 0) console.log(`Compared ${result.cases} renders`);
      const [before, after] = captures;
      if (width === 390 && /en-(light|dark)-(00FF00|8000FF)-(demo-parked|confirm|controls)\.html/u.test(file)) {
        const masks = before.flatMap((el, i) => after[i] && [...colorProperties].some((key) => el.style[key] !== after[i].style[key]) ? [el.box] : []);
        await writeFile(join(root, screenshots, `${name}-masks.json`), JSON.stringify({ scale: zoom ? 2 : 1, rects: masks }));
      }
      if (before.length !== after.length) result.geometryFailures.push({ name, reason: 'element count' });
      before.forEach((element, index) => {
        const next = after[index];
        if (!next || JSON.stringify([element.tag, element.text, element.box]) !== JSON.stringify([next.tag, next.text, next.box])) {
          result.geometryFailures.push({ name, index, before: element.box, after: next?.box });
        }
        for (const [property, value] of Object.entries(element.style)) {
          if (next && value !== next.style[property] && !colorProperties.has(property) && !property.endsWith('-color')) {
            result.styleFailures.push({ name, index, property, before: value, after: next.style[property] });
          }
        }
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
  await writeFile(join(root, zoom ? 'comparison200.json' : process.env.QA338_FILES ? 'sample-comparison.json' : 'comparison.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ ...result, screenshots: result.screenshots.length }, null, 2));
if (result.geometryFailures.length || result.styleFailures.length || result.errors.length) process.exitCode = 1;
