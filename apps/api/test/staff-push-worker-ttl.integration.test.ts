import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("worker_ttl");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const delivery = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  return { ...fixture, deliveryId: delivery.rows[0]!.id };
}

async function setIntentLifetime(valetSessionId: string, seconds: number) {
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_intents
       SET expires_at = clock_timestamp() + make_interval(secs => $2)
       WHERE valet_session_id = $1`,
      [valetSessionId, seconds],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function makeDue(deliveryId: string) {
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_deliveries
       SET next_attempt_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [deliveryId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.adminPool.query("DELETE FROM staff_push_deliveries");
  await context.adminPool.query("DELETE FROM staff_push_intents");
  await context.adminPool.query("DELETE FROM staff_push_registrations");
});
afterAll(() => context.teardown(), 60_000);

describe("Staff Push authoritative provider TTL", () => {
  it("does not extend DB lifetime under unrelated application clock epochs", async () => {
    const fixture = await prepared();
    await setIntentLifetime(fixture.sessionId, 120);
    let wireTtl = 0;
    const provider: StaffPushProvider = {
      async send(request) {
        wireTtl = Number.parseFloat(request.messageForTransport()!.android.ttl);
        return providerSendResult({ resultClass: "ACCEPTED" });
      },
    };
    await new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      provider,
      { observe: () => undefined },
      Math.random,
      () => 9_000_000_000_000,
    ).runOnce();
    expect(wireTtl).toBeGreaterThan(110);
    expect(wireTtl).toBeLessThanOrEqual(120);
  });

  it("subtracts monotonic delay from the DB-authoritative budget", async () => {
    const fixture = await prepared();
    await setIntentLifetime(fixture.sessionId, 30);
    const monotonicTimes = [1_000_000, 1_005_000];
    let wireTtl = 0;
    const provider: StaffPushProvider = {
      async send(request) {
        wireTtl = Number.parseFloat(request.messageForTransport()!.android.ttl);
        return providerSendResult({ resultClass: "ACCEPTED" });
      },
    };
    await new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      provider,
      { observe: () => undefined },
      Math.random,
      () => monotonicTimes.shift() ?? 1_005_000,
    ).runOnce();
    expect(wireTtl).toBeGreaterThan(20);
    expect(wireTtl).toBeLessThanOrEqual(25);
  });

  it("does not restart the five-minute TTL on retry", async () => {
    const fixture = await prepared();
    await setIntentLifetime(fixture.sessionId, 45);
    const first: StaffPushProvider = {
      async send(request) {
        expect(request.messageForTransport()).toBeDefined();
        return providerSendResult({ resultClass: "TRANSIENT" });
      },
    };
    await new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      first,
      { observe: () => undefined },
      () => 0,
    ).runOnce();
    await makeDue(fixture.deliveryId);
    let retryTtl = 0;
    const retry: StaffPushProvider = {
      async send(request) {
        retryTtl = Number.parseFloat(
          request.messageForTransport()!.android.ttl,
        );
        return providerSendResult({ resultClass: "ACCEPTED" });
      },
    };
    await new StaffPushDeliveryWorker(context.runtimePool, policy, retry, {
      observe: () => undefined,
    }).runOnce();
    expect(retryTtl).toBeGreaterThan(35);
    expect(retryTtl).toBeLessThanOrEqual(45);
  });

  it("finalizes EXPIRED when freshness ends before transport", async () => {
    const fixture = await prepared();
    const provider: StaffPushProvider = {
      async send() {
        return { kind: "EXPIRED_BEFORE_TRANSPORT" };
      },
    };
    await new StaffPushDeliveryWorker(context.runtimePool, policy, provider, {
      observe: () => undefined,
    }).runOnce();
    const result = await context.adminPool.query<{ state: string }>(
      "SELECT state::text FROM staff_push_deliveries WHERE id = $1",
      [fixture.deliveryId],
    );
    expect(result.rows[0]!.state).toBe("EXPIRED");
  });
});
