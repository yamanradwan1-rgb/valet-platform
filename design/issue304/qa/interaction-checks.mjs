import { fileUrl, optionId } from './browser-setup.mjs';
import { verifyContentAndScope, verifyPreviewStates, verifyIdentityFallback } from './content-checks.mjs';

async function testMobileMenu(page, record, context) {
  const trigger = page.locator('[data-shell-menu-trigger]');
  if (!await trigger.isVisible()) {
    record('mobile-navigation', false, context, 'Missing or invisible menu trigger at 390px');
    return;
  }
  await trigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.locator('[data-shell-mobile-dialog]');
  record('mobile-menu-open', await panel.isVisible(), context);
  record('mobile-menu-focus', await page.evaluate(() => document.querySelector('[data-shell-dialog]')?.contains(document.activeElement)), context);
  await page.keyboard.press('Escape');
  record('mobile-menu-escape', !await panel.isVisible(), context);
  record('mobile-focus-restore', await trigger.evaluate((el) => el === document.activeElement), context);
}

async function testScopeCycle(page, record, context) {
  const selector = page.locator('[data-shell-location-trigger]');
  const options = page.locator('[data-shell-location-option]');
  await selector.focus();
  await page.keyboard.press('Enter');
  record('scope-opens', await page.locator('[data-shell-location-list]').isVisible(), context);
  const initial = await page.locator('[data-shell-location]').innerText();
  if (await options.count() !== 2) {
    record('scope-options', false, context, `expected 2; observed ${await options.count()}`);
    return;
  }
  await options.nth(1).click();
  const second = await page.locator('[data-shell-location]').innerText();
  record('scope-A-to-B', second !== initial, context, `${initial} -> ${second}`);
  await selector.click();
  await options.first().click();
  const restored = await page.locator('[data-shell-location]').innerText();
  record('scope-B-to-A', restored === initial, context, `${second} -> ${restored}`);
  await selector.click();
  await page.keyboard.press('Escape');
  record('scope-escape', !await page.locator('[data-shell-location-list]').isVisible(), context);
}

async function testTabFocus(page, record, context) {
  await page.keyboard.press('Tab');
  const result = await page.evaluate(() => {
    const target = document.activeElement;
    const css = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    return { tag: target.tagName, shadow: css.boxShadow, outline: css.outlineStyle,
      visible: rect.width > 0 && rect.height > 0 };
  });
  record('keyboard-focus-visible', result.visible &&
    (result.outline !== 'none' || result.shadow !== 'none'), context, JSON.stringify(result));
}

async function testContent(page, record, context) {
  const bodyText = await page.locator('#keys-spots-design-content').innerText();
  const topLevel = await page.locator('#keys-spots-design-content button, #keys-spots-design-content [role="tab"]')
    .allTextContents();
  record('no-duplicate-operational-tab', !topLevel.some((title) => /^\s*Operational Keys\s*$/i.test(title)), context);
  record('synthetic-disclosure', /synthetic|demo|تجريبية|افتراضية|توضيحية/i.test(await page.locator('body').innerText()), context);
  const keyed = await page.evaluate(() => ({
    keyCount: document.querySelectorAll('[data-resource-code^="K-"]').length,
    spotCount: document.querySelectorAll('[data-resource-code^="P-"]').length,
    tabs: [...document.querySelectorAll('[role="tab"]')].map((e) => e.textContent?.trim()),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }));
  return keyed;
}

export async function runInteractionChecks(browser, options, record) {
  const observations = [];
  for (const path of options) {
    const option = optionId(path);
    for (const locale of ['en', 'ar']) {
      const context = { option, locale, width: 390 };
      const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await browserContext.newPage();
      try {
        await page.goto(fileUrl(path));
        if (locale === 'ar') await page.locator('[data-shell-locale]').click();
        await testMobileMenu(page, record, context);
        await testScopeCycle(page, record, context);
        await testTabFocus(page, record, context);
        observations.push({ ...context, ...await testContent(page, record, context) });
        observations.push(...await verifyContentAndScope(page, path, locale, record));
        await verifyIdentityFallback(page, path, locale, record);
        await verifyPreviewStates(page, path, locale, record);
      } catch (error) { record('interaction-runtime', false, context, String(error)); }
      await browserContext.close();
    }
  }
  return observations;
}
