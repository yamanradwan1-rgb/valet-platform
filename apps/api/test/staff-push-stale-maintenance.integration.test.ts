import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { claimStaffPushDelivery } from "../src/modules/staff-push/staff-push-claim-repository";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import { retryOrTerminalizeStaffPushDelivery } from "../src/modules/staff-push/staff-push-finalization-repository";
import { reconcileStaleStaffPushRegistrations } from "../src/modules/staff-push/staff-push-maintenance-repository";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("stale_maintenance");
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
  return { ...registration, deliveryId: delivery.rows[0]!.id };
}

async function ageRegistration(registrationId: string, days: number) {
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_registrations
       SET created_at = clock_timestamp() - interval '31 days',
           last_confirmed_at = clock_timestamp() - make_interval(days => $2),
           updated_at = clock_timestamp()
       WHERE id = $1`,
      [registrationId, days],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function registration(registrationId: string) {
  const result = await context.adminPool.query<{
    provider_token: string | null;
    state: string;
    terminal_reason_class: string | null;
    token_hash: string;
  }>(
    `SELECT state::text, provider_token, terminal_reason_class, token_hash
     FROM staff_push_registrations WHERE id = $1`,
    [registrationId],
  );
  return result.rows[0]!;
}

async function deliveryState(deliveryId: string) {
  const result = await context.adminPool.query<{ state: string }>(
    "SELECT state::text FROM staff_push_deliveries WHERE id = $1",
    [deliveryId],
  );
  return result.rows[0]!.state;
}

beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.adminPool.query("DELETE FROM staff_push_deliveries");
  await context.adminPool.query("DELETE FROM staff_push_intents");
  await context.adminPool.query("DELETE FROM staff_push_registrations");
});
afterAll(() => context.teardown(), 60_000);

describe("DEC-076 stale Staff Push registration maintenance", () => {
  it("sends below 30 days and suppresses at the threshold", async () => {
    const fresh = await prepared();
    await ageRegistration(fresh.registrationId, 29);
    const freshSend = vi
      .fn<StaffPushProvider["send"]>()
      .mockResolvedValue(providerSendResult({ resultClass: "ACCEPTED" }));
    await new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      { send: freshSend },
      { observe: () => undefined },
    ).runOnce();
    expect(freshSend).toHaveBeenCalledOnce();

    const stale = await prepared();
    await ageRegistration(stale.registrationId, 30);
    const staleSend = vi.fn<StaffPushProvider["send"]>();
    await new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      { send: staleSend },
      { observe: () => undefined },
    ).runOnce();
    expect(staleSend).not.toHaveBeenCalled();
    expect(await deliveryState(stale.deliveryId)).toBe("SUPPRESSED");
  });

  it.each(["PENDING", "RETRY_WAIT"] as const)(
    "disables stale registration and suppresses %s work",
    async (state) => {
      const fixture = await prepared();
      if (state === "RETRY_WAIT") {
        const claim = (await claimStaffPushDelivery(context.runtimePool, 30))!;
        await retryOrTerminalizeStaffPushDelivery(
          context.runtimePool,
          claim,
          "TRANSIENT",
          10,
        );
      }
      const before = await registration(fixture.registrationId);
      await ageRegistration(fixture.registrationId, 30);
      await expect(
        reconcileStaleStaffPushRegistrations(context.runtimePool, 30),
      ).resolves.toEqual({
        disabledRegistrations: 1,
        suppressedDeliveries: 1,
      });
      expect(await registration(fixture.registrationId)).toEqual({
        provider_token: null,
        state: "DISABLED",
        terminal_reason_class: "STALE_CONFIRMATION_TIMEOUT",
        token_hash: before.token_hash,
      });
      expect(await deliveryState(fixture.deliveryId)).toBe("SUPPRESSED");
    },
  );

  it("never rewrites a currently LEASED delivery", async () => {
    const fixture = await prepared();
    await claimStaffPushDelivery(context.runtimePool, 30);
    await ageRegistration(fixture.registrationId, 30);
    await reconcileStaleStaffPushRegistrations(context.runtimePool, 30);
    expect((await registration(fixture.registrationId)).state).toBe("DISABLED");
    expect(await deliveryState(fixture.deliveryId)).toBe("LEASED");
  });
});
