import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../dashboard/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw Error('Pass before or after');
const output = resolve(process.env.QA_EVIDENCE || 'tmp/issue-316-b-w5-evidence');
const browser = await chromium.launch({ headless: true });
const samples = [];
await mkdir(join(output, phase), { recursive: true });
try {
  for (const [width, locale, theme] of [
    [390, 'en', 'light'], [390, 'ar', 'dark'],
    [320, 'en', 'dark'], [768, 'ar', 'light'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 }, deviceScaleFactor: 1,
      reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    await context.addInitScript(({ locale, theme }) => {
      localStorage.setItem('vaylet_guest_locale', locale);
      localStorage.setItem('vaylet_guest_theme', theme);
    }, { locale, theme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.TARGET_URL || 'http://localhost:3315');
    await page.locator('header button').last().click();
    const title = locale === 'en' ? 'More options' : 'خيارات إضافية';
    const sheet = page.getByRole('dialog', { name: title });
    await sheet.waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });
    const rows = await sheet.getByRole('button').evaluateAll((buttons) =>
      buttons.filter((button) => button.querySelector('svg')).map((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        const label = button.querySelector('div[style*="font-size: 14px"]');
        return {
          label: label?.textContent ?? '',
          height: rect.height, width: rect.width,
          style: Object.fromEntries([
            'padding', 'border', 'border-radius', 'background-color', 'min-height',
            'display', 'align-items', 'justify-content', 'text-align',
          ].map((key) => [key, style.getPropertyValue(key)])),
          icon: button.querySelector('svg')?.outerHTML ?? '',
        };
      }));
    const name = `${width}-${locale}-${theme}`;
    await page.screenshot({ path: join(output, phase, `${name}.png`), fullPage: true });
    const sample = { name, rows, errors };
    if (phase === 'after') {
      const before = JSON.parse(await readFile(join(output, 'before', `${name}.json`), 'utf8'));
      const survivors = before.rows.filter((row) => !/Vehicle condition photos|صور حالة السيارة/.test(row.label));
      sample.parity = JSON.stringify(survivors) === JSON.stringify(rows);
      if (!sample.parity) throw Error(`Unchanged More row parity failed: ${name}`);
    }
    if (errors.length) throw Error(`${name}: ${errors.join('; ')}`);
    await writeFile(join(output, phase, `${name}.json`), JSON.stringify(sample, null, 2));
    samples.push(sample);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ phase, samples: samples.map(({ name, rows, parity }) => ({
  name, rows: rows.map((row) => row.label), parity,
})) }, null, 2));
