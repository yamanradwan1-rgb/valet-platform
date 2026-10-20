// Issue #304 Owner follow-up: ONLY refined Option 3. Prime serializes browser ownership.
// Do not execute until Prime explicitly authorizes a browser QA window.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { designDir, qaDir, fileUrl, launchEdge, makeRecorder } from './browser-setup.mjs';

const option = join(designDir, 'option-3.html');
const fixture = JSON.parse(readFileSync(join(designDir, 'fixtures', 'canonical-data.json'), 'utf8'));
const screenshotDir = join(designDir, 'evidence', 'screenshots');
const widths = [320, 390, 768, 1440], locales = ['en', 'ar'], themes = ['light', 'dark'];
const kpis = ['keys-active', 'keys-available', 'keys-in-use', 'spots-active', 'spots-available', 'spots-occupied'];
const kpiCopyKeys = ['activeKeySlots', 'keysAvailable', 'keysInUse', 'activeParkingSpots', 'spotsAvailable', 'spotsOccupied'];
const exact = { 'loc-a': [6, 2, 4, 7, 3, 4], 'loc-b': [2, 1, 1, 2, 1, 1] };
const vehicleCases = {
  'loc-a': [
    { type: 'keys', code: 'K-02', identity: 'DEMO 4821', kind: 'plate' },
    { type: 'spots', code: 'P-02', identity: 'DEMO 4821', kind: 'plate' },
    { type: 'keys', code: 'K-03', identity: ['Temporary vehicle · Silver sedan', 'مركبة مؤقتة · سيدان فضية'], kind: 'descriptor' },
    { type: 'spots', code: 'P-03', identity: ['Temporary vehicle · Silver sedan', 'مركبة مؤقتة · سيدان فضية'], kind: 'descriptor' },
    { type: 'keys', code: 'K-08', identity: ['Vehicle identity unavailable', 'هوية المركبة غير متاحة'], kind: 'unavailable' },
    { type: 'spots', code: 'P-08', identity: ['Vehicle identity unavailable', 'هوية المركبة غير متاحة'], kind: 'unavailable' },
    { type: 'keys', code: 'K-05', identity: ['Vehicle association unknown', 'ارتباط المركبة غير معروف'], kind: 'inactive' },
    { type: 'spots', code: 'P-04', identity: ['Vehicle association unknown', 'ارتباط المركبة غير معروف'], kind: 'inactive' },
  ],
  'loc-b': [
    { type: 'keys', code: 'K-12', identity: 'DEMO 9076', kind: 'plate' },
    { type: 'spots', code: 'P-12', identity: 'DEMO 9076', kind: 'plate' },
    { type: 'keys', code: 'K-13', identity: ['Vehicle association unknown', 'ارتباط المركبة غير معروف'], kind: 'inactive' },
    { type: 'spots', code: 'P-13', identity: ['Vehicle association unknown', 'ارتباط المركبة غير معروف'], kind: 'inactive' },
  ],
};
const { checks, record } = makeRecorder();
const screenshots = [], observations = [], errors = [];
const num = (value) => Number(String(value).replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[^0-9.-]/g, ''));
const localeIdentity = (value, locale) => Array.isArray(value) ? value[locale === 'ar' ? 1 : 0] : value;
const snap = async (page, name) => {
  const filename = `option3-refined-${name}.png`;
  await page.screenshot({ path: join(screenshotDir, filename), fullPage: true });
  screenshots.push(filename);
};

function fixtureCounts(location) {
  const resources = fixture.resources[location];
  const count = (rows, status, usage) => rows.filter((r) => r.status === status && (!usage || r.usage === usage)).length;
  const keys = resources.keys, spots = resources.spots;
  return [count(keys, 'ACTIVE'), count(keys, 'ACTIVE', 'AVAILABLE'), count(keys, 'ACTIVE', 'IN_USE'),
    count(spots, 'ACTIVE'), count(spots, 'ACTIVE', 'AVAILABLE'), count(spots, 'ACTIVE', 'OCCUPIED')];
}

