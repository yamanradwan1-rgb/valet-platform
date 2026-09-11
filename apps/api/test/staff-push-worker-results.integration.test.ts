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
import type {
  StaffPushObservation,
  StaffPushObserver,
} from "../src/modules/staff-push/staff-push-observability";
import type {
  StaffPushProvider,
  StaffPushProviderResult,
} from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const context = new RetrievalPushTestContext("worker_results");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  const registration = await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const delivery = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  return {
    ...fixture,
    ...registration,
    deliveryId: delivery.rows[0]!.id,
    valetSessionId: fixture.sessionId,
  };
}

function worker(
  result: StaffPushProviderResult,
  afterProviderResult: () => Promise<void> = async () => undefined,
  observer: StaffPushObserver = { observe: () => undefined },
) {
  const provider: StaffPushProvider = {
    send: vi.fn().mockResolvedValue(result),
  };
  return new StaffPushDeliveryWorker(
    context.runtimePool,
    policy,
    provider,
    observer,
    () => 0.5,
    () => new Date(),
    afterProviderResult,
  );
}

async function row(id: string) {
  const result = await context.adminPool.query<{
    attempt_count: number;
    next_attempt_at: Date | null;
    provider_result_class: string | null;
    state: string;
  }>(
    `SELECT state::text, attempt_count, next_attempt_at,
            provider_result_class::text
     FROM staff_push_deliveries WHERE id = $1`,
    [id],
  );
  return result.rows[0]!;
}

async function bypassGuard(sql: string, values: unknown[]): Promise<void> {
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(sql, values);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
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

describe("Staff Push provider result finalization", () => {
  it("does not claim or send when worker sending is disabled", async () => {
    const fixture = await prepared();
    const send = vi.fn<StaffPushProvider["send"]>();
    const disabled = new StaffPushDeliveryWorker(
      context.runtimePool,
      { ...policy, sendingEnabled: false },
      { send },
      { observe: () => undefined },
    );
    await expect(disabled.runOnce()).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(await row(fixture.deliveryId)).toMatchObject({
      attempt_count: 0,
      state: "PENDING",
    });
  });

  it("emits only bounded operational observations and no attempt audit", async () => {
    const fixture = await prepared();
    const observations: StaffPushObservation[] = [];
    const auditBefore = await context.adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE valet_session_id = $1",
      [fixture.valetSessionId],
    );
    await worker({ resultClass: "ACCEPTED" }, async () => undefined, {
      observe: (observation) => void observations.push(observation),
    }).runOnce();
    expect(observations).toEqual([
      { attempt: "1", event: "CLAIM", reclaimed: false },
      { event: "PROVIDER_RESULT", resultClass: "ACCEPTED" },
    ]);
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain(fixture.deliveryId);
    expect(serialized).not.toContain(fixture.registrationId);
    expect(serialized).not.toContain("synthetic-token");
    const auditAfter = await context.adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE valet_session_id = $1",
      [fixture.valetSessionId],
    );
    expect(auditAfter.rows[0]!.count).toBe(auditBefore.rows[0]!.count);
  });

  it.each(["TRANSIENT", "UNKNOWN", "CONFIGURATION"] as const)(
    "schedules bounded %s retry",
    async (resultClass) => {
      const fixture = await prepared();
      const before = Date.now();
      await worker({ resultClass }).runOnce();
      const delivery = await row(fixture.deliveryId);
      expect(delivery).toMatchObject({
        attempt_count: 1,
        provider_result_class: resultClass,
        state: "RETRY_WAIT",
      });
      expect(delivery.next_attempt_at!.getTime()).toBeGreaterThanOrEqual(
        before + 9_000,
      );
      expect(delivery.next_attempt_at!.getTime()).toBeLessThanOrEqual(
        before + 20_500,
      );
    },
  );

  it("uses bounded RATE_LIMITED scheduling", async () => {
    const fixture = await prepared();
    const before = Date.now();
    await worker({
      resultClass: "RATE_LIMITED",
      retryAfterSeconds: 600,
    }).runOnce();
    const delivery = await row(fixture.deliveryId);
    expect(delivery.state).toBe("RETRY_WAIT");
    expect(delivery.next_attempt_at!.getTime()).toBeLessThanOrEqual(
      before + 60_500,
    );
  });

  it("terminalizes PERMANENT without retry", async () => {
    const fixture = await prepared();
    await worker({ resultClass: "PERMANENT" }).runOnce();
    expect(await row(fixture.deliveryId)).toMatchObject({
      next_attempt_at: null,
      provider_result_class: "PERMANENT",
      state: "PERMANENT_FAILURE",
    });
  });

  it("uses at most four total provider attempts", async () => {
    const fixture = await prepared();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await worker({ resultClass: "UNKNOWN" }).runOnce();
      if (attempt < 4) {
        expect(await row(fixture.deliveryId)).toMatchObject({
          attempt_count: attempt,
          state: "RETRY_WAIT",
        });
        await bypassGuard(
          `UPDATE staff_push_deliveries
           SET next_attempt_at = clock_timestamp() - interval '1 second'
           WHERE id = $1`,
          [fixture.deliveryId],
        );
      }
    }
    expect(await row(fixture.deliveryId)).toMatchObject({
      attempt_count: 4,
      provider_result_class: "UNKNOWN",
      state: "PERMANENT_FAILURE",
    });
  });

  it("expires instead of scheduling a retry at intent expiry", async () => {
    const fixture = await prepared();
    await bypassGuard(
      `UPDATE staff_push_intents
       SET expires_at = clock_timestamp() + interval '5 seconds'
       WHERE valet_session_id = $1`,
      [fixture.valetSessionId],
    );
    await worker({ resultClass: "TRANSIENT" }).runOnce();
    expect(await row(fixture.deliveryId)).toMatchObject({
      next_attempt_at: null,
      provider_result_class: "TRANSIENT",
      state: "EXPIRED",
    });
  });
});
