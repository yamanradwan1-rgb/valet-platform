import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY, setPersistedLocale, getPersistedLocale } from '../i18n/locale';
import {
  commitThemeChange,
  DEFAULT_THEME,
  getPersistedTheme,
  isSupportedTheme,
  setPersistedTheme,
  THEME_CHANGE_EVENT,
  THEME_COLORS,
  THEME_STORAGE_KEY,
} from './theme';

describe('Theme Domain & Persistence Layer', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    } as Storage;

    const classListSet = new Set<string>();
    const attributesMap: Record<string, string> = {};

    const mockDocElement = {
      getAttribute: (name: string) => attributesMap[name] ?? null,
      setAttribute: (name: string, value: string) => {
        attributesMap[name] = value;
      },
      removeAttribute: (name: string) => {
        delete attributesMap[name];
      },
      classList: {
        add: (cls: string) => classListSet.add(cls),
        remove: (cls: string) => classListSet.delete(cls),
        contains: (cls: string) => classListSet.has(cls),
      },
    };

    const mockMetaThemeColor = {
      getAttribute: vi.fn(),
      setAttribute: vi.fn(),
    };

    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: storageMock,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'document', {
      value: {
        documentElement: mockDocElement,
        querySelector: (selector: string) => {
          if (selector === 'meta[name="theme-color"]') {
            return mockMetaThemeColor;
          }
          return null;
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error Resetting global window mock in node test environment
    delete globalThis.window;
    // @ts-expect-error Resetting global document mock in node test environment
    delete globalThis.document;
  });

  it('validates supported themes strictly', () => {
    expect(isSupportedTheme('light')).toBe(true);
    expect(isSupportedTheme('dark')).toBe(true);
    expect(isSupportedTheme('dim')).toBe(false);
    expect(isSupportedTheme(null)).toBe(false);
    expect(isSupportedTheme(undefined)).toBe(false);
    expect(isSupportedTheme('')).toBe(false);
  });

  it('handles local storage persistence with safe fallback on malformed input', () => {
    expect(getPersistedTheme()).toBe(DEFAULT_THEME);

    setPersistedTheme('dark');
    expect(getPersistedTheme()).toBe('dark');

    mockStorage[THEME_STORAGE_KEY] = 'invalid-theme-value';
    expect(getPersistedTheme()).toBe(DEFAULT_THEME);
  });

  it('proves commitThemeChange synchronizes storage, DOM attributes, meta tag, and event with 0 API calls', () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    // 1. Commit switch to dark theme
    commitThemeChange('dark');
    expect(getPersistedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: THEME_CHANGE_EVENT }),
    );

    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.setAttribute).toHaveBeenCalledWith('content', THEME_COLORS.dark);

    // 2. Commit switch back to light theme
    commitThemeChange('light');
    expect(getPersistedTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(meta?.setAttribute).toHaveBeenCalledWith('content', THEME_COLORS.light);

    // 3. Proves zero network requests were triggered
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('proves locale and theme preferences remain strictly independent', () => {
    // Set locale to Arabic
    setPersistedLocale('ar');
    expect(getPersistedLocale()).toBe('ar');
    expect(getPersistedTheme()).toBe('light');

    // Set theme to dark
    setPersistedTheme('dark');
    expect(getPersistedLocale()).toBe('ar');
    expect(getPersistedTheme()).toBe('dark');

    // Reset locale to English
    setPersistedLocale('en');
    expect(getPersistedLocale()).toBe('en');
    expect(getPersistedTheme()).toBe('dark');

    // Storage only contains the two intended independent keys
    expect(mockStorage).toEqual({
      [LOCALE_STORAGE_KEY]: 'en',
      [THEME_STORAGE_KEY]: 'dark',
    });
  });
});
