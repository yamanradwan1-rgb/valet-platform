export const WEB_PUSH_DELIVERY = {
  attemptCap: 5,
  baseRetryMilliseconds: 5_000,
  batchSize: 25,
  eventTtlMilliseconds: 5 * 60_000,
  leaseMilliseconds: 30_000,
  maxRetryMilliseconds: 60_000,
  pollMilliseconds: 5_000,
  providerTimeoutMilliseconds: 10_000,
} as const;
