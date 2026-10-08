import {
  GUEST_BROWSER_CSRF_HEADER,
  GUEST_BROWSER_CSRF_VALUE,
} from '@valet/contracts';

import { getGuestApiBaseUrl } from '../../lib/api/api-config';
import { GuestApiError } from '../../lib/api/api-error';
import {
  announceBrowserContextChange,
  readBrowserContextMarker,
} from '../../lib/api/guest-browser-context-marker';
import { executeGuestHttpRequest } from '../../lib/api/guest-http-transport';
import type {
  GuestWebPushRegistrationPayload,
  GuestWebPushTransport,
} from './guest-web-push-client';

interface GuestWebPushConfig {
  readonly enabled: boolean;
  readonly publicKey: string | null;
}

function parseConfig(raw: unknown): GuestWebPushConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid config.');
  const value = raw as Record<string, unknown>;
  if (typeof value.enabled !== 'boolean' ||
      (value.publicKey !== null && typeof value.publicKey !== 'string')) {
    throw new Error('Invalid config.');
  }
  return { enabled: value.enabled, publicKey: value.publicKey as string | null };
}

function assertSameBrowserContext(before: string | null): void {
  if (before === readBrowserContextMarker()) return;
  announceBrowserContextChange();
  throw new GuestApiError({
    status: 409,
    code: 'GUEST_CONTEXT_CHANGED',
    message: 'The guest browser context changed.',
  });
}

export function createGuestWebPushTransport(
  baseUrl = getGuestApiBaseUrl(),
): GuestWebPushTransport {
  let cachedPublicKey: string | null = null;
  return {
    async loadVapidPublicKey(signal) {
      const context = readBrowserContextMarker();
      if (cachedPublicKey !== null) {
        assertSameBrowserContext(context);
        return cachedPublicKey;
      }
      const config = await executeGuestHttpRequest<GuestWebPushConfig>({
        url: `${baseUrl}/push/config`,
        init: { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } },
        callerSignal: signal,
        parse: parseConfig,
      });
      assertSameBrowserContext(context);
      if (!config.enabled || config.publicKey === null || config.publicKey.length === 0) {
        throw new Error('Guest Web Push is unavailable.');
      }
      cachedPublicKey = config.publicKey;
      return config.publicKey;
    },
    async registerSubscription(payload: GuestWebPushRegistrationPayload, signal) {
      const context = readBrowserContextMarker();
      await executeGuestHttpRequest<void>({
        url: `${baseUrl}/push/registration`,
        init: {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            [GUEST_BROWSER_CSRF_HEADER]: GUEST_BROWSER_CSRF_VALUE,
          },
          body: JSON.stringify(payload),
        },
        callerSignal: signal,
      });
      assertSameBrowserContext(context);
    },
  };
}
