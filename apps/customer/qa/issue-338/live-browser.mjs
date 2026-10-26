import { setNativeBrowserZoom } from './native-browser-zoom.mjs';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../../dashboard/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = resolve(process.env.QA338_EVIDENCE || '/workspace/work/issue338-evidence');
const target = process.env.TARGET_URL || 'http://127.0.0.1:3314';
const zoom = process.env.QA338_ZOOM === '200';
const result = { zoom, cases: [], errors: [] };
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: !zoom,
  args: ['--no-sandbox', '--disable-gpu'] });
function contrast(a, b) {
  const lum = (color) => color.match(/[\d.]+/gu).slice(0, 3).map(Number).map((v) => {
    v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
try {
  for (const width of [320, 390, 768, 1440]) for (const locale of ['en', 'ar']) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem('vaylet_guest_locale', locale);
      localStorage.setItem('vaylet_guest_theme', theme);
    }, { locale, theme });
    let color = '#00FF00';
    let failure = false;
    await page.route('**/api/v1/guest/**', async (route) => {
      const url = route.request().url();
      const session = { valetSessionId: '123e4567-e89b-12d3-a456-426614174000', state: 'PARKED', readyAt: null,
        vehicle: { make: 'Toyota', model: 'Camry', color: 'Black' },
        ...(color === 'fallback' ? {} : { branding: { displayName: 'Fixture venue', primaryColor: color } }) };
      await route.fulfill({ status: failure ? 401 : 200, contentType: 'application/json',
        body: JSON.stringify(failure ? { code: 'GUEST_ACCESS_INVALID', message: 'Expired' }
          : url.endsWith('/session') ? session : { result: 'RECOVERED', enabled: false }) });
    });
    for (color of ['#00FF00', '#8000FF', 'fallback']) {
      await page.goto(target);
      if (zoom) {
        setNativeBrowserZoom('VAYLET Guest');
        await page.waitForFunction(() => devicePixelRatio === 2);
      }
      const button = page.locator('main button.guest-brand-primary');
      await button.waitFor();
      await page.waitForFunction(() => !document.querySelector('main button.guest-brand-primary')?.disabled);
      assert.equal(await page.locator('html').getAttribute('dir'), locale === 'ar' ? 'rtl' : 'ltr');
      await page.waitForFunction(() => document.getAnimations().every((animation) =>
        animation.effect?.getTiming().iterations === Infinity || animation.playState === 'finished'));
      const geometry = () => button.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height, x: box.x + scrollX, y: box.y + scrollY };
      });
      const initialBox = await geometry();
      const states = {};
      for (const state of ['default', 'hover', 'pressed', 'focus']) {
        if (state === 'hover') await button.hover();
        if (state === 'pressed') await page.mouse.down();
        if (state === 'focus') { await page.mouse.move(0, 0); await page.mouse.up(); await page.keyboard.press('Tab'); await button.focus(); }
        await page.waitForTimeout(180);
        states[state] = await button.evaluate((el) => {
          const css = getComputedStyle(el);
          return { background: css.backgroundColor, color: css.color, outline: css.outlineColor,
            outlineStyle: css.outlineStyle, primary: css.getPropertyValue('--brand-primary') };
        });
        assert.deepEqual(await geometry(), initialBox);
        if (color !== 'fallback') assert.ok(contrast(states[state].background, states[state].color) >= 4.5);
      }
      if (color !== 'fallback') {
        assert.equal(states.default.primary, color);
        assert.notEqual(states.default.background, states.hover.background);
        assert.notEqual(states.hover.background, states.pressed.background);
      }
      assert.equal(states.focus.outlineStyle, 'solid');
      if (width === 390 && color === '#00FF00') await page.screenshot({ path: join(root, `live-${zoom ? 200 : 100}-${locale}-${theme}.png`), fullPage: true });
      await context.setOffline(true);
      await page.waitForFunction(() => document.querySelector('main button.guest-brand-primary')?.disabled);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('main button.guest-brand-primary')).opacity === '0.5');
      assert.equal(await button.evaluate((el) => getComputedStyle(el).opacity), '0.5');
      await context.setOffline(false);
      result.cases.push({ width, locale, theme, color, devicePixelRatio: await page.evaluate(() => devicePixelRatio), states });
    }
    failure = true;
    await page.goto(target);
    await page.getByText(locale === 'en' ? 'Valet session unavailable' : 'خدمة الاصطفاف غير متاحة', { exact: false }).first().waitFor();
    assert.equal(await page.locator('[style*="--brand-primary:"]').count(), 0);
    await page.close();
    await context.close();
  }
} catch (error) { result.errors.push(String(error.stack || error)); }
finally {
  await browser.close();
  await writeFile(join(root, `live-${zoom ? 200 : 100}-results.json`), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ zoom, cases: result.cases.length, errors: result.errors }, null, 2));
if (result.errors.length || result.cases.length !== 48) process.exitCode = 1;