async function setLocaleTheme(page, locale, theme) {
  const html = page.locator('html');
  if (await html.getAttribute('lang') !== locale) await page.locator('[data-shell-locale]').click();
  if (await html.getAttribute('data-theme') !== theme) await page.locator(`[data-shell-theme="${theme}"]`).click();
  return [await html.getAttribute('lang'), await html.getAttribute('dir'), await html.getAttribute('data-theme')];
}

async function setLocation(page, loc) {
  await page.locator('[data-shell-location-trigger]').click();
  await page.locator(`[data-shell-location-option="${loc === 'loc-a' ? 0 : 1}"]`).click();
}

async function family(page, type) { await page.locator(`[data-c-family="${type}"]`).click(); }

async function readKpis(page) {
  return page.evaluate(({ keys, copyKeys }) => keys.map((key, index) => {
    const el = document.querySelector(`[data-c-kpi="${key}"]`);
    if (!el) return { key, present: false };
    const value = el.querySelector('[data-c-kpi-value]');
    const label = el.querySelector('.c-kpi-label, [data-c-kpi-label]');
    const localization = document.querySelector('[data-c-copy]');
    const translations = localization ? JSON.parse(localization.textContent) : {};
    const expectedLabel = translations[copyKeys[index]]?.[document.documentElement.lang === 'ar' ? 1 : 0] || '';
    const valueNode = value || el.querySelector('strong,output,[data-value]');
    const r = el.getBoundingClientRect();
    const css = valueNode && getComputedStyle(valueNode);
    const labelCss = label && getComputedStyle(label);
    return { key, present: true, value: valueNode?.textContent?.trim() || '',
      label: label?.textContent?.trim() || '', expectedLabel,
      caption: el.querySelector('.c-kpi-context')?.textContent?.trim() || '',
      visible: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none',
      valueFontPx: css ? parseFloat(css.fontSize) : 0,
      labelFontPx: labelCss ? parseFloat(labelCss.fontSize) : 0 };
  }), { keys: kpis, copyKeys: kpiCopyKeys });
}

async function verifyKpis(page, loc, type, context) {
  const data = await readKpis(page);
  const expected = exact[loc], fromFixture = fixtureCounts(loc);
  record('fixture-contract-six-values', JSON.stringify(expected) === JSON.stringify(fromFixture), context,
    `Owner expected=${expected}; fixture computed=${fromFixture}`);
  for (let i = 0; i < kpis.length; i++) {
    const row = data[i];
    record('six-kpi-present', row.present && row.visible, { ...context, kpi: row.key }, JSON.stringify(row));
    record('six-kpi-exact-value', row.present && row.visible && num(row.value) === expected[i],
      { ...context, kpi: row.key }, `expected ${expected[i]}, actual '${row.value}'`);
    record('six-kpi-readable-typography', row.present && row.valueFontPx >= 18 && row.labelFontPx >= 10,
      { ...context, kpi: row.key }, `value ${row.valueFontPx}px; label ${row.labelFontPx}px`);
    record('six-kpi-localized-label', row.present && row.label === row.expectedLabel &&
      row.label.length > 2 && (context.locale !== 'ar' || /[\u0600-\u06ff]/.test(row.label)),
      { ...context, kpi: row.key }, `expected '${row.expectedLabel}', actual '${row.label}'`);
    if ([0, 1, 3, 4].includes(i)) {
      const requiredCaptionNumber = i === 0 ? fixture.resources[loc].keys.length
        : i === 3 ? fixture.resources[loc].spots.length
          : i === 1 ? expected[0] : expected[3];
      record('kpi-supporting-context-accurate', row.present &&
        new RegExp(`(^|\\D)${requiredCaptionNumber}($|\\D)`).test(row.caption),
        { ...context, kpi: row.key }, row.caption);
    }
  }
  observations.push({ context, kpis: data });
}

