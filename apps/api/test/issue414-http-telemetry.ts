/**
 * A successful HTTP envelope is not enough to certify PostgreSQL telemetry.
 * Missing, NaN, or newly elevated pool-failure counters are fail-closed.
 */
export const issue414CriticalPoolDeltas = [
  "acquisitionTimeoutsDelta",
  "transactionTimeoutsDelta",
  "leaseExpirationsDelta",
  "rejectedDelta",
  "connectionFailuresDelta",
  "poolErrorsDelta",
  "clientErrorsDelta",
  "leaseSetupFailuresDelta",
  "expiredAcquisitionsDelta",
  "releaseFailuresDelta",
  "failuresDelta",
  "queryTimeoutsDelta",
  "lockTimeoutsDelta",
  "statementTimeoutsDelta",
  "deadlocksDelta",
] as const;

export function issue414HttpTelemetryValid(
  pool: Record<string, unknown>,
): boolean {
  return (
    pool.actualMountedPoolMax === 4 &&
    typeof pool.pgActivitySamples === "number" &&
    pool.pgActivitySamples > 0 &&
    Array.isArray(pool.samplerErrors) &&
    pool.samplerErrors.length === 0 &&
    issue414CriticalPoolDeltas.every((metric) => pool[metric] === 0)
  );
}
