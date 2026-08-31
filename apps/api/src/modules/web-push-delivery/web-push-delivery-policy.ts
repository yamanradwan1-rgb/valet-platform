import { WEB_PUSH_DELIVERY } from "./web-push-delivery-constants";

export type WebPushHttpOutcome =
  "ACCEPTED" | "CONFIGURATION" | "ENDPOINT_GONE" | "PAYLOAD" | "RETRY";

export function classifyWebPushOutcome(statusCode: number): WebPushHttpOutcome {
  if (statusCode >= 200 && statusCode < 300) return "ACCEPTED";
  if (statusCode === 404 || statusCode === 410) return "ENDPOINT_GONE";
  if (statusCode === 429 || statusCode >= 500) return "RETRY";
  if (statusCode === 401 || statusCode === 403) return "CONFIGURATION";
  return "PAYLOAD";
}

export function parseRetryAfter(
  value: string | undefined,
  now: Date,
): Date | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (/^\d+$/.test(value.trim())) {
    const timestamp = now.getTime() + Number(value.trim()) * 1_000;
    return Number.isFinite(timestamp) && timestamp <= 8.64e15
      ? new Date(timestamp)
      : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > now.getTime()
    ? new Date(parsed)
    : undefined;
}

export function computeWebPushRetry(input: {
  readonly attempt: number;
  readonly expiresAt: Date;
  readonly now: Date;
  readonly random: () => number;
  readonly retryAfter?: Date;
}): { readonly nextAttemptAt: Date } | { readonly terminal: true } {
  if (input.attempt >= WEB_PUSH_DELIVERY.attemptCap) return { terminal: true };
  const exponential = Math.min(
    WEB_PUSH_DELIVERY.maxRetryMilliseconds,
    WEB_PUSH_DELIVERY.baseRetryMilliseconds * 2 ** (input.attempt - 1),
  );
  const jittered = exponential * (0.5 + input.random());
  const computed = new Date(input.now.getTime() + jittered);
  const nextAttemptAt =
    input.retryAfter !== undefined && input.retryAfter > computed
      ? input.retryAfter
      : computed;
  return nextAttemptAt >= input.expiresAt
    ? { terminal: true }
    : { nextAttemptAt };
}
