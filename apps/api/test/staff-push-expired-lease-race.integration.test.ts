import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("issue357_lease_race");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };

function transport(resultClass: "ACCEPTED" | "UNKNOWN" = "ACCEPTED") {
  const posted: string[] = [];
  const send = vi
    .fn<StaffPushProvider["send"]>()
    .mockImplementation(async (request) => {
      const message = request.messageForTransport();
      if (message === undefined) return { kind: "EXPIRED_BEFORE_TRANSPORT" };
      posted.push(message.data.intentId);
      return providerSendResult({ resultClass });
    });
  return { posted, send };
}

function worker(
  provider: StaffPushProvider,
  beforeProviderCall: () => Promise<void> = async () => undefined,
) {
  return new StaffPushDeliveryWorker(
    context.runtimePool,
    policy,
    provider,
    { observe: () => undefined },
    () => 0.5,
    undefined,
    undefined,
    beforeProviderCall,
  );
}

async function prepared(): Promise<string> {
  const fixture = await context.createGuestParkedFixture();
  await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const delivery = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id FROM staff_push_deliveries AS delivery
     JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  expect(delivery.rowCount).toBe(1);
  return delivery.rows[0]!.id;
}

async function deliveryState(deliveryId: string) {
  const result = await context.adminPool.query<{
    attempt_count: number;
    lease_token: string | null;
    provider_result_class: string | null;
    state: string;
  }>(
    `SELECT state::text, attempt_count, lease_token::text,
            provider_result_class::text
     FROM staff_push_deliveries WHERE id = $1`,
    [deliveryId],
  );
  return result.rows[0]!;
}

async function alterDeliveryClock(deliveryId: string, update: string) {
  // The database trigger protects real deliveries. Only this disposable
  // PostgreSQL fixture can backdate a lease/retry without waiting 30 seconds.
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(update, [deliveryId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function gate() {
  let arrive!: () => void;
  let resume!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    resume = resolve;
  });
  return {
    reached,
    resume,
    pause: async () => {
      arrive();
      await waiting;
    },
  };
}

beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.adminPool.query("DELETE FROM staff_push_deliveries");
  await context.adminPool.query("DELETE FROM staff_push_intents");
  await context.adminPool.query("DELETE FROM staff_push_registrations");
});
afterAll(() => context.teardown(), 60_000);

