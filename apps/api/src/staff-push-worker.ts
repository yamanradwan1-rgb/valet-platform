import "reflect-metadata";

import {
  createRuntimePostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "./common/database/postgres";
import { FcmHttpV1Adapter } from "./modules/staff-push/fcm-http-v1-adapter";
import { readFcmHttpV1Config } from "./modules/staff-push/fcm-http-v1-config";
import {
  staffPushBacklog,
  cleanupStaffPushPersistence,
} from "./modules/staff-push/staff-push-maintenance-repository";
import { StaffPushDeliveryWorker } from "./modules/staff-push/staff-push-delivery-worker";
import { readStaffPushOperationalPolicy } from "./modules/staff-push/staff-push-operational-policy";
import { NoopStaffPushObserver } from "./modules/staff-push/staff-push-observability";

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
  const policy = readStaffPushOperationalPolicy(process.env);
  const fcm = readFcmHttpV1Config(
    process.env,
    policy.sendingEnabled,
    policy.providerCallTimeoutSeconds,
  );
  const pool = createRuntimePostgresPool(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === "production") {
    await verifyProductionRuntimeDatabaseSafety(pool);
  }
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  const observer = new NoopStaffPushObserver();
  const worker =
    fcm === undefined
      ? undefined
      : new StaffPushDeliveryWorker(
          pool,
          policy,
          new FcmHttpV1Adapter(fcm),
          observer,
        );
  let cleanupDue = 0;
  try {
    while (!stop.signal.aborted) {
      const now = Date.now();
      if (now >= cleanupDue) {
        const cleaned = await cleanupStaffPushPersistence(pool);
        await observer.observe({ event: "CLEANUP", ...cleaned });
        cleanupDue = now + policy.cleanupIntervalHours * 60 * 60 * 1_000;
      }
      const backlog = await staffPushBacklog(pool);
      await observer.observe({ event: "BACKLOG", ...backlog });
      const worked = worker === undefined ? false : await worker.runOnce();
      if (!worked) await delay(IDLE_POLL_MILLISECONDS, stop.signal);
    }
  } finally {
    await pool.end();
  }
}

void bootstrap();