async function verifyGeometry(page, context) {
  const result = await page.evaluate(() => {
    const html = document.documentElement;
    const root = document.querySelector('.inspector');
    const css = root && getComputedStyle(root);
    const body = getComputedStyle(document.body);
    const heading = root?.querySelector('h1');
    const headingCss = heading && getComputedStyle(heading);
    const buttons = [...(root?.querySelectorAll('button:not([disabled]), input, select') ?? [])].filter((el) => {
      const rect = el.getBoundingClientRect();
      return !el.closest('[hidden]') && rect.width && rect.height &&
        (rect.left < -2 || rect.right > innerWidth + 2);
    }).map((el) => ({ label: (el.getAttribute('aria-label') || el.textContent || '').slice(0, 55),
      left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }));
    const bar = document.querySelector('.topbar')?.getBoundingClientRect();
    const signout = document.querySelector('[data-shell-logout]')?.getBoundingClientRect();
    return { documentOverflow: html.scrollWidth - innerWidth,
      controlsOutside: buttons, font: css?.fontFamily, shellFont: body.fontFamily,
      titleFontPx: headingCss ? parseFloat(headingCss.fontSize) : null,
      shellTopbarSpill: bar && signout ? signout.bottom - bar.bottom : null };
  });
  record('interior-no-document-overflow', result.documentOverflow <= 2, context, `${result.documentOverflow}px`);
  record('interior-controls-inside-screen', result.controlsOutside.length === 0, context, JSON.stringify(result.controlsOutside));
  record('native-dashboard-font-family', Boolean(result.font && result.shellFont &&
    result.font.split(',')[0].trim() === result.shellFont.split(',')[0].trim()), context,
    `inspector ${result.font}; shell ${result.shellFont}`);
  record('title-readable-size', result.titleFontPx >= 24, context, `${result.titleFontPx}px`);
  record('inherited-topbar-spill', result.shellTopbarSpill === null ? null : result.shellTopbarSpill <= 2,
    { ...context, inheritedShell: true }, `sign-out bottom minus topbar bottom = ${result.shellTopbarSpill}px`);
  observations.push({ context, geometry: result });
}

async function verifySelectedVehicle(page, vehicleCase, context) {
  const { type, code, kind, identity } = vehicleCase;
  const expected = localeIdentity(identity, context.locale);
  try {
    await family(page, type);
    const row = page.locator('[data-c-list] [data-c-id]').filter({ hasText: code }).first();
    const exists = await row.count() === 1;
    record('resource-row-present', exists, { ...context, type, code, kind }, `expected ${code}`);
    if (!exists) return;
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    record('resource-list-vehicle-truth', rowText.includes(expected), { ...context, type, code, kind }, rowText);
    const listStyle = await row.evaluate((node) => {
      const el = node.querySelector('.c-row-identity, .c-row-vehicle bdi, .c-row-plate, [data-c-plate]');
      if (!el) return null;
      const s = getComputedStyle(el), r = el.getBoundingClientRect(), host = node.getBoundingClientRect();
      return { fontPx: parseFloat(s.fontSize), weight: s.fontWeight,
        withinRow: r.left >= host.left - 2 && r.right <= host.right + 2,
        clipped: el.scrollWidth > el.clientWidth + 2 };
    });
    if (kind === 'plate') record('occupied-plate-prominent-in-list', listStyle && listStyle.fontPx >= 12 &&
      !listStyle.clipped && listStyle.withinRow, { ...context, type, code }, JSON.stringify(listStyle));
    await row.click();
    const detail = page.locator('[data-c-detail]');
    record('selected-detail-visible', await detail.isVisible(), { ...context, type, code });
    const actual = (await page.locator('[data-c-vehicle]').textContent()).trim();
    record('selected-vehicle-identity-exact', actual === expected, { ...context, type, code, kind },
      `expected '${expected}' actual '${actual}'`);
    const detailStyle = await page.locator('[data-c-vehicle]').evaluate((el) => {
      const s = getComputedStyle(el); return { fontPx: parseFloat(s.fontSize), weight: s.fontWeight };
    });
    if (kind === 'plate') record('occupied-plate-prominent-in-detail', detailStyle.fontPx >= 16,
      { ...context, type, code }, JSON.stringify(detailStyle));
    if (kind === 'inactive') {
      const usage = await page.locator('[data-c-usage]').innerText();
      record('inactive-is-not-free-or-occupied', !/available|occupied|in use|متاح|مشغول|قيد الاستخدام/i.test(usage),
        { ...context, type, code }, `usage '${usage}'`);
      record('inactive-no-false-vehicle-plate', !/DEMO\s*\d/.test(actual), { ...context, type, code }, actual);
    }
    if ([390, 1440].includes(context.width) && ['K-02', 'P-02'].includes(code)) {
      await snap(page, `${context.width}-${context.locale}-${context.theme}-${context.loc}-${code.toLowerCase()}-detail`);
    }
    if (context.width <= 820 && await page.locator('[data-c-back]').isVisible()) await page.locator('[data-c-back]').click();
  } catch (error) { record('resource-inspection-error', false, { ...context, type, code }, String(error)); }
}

