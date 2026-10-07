import { describe, expect, it } from 'vitest';

import { resolveGuestScreenId } from '../features/session/guest-lifecycle-router';
import type { GuestSafeSession } from '../lib/api/guest-api-types';
import { formatSessionState } from './format-session-state';
import { interpolateTranslation } from './interpolate';
import { arTranslations } from './translations/ar';
import { enTranslations } from './translations/en';
import type { TranslationKey } from './translations/types';

describe('i18n Localization Integration & Parameter Interpolation', () => {
  const enT = (key: TranslationKey, params?: Record<string, string | number>) =>
    interpolateTranslation(enTranslations[key], params);

  const arT = (key: TranslationKey, params?: Record<string, string | number>) =>
    interpolateTranslation(arTranslations[key], params);

  it('correctly interpolates dynamic vehicle parameters using production interpolateTranslation', () => {
    const enReady = enT('ready.title', { vehicle: 'Porsche Cayenne' });
    const arReady = arT('ready.title', { vehicle: 'Porsche Cayenne' });

    expect(enReady).toBe('Your Porsche Cayenne is ready.');
    expect(arReady).toBe('سيارتك Porsche Cayenne جاهزة للاستلام.');

    const enCompleted = enT('completed.title', { vehicle: 'BMW X5' });
    const arCompleted = arT('completed.title', { vehicle: 'BMW X5' });

    expect(enCompleted).toBe('Your BMW X5 has been released.');
    expect(arCompleted).toBe('تم تسليم سيارتك BMW X5 بنجاح.');
  });

  it('correctly interpolates expiry countdown parameters using production interpolateTranslation', () => {
    const enTime = enT('handoffPin.expiresIn', { time: '1:45' });
    const arTime = arT('handoffPin.expiresIn', { time: '1:45' });

    expect(enTime).toBe('Expires in 1:45');
    expect(arTime).toBe('ينتهي خلال 1:45');

    const enSecs = enT('handoffQr.updatesEvery', { seconds: 45 });
    const arSecs = arT('handoffQr.updatesEvery', { seconds: 45 });

    expect(enSecs).toBe('Updates every 2 min · Expires in 45s');
    expect(arSecs).toBe('يتجدد كل دقيقتين · ينتهي خلال 45 ثانية');
  });

  it('correctly maps and formats all authoritative session states in English and Arabic', () => {
    const states = [
      'CHECKING_IN',
      'AWAITING_PARKING',
      'PARKING',
      'PARKED',
      'REQUESTED',
      'RETRIEVING',
      'READY',
      'HANDOFF_PENDING',
      'COMPLETED',
    ];

    states.forEach((state) => {
      const enFormatted = formatSessionState(state, (k) => enTranslations[k]);
      const arFormatted = formatSessionState(state, (k) => arTranslations[k]);

      expect(typeof enFormatted).toBe('string');
      expect(enFormatted.trim().length).toBeGreaterThan(0);
      expect(typeof arFormatted).toBe('string');
      expect(arFormatted.trim().length).toBeGreaterThan(0);

      // Verify not returning raw untranslated state key when translation exists
      expect(enFormatted).not.toBe(`states.${state}`);
      expect(arFormatted).not.toBe(`states.${state}`);
    });
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

  it('proves lifecycle routing resolves all physical custody states deterministically without locale input', () => {
    const createSession = (state: GuestSafeSession['state']): GuestSafeSession => ({
      readyAt: ['READY', 'HANDOFF_PENDING', 'COMPLETED'].includes(state)
        ? '2026-08-29T12:00:00.000Z'
        : null,
      valetSessionId: 'sess-123',
      state,
      vehicle: { make: 'Toyota', model: 'Camry', color: 'White' },
    });

    const route = (session: GuestSafeSession | null, method: 'PICKUP_CODE' | 'DYNAMIC_QR' = 'PICKUP_CODE') =>
      resolveGuestScreenId({
        hasAuthority: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session,
        handoffMethod: method,
      });

    expect(route(createSession('CHECKING_IN'))).toBe('RECEIVED');
    expect(route(createSession('AWAITING_PARKING'))).toBe('RECEIVED');
    expect(route(createSession('PARKING'))).toBe('RECEIVED');
    expect(route(createSession('PARKED'))).toBe('PARKED');
    expect(route(createSession('REQUESTED'))).toBe('REQUESTED');
    expect(route(createSession('RETRIEVING'))).toBe('RETRIEVING');
    expect(route(createSession('READY'))).toBe('READY');
    expect(route(createSession('HANDOFF_PENDING'), 'PICKUP_CODE')).toBe('HANDOFF_PENDING_PIN');
    expect(route(createSession('HANDOFF_PENDING'), 'DYNAMIC_QR')).toBe('HANDOFF_PENDING_QR');
    expect(route(createSession('COMPLETED'))).toBe('COMPLETED');
  });
});
