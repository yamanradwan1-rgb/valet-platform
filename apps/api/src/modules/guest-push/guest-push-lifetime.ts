export function remainingGuestPushLifetime(
  databaseRemainingMilliseconds: number,
  monotonicStartedAt: number,
  monotonicNow: number,
): number | undefined {
  if (
    !Number.isFinite(databaseRemainingMilliseconds) ||
    !Number.isFinite(monotonicStartedAt) ||
    !Number.isFinite(monotonicNow) ||
    monotonicNow < monotonicStartedAt
  ) {
    return undefined;
  }
  const remaining = Math.floor(
    databaseRemainingMilliseconds - (monotonicNow - monotonicStartedAt),
  );
  return remaining > 0 ? remaining : undefined;
}