async function testOverlay(page, context) {
  try {
    await family(page, 'keys');
    const row = page.locator('[data-c-list] [data-c-id]').filter({ hasText: context.loc === 'loc-a' ? 'K-02' : 'K-12' }).first();
    await row.click();
    const opener = page.locator('[data-c-open-qr]');
    record('qr-trigger-enabled', await opener.isEnabled(), context);
    await opener.click();
    const modal = page.locator('[data-c-modal]');
    record('qr-preview-opens', await modal.isVisible() && await page.locator('[data-c-qr-modal]').isVisible(), context);
    const code = context.loc === 'loc-a' ? 'K-02' : 'K-12';
    record('qr-canonical-resource-code', (await page.locator('[data-c-qr-code]').innerText()).trim() === code, context);
    const disclosure = (await modal.locator('[data-c-qr-modal] .c-modal-disclaimer').innerText()).trim();
    const containsWarning = /does not contain an operational scanning code|غير قابلة للمسح|غير قابل للمسح|رمز فعلي للمسح|not scannable/i.test(disclosure);
    record('qr-nonscannable-disclosure', containsWarning, context, disclosure);
    const children = modal.locator('button:visible:not([disabled]),input:visible:not([disabled]),select:visible:not([disabled])');
    if (await children.count()) {
      await children.last().focus(); await page.keyboard.press('Tab');
      const forward = await page.evaluate(() => document.querySelector('[data-c-modal]')?.contains(document.activeElement));
      await children.first().focus(); await page.keyboard.press('Shift+Tab');
      const backward = await page.evaluate(() => document.querySelector('[data-c-modal]')?.contains(document.activeElement));
      record('qr-focus-trap-both-directions', forward && backward, context, `forward=${forward}, backward=${backward}`);
    } else record('qr-focus-trap-both-directions', false, context, 'No visible focusable control');
    await snap(page, `qr-${context.width}-${context.locale}-${context.theme}`);
    await page.keyboard.press('Escape');
    record('qr-escape', !await modal.isVisible(), context);
    record('qr-focus-return', await opener.evaluate((el) => el === document.activeElement), context);
    if (context.width <= 820 && await page.locator('[data-c-back]').isVisible()) await page.locator('[data-c-back]').click();
    await page.locator('[data-c-open-add]').click();
    record('create-preview-preserved', await modal.isVisible() && await page.locator('[data-c-add-form]').isVisible(), context);
    await page.keyboard.press('Escape');
    record('create-preview-escape', !await modal.isVisible(), context);
  } catch (error) { record('overlay-runtime', false, context, String(error)); }
}

