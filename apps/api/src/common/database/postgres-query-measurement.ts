import { performance } from "node:perf_hooks";
import type { RuntimePoolMeasurements } from "./bounded-postgres-pool";
import type { PoolClient } from "pg";
import { beginLifecycleQuery } from "./postgres-lifecycle-diagnostics";

/** Fixed categories only: setup, work, transaction control, reset. No SQL output. */
export function beginQueryMeasurement(
  text: string | undefined,
  measurements: RuntimePoolMeasurements,
  client: PoolClient,
): () => void {
  const finishLifecycle = beginLifecycleQuery(client, text, measurements);
  const kind = text?.startsWith("SELECT set_config('statement_timeout'")
    ? 0
    : text?.startsWith("RESET statement_timeout;")
      ? 3
      : /^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(text ?? "")
        ? 2
        : 1;
  const started = performance.now();
  measurements.queryCounts[kind]! += 1;
  let completed = false;
  return () => {
    if (completed) return;
    completed = true;
    finishLifecycle();
    // Driver round trip includes network and server time; not SQL execution only.
    measurements.queryMs[kind]! += performance.now() - started;
  };
}
