import { performance } from "node:perf_hooks";
import { AsyncResource } from "node:async_hooks";
import type { PoolClient } from "pg";
import { beginLeaseDiagnostics } from "./postgres-lifecycle-diagnostics";
import type { RuntimePoolMeasurements } from "./bounded-postgres-pool";
import { finishTransactionOutcomes } from "./postgres-transaction-outcome";
import {
  isGuestDatabaseOperation,
  trackDatabaseOperationClient,
} from "./runtime-database-deadline";
import {
  runtimeDatabaseBudgets,
  type GeneralDatabaseBudgets,
} from "./runtime-postgres-policy";

export async function configureGeneralLease(
  client: PoolClient,
  budgets: GeneralDatabaseBudgets,
  acquireRemainingMs: number,
): Promise<void> {
  if (isGuestDatabaseOperation()) return;
  const config = {
    text:
      "SELECT set_config('statement_timeout',$1,false), " +
      "CASE WHEN current_setting('server_version_num')::int >= 170000 " +
      "THEN set_config('transaction_timeout',$2,false) ELSE NULL END, " +
      "set_config('idle_in_transaction_session_timeout',$3,false), " +
      "set_config('lock_timeout',$4,false)",
    values: [
      String(budgets.statementMs),
      String(budgets.transactionMs),
      String(budgets.idleTransactionMs),
      String(budgets.lockMs),
    ],
    query_timeout: acquireRemainingMs,
  };
  await client.query(config);
}

export function ownPostgresLease(
  client: PoolClient,
  general: GeneralDatabaseBudgets,
  returned: () => void,
  measurements?: RuntimePoolMeasurements,
): () => void {
  const started = performance.now();
  const diagnostics = measurements
    ? beginLeaseDiagnostics(client, measurements)
    : undefined;
  const nativeRelease = client.release.bind(client);
  const guest = isGuestDatabaseOperation();
  let releaseRequested = false;
  let finished = false;
  let untrack = () => {};
  const finish = (destroy?: Error | boolean) => {
    if (finished) return;
    finished = true;
    diagnostics?.finish(Boolean(destroy));
    if (measurements) {
      const elapsed = performance.now() - started;
      measurements.leaseCompletions += 1;
      measurements.leaseMs += elapsed;
      const bucket = [5, 25, 100, 500, 1000, 5000].findIndex(
        (ceiling) => elapsed <= ceiling,
      );
      measurements.leaseBuckets[bucket < 0 ? 6 : bucket]! += 1;
    }
    if (destroy) finishTransactionOutcomes(client, "UNAVAILABLE");
    clearTimeout(timer);
    untrack();
    client.removeListener("error", onError);
    client.removeListener("end", onEnd);
    returned();
    nativeRelease(destroy);
  };
  const release = (error?: Error | boolean) => {
    if (finished) return;
    // Forced disposal must also interrupt a reset already in flight.
    if (error) {
      finish(error);
      return;
    }
    if (releaseRequested) return;
    releaseRequested = true;
    if (guest) {
      finish();
      return;
    }
    diagnostics?.resetStarted();
    const reset = {
      text:
        "RESET statement_timeout; RESET idle_in_transaction_session_timeout; " +
        "RESET lock_timeout; SELECT CASE WHEN " +
        "current_setting('server_version_num')::int >= 170000 " +
        "THEN set_config('transaction_timeout','0',false) ELSE NULL END",
      query_timeout: runtimeDatabaseBudgets.acquireMs,
    };
    void client.query(reset).then(
      () => finish(),
      (error: unknown) => {
        diagnostics?.resetFailed(error);
        if (measurements) measurements.releaseFailures += 1;
        finish(true);
      },
    );
  };
  const dispose = () => finish(true);
  const onError = () => dispose();
  const onEnd = () => dispose();
  // Scope expiry is checked before/after installation; this step cannot throw
  // between native checkout and assigning ownership of its release.
  const timer = setTimeout(
    () => {
      if (measurements) measurements.leaseExpirations += 1;
      dispose();
    },
    guest ? runtimeDatabaseBudgets.operationMs : general.transactionMs,
  );
  // pg.Pool.query releases from a socket callback which can retain an expired
  // startup/previous-operation scope. Cleanup belongs to this lease's owner;
  // retain its deadlines, watchdog and query bounds, not the callback's scope.
  client.release = AsyncResource.bind(release);
  client.on("error", onError);
  client.on("end", onEnd);
  untrack = trackDatabaseOperationClient({ end: async () => dispose() });
  return dispose;
}
