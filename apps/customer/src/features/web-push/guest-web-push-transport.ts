import {
  GUEST_BROWSER_CSRF_HEADER,
  GUEST_BROWSER_CSRF_VALUE,
} from '@valet/contracts';

import { getGuestApiBaseUrl } from '../../lib/api/api-config';
import { GuestApiError, mapToGuestSafeMessage } from '../../lib/api/api-error';
import {
  announceBrowserContextChange,
  readBrowserContextMarker,
} from '../../lib/api/guest-browser-context-marker';
import {
  executeGuestHttpRequest,
  parseGuestRetryAfter,
} from '../../lib/api/guest-http-transport';
import type {
  GuestWebPushRegistrationPayload,
  GuestWebPushTransport,
} from './guest-web-push-client';

interface GuestWebPushConfig {
  readonly enabled: boolean;
  readonly publicKey: string | null;
}

const REGISTRATION_DEADLINE_MS = 12_000;
const MAX_RESPONSE_CHARS = 1_000_000;

function unknownRegistrationOutcome(status = 0): GuestApiError {
  return new GuestApiError({
    status,
    code: 'MUTATION_OUTCOME_UNKNOWN',
    message: 'The operation may have completed. Check the current vehicle status.',
    isNetworkError: status === 0,
  });
}

async function requireRegistrationResponse(response: Response, requestedUrl: string): Promise<void> {
  // This Nest route returns exactly 204 No Content. A proxy HTML page, a
  // followed redirect or another 2xx must never confirm persisted enrollment.
  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
  const expectedUrl = new URL(
    requestedUrl,
    typeof window === 'undefined' ? 'http://localhost/' : window.location.href,
  ).href;
  if (response.redirected || response.status >= 300 && response.status < 400 ||
      (response.url.length > 0 && response.url !== expectedUrl) ||
      contentType.includes('text/html')) {
    throw unknownRegistrationOutcome(response.status);
  }
  const rawText = await response.text();
  if (rawText.length > MAX_RESPONSE_CHARS) {
    throw unknownRegistrationOutcome(response.status);
  }
  if (response.status === 204 && rawText.length === 0) return;
  if (response.ok) throw unknownRegistrationOutcome(response.status);

  let payload: unknown;
  try { payload = JSON.parse(rawText); }
  catch { payload = rawText; }
  const safe = mapToGuestSafeMessage(response.status, payload);
  throw new GuestApiError({
    status: response.status,
    code: safe.code,
    message: safe.message,
    retryAfter: parseGuestRetryAfter(response.headers.get('Retry-After'), safe.retryAfter),
  });
}

async function postGuestPushRegistration(
  url: string,
  payload: GuestWebPushRegistrationPayload,
  callerSignal?: AbortSignal,
): Promise<void> {
  if (callerSignal?.aborted) {
    throw new GuestApiError({
      status: 0, code: 'GUEST_REQUEST_CANCELLED', message: 'The request was cancelled.',
    });
  }
  const controller = new AbortController();
  let rejectCancelled: ((error: Error) => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
  const onCancel = () => {
    controller.abort();
    rejectCancelled?.(new Error('Guest push registration cancelled'));
  };
  callerSignal?.addEventListener('abort', onCancel, { once: true });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Guest push registration deadline exceeded'));
    }, REGISTRATION_DEADLINE_MS);
  });

  try {
    const operation = (async () => {
      const response = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          [GUEST_BROWSER_CSRF_HEADER]: GUEST_BROWSER_CSRF_VALUE,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      await requireRegistrationResponse(response, url);
    })();
    await Promise.race([operation, deadline, cancelled]);
  } catch (error) {
    if (error instanceof GuestApiError) throw error;
    // Abort, timeout and lost network responses cannot establish whether the
    // server committed the registration; do not report an authoritative failure.
    throw unknownRegistrationOutcome();
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', onCancel);
  }
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
      await postGuestPushRegistration(`${baseUrl}/push/registration`, payload, signal);
      assertSameBrowserContext(context);
    },
  };
}
