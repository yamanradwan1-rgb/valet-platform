import { createRuntimePostgresPool } from "../../src/common/database/postgres";
import { StaffPushDeliveryWorker } from "../../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushOperationalPolicyShape } from "../../src/modules/staff-push/staff-push-operational-policy";

const databaseUrl = process.env.CRASH_TEST_DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error("Crash test database unavailable.");
const providerUrl = process.env.CRASH_TEST_PROVIDER_URL;
if (providerUrl === undefined)
  throw new Error("Crash test provider unavailable.");

const policy: StaffPushOperationalPolicyShape = {
  activeRegistrationStaleDays: 30,
  cleanupIntervalHours: 24,
  creationEnabled: true,
  employeeRetrievalRequested: {
    intentTtlSeconds: 300,
    maxAttempts: 4,
    policyVersion: 1,
  },
  intentDeliveryRetentionDays: 7,
  leaseDurationSeconds: 30,
  providerCallTimeoutSeconds: 10,
  retryCapSeconds: 60,
  retryMinimumSeconds: 10,
  sendingEnabled: true,
  terminalRegistrationRetentionDays: 30,
};

const pool = createRuntimePostgresPool(databaseUrl);
const crashPoint = process.env.CRASH_TEST_POINT ?? "BEFORE_FINALIZE";
const worker = new StaffPushDeliveryWorker(
  pool,
  policy,
  {
    async send() {
      const response = await fetch(providerUrl, { method: "POST" });
      if (!response.ok) throw new Error("Crash test provider rejected.");
      process.send?.("PROVIDER_ACCEPTED");
      return { resultClass: "ACCEPTED" };
    },
  },
  { observe: () => undefined },
  Math.random,
  () => new Date(),
  async () => {
    if (crashPoint === "BEFORE_FINALIZE") {
      process.send?.("BEFORE_FINALIZE");
      await new Promise<void>(() => undefined);
    }
  },
  async () => {
    if (crashPoint === "BEFORE_SEND") {
      process.send?.("BEFORE_SEND");
      await new Promise<void>(() => undefined);
    }
  },
);

void worker.runOnce();
