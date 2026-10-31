import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
const require = createRequire('D:/kndoom/valet-platform/apps/dashboard/package.json');
const { chromium, expect } = require('@playwright/test');
const base = 'http://127.0.0.1:4343/';
const browser = await chromium.launch({ headless: false });
const failures = [], external = [], passed = [];
const record = (message) => { passed.push(message); console.log('PASS', message); };
const screenshot = (name) => fileURLToPath(new URL(`./screenshots/${name}.png`, import.meta.url));
async function setup(locale = 'en', theme = 'light', width = 1440, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(({ locale, theme }) => {
    localStorage.setItem('vaylet_dashboard_locale', locale);
    localStorage.setItem('vaylet_dashboard_theme', theme);
  }, { locale, theme });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      external.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto(base);
  const detailName = locale === 'ar' ? 'التفاصيل: اصطفاف' : 'Details: Parking';
  // Use actual table actions and the actual production drawer.
  const action = page.getByRole('button', { name: detailName, exact: true }).first();
  if (!(await action.count())) console.log('BUTTONS', await page.getByRole('button').allTextContents());
  await action.click();
  return { page, context };
}
async function open(page, locale = 'en') {
  await page.getByRole('button', { name: locale === 'ar' ? 'عرض المسار' : 'View Route', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: locale === 'ar' ? 'سجل المسار المسجّل' : 'Recorded Route History', exact: true });
  await viewer.getByRole('group', { name: locale === 'ar' ? 'خريطة إحداثيات GPS المسجّلة' : 'Recorded GPS coordinate map' }).waitFor();
  return viewer;
}
try {
  const { page, context } = await setup();
  // A fresh page has no lazy viewer or route fixtures loaded before intent.
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /route-viewer|route-fixtures|route-map\.tsx/.test(r.name)))).toBe(false);
  passed.push('No route viewer/map/coordinate fixture module before View Route');
  await page.screenshot({ path: screenshot('route-section'), fullPage: true });
  const viewer = await open(page);
  await viewer.getByRole('button', { name: 'Next sample', exact: true }).click();
  await expect(viewer.getByRole('status')).toContainText('Sample 2 of 24');
  const slider = viewer.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('23');
  await viewer.getByRole('button', { name: 'Start, 14:24:05', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await viewer.getByRole('button', { name: 'Fit recording', exact: true }).click();
  await page.screenshot({ path: screenshot('route-viewer'), fullPage: true });
  const close = viewer.getByRole('button', { name: 'Close route viewer' });
  const summary = viewer.locator('summary');
  await summary.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'View Route', exact: true })).toBeFocused();
  passed.push('Point selection, timestamp slider, zoom/fit, closed-details focus trap, Escape, focus return');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Details: Retrieval', exact: true }).click();
  const retrieval = await open(page);
  await expect(retrieval.getByRole('status')).toContainText('15:42:05');
  passed.push('Switching Tasks resets route/time/context; Retrieval fixture differs');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Details: Parking', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'View Route', exact: true })).toBeDisabled();
  passed.push('Active Task never opens historical route');
  await context.close();

  const states = await setup();
  const stateViewer = await open(states.page);
  await stateViewer.locator('summary').click();
  const scenario = stateViewer.getByLabel('Demo scenario', { exact: true });
  for (const [value, text] of [
    ['empty', 'No recorded GPS points'], ['single', 'One observation only.'],
    ['loading', 'Loading recorded route…'], ['unavailable', 'Route unavailable'],
    ['denied', 'Route access unavailable'], ['long', '2,000'],
    ['partial', 'Partial recording.'], ['sparse', '4'], ['noisy', '24'], ['short', '2'],
  ]) {
    await scenario.selectOption(value);
    await expect(stateViewer).toContainText(text);
    if (['denied', 'unavailable', 'loading', 'empty'].includes(value)) {
      await expect(stateViewer.locator('[data-route-segment]')).toHaveCount(0);
      await expect(stateViewer.getByRole('slider')).toHaveCount(0);
    }
    if (value === 'partial') await expect(stateViewer.locator('[data-route-segment]')).toHaveCount(2);
    if (value === 'long') {
      await stateViewer.getByRole('slider').focus();
      await states.page.keyboard.press('End');
      await expect(stateViewer.getByRole('slider')).toHaveValue('1999');
      expect(await stateViewer.locator('svg g[role="button"]').count()).toBeLessThanOrEqual(30);
    }
    record(`State: ${value}`);
  }
  await scenario.selectOption('provider');
  await expect(stateViewer).toContainText('Map could not be loaded');
  await stateViewer.getByRole('button', { name: 'Retry', exact: true }).click();
  await stateViewer.getByRole('slider').waitFor();
  passed.push('Provider failure and read-only retry');
  await states.context.close();

  for (const locale of ['en', 'ar']) for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1440]) {
    const item = await setup(locale, theme, width);
    const dialog = await open(item.page, locale);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const closeButton = dialog.getByRole('button', { name: locale === 'ar' ? 'إغلاق عارض المسار' : 'Close route viewer' });
    await closeButton.scrollIntoViewIfNeeded();
    const rect = await closeButton.boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(await item.page.locator('html').getAttribute('dir')).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    expect(await item.page.locator('html').getAttribute('data-theme')).toBe(theme);
    if (locale === 'ar' && theme === 'dark' && width === 390) {
      await item.page.screenshot({ path: screenshot('route-arabic-mobile'), fullPage: true });
    }
    if (locale === 'ar' && theme === 'dark' && width === 1440) {
      await item.page.screenshot({ path: screenshot('route-arabic-dark'), fullPage: true });
    }
    record(`Viewport ${width}, ${locale}, ${theme}: no viewer overflow, Close reachable`);
    await item.context.close();
  }

  // 200% content magnification; this is explicitly an emulation, not browser-chrome zoom.
  for (const locale of ['en', 'ar']) {
    const item = await setup(locale, 'light', 1440, 1000);
    await item.page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const dialog = await open(item.page, locale);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await item.page.keyboard.press('Escape');
    await expect(item.page.getByRole('button', { name: locale === 'ar' ? 'عرض المسار' : 'View Route', exact: true })).toBeFocused();
    passed.push(`200% content zoom emulation, ${locale}: no viewer overflow; Escape/return focus`);
    await item.context.close();
  }
  expect(external).toEqual([]);
  expect(failures).toEqual([]);
  console.log(JSON.stringify({ passed, externalRequests: external.length, pageErrors: failures }, null, 2));
  await writeFile(new URL('./verification.json', import.meta.url), JSON.stringify({ passed, externalRequests: external.length, pageErrors: failures }, null, 2));
} finally { await browser.close(); }
