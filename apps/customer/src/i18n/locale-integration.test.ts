import { describe, expect, it } from 'vitest';

import { arTranslations } from './translations/ar';
import { enTranslations } from './translations/en';
import type { TranslationDictionary, TranslationKey } from './translations/types';

describe('i18n Localization Integration & Parameter Interpolation', () => {
  const interpolate = (
    dict: TranslationDictionary,
    key: TranslationKey,
    params?: Record<string, string | number>,
  ): string => {
    let value = dict[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return value;
  };

  it('correctly interpolates dynamic vehicle parameters in English and Arabic', () => {
    const enReady = interpolate(enTranslations, 'ready.title', { vehicle: 'Porsche Cayenne' });
    const arReady = interpolate(arTranslations, 'ready.title', { vehicle: 'Porsche Cayenne' });

    expect(enReady).toBe('Your Porsche Cayenne is ready.');
    expect(arReady).toBe('سيارتك Porsche Cayenne جاهزة للاستلام.');

    const enCompleted = interpolate(enTranslations, 'completed.title', { vehicle: 'BMW X5' });
    const arCompleted = interpolate(arTranslations, 'completed.title', { vehicle: 'BMW X5' });

    expect(enCompleted).toBe('Your BMW X5 has been released.');
    expect(arCompleted).toBe('تم تسليم سيارتك BMW X5 بنجاح.');
  });

  it('correctly interpolates expiry countdown parameters in English and Arabic', () => {
    const enTime = interpolate(enTranslations, 'handoffPin.expiresIn', { time: '1:45' });
    const arTime = interpolate(arTranslations, 'handoffPin.expiresIn', { time: '1:45' });

    expect(enTime).toBe('Expires in 1:45');
    expect(arTime).toBe('ينتهي خلال 1:45');

    const enSecs = interpolate(enTranslations, 'handoffQr.updatesEvery', { seconds: 45 });
    const arSecs = interpolate(arTranslations, 'handoffQr.updatesEvery', { seconds: 45 });

    expect(enSecs).toBe('Updates every 2 min · Expires in 45s');
    expect(arSecs).toBe('يتجدد كل دقيقتين · ينتهي خلال 45 ثانية');
  });

  it('correctly interpolates state parameters for offline/error screens', () => {
    const enState = interpolate(enTranslations, 'system.lastRecordedState', { state: 'PARKED' });
    const arState = interpolate(arTranslations, 'system.lastRecordedState', { state: 'PARKED' });

    expect(enState).toBe('Last recorded state: PARKED');
    expect(arState).toBe('آخر حالة مسجلة: PARKED');
  });

  it('guarantees that all translation keys have matching parameter placeholders between en and ar', () => {
    const paramRegex = /\{([a-zA-Z0-9_]+)\}/g;

    const keys = Object.keys(enTranslations) as TranslationKey[];
    keys.forEach((key) => {
      const enStr = enTranslations[key];
      const arStr = arTranslations[key];

      const enParams = Array.from(enStr.matchAll(paramRegex)).map((m) => m[1]).sort();
      const arParams = Array.from(arStr.matchAll(paramRegex)).map((m) => m[1]).sort();

      expect(enParams).toEqual(arParams);
    });
  });
});
