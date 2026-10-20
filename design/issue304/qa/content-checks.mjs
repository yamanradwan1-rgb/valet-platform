import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { designDir, optionId } from './browser-setup.mjs';

const fixture = JSON.parse(readFileSync(join(designDir, 'fixtures/canonical-data.json'), 'utf8'));
const selectors = {
  'option-1': { family: (type) => `[data-family="${type}"]`, region: '#a-rows',
    next: '#a-next', search: '#a-search', state: '#a-state', statePanel: '#a-read-state', ready: 'live' },
  'option-2': { family: () => null, region: (type) => `[data-opt2-table="${type}"]`,
    next: null, search: null, state: '#opt2-demo-mode', statePanel: '.opt2-state', ready: 'ready' },
  'option-3': { family: (type) => `[data-c-family="${type}"]`, region: '[data-c-list]',
    next: null, search: '[data-c-search]', state: '[data-c-preview-state]',
    statePanel: '[data-c-empty]', ready: 'normal' },
  'option-4': { family: (type) => `[data-d-kind="${type}"]`, region: '#d-group-list',
    next: null, search: '#d-search', state: '#d-demo-state', statePanel: '#d-group-list .d-state', ready: 'ready' },
};

async function visibleResourceCodes(page, selector) {
  const text = await page.locator(selector).innerText();
  return [...new Set(text.match(/\b(?:K|P)-\d{2}\b/g) || [])];
}

async function setLocation(page, index) {
  await page.locator('[data-shell-location-trigger]').click();
  await page.locator(`[data-shell-location-option="${index}"]`).click();
}

async function showFamily(page, config, family) {
  const selector = config.family(family);
  if (selector) await page.locator(selector).click();
}

async function showAllGroups(page, option) {
  if (option !== 'option-4') return;
  const candidateSelectors = ['[data-d-group-toggle][aria-expanded="false"]',
    '#d-group-list button[aria-expanded="false"]'];
  for (const selector of candidateSelectors) {
    const candidate = page.locator(selector);
    for (let i = 0; i < 20 && await candidate.count(); i++) await candidate.first().click();
  }
}

async function collectAllCodes(page, option, config, family) {
  await showFamily(page, config, family);
  await showAllGroups(page, option);
  const selector = typeof config.region === 'function' ? config.region(family) : config.region;
  const codes = new Set(await visibleResourceCodes(page, selector));
  if (config.next) {
    const next = page.locator(config.next);
    for (let index = 0; index < 10 && await next.isEnabled(); index++) {
      await next.click();
      for (const code of await visibleResourceCodes(page, selector)) codes.add(code);
    }
  }
  return [...codes].sort();
}

export async function verifyContentAndScope(page, optionPath, locale, record) {
  const option = optionId(optionPath);
  const config = selectors[option];
  const observations = [];
  if (!config) return observations;
  const cycles = [0, 1, 0];
  for (const index of cycles) {
    await setLocation(page, index);
    for (const family of ['keys', 'spots']) {
      const loc = fixture.locations[index].id;
      const expected = fixture.resources[loc][family].map((item) => item.code).sort();
      const context = { option, locale, location: loc, family };
      try {
        const found = await collectAllCodes(page, option, config, family);
        const unexpected = found.filter((code) => !expected.includes(code));
        const missing = expected.filter((code) => !found.includes(code));
        record('rendered-fixture-parity', !missing.length && !unexpected.length,
          context, `actual=${found.length}, expected=${expected.length}; missing=${missing}; unexpected=${unexpected}`);
        observations.push({ ...context, expected, found, missing, unexpected });
      } catch (error) {
        record('rendered-fixture-parity', false, context, String(error));
      }
    }
  }
  return observations;
}

export async function verifyPreviewStates(page, optionPath, locale, record) {
  const option = optionId(optionPath);
  const config = selectors[option];
  const context = { option, locale };
  if (!config?.state) {
    record('empty-loading-error-controls', false, context, 'No independent preview state selector present');
    return;
  }
  const stateSelect = page.locator(config.state);
  const available = await stateSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value));
  for (const state of ['empty', 'loading', 'error']) {
    if (!available.includes(state)) { record(`preview-${state}`, false, context, `Missing ${state} option`); continue; }
    await stateSelect.selectOption(state);
    const panel = page.locator(config.statePanel).first();
    const visible = await panel.isVisible();
    const text = visible ? await panel.innerText() : '';
    const retry = await panel.locator('button').count();
    const substantive = text.trim().length > 10;
    record(`preview-${state}`, visible && substantive && (state === 'empty' || state === 'loading' || retry > 0 || option === 'option-3'),
      context, `visible=${visible}; controls=${retry}; text=${text.slice(0, 160)}`);
  }
  await stateSelect.selectOption(config.ready);
}

export async function verifyIdentityFallback(page, optionPath, locale, record) {
  const option = optionId(optionPath);
  const config = selectors[option];
  if (!config) return;
  await setLocation(page, 0);
  const expected = locale === 'ar' ? /هوية المركبة غير متاحة|غير متاحة|غير معروفة/ : /vehicle unavailable|unavailable|identity unavailable/i;
  for (const family of ['keys', 'spots']) {
    const code = family === 'keys' ? 'K-08' : 'P-08';
    const context = { option, locale, family, code };
    await showFamily(page, config, family);
    if (config.search) await page.locator(config.search).fill(code);
    await showAllGroups(page, option);
    const region = typeof config.region === 'function' ? config.region(family) : config.region;
    if (option === 'option-4') await page.locator(`[data-resource-code="${code}"]`).click();
    if (option === 'option-3') await page.locator(`[data-c-list] button:has-text("${code}")`).click();
    const text = await page.locator(option === 'option-4' ? '#d-inspector-content' :
      option === 'option-3' ? '[data-c-detail]' : region).innerText();
    record('vehicle-identity-unavailable', text.includes(code) && expected.test(text), context,
      `matched ${code} and localized unavailable in visible inventory: ${text.slice(0, 160)}`);
    if (option === 'option-3') {
      const back = page.locator('[data-c-back]');
      if (await back.isVisible()) await back.click();
    }
    if (config.search) await page.locator(config.search).fill('');
  }
}
