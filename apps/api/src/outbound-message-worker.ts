import "reflect-metadata";

import {
  createRuntimePostgresPool,
  verifyProductionRuntimeDatabaseSafety,
  type PostgresPool,
} from "./common/database/postgres";
import {
  runOutboundWorkerLoop,
  type OutboundWorkerLoopPorts,
} from "./modules/notifications/worker/outbound-worker-loop";
import { senderDatabaseUrl } from "./modules/notifications/worker/outbound-worker-principal";

export type OutboundWorkerComposition = (
  senderPool: PostgresPool,
) => Promise<OutboundWorkerLoopPorts>;

/** Isolated sender process entrypoint; Prime composes W1/W3/W2 implementations. */
export async function startOutboundMessageWorker(
  compose: OutboundWorkerComposition,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const senderUrl = senderDatabaseUrl(env);
  const senderPool = createRuntimePostgresPool(senderUrl, env);
  const stop = new AbortController();
  const onStop = () => stop.abort();
  process.once("SIGTERM", onStop);
  process.once("SIGINT", onStop);
  try {
    if (env.NODE_ENV === "production") {
      await verifyProductionRuntimeDatabaseSafety(senderPool);
    }
    const ports = await compose(senderPool);
    await runOutboundWorkerLoop(ports, stop.signal);
  } finally {
    stop.abort();
    process.removeListener("SIGTERM", onStop);
    process.removeListener("SIGINT", onStop);
    await senderPool.end();
  }
}
