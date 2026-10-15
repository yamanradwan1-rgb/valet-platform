import { OUTBOUND_LIMITS, type OutboundLeaseRepository } from "../contracts/outbound-lease";
import type { OutboundDeliveryWorker } from "./outbound-delivery-worker";

export interface OutboundWorkerLoopPorts {
  readonly leases: OutboundLeaseRepository;
  readonly worker: Pick<OutboundDeliveryWorker, "runBatch">;
  /** Separate database role, schema, key and capability checks at startup. */
  readonly checkReady: () => Promise<void>;
  /** An OFF environment flag may only narrow durable policy. */
  readonly sendingEnabled: boolean;
  readonly pollIntervalMs?: number;
  readonly afterCycle?: (cycle: { readonly claimed: number; readonly purged: number }) => void;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finished = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finished);
      resolve();
    };
    signal.addEventListener("abort", finished, { once: true });
    const timer = setTimeout(finished, milliseconds);
  });
}

/** Keeps cleanup running with sends OFF; a signal prevents any new claims. */
export async function runOutboundWorkerLoop(
  ports: OutboundWorkerLoopPorts,
  signal: AbortSignal,
): Promise<void> {
  await ports.checkReady();
  const interval = ports.pollIntervalMs ?? 1_000;
  if (!Number.isSafeInteger(interval) || interval < 100 || interval > 60_000) {
    throw new Error("OUTBOUND_WORKER_POLL_INVALID");
  }
  while (!signal.aborted) {
    const purged = await ports.leases.expireAndPurge(OUTBOUND_LIMITS.cleanupBatchSize);
    if (signal.aborted) break;
    const claimed = ports.sendingEnabled ? await ports.worker.runBatch(signal) : 0;
    ports.afterCycle?.({ claimed, purged });
    if (signal.aborted) break;
    await abortableDelay(claimed > 0 || purged > 0 ? 100 : interval, signal);
  }
}
