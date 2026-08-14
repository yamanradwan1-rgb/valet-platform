import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GuestApiError } from '../lib/api/api-error';
import { getLocalizedErrorMessage } from './error-translator';
import {
  getDirectionForLocale,
  getPersistedLocale,
  isSupportedLocale,
  LOCALE_STORAGE_KEY,
  setPersistedLocale,
} from './locale';
import { arTranslations } from './translations/ar';
import { enTranslations } from './translations/en';
import type { TranslationKey } from './translations/types';

describe('i18n Locale & Translation Dictionaries', () => {
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

    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: storageMock,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error Resetting global window mock in node test environment
    delete globalThis.window;
  });

  it('proves English and Arabic dictionaries have complete 100% key parity', () => {
    const enKeys = Object.keys(enTranslations).sort();
    const arKeys = Object.keys(arTranslations).sort();

    expect(enKeys).toEqual(arKeys);

    // Verify all values are non-empty strings
    enKeys.forEach((key) => {
      const enVal = enTranslations[key as TranslationKey];
      const arVal = arTranslations[key as TranslationKey];

      expect(typeof enVal).toBe('string');
      expect(enVal.trim().length).toBeGreaterThan(0);

      expect(typeof arVal).toBe('string');
      expect(arVal.trim().length).toBeGreaterThan(0);
    });
  });

  it('maps locales to correct document direction', () => {
    expect(getDirectionForLocale('en')).toBe('ltr');
    expect(getDirectionForLocale('ar')).toBe('rtl');
  });

  it('validates supported locales strictly', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('ar')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
  });

  it('handles local storage persistence with safe fallback on malformed input', () => {
    expect(getPersistedLocale()).toBe('en');

    setPersistedLocale('ar');
    expect(getPersistedLocale()).toBe('ar');

    // Corrupt storage value -> safe fallback to 'en'
    mockStorage[LOCALE_STORAGE_KEY] = 'invalid-locale';
    expect(getPersistedLocale()).toBe('en');
  });

  it('correctly translates known error codes for both English and Arabic', () => {
    const apiError = new GuestApiError({
      status: 400,
      code: 'RETRIEVAL_REQUEST_NOT_READY',
      message: 'Retrieval not ready',
    });

    const enTranslator = (k: TranslationKey) => enTranslations[k];
    const arTranslator = (k: TranslationKey) => arTranslations[k];

    const enMessage = getLocalizedErrorMessage(apiError, enTranslator);
    const arMessage = getLocalizedErrorMessage(apiError, arTranslator);

    expect(enMessage).toBe(
      'Retrieval request is not currently available for this vehicle.',
    );
    expect(arMessage).toBe('طلب استرجاع السيارة غير متاح حالياً.');
  });

  it('never surfaces raw English GuestApiError.message for unknown error codes in Arabic', () => {
    const rawEnglishBackendMessage = 'Internal database constraint violation in worker thread';
    const unknownApiError = new GuestApiError({
      status: 500,
      code: 'UNKNOWN_BACKEND_OR_ORACLE_ERROR',
      message: rawEnglishBackendMessage,
    });

    const arTranslator = (k: TranslationKey) => arTranslations[k];
    const arMessage = getLocalizedErrorMessage(unknownApiError, arTranslator);

    // MUST return localized fallback, and MUST NOT contain raw English backend message
    expect(arMessage).toBe('تعذر معالجة طلبك. يرجى إعادة المحاولة.');
    expect(arMessage).not.toContain(rawEnglishBackendMessage);
  });

  it('handles network error objects in getLocalizedErrorMessage', () => {
    const networkError = new TypeError('Failed to fetch');
    const arTranslator = (k: TranslationKey) => arTranslations[k];

    const message = getLocalizedErrorMessage(networkError, arTranslator);
    expect(message).toBe(
      'خطأ في الاتصال بالشبكة. يرجى التحقق من اتصال الإنترنت.',
    );
  });
});
