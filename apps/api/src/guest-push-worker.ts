import "reflect-metadata";

import {
  createRuntimePostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "./common/database/postgres";
import { GuestPushDeliveryWorker } from "./modules/guest-push/guest-push-delivery-worker";
import {
  cleanupGuestPushPersistence,
  guestPushBacklog,
} from "./modules/guest-push/guest-push-maintenance-repository";
import { runGuestPushMaintenance } from "./modules/guest-push/guest-push-maintenance";
import {
  ConsoleGuestPushObserver,
  observeGuestPushSafely,
} from "./modules/guest-push/guest-push-observability";
import { readGuestPushOperationalPolicy } from "./modules/guest-push/guest-push-operational-policy";
import { readGuestPushWorkerDatabaseUrl } from "./modules/guest-push/guest-push-worker-database";
import { GuestWebPushAdapter } from "./modules/guest-push/guest-web-push-adapter";
import { readGuestWebPushConfig } from "./modules/guest-push/guest-web-push-config";

const IDLE_POLL_MILLISECONDS = 1_000;

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function bootstrap(): Promise<void> {
  const policy = readGuestPushOperationalPolicy(process.env);
  const webPush = readGuestWebPushConfig(
    process.env,
    policy.sendingEnabled,
    policy.providerCallTimeoutSeconds,
  );
  const workerDatabaseUrl = readGuestPushWorkerDatabaseUrl(process.env);
  const pool = createRuntimePostgresPool(workerDatabaseUrl, process.env);
  if (process.env.NODE_ENV === "production") {
    await verifyProductionRuntimeDatabaseSafety(pool);
  }
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  const observer = new ConsoleGuestPushObserver();
  const worker =
    webPush === undefined
      ? undefined
      : new GuestPushDeliveryWorker(
          pool,
          policy,
          new GuestWebPushAdapter(webPush),
          observer,
        );
  let cleanupDue = 0;
  try {
    while (!stop.signal.aborted) {
      const now = Date.now();
      if (now >= cleanupDue) {
        const cleaned = await cleanupGuestPushPersistence(pool);
        await observeGuestPushSafely(observer, {
          event: "CLEANUP",
          ...cleaned,
        });
        cleanupDue = now + policy.cleanupIntervalHours * 60 * 60 * 1_000;
      }
      const maintained = await runGuestPushMaintenance(pool);
      await observeGuestPushSafely(observer, {
        event: "MAINTENANCE",
        ...maintained,
      });
      const backlog = await guestPushBacklog(pool);
      await observeGuestPushSafely(observer, { event: "BACKLOG", ...backlog });
      const worked = worker === undefined ? false : await worker.runOnce();
      if (!worked) await delay(IDLE_POLL_MILLISECONDS, stop.signal);
    }
  } finally {
    await pool.end();
  }
}

void bootstrap();
