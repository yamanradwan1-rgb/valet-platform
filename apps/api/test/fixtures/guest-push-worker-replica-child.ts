import { Pool } from "pg";

import { GuestPushDeliveryWorker } from "../../src/modules/guest-push/guest-push-delivery-worker";
import { guestPushPolicyV1 } from "../../src/modules/guest-push/guest-push-operational-policy";
import type { GuestPushProvider } from "../../src/modules/guest-push/guest-push-provider";

const databaseUrl = process.env.GUEST_PUSH_TEST_DATABASE_URL;
const mode = process.env.GUEST_PUSH_TEST_MODE;
if (databaseUrl === undefined || mode === undefined) {
  throw new Error("Guest Push replica child requires test configuration.");
}

let sendCount = 0;

async function waitForContinue(): Promise<void> {
  if (typeof process.send !== "function") return;
  process.send("AFTER_PROVIDER");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("hold timeout")), 10_000);
    process.once("message", (message) => {
      clearTimeout(timer);
      if (message === "CONTINUE") resolve();
      else reject(new Error("unexpected parent message"));
    });
  });
}

const provider: GuestPushProvider = {
  async send(request) {
    sendCount += 1;
    if (request.messageForTransport() === undefined) {
      return { kind: "EXPIRED_BEFORE_TRANSPORT" };
    }
    return {
      kind: "PROVIDER_RESULT",
      result: {
        resultClass: mode === "TRANSIENT" ? "TRANSIENT" : "ACCEPTED",
      },
    };
  },
};

function createWorker(pool: Pool): GuestPushDeliveryWorker {
  return new GuestPushDeliveryWorker(
    pool,
    { ...guestPushPolicyV1, sendingEnabled: true },
    provider,
    { observe: () => undefined },
    () => 0,
    () => 0,
    mode === "CRASH_AFTER_PROVIDER"
      ? async () => {
          throw new Error("simulated sender crash");
        }
      : mode === "HOLD_AFTER_PROVIDER"
        ? waitForContinue
        : undefined,
  );
}

async function main(): Promise<void> {
  const pools = [new Pool({ connectionString: databaseUrl, max: 2 })];
  try {
    if (mode === "RACE") {
      pools.push(new Pool({ connectionString: databaseUrl, max: 2 }));
      const results = await Promise.all(pools.map((pool) => createWorker(pool).runOnce()));
      process.stdout.write(
        JSON.stringify({
          ok: true,
          ranCount: results.filter(Boolean).length,
          sendCount,
        }),
      );
      return;
    }
    const ran = await createWorker(pools[0]!).runOnce();
    process.stdout.write(JSON.stringify({ ok: true, ran, sendCount }));
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        error: error instanceof Error ? error.message : "unknown",
        ok: false,
        sendCount,
      }),
    );
    process.exitCode = 3;
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
  }
}

void main();
