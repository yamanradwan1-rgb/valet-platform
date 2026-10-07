import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestApiError } from '../../lib/api/api-error';

import {
  bootstrapGuestAuthTransport,
  GuestAuthProvider,
  useGuestAuth,
} from './guest-auth-context';

const VALID_TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_';

function AuthStateProbe() {
  const { token, isTokenBootstrapComplete } = useGuestAuth();
  return <span>{`${isTokenBootstrapComplete ? 'ready' : 'bootstrapping'}:${token ?? 'none'}`}</span>;
}

function renderAuthState(initialToken?: string | null): string {
  const tokenProps = initialToken === undefined ? {} : { initialToken };
  return renderToStaticMarkup(
    <GuestAuthProvider {...tokenProps}>
      <AuthStateProbe />
    </GuestAuthProvider>,
  );
}

describe('GuestAuthProvider bootstrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders without window and starts in a deterministic bootstrap state', () => {
    vi.stubGlobal('window', undefined);

    expect(renderAuthState()).toBe('<span>bootstrapping:none</span>');
  });

  it('does not inspect a development fragment during the first browser render', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: {
        hash: '#guestToken=dev_secret_token_123',
        pathname: '/',
        search: '',
      },
      history: { replaceState },
    });

    const browserFirstRender = renderAuthState();

    expect(browserFirstRender).toBe('<span>bootstrapping:none</span>');
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('uses an explicit initial token synchronously', () => {
    expect(renderAuthState('initial_token_123')).toBe('<span>ready:initial_token_123</span>');
  });

  it('keeps the legacy bearer path when Browser Session enrollment is disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await bootstrapGuestAuthTransport(VALID_TOKEN, false);

    expect(result.token).toBe(VALID_TOKEN);
    expect(result.client).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('enrolls and exchanges before switching to cookie authority when enabled', async () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            readyAt: null,
            valetSessionId: validUuid,
            state: 'PARKED',
            vehicle: { make: 'Toyota', model: 'Camry', color: 'White' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await bootstrapGuestAuthTransport(VALID_TOKEN, true);
    expect(result.token).toBeNull();
    await result.client.loadSession();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('restores with cookie authority when no fragment token exists', async () => {
    const result = await bootstrapGuestAuthTransport(null, false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          readyAt: null,
          valetSessionId: '123e4567-e89b-12d3-a456-426614174000',
          state: 'PARKED',
          vehicle: { make: 'Toyota', model: 'Camry', color: 'White' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    expect(result.token).toBeNull();
    await result.client.loadSession();
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('retries the same exchange once after an ambiguous network failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await bootstrapGuestAuthTransport(VALID_TOKEN, true);

    expect(result.token).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1]?.[0]).toContain('/v1/guest/browser-session/exchange');
    expect(fetchSpy.mock.calls[2]?.[0]).toContain('/v1/guest/browser-session/exchange');
  });

  it('retries the same exchange once after an ambiguous 5xx response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Temporary failure' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await bootstrapGuestAuthTransport(VALID_TOKEN, true);

    expect(result.token).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1]?.[0]).toContain('/v1/guest/browser-session/exchange');
    expect(fetchSpy.mock.calls[2]?.[0]).toContain('/v1/guest/browser-session/exchange');
  });

  it.each([400, 401, 429])('does not retry exchange after HTTP %s', async (status) => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'GUEST_ACCESS_INVALID', message: 'Denied' }),
          { status, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(bootstrapGuestAuthTransport(VALID_TOKEN, true)).rejects.toBeInstanceOf(
      GuestApiError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops after exactly one retry when the ambiguous exchange remains unresolved', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 502 }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(bootstrapGuestAuthTransport(VALID_TOKEN, true)).rejects.toMatchObject({
      isNetworkError: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('fails closed without cookie or legacy fallback after exchange denial', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'GUEST_ACCESS_INVALID', message: 'Guest access is invalid.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(bootstrapGuestAuthTransport(VALID_TOKEN, true)).rejects.toMatchObject({
      code: 'GUEST_ACCESS_INVALID',
    });
  });
});
