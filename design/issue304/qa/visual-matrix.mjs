import { join } from 'node:path';
import { screenshotsDir, widths, locales, themes, optionId, fileUrl } from './browser-setup.mjs';

const shellSelectors = ['.sidebar', '.topbar', '[data-shell-mobile-dialog]', '[data-shell-nav="main"]'];
const geometrySelectors = ['.shell', '.sidebar', '.topbar', '.content'];

async function setLocaleAndTheme(page, locale, theme, record, context) {
  if (await page.locator('html').getAttribute('lang') !== locale) {
    await page.locator('[data-shell-locale]').click();
  }
  const lang = await page.locator('html').getAttribute('lang');
  const direction = await page.locator('html').getAttribute('dir');
  record('locale-direction', lang === locale && direction === (locale === 'ar' ? 'rtl' : 'ltr'), context, `${lang}/${direction}`);
  if (await page.locator('html').getAttribute('data-theme') !== theme) {
    await page.locator(`[data-shell-theme="${theme}"]`).click();
  }
  const selectedTheme = await page.locator('html').getAttribute('data-theme');
  const active = await page.locator(`[data-shell-theme="${theme}"]`).getAttribute('aria-pressed');
  record('theme', selectedTheme === theme && active === 'true', context, `${selectedTheme}; aria-pressed=${active}`);
}

async function measure(page) {
  return page.evaluate(({ shellSelectors, geometrySelectors }) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10);
    };
    const style = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const css = getComputedStyle(el);
      return ['display', 'padding', 'backgroundColor', 'color', 'fontFamily', 'fontSize', 'gridTemplateColumns'].map((key) => css[key]);
    };
    return {
      html: shellSelectors.map((selector) => document.querySelector(selector)?.outerHTML ?? null),
      shellCss: document.querySelector('[data-issue304-shell]')?.textContent ?? '',
      geometry: geometrySelectors.map(rect),
      style: geometrySelectors.map(style),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      contentWidth: document.querySelector('#keys-spots-design-content')?.getBoundingClientRect().width ?? -1,
      navCurrent: document.querySelectorAll('.sidebar [aria-current="page"]').length,
      images: [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src.slice(0, 60)),
      topbarSpill: [...document.querySelectorAll('.topbar button')].filter((el) => {
        const rect = el.getBoundingClientRect();
        const bar = document.querySelector('.topbar').getBoundingClientRect();
        return rect.width && rect.height && rect.bottom > bar.bottom + 2;
      }).map((el) => ({ label: el.getAttribute('aria-label') || el.textContent.trim(),
        bottom: Math.round(el.getBoundingClientRect().bottom) })),
      clippedControls: [...document.querySelectorAll('#keys-spots-design-content button, #keys-spots-design-content input, #keys-spots-design-content select')]
        .filter((el) => {
          if (el.closest('[role="region"], .a-table-scroll, [hidden]')) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.left < -2 || rect.right > innerWidth + 2);
        }).slice(0, 20).map((el) => ({ label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30),
          box: [Math.round(el.getBoundingClientRect().left), Math.round(el.getBoundingClientRect().right)] })),
    };
  }, { shellSelectors, geometrySelectors });
}

function parityKey(width, locale, theme) { return `${width}/${locale}/${theme}`; }

export async function runVisualMatrix(browser, options, record) {
  const snapshots = new Map();
  const metadata = [];
  for (const path of options) {
    const option = optionId(path);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    const page = await context.newPage();
    const externalRequests = [];
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of locales) for (const theme of themes) {
        const checkContext = { option, width, locale, theme };
        try {
          await page.goto(fileUrl(path), { waitUntil: 'load' });
          await setLocaleAndTheme(page, locale, theme, record, checkContext);
          const result = await measure(page);
          const key = parityKey(width, locale, theme);
          if (!snapshots.has(key)) snapshots.set(key, { option, result });
          const baseline = snapshots.get(key).result;
          for (const field of ['html', 'shellCss', 'geometry', 'style']) {
            record(`shell-parity-${field}`, JSON.stringify(result[field]) === JSON.stringify(baseline[field]), checkContext,
              `against ${snapshots.get(key).option}`);
          }
          record('horizontal-overflow', result.overflow <= 2, checkContext, `document overflow ${result.overflow}px`);
          record('shell-active-nav', result.navCurrent === 1, checkContext, `active=${result.navCurrent}`);
          record('logo-image-load', result.images.length === 0, checkContext, result.images.join(', '));
          record('nonempty-interior', result.contentWidth > 0, checkContext, `width=${result.contentWidth}`);
          record('topbar-controls-within-header', result.topbarSpill.length === 0, checkContext, JSON.stringify(result.topbarSpill));
          record('no-offscreen-interactive-controls', result.clippedControls.length === 0, checkContext, JSON.stringify(result.clippedControls));
          const shot = `${option}-${width}-${locale}-${theme}.png`;
          await page.screenshot({ path: join(screenshotsDir, shot), fullPage: true });
          metadata.push({ ...checkContext, screenshot: shot, documentOverflow: result.overflow });
        } catch (error) {
          record('visual-runtime', false, checkContext, String(error));
        }
      }
    }
    record('no-external-requests', externalRequests.length === 0, { option }, externalRequests.slice(0, 6).join(', '));
    await context.close();
  }
  return metadata;
}

export async function runZoomChecks(browser, options, record) {
  const observations = [];
  for (const path of options) {
    const option = optionId(path);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(fileUrl(path));
      await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
      const cssZoom = await page.evaluate(() => ({
        zoom: getComputedStyle(document.documentElement).zoom,
        overflow: document.documentElement.scrollWidth - innerWidth,
        width: document.querySelector('#keys-spots-design-content')?.getBoundingClientRect().width,
      }));
      record('css-zoom-200pct-applied', cssZoom.zoom === '2' && cssZoom.width > 0,
        { option, viewport: 1440, zoom: 'CSS 200%' }, JSON.stringify(cssZoom));
      record('native-browser-zoom-200pct', null,
        { option, viewport: 1440, zoom: 'native Edge 200%' },
        `NOT RUN: CSS zoom is not native browser zoom (injected zoom overflow=${cssZoom.overflow}px). ` +
        'A separate 720px CSS-layout equivalent is tested below.');
      await page.screenshot({ path: join(screenshotsDir, `${option}-1440-zoom200.png`), fullPage: true });
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
      await page.setViewportSize({ width: 720, height: 900 });
      const narrow = await measure(page);
      record('browser-zoom-200pct-layout-proxy', narrow.overflow <= 2 && narrow.contentWidth > 0,
        { option, viewport: 720, zoom: '1440/2 proxy' }, `horizontal overflow=${narrow.overflow}px`);
      await page.screenshot({ path: join(screenshotsDir, `${option}-720-zoom-proxy.png`), fullPage: true });
      observations.push({ option, cssZoom, narrowOverflow: narrow.overflow });
    } catch (error) { record('zoom-runtime', false, { option }, String(error)); }
    await context.close();
  }
  return observations;
}