async function testKeyboardAndPreviewModes(page, context) {
  try {
    await family(page, 'keys');
    const spotsTab = page.locator('[data-c-family="spots"]');
    await spotsTab.focus();
    await page.keyboard.press('Enter');
    record('family-switch-keyboard-enter', (await spotsTab.getAttribute('aria-pressed')) === 'true', context);
    record('unsupported-search-ui-absent', (await page.locator('[data-c-search], .c-search, input[type="search"]').count()) === 0, context);
    await page.keyboard.press('/');
    record('unsupported-search-shortcut-removed', await spotsTab.evaluate((el) => el === document.activeElement), context);
    const modes = page.locator('[data-c-preview-state]');
    for (const mode of ['empty', 'loading', 'error']) {
      await modes.selectOption(mode);
      const empty = page.locator('[data-c-empty]');
      record('synthetic-preview-state', await empty.isVisible() && (await empty.innerText()).trim().length > 8,
        { ...context, mode }, (await empty.innerText()).trim());
      const actual = await readKpis(page);
      const expected = exact[context.loc];
      record('kpis-truthful-through-preview-mode', actual.every((row, index) => row.present && num(row.value) === expected[index]),
        { ...context, mode }, JSON.stringify(actual.map((row) => row.value)));
    }
    await modes.selectOption('normal');
    record('preview-ready-restores-inventory', await page.locator('[data-c-list] [data-c-id]').count() > 0, context);
  } catch (error) { record('keyboard-preview-runtime', false, context, String(error)); }
}

async function run() {
  const lastSourceEdit = Math.max(...['option-3.inner', 'option-3.css', 'option-3.js']
    .map((name) => statSync(join(designDir, 'concepts', name)).mtimeMs));
  if (statSync(option).mtimeMs < lastSourceEdit) {
    throw new Error('Option 3 assembled HTML is older than W6 concept source. Ask Prime to rebuild before Edge QA.');
  }
  const browser = await launchEdge();
  const externalRequests = [];
  try {
    for (const width of widths) for (const locale of locales) for (const theme of themes) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const page = await ctx.newPage();
      page.on('request', (r) => { if (/^https?:/i.test(r.url())) externalRequests.push(r.url()); });
      const base = { width, locale, theme };
      try {
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(String(error)));
        await page.goto(fileUrl(option), { waitUntil: 'load' });
        const actual = await setLocaleTheme(page, locale, theme);
        record('locale-direction-theme', actual.join('/') === [locale, locale === 'ar' ? 'rtl' : 'ltr', theme].join('/'), base, actual.join('/'));
        await verifyGeometry(page, base);
        for (const loc of ['loc-a', 'loc-b']) {
          await setLocation(page, loc);
          const state = { ...base, loc };
          for (const type of ['keys', 'spots']) {
            await family(page, type);
            await verifyKpis(page, loc, type, { ...state, type });
          }
          await snap(page, `${width}-${locale}-${theme}-${loc}`);
          if (width === 390 || width === 1440) {
            for (const caseData of vehicleCases[loc]) await verifySelectedVehicle(page, caseData, state);
          }
        }
        // Scope returns to A: KPIs and vehicle context must again reference A.
        await setLocation(page, 'loc-a');
        await family(page, 'keys');
        await verifyKpis(page, 'loc-a', 'keys', { ...base, loc: 'loc-a', cycle: 'A-B-A' });
        if (width === 390 && theme === 'dark') {
          await testKeyboardAndPreviewModes(page, { ...base, loc: 'loc-a' });
          await testOverlay(page, { ...base, loc: 'loc-a' });
        }
        record('no-script-errors', pageErrors.length === 0, base, pageErrors.join('\n'));
      } catch (error) { record('scenario-error', false, base, String(error)); errors.push({ base, error: String(error) }); }
      await ctx.close();
    }
    record('no-external-requests', externalRequests.length === 0, {}, externalRequests.slice(0, 8).join(', '));
  } finally { await browser.close(); }
}

const sourceDigest = createHash('sha256').update(readFileSync(option)).digest('hex');
mkdirSync(screenshotDir, { recursive: true });
await run();
const totals = Object.fromEntries(['PASS', 'FAIL', 'NOT_RUN'].map((status) =>
  [status, checks.filter((check) => check.status === status).length]));
const result = { version: 1, testedAt: new Date().toISOString(), source: option, sourceSha256: sourceDigest,
  totals, checks, screenshots, observations, errors, externalRequests: 'recorded only if observed; no API data requested' };
writeFileSync(join(qaDir, 'option3-refined-results.json'), JSON.stringify(result, null, 2));
process.stdout.write(`Option3 refined QA: ${JSON.stringify(totals)}, screenshots=${screenshots.length}\n`);
if (totals.FAIL) process.exitCode = 1;
