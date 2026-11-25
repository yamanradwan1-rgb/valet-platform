import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { claimStaffPushDelivery } from "../src/modules/staff-push/staff-push-claim-repository";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import { finalizeStaffPushDelivery } from "../src/modules/staff-push/staff-push-finalization-repository";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { withStaffPushFixtureGuardsDisabled } from "./staff-push-fixture-guard";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("worker_crash");
const childScript = resolve(
  process.cwd(),
  "test/fixtures/staff-push-crash-child.ts",
);
const children = new Set<ReturnType<typeof spawn>>();
const providerServers: Server[] = [];

async function startFakeProvider(): Promise<{
  readonly requests: () => number;
  readonly url: string;
}> {
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    request.resume();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"accepted":true}');
  });
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  providerServers.push(server);
  const address = server.address() as AddressInfo;
  return {
    requests: () => requestCount,
    url: `http://127.0.0.1:${address.port.toString()}`,
  };
}

async function prepare(): Promise<string> {
  const fixture = await context.createGuestParkedFixture();
  await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const result = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  return result.rows[0]!.id;
}

function startCrashChild(providerUrl: string, crashPoint: "BEFORE_SEND" | "BEFORE_FINALIZE") {
  // The worker itself must be the child we kill, not the tsx CLI launcher.
  const child = spawn(process.execPath, ["--import", "tsx", childScript], {
    env: {
      ...process.env,
      CRASH_TEST_DATABASE_URL: context.runtimeUrl,
      CRASH_TEST_PROVIDER_URL: providerUrl,
      CRASH_TEST_POINT: crashPoint,
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
  });
  children.add(child);
  child.once("close", () => children.delete(child));
  return child;
}

function waitForMessage(child: ReturnType<typeof spawn>, expected: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Crash child timed out.")), 20_000);
    const onMessage = (message: unknown) => {
      if (typeof message !== "object" || message === null || !("event" in message) || message.event !== expected)
        return;
      if (!("pid" in message) || message.pid !== child.pid)
        finish(new Error("Crash barrier did not originate from the owned worker PID."));
      else finish();
    };
    const onExit = () => finish(new Error("Crash child exited before its barrier."));
    const onError = () => finish(new Error("Crash child failed before its barrier."));
    function finish(error?: Error) {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
      if (error) reject(error);
      else resolve();
    }
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function killOwnedChild(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return { signal: child.signalCode };
  if (!children.has(child) || !child.pid || child.spawnfile !== process.execPath || !child.spawnargs.includes(childScript))
    throw new Error("Refusing hard kill without exact owned worker identity.");
  return new Promise<{ signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("Owned crash worker did not exit."));
    }, 5_000);
    function onExit(_code: number | null, signal: NodeJS.Signals | null) {
      clearTimeout(timer);
      resolve({ signal });
    }
    child.once("exit", onExit);
    if (!child.kill("SIGKILL")) {
      clearTimeout(timer);
      child.off("exit", onExit);
      reject(new Error("Owned crash worker hard kill failed."));
    }
  });
}

async function expireLease(deliveryId: string): Promise<void> {
  await withStaffPushFixtureGuardsDisabled(context.adminPool, context.databaseName, ["staff_push_deliveries"], async (client) => {
    await client.query(
      `UPDATE staff_push_deliveries
       SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [deliveryId],
    );
  });
}

beforeAll(() => context.setup(), 120_000);
afterEach(async () => {
  try {
    await Promise.all([...children].map(killOwnedChild));
  } finally {
    await Promise.all(
      providerServers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolveClose, reject) =>
              server.close((error) =>
                error === undefined ? resolveClose() : reject(error),
              ),
            ),
        ),
    );
  }
});
afterAll(() => context.teardown(), 60_000);

describe("Staff Push hard process-loss recovery", () => {
  it("reclaims after SIGKILL between provider acceptance and finalization", async () => {
    const deliveryId = await prepare();
    const fakeProvider = await startFakeProvider();
    const child = startCrashChild(fakeProvider.url, "BEFORE_FINALIZE");
    await waitForMessage(child, "BEFORE_FINALIZE");
    expect(fakeProvider.requests()).toBe(1);
    const leased = await context.adminPool.query<{
      attempt_count: number;
      lease_token: string;
    }>(
      `SELECT attempt_count, lease_token::text
       FROM staff_push_deliveries WHERE id = $1 AND state = 'LEASED'`,
      [deliveryId],
    );
    await expect(killOwnedChild(child)).resolves.toEqual({ signal: "SIGKILL" });

    await expireLease(deliveryId);

    const secondSend = vi.fn<StaffPushProvider["send"]>().mockResolvedValue({
      ...providerSendResult({ resultClass: "ACCEPTED" }),
    });
    const second = new StaffPushDeliveryWorker(
      context.runtimePool,
      { ...syntheticStaffPushPolicy, sendingEnabled: true },
      { send: secondSend },
      { observe: () => undefined },
    );
    await second.runOnce();
    expect(secondSend).toHaveBeenCalledOnce();
    const final = await context.adminPool.query<{
      attempt_count: number;
      state: string;
    }>(
      "SELECT attempt_count, state::text FROM staff_push_deliveries WHERE id = $1",
      [deliveryId],
    );
    expect(final.rows[0]).toEqual({
      attempt_count: 2,
      state: "PROVIDER_ACCEPTED",
    });
    await expect(
      finalizeStaffPushDelivery(
        context.runtimePool,
        {
          attemptCount: leased.rows[0]!.attempt_count,
          deliveryId,
          leaseToken: leased.rows[0]!.lease_token,
          maxAttempts: 4,
          reclaimed: false,
        },
        "PROVIDER_ACCEPTED",
        "ACCEPTED",
      ),
    ).resolves.toBe(false);
    expect(
      await claimStaffPushDelivery(context.runtimePool, 30),
    ).toBeUndefined();
  });

  it("recovers after SIGKILL after claim and before provider I/O", async () => {
    const deliveryId = await prepare();
    const fakeProvider = await startFakeProvider();
    const child = startCrashChild(fakeProvider.url, "BEFORE_SEND");
    await waitForMessage(child, "BEFORE_SEND");
    expect(fakeProvider.requests()).toBe(0);
    await expect(killOwnedChild(child)).resolves.toEqual({ signal: "SIGKILL" });
    await expireLease(deliveryId);

    const send = vi.fn<StaffPushProvider["send"]>().mockResolvedValue({
      ...providerSendResult({ resultClass: "ACCEPTED" }),
    });
    const replacement = new StaffPushDeliveryWorker(
      context.runtimePool,
      { ...syntheticStaffPushPolicy, sendingEnabled: true },
      { send },
      { observe: () => undefined },
    );
    await replacement.runOnce();
    expect(send).toHaveBeenCalledOnce();
    const final = await context.adminPool.query<{
      attempt_count: number;
      state: string;
    }>(
      "SELECT attempt_count, state::text FROM staff_push_deliveries WHERE id = $1",
      [deliveryId],
    );
    expect(final.rows[0]).toEqual({
      attempt_count: 2,
      state: "PROVIDER_ACCEPTED",
    });
  });
});
