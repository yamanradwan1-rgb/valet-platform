/**
 * Instance-local telemetry only. PostgreSQL remains the authoritative limiter;
 * these diagnostic counters never influence authorization or rate budgets.
 */
export interface LimiterMaintenanceSnapshot {
  readonly runs: number;
  readonly deleted: number;
  readonly failures: number;
  readonly durationMs: number;
  readonly expiredSample: number;
  readonly oldestExpiredAgeSeconds: number;
}

const emptySnapshot: LimiterMaintenanceSnapshot = {
  runs: 0,
  deleted: 0,
  failures: 0,
  durationMs: 0,
  expiredSample: 0,
  oldestExpiredAgeSeconds: 0,
};

let latestSnapshot = emptySnapshot;

export function recordLimiterMaintenanceSnapshot(
  snapshot: LimiterMaintenanceSnapshot,
): void {
  latestSnapshot = { ...snapshot };
}

export function readLimiterMaintenanceSnapshot(): LimiterMaintenanceSnapshot {
  return { ...latestSnapshot };
}
