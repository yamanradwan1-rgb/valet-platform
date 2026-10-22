import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestApiClient } from './guest-api-client';
import { GuestApiError } from './api-error';

const base = 'https://guest.example.test/api/v1/guest';
const published = {
  locale: 'en',
  privacy: {
    status: 'PUBLISHED', text: 'Published privacy terms', url: null,
    version: 2, publishedAt: '2026-10-22T12:00:00.000Z',
  },
  contact: {
    displayName: 'Authorized operator', phone: '+962791234567',
    supportUrl: 'https://support.example.test/contact', hours: null,
  },
};

afterEach(() => vi.restoreAllMocks());

describe('#316 authenticated Guest information GET', () => {
  it('uses the visit bearer and validates the published projection', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(published), { status: 200 }),
    );
    const result = await new GuestApiClient('visit-secret', base).loadInformation('en');
    expect(result.privacy.version).toBe(2);
    expect(result.contact.phone).toBe('+962791234567');
    expect(fetchSpy).toHaveBeenCalledWith(`${base}/information?locale=en`,
      expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer visit-secret' } }));
  });

  it('uses browser-session cookie authority without an Authorization header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        locale: 'ar',
        privacy: { status: 'UNAVAILABLE', text: null, url: null,
          version: null, publishedAt: null },
        contact: { displayName: null, phone: null, supportUrl: null, hours: null },
      }), { status: 200 }),
    );
    const result = await GuestApiClient.browserSession(base).loadInformation('ar');
    expect(result.locale).toBe('ar');
    expect(fetchSpy).toHaveBeenCalledWith(`${base}/information?locale=ar`,
      expect.objectContaining({ headers: { Accept: 'application/json' },
        credentials: 'same-origin' }));
  });

  it.each([
    [{ ...published, locale: 'ar' }, 'wrong locale'],
    [{ ...published, contact: { ...published.contact,
      supportUrl: 'javascript:alert(1)' } }, 'unsafe contact URL'],
    [{ ...published, privacy: { ...published.privacy,
      status: 'UNAVAILABLE' } }, 'unpublished snapshot disclosure'],
  ])('fails closed for %s (%s)', async (response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    await expect(new GuestApiClient('visit-secret', base).loadInformation('en'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' } satisfies Partial<GuestApiError>);
  });
});
