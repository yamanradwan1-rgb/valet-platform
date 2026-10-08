import { GuestApiError, mapToGuestSafeMessage } from './api-error';

const READ_DEADLINE_MS = 8_000;
const MUTATION_DEADLINE_MS = 12_000;
const MAX_RESPONSE_CHARS = 1_000_000;

export function parseGuestRetryAfter(
  raw: string | null | undefined,
  fallback: number | undefined,
  now = Date.now(),
): number | undefined {
  if (raw !== undefined && raw !== null) {
    const value = raw.trim();
    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      if (Number.isSafeInteger(seconds)) return seconds;
    } else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /i.test(value)) {
      const instant = Date.parse(value);
      if (Number.isFinite(instant)) return Math.max(0, Math.ceil((instant - now) / 1000));
    }
  }
  return fallback !== undefined && Number.isSafeInteger(fallback) && fallback >= 0
    ? fallback : undefined;
}

export interface GuestHttpRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly callerSignal?: AbortSignal | undefined;
  readonly parse?: ((raw: unknown) => unknown) | undefined;
}

// Abort covers fetch and body. Promise.race also bounds mocked or broken
// transports that ignore AbortSignal and never settle the response stream.
export async function executeGuestHttpRequest<T>(request: GuestHttpRequest): Promise<T> {
  const method = request.init.method ?? 'GET';
  const mutation = method !== 'GET';
  const abort = new AbortController();
  let timedOut = false;
  let externallyAborted = request.callerSignal?.aborted ?? false;
  let rejectExternal: ((error: Error) => void) | undefined;
  const externalAbortPromise = new Promise<never>((_, reject) => {
    rejectExternal = reject;
  });
  const onExternalAbort = () => {
    externallyAborted = true;
    abort.abort();
    rejectExternal?.(new Error('Guest caller cancelled the request'));
  };
  if (externallyAborted) {
    throw new GuestApiError({ status: 0, code: 'GUEST_REQUEST_CANCELLED',
      message: 'The request was cancelled.' });
  }
  request.callerSignal?.addEventListener('abort', onExternalAbort, { once: true });

  let rejectDeadline: ((reason: unknown) => void) | undefined;
  const deadlinePromise = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    abort.abort();
    rejectDeadline?.(new Error('Guest operation deadline exceeded'));
  }, mutation ? MUTATION_DEADLINE_MS : READ_DEADLINE_MS);

  try {
    const operation = (async () => {
      const response = await fetch(request.url, { ...request.init, signal: abort.signal });
      const rawText = await response.text();
      if (rawText.length > MAX_RESPONSE_CHARS) {
        throw new GuestApiError({
          status: response.status,
          code: mutation ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_RESPONSE',
          message: 'The server response could not be processed.',
        });
      }
      let payload: unknown;
      if (rawText.length > 0) {
        try { payload = JSON.parse(rawText); }
        catch { payload = rawText; }
      }
      if (!response.ok) {
        const safe = mapToGuestSafeMessage(response.status, payload);
        throw new GuestApiError({
          status: response.status, code: safe.code, message: safe.message,
          retryAfter: parseGuestRetryAfter(response.headers?.get('Retry-After'), safe.retryAfter),
        });
      }
      try {
        return request.parse ? request.parse(payload) as T : payload as T;
      } catch {
        throw new GuestApiError({
          status: response.status,
          code: mutation ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_RESPONSE',
          message: 'The server response could not be processed.',
        });
      }
    })();
    return await Promise.race([operation, deadlinePromise, externalAbortPromise]);
  } catch (error) {
    if (error instanceof GuestApiError) throw error;
    if (mutation) {
      throw new GuestApiError({
        status: 0, code: 'MUTATION_OUTCOME_UNKNOWN',
        message: 'The operation may have completed. Check the current vehicle status.',
        isNetworkError: true,
      });
    }
    if (timedOut) {
      throw new GuestApiError({
        status: 0, code: 'REQUEST_TIMEOUT',
        message: 'The request timed out. Please try again.', isNetworkError: true,
      });
    }
    if (externallyAborted) {
      throw new GuestApiError({
        status: 0, code: 'GUEST_REQUEST_CANCELLED',
        message: 'The request was cancelled.',
      });
    }
    throw new GuestApiError({
      status: 0, code: 'NETWORK_ERROR',
      message: 'Network connection unavailable. Please check your internet connection.',
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
    request.callerSignal?.removeEventListener('abort', onExternalAbort);
  }
}
