import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestApiError } from '../../lib/api/api-error';
import { GuestApiClient } from '../../lib/api/guest-api-client';
import {
  beginGuestContextSwitchState,
  bootstrapGuestAuthTransport,
  continueCurrentGuestVisitState,
  failedGuestContextSwitchState,
  switchGuestBrowserContextTransport,
} from './guest-auth-context';

const VALID_TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_';

describe('GuestAuthProvider context-switch behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats a same-visit prepare result as cookie-authority continuity without conflict', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'SAME_VISIT' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await bootstrapGuestAuthTransport(VALID_TOKEN, true);
    expect(result.token).toBeNull();
    expect(result.contextConflictScope).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['ACTIVE', 'POST_VISIT'] as const)(
    'keeps a different %s visit bearer in memory for the explicit conflict decision',
    async (currentScope) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ result: 'CONTEXT_CONFLICT', currentScope }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await bootstrapGuestAuthTransport(VALID_TOKEN, true);
      expect(result.token).toBe(VALID_TOKEN);
      expect(result.contextConflictScope).toBe(currentScope);
      expect(result.client).not.toBeNull();
    },
  );

  it('retries an ambiguous explicit switch once and reconciles a committed response loss', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'RECOVERED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await switchGuestBrowserContextTransport(new GuestApiClient(VALID_TOKEN));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a definite invalid-link switch failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'GUEST_ACCESS_INVALID', message: 'Denied' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      switchGuestBrowserContextTransport(new GuestApiClient(VALID_TOKEN)),
    ).rejects.toMatchObject({ code: 'GUEST_ACCESS_INVALID' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('continues the current visit by discarding only the in-memory pending intent', () => {
    const currentClient = GuestApiClient.browserSession();
    const state = {
      token: VALID_TOKEN,
      client: currentClient,
      contextConflictScope: 'ACTIVE' as const,
      isComplete: true,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false,
      retryStage: null,
    };
    const continued = continueCurrentGuestVisitState(state);
    expect(continued.client).toBe(currentClient);
    expect(continued.token).toBeNull();
    expect(continued.contextConflictScope).toBeNull();
  });

  it('keeps the current client identity while an explicit switch is pending', () => {
    const currentClient = GuestApiClient.browserSession();
    const state = {
      token: VALID_TOKEN,
      client: currentClient,
      contextConflictScope: 'ACTIVE' as const,
      isComplete: true,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false,
      retryStage: null,
    };
    const switching = beginGuestContextSwitchState(state);
    expect(switching.client).toBe(currentClient);
    expect(switching.isContextSwitching).toBe(true);
    expect(switching.token).toBe(VALID_TOKEN);
  });

  it('preserves current context and pending intent after an ambiguous switch failure', () => {
    const currentClient = GuestApiClient.browserSession();
    const state = {
      token: VALID_TOKEN,
      client: currentClient,
      contextConflictScope: 'POST_VISIT' as const,
      isComplete: true,
      isContextSwitching: true,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false,
      retryStage: null,
    };
    const failed = failedGuestContextSwitchState(
      state,
      new GuestApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'offline',
        isNetworkError: true,
      }),
    );
    expect(failed.client).toBe(currentClient);
    expect(failed.token).toBe(VALID_TOKEN);
    expect(failed.contextConflictScope).toBe('POST_VISIT');
    expect(failed.isSwitchOutcomeAmbiguous).toBe(true);
  });

  it('preserves the current client while discarding a definitively invalid new-link intent', () => {
    const currentClient = GuestApiClient.browserSession();
    const state = {
      token: VALID_TOKEN,
      client: currentClient,
      contextConflictScope: 'ACTIVE' as const,
      isComplete: true,
      isContextSwitching: true,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false,
      retryStage: null,
    };
    const failed = failedGuestContextSwitchState(
      state,
      new GuestApiError({
        status: 401,
        code: 'GUEST_ACCESS_INVALID',
        message: 'invalid',
      }),
    );
    expect(failed.client).toBe(currentClient);
    expect(failed.token).toBeNull();
    expect(failed.contextConflictScope).toBeNull();
    expect(failed.isSwitchOutcomeAmbiguous).toBe(false);
  });
});
