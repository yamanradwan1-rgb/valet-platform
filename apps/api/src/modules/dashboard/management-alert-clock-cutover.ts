/**
 * Option A legacy safety gate. The cutover must be the PostgreSQL server clock
 * captured AFTER every pre-fix Dispatch writer and in-flight transaction is
 * quiescent, and BEFORE enabling Phase 1. It is release authority, not a
 * client-supplied preference or a deployment timestamp guessed by application.
 */
export function parseManagementAlertClockCutover(
  value: string | undefined,
): Date {
  if (
    value === undefined ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(
      "Management alert Dispatch source-clock cutover is unavailable.",
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(
      "Management alert Dispatch source-clock cutover is invalid.",
    );
  }
  return parsed;
}

export function requireManagementAlertClockCutover(): Date {
  return parseManagementAlertClockCutover(
    process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER,
  );
}
