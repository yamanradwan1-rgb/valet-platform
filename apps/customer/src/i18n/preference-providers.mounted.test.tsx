import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findElement, installTestDom, invokeReactClick, type TestElement } from '../app/guest-refresh-mounted.test-host';
import { LocaleProvider, useTranslation } from './locale-provider';
import { LOCALE_CHANGE_EVENT, LOCALE_STORAGE_KEY } from './locale';
import { ThemeProvider, useTheme } from '../theme/theme-provider';
import { THEME_CHANGE_EVENT, THEME_COLORS, THEME_STORAGE_KEY } from '../theme/theme';

function PreferenceControls() {
  const { locale, toggleLocale, t } = useTranslation();
  const { theme, isDark, toggleTheme } = useTheme();

  return (
    <>
      <span>{t('header.moreAria')}</span>
      <button type="button" aria-label={t('menu.languageLabel')} onClick={toggleLocale}>
        {locale}
      </button>
      <button type="button" role="switch" aria-checked={isDark} aria-label={t('menu.darkModeAria')} onClick={toggleTheme}>
        {theme}
      </button>
    </>
  );
}

describe('mounted Guest preference providers with restricted localStorage', () => {
  let root: Root | null = null;
  let container: TestElement;
  let html: TestElement;
  let themeMeta: TestElement;
  let browserWindow: Record<string, unknown>;
  let values: Map<string, string>;

  beforeEach(() => {
    const dom = installTestDom();
    browserWindow = dom.window;
    html = dom.document.documentElement;
    themeMeta = dom.document.createElement('meta');
    themeMeta.setAttribute('id', 'vaylet-theme-color');
    Object.assign(dom.document, {
      getElementById: (id: string) => id === 'vaylet-theme-color' ? themeMeta : null,
      querySelector: () => themeMeta,
    });
    values = new Map();
    browserWindow.localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    container = dom.document.createElement('div');
    dom.document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
  });

  async function mount() {
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(<LocaleProvider><ThemeProvider><PreferenceControls /></ThemeProvider></LocaleProvider>);
    });
  }

  async function click(text: string) {
    await act(async () => { invokeReactClick(findElement(container, 'button', text)); });
  }

  function expectPreferences(locale: 'en' | 'ar', theme: 'light' | 'dark') {
    expect(container.textContent).toContain(locale === 'ar' ? 'خيارات إضافية' : 'More options');
    expect(html).toMatchObject({ lang: locale, dir: locale === 'ar' ? 'rtl' : 'ltr' });
    expect(html.getAttribute('data-theme')).toBe(theme);
    expect(themeMeta.getAttribute('content')).toBe(THEME_COLORS[theme]);
    expect(findElement(container, 'button', locale).getAttribute('aria-label'))
      .toBe(locale === 'ar' ? 'English' : 'العربية');
    const themeSwitch = findElement(container, 'button', theme);
    expect(themeSwitch.getAttribute('aria-checked')).toBe(String(theme === 'dark'));
    expect(themeSwitch.getAttribute('aria-label'))
      .toBe(locale === 'ar' ? 'تبديل الوضع الداكن' : 'Toggle dark mode');
  }

  it('reverses EN↔AR and light↔dark repeatedly when both storage methods throw', async () => {
    browserWindow.localStorage = {
      getItem: () => { throw new Error('SecurityError: read blocked'); },
      setItem: () => { throw new Error('SecurityError: write blocked'); },
    };
    await mount();
    expectPreferences('en', 'light');

    await click('en');
    await click('light');
    expectPreferences('ar', 'dark');

    await click('ar');
    await click('dark');
    expectPreferences('en', 'light');

    await click('en');
    await click('light');
    expectPreferences('ar', 'dark');

    const dispatch = browserWindow.dispatchEvent as (event: Event) => boolean;
    await act(async () => {
      dispatch(Object.assign(new Event('storage'), { key: LOCALE_STORAGE_KEY, newValue: null }));
      dispatch(Object.assign(new Event('storage'), { key: THEME_STORAGE_KEY, newValue: null }));
    });
    expectPreferences('en', 'light');
  });

  it('keeps Arabic/dark bootstrap presentation if storage becomes inaccessible during hydration', async () => {
    html.classList.add('vaylet-persisted-ar');
    html.setAttribute('data-theme', 'dark');
    themeMeta.setAttribute('content', THEME_COLORS.dark);
    browserWindow.localStorage = {
      getItem: () => { throw new Error('SecurityError: read blocked after bootstrap'); },
      setItem: () => { throw new Error('SecurityError: write blocked'); },
    };

    await mount();
    expectPreferences('ar', 'dark');
    expect(html.classList.contains('vaylet-persisted-ar')).toBe(false);
    expect(html.classList.contains('vaylet-hydrated')).toBe(true);

    // Rechecking the store after the Arabic bootstrap guard disappears must stay Arabic.
    const dispatch = browserWindow.dispatchEvent as (event: Event) => boolean;
    await act(async () => {
      dispatch(new Event(LOCALE_CHANGE_EVENT));
      dispatch(new Event(THEME_CHANGE_EVENT));
    });
    expectPreferences('ar', 'dark');

    await click('ar');
    await click('dark');
    expectPreferences('en', 'light');
  });

  it('retains the last successful stored preference when reads fail after hydration', async () => {
    values.set(LOCALE_STORAGE_KEY, 'ar');
    values.set(THEME_STORAGE_KEY, 'dark');
    html.classList.add('vaylet-persisted-ar');
    html.setAttribute('data-theme', 'dark');
    let denyReads = false;
    browserWindow.localStorage = {
      getItem: (key: string) => {
        if (denyReads) throw new Error('SecurityError: reads became blocked');
        return values.get(key) ?? null;
      },
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    await mount();
    expectPreferences('ar', 'dark');
    expect(html.classList.contains('vaylet-persisted-ar')).toBe(false);

    denyReads = true;
    const dispatch = browserWindow.dispatchEvent as (event: Event) => boolean;
    await act(async () => {
      dispatch(new Event(LOCALE_CHANGE_EVENT));
      dispatch(new Event(THEME_CHANGE_EVENT));
    });
    expectPreferences('ar', 'dark');

    await click('ar');
    await click('dark');
    expectPreferences('en', 'light');
    await click('en');
    await click('light');
    expectPreferences('ar', 'dark');
  });

  it('keeps active preference when reads work but writes throw', async () => {
    browserWindow.localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    await mount();
    await click('en');
    await click('light');
    expectPreferences('ar', 'dark');
    expect(values.size).toBe(0);

    const dispatch = browserWindow.dispatchEvent as (event: Event) => boolean;
    await act(async () => {
      dispatch(Object.assign(new Event('storage'), { key: 'other-feature', newValue: 'updated' }));
    });
    expectPreferences('ar', 'dark');

    // Another tab can still replace the fallback preference with a real storage event.
    values.set(LOCALE_STORAGE_KEY, 'en');
    values.set(THEME_STORAGE_KEY, 'light');
    await act(async () => {
      dispatch(Object.assign(new Event('storage'), { key: LOCALE_STORAGE_KEY, newValue: 'en' }));
      dispatch(Object.assign(new Event('storage'), { key: THEME_STORAGE_KEY, newValue: 'light' }));
    });
    expectPreferences('en', 'light');
  });

  it('preserves stored preferences and synchronizes changes from another tab', async () => {
    values.set(LOCALE_STORAGE_KEY, 'ar');
    values.set(THEME_STORAGE_KEY, 'dark');
    await mount();
    expectPreferences('ar', 'dark');

    values.set(LOCALE_STORAGE_KEY, 'en');
    values.set(THEME_STORAGE_KEY, 'light');
    const dispatch = browserWindow.dispatchEvent as (event: Event) => boolean;
    await act(async () => {
      dispatch(Object.assign(new Event('storage'), { key: LOCALE_STORAGE_KEY, newValue: 'en' }));
      dispatch(Object.assign(new Event('storage'), { key: THEME_STORAGE_KEY, newValue: 'light' }));
    });
    expectPreferences('en', 'light');

    await click('en');
    await click('light');
    expect(values.get(LOCALE_STORAGE_KEY)).toBe('ar');
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
  });
});
