import type { PoolClient } from "pg";
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
      "set_config('transaction_timeout',$2,false), " +
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
): () => void {
  const nativeRelease = client.release.bind(client);
  const guest = isGuestDatabaseOperation();
  let releaseRequested = false;
  let finished = false;
  let untrack = () => {};
  const finish = (destroy?: Error | boolean) => {
    if (finished) return;
    finished = true;
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
    const reset = {
      text:
        "RESET statement_timeout; RESET transaction_timeout; " +
        "RESET idle_in_transaction_session_timeout; RESET lock_timeout",
      query_timeout: runtimeDatabaseBudgets.acquireMs,
    };
    void client.query(reset).then(
      () => finish(),
      () => finish(true),
    );
  };
  const dispose = () => finish(true);
  const onError = () => dispose();
  const onEnd = () => dispose();
  // Scope expiry is checked before/after installation; this step cannot throw
  // between native checkout and assigning ownership of its release.
  const timer = setTimeout(
    dispose,
    guest ? runtimeDatabaseBudgets.operationMs : general.transactionMs,
  );
  client.release = release;
  client.on("error", onError);
  client.on("end", onEnd);
  untrack = trackDatabaseOperationClient({ end: async () => dispose() });
  return dispose;
}
