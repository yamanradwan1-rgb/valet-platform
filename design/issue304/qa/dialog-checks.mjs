import { join } from 'node:path';
import { fileUrl, optionId, screenshotsDir } from './browser-setup.mjs';

const controls = {
  'option-1': { family: '[data-family="keys"]', detail: '#a-rows [data-detail]',
    detailVisible: '#a-drawer', qrTrigger: '#a-drawer [data-qr]:not([disabled])',
    qrVisible: '#a-modal', create: '#a-create', createVisible: '#a-modal',
    dialog: '#a-overlay', form: '#a-create-form', list: '#a-rows' },
  'option-2': { family: null, detail: '[data-opt2-table="keys"] [data-opt2-detail]',
    detailVisible: '[data-opt2-dialog]', qrTrigger: '[data-opt2-table="keys"] [data-opt2-qr]:not([disabled])',
    qrVisible: '[data-opt2-dialog]', create: '[data-opt2-create="keys"]',
    createVisible: '[data-opt2-dialog]', dialog: '[data-opt2-dialog-backdrop]',
    form: '[data-opt2-preview-form]', list: '[data-opt2-table="keys"]' },
  'option-3': { family: '[data-c-family="keys"]', detail: '[data-c-list] [data-c-id]',
    detailVisible: '[data-c-detail]', qrTrigger: '[data-c-open-qr]',
    qrVisible: '[data-c-modal]', create: '[data-c-open-add]',
    createVisible: '[data-c-modal]', dialog: '[data-c-modal]',
    form: '[data-c-add-form]', list: '[data-c-list]' },
  'option-4': { family: '[data-d-kind="keys"]', detail: '#d-group-list [data-d-resource]',
    detailVisible: '#d-inspector-content', qrTrigger: '#d-inspector-content [data-d-qr]:not([disabled])',
    qrVisible: '#d-dialog', create: '#d-create', createVisible: '#d-dialog',
    dialog: '#d-dialog', form: '#d-create-form', list: '#d-group-list' },
};

async function visibleDialog(page, selector) {
  return page.locator(selector).first().isVisible();
}

async function dialogFocus(page, selector) {
  return page.evaluate((selector) => {
    const modal = document.querySelector(selector);
    return Boolean(modal && modal.contains(document.activeElement));
  }, selector);
}

async function checkFocusCycle(page, selector, record, context) {
  const elements = page.locator(`${selector} button:not(:disabled), ${selector} input:not(:disabled), ${selector} select:not(:disabled)`);
  const visible = [];
  for (let i = 0; i < await elements.count(); i++) {
    const element = elements.nth(i);
    if (await element.isVisible()) visible.push(element);
  }
  if (!visible.length) {
    record('overlay-focus-cycle', false, context, 'No visible interactive children in dialog');
    return;
  }
  await visible.at(-1).focus();
  await page.keyboard.press('Tab');
  const inspect = () => page.evaluate((query) => {
    const target = document.activeElement;
    return { active: target?.outerHTML.slice(0, 140), tag: target?.tagName,
      inside: Boolean(document.querySelector(query)?.contains(target)),
      dialogOpen: document.querySelector(query)?.open ?? null,
    };
  }, selector);
  const forwardState = await inspect();
  await visible[0].focus();
  await page.keyboard.press('Shift+Tab');
  const backwardState = await inspect();
  record('overlay-focus-cycle', forwardState.inside && backwardState.inside, context,
    JSON.stringify({ forwardState, backwardState }));
}

async function checkEscapeAndReturn(page, config, record, context) {
  await page.keyboard.press('Escape');
  const closed = !await visibleDialog(page, config.dialog);
  const targetBack = await page.evaluate(() => {
    const node = document.activeElement;
    return {
      tag: node?.tagName || '',
      target: node?.outerHTML.slice(0, 150) || '',
      visible: Boolean(node && node !== document.body && node !== document.documentElement && node.getClientRects().length),
    };
  });
  record('overlay-escape-close', closed, context);
  record('overlay-focus-restored', targetBack.visible, context, JSON.stringify(targetBack));
}

async function capture(page, option, locale, type) {
  await page.screenshot({ path: join(screenshotsDir, `${option}-390-${locale}-${type}.png`), fullPage: true });
}

export async function verifyDialogs(browser, optionPath, locale, record) {
  const option = optionId(optionPath);
  const config = controls[option];
  const context = { option, locale, width: 390 };
  const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await browserContext.newPage();
  try {
    await page.goto(fileUrl(optionPath));
    if (locale === 'ar') await page.locator('[data-shell-locale]').click();
    if (config.family) await page.locator(config.family).click();
    const detailTrigger = page.locator(config.detail).first();
    if (!await detailTrigger.count()) throw Error(`No detail trigger matching ${config.detail}`);
    await detailTrigger.click();
    record('resource-detail-opens', await visibleDialog(page, config.detailVisible), context);
    await capture(page, option, locale, 'detail');
    if (option === 'option-1' || option === 'option-2') await checkEscapeAndReturn(page, config, record, { ...context, type: 'detail' });

    if (option === 'option-1') await page.locator(config.detail).first().click();
    const qr = page.locator(config.qrTrigger).first();
    if (!await qr.count()) throw Error(`No QR trigger matching ${config.qrTrigger}`);
    await qr.click();
    const qrOpen = await visibleDialog(page, config.qrVisible);
    const qrText = qrOpen ? await page.locator(config.qrVisible).first().innerText() : '';
    record('qr-preview-opens', qrOpen && /QR|ملصق|الرمز/i.test(qrText), context, qrText.slice(0, 150));
    record('qr-preview-focus', await dialogFocus(page, config.qrVisible), context);
    await checkFocusCycle(page, config.qrVisible, record, { ...context, type: 'qr' });
    await capture(page, option, locale, 'qr');
    await checkEscapeAndReturn(page, config, record, { ...context, type: 'qr' });

    if (option === 'option-3') {
      const back = page.locator('[data-c-back]');
      if (await back.isVisible()) await back.click();
    }
    const create = page.locator(config.create).first();
    await create.click();
    const createOpen = await visibleDialog(page, config.createVisible);
    const form = page.locator(config.form);
    record('create-preview-opens', createOpen && await form.isVisible(), context);
    await checkFocusCycle(page, config.createVisible, record, { ...context, type: 'create' });
    await capture(page, option, locale, 'create');
    const input = form.locator('input[name="code"], #opt2-input-code').first();
    if (await input.isVisible()) {
      await input.fill('K-QA99');
      const submit = form.locator('button[type="submit"]');
      await submit.click();
      const text = await page.locator('#keys-spots-design-content').innerText();
      const listText = await page.locator(config.list).innerText();
      const visibleDraft = text.includes('K-QA99');
      if (await visibleDialog(page, config.dialog)) await page.keyboard.press('Escape');
      await page.reload();
      const reloadedListText = await page.locator(config.list).innerText();
      record('create-preview-not-persisted', !listText.includes('K-QA99') &&
        !reloadedListText.includes('K-QA99') && /preview|not saved|nothing|لم|معاينة|حفظ/i.test(text),
        context, `before reload draft list=${listText.includes('K-QA99')}; after reload draft list=${reloadedListText.includes('K-QA99')}; draft remains visible=${visibleDraft}`);
    } else record('create-preview-input', false, context, 'Code entry field missing');
  } catch (error) { record('dialog-runtime', false, context, String(error)); }
  await browserContext.close();
}