describe("#357 actual PostgreSQL Staff Push lease race", () => {
  it("stale paused worker A cannot send after B reclaims, posts and finalizes", async () => {
    const deliveryId = await prepared();
    const barrier = gate();
    const a = transport();
    const b = transport();
    const runA = worker(a, barrier.pause).runOnce();
    await barrier.reached;

    try {
      const claimedByA = await deliveryState(deliveryId);
      expect(claimedByA).toMatchObject({ attempt_count: 1, state: "LEASED" });
      expect(claimedByA.lease_token).toBeTruthy();
      expect(a.posted).toHaveLength(0);

      await alterDeliveryClock(
        deliveryId,
        `UPDATE staff_push_deliveries
         SET lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = $1`,
      );
      expect(await worker(b).runOnce()).toBe(true);
      expect(b.posted).toHaveLength(1);
      expect(await deliveryState(deliveryId)).toMatchObject({
        attempt_count: 2,
        lease_token: null,
        provider_result_class: "ACCEPTED",
        state: "PROVIDER_ACCEPTED",
      });
    } finally {
      barrier.resume();
    }

    expect(await runA).toBe(true);
    expect(a.posted).toHaveLength(0);
    expect(a.send).not.toHaveBeenCalled();
    expect(b.send).toHaveBeenCalledOnce();
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 2,
      state: "PROVIDER_ACCEPTED",
    });
  });

  it("does not start provider I/O after its own lease expires without reclaim", async () => {
    const deliveryId = await prepared();
    const barrier = gate();
    const a = transport();
    const runA = worker(a, barrier.pause).runOnce();
    await barrier.reached;
    try {
      await alterDeliveryClock(
        deliveryId,
        `UPDATE staff_push_deliveries
         SET lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = $1`,
      );
    } finally {
      barrier.resume();
    }
    await expect(runA).resolves.toBe(true);
    expect(a.posted).toHaveLength(0);
    expect(a.send).not.toHaveBeenCalled();
    expect((await deliveryState(deliveryId)).state).toBe("LEASED");
    const b = transport();
    expect(await worker(b).runOnce()).toBe(true);
    expect(b.posted).toHaveLength(1);
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 2,
      state: "PROVIDER_ACCEPTED",
    });
  });

  it.each([
    [
      "revoked staff session",
      `UPDATE staff_auth_sessions
      SET revoked_at = clock_timestamp()
      WHERE id IN (SELECT registration.staff_auth_session_id
        FROM staff_push_registrations AS registration
        JOIN staff_push_deliveries AS delivery
          ON delivery.registration_id = registration.id WHERE delivery.id = $1)`,
    ],
    [
      "disabled notification policy",
      `UPDATE organizations
      SET employee_retrieval_requested_notification_enabled = FALSE
      WHERE id IN (SELECT organization_id FROM staff_push_deliveries WHERE id = $1)`,
    ],
    [
      "disabled device registration",
      `UPDATE staff_push_registrations
      SET state = 'DISABLED', provider_token = NULL,
          terminal_at = clock_timestamp(), terminal_reason_class = 'TEST'
      WHERE id IN (SELECT registration_id FROM staff_push_deliveries WHERE id = $1)`,
    ],
    [
      "ended exact-location shift",
      `UPDATE shifts
      SET status = 'ENDED', ended_at = clock_timestamp()
      WHERE membership_id IN (SELECT recipient_membership_id
        FROM staff_push_deliveries WHERE id = $1)`,
    ],
  ])(
    "stale worker cannot send after B suppresses %s",
    async (_reason, revokeSql) => {
      const deliveryId = await prepared();
      const barrier = gate();
      const a = transport();
      const b = transport();
      const runA = worker(a, barrier.pause).runOnce();
      await barrier.reached;
      try {
        await alterDeliveryClock(
          deliveryId,
          `UPDATE staff_push_deliveries
         SET lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = $1`,
        );
        await context.adminPool.query(revokeSql, [deliveryId]);
        expect(await worker(b).runOnce()).toBe(true);
        expect(b.posted).toHaveLength(0);
        expect((await deliveryState(deliveryId)).state).toBe("SUPPRESSED");
      } finally {
        barrier.resume();
      }
      await expect(runA).resolves.toBe(true);
      expect(a.posted).toHaveLength(0);
      expect(a.send).not.toHaveBeenCalled();
      expect((await deliveryState(deliveryId)).state).toBe("SUPPRESSED");
    },
  );

  it("keeps legitimate UNKNOWN-result retry despite possible at-least-once duplicate", async () => {
    const deliveryId = await prepared();
    const first = transport("UNKNOWN");
    const second = transport("ACCEPTED");
    expect(await worker(first).runOnce()).toBe(true);
    expect(first.posted).toHaveLength(1);
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 1,
      provider_result_class: "UNKNOWN",
      state: "RETRY_WAIT",
    });
    await alterDeliveryClock(
      deliveryId,
      `UPDATE staff_push_deliveries
       SET next_attempt_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
    );
    expect(await worker(second).runOnce()).toBe(true);
    expect(second.posted).toHaveLength(1);
    expect(second.posted[0]).toBe(first.posted[0]);
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 2,
      state: "PROVIDER_ACCEPTED",
    });
  });

  it("lets a valid current lease issue exactly one normal transport request", async () => {
    const deliveryId = await prepared();
    const current = transport();
    expect(await worker(current).runOnce()).toBe(true);
    expect(current.send).toHaveBeenCalledOnce();
    expect(current.posted).toHaveLength(1);
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 1,
      state: "PROVIDER_ACCEPTED",
    });
  });
});
