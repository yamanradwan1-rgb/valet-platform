import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { cleanupStaffPushPersistence } from "../src/modules/staff-push/staff-push-maintenance-repository";
import { runProviderIndependentStaffPushMaintenance } from "../src/modules/staff-push/staff-push-maintenance";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("worker_cleanup");

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  const registration = await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const result = await context.adminPool.query<{
    delivery_id: string;
    intent_id: string;
  }>(
    `SELECT delivery.id AS delivery_id, intent.id AS intent_id
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  const worker = new StaffPushDeliveryWorker(
    context.runtimePool,
    { ...syntheticStaffPushPolicy, sendingEnabled: true },
    { send: async () => providerSendResult({ resultClass: "ACCEPTED" }) },
    { observe: () => undefined },
  );
  await worker.runOnce();
  await context.adminPool.query(
    `UPDATE staff_push_registrations
     SET state = 'DISABLED', provider_token = NULL,
         terminal_at = clock_timestamp(), terminal_reason_class = 'TEST',
         updated_at = clock_timestamp()
     WHERE id = $1`,
    [registration.registrationId],
  );
  return { ...registration, ...result.rows[0]! };
}

async function ageRows(
  fixture: Awaited<ReturnType<typeof prepared>>,
  days: number,
) {
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_deliveries
       SET created_at = clock_timestamp() - make_interval(days => $2 + 1),
           terminal_at = clock_timestamp() - make_interval(days => $2),
           updated_at = clock_timestamp() - make_interval(days => $2)
       WHERE id = $1`,
      [fixture.delivery_id, days],
    );
    await client.query(
      `UPDATE staff_push_intents
       SET created_at = clock_timestamp() - make_interval(days => $2 + 1),
           expires_at = clock_timestamp() - make_interval(days => $2)
       WHERE id = $1`,
      [fixture.intent_id, days],
    );
    await client.query(
      `UPDATE staff_push_registrations
       SET created_at = clock_timestamp() - interval '32 days',
           last_confirmed_at = clock_timestamp() - interval '32 days',
           terminal_at = clock_timestamp() - interval '31 days',
           updated_at = clock_timestamp() - interval '31 days'
       WHERE id = $1`,
      [fixture.registrationId],
    );
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

describe("Staff Push retention cleanup", () => {
  it("does not delete before retention and is idempotent", async () => {
    const fixture = await prepared();
    await ageRows(fixture, 6);
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toEqual({
      deliveries: 0,
      intents: 0,
      registrations: 0,
    });
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toEqual({
      deliveries: 0,
      intents: 0,
      registrations: 0,
    });
  });

  it("retains then deletes an unreferenced terminal registration at 30 days", async () => {
    const fixture = await context.createGuestParkedFixture();
    const registration = await context.addRegistration(fixture.userId);
    const ageTerminal = async (days: number) => {
      const client = await context.adminPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL session_replication_role = replica");
        await client.query(
          `UPDATE staff_push_registrations
           SET state = 'DISABLED', provider_token = NULL,
               created_at = clock_timestamp() - interval '32 days',
               last_confirmed_at = clock_timestamp() - interval '32 days',
               terminal_at = clock_timestamp() - make_interval(days => $2),
               terminal_reason_class = 'TEST', updated_at = clock_timestamp()
           WHERE id = $1`,
          [registration.registrationId, days],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
    await ageTerminal(29);
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toMatchObject({
      registrations: 0,
    });
    await ageTerminal(31);
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toMatchObject({
      registrations: 1,
    });
  });

  it("deletes in FK-safe delivery, intent, registration order after bounds", async () => {
    const fixture = await prepared();
    await ageRows(fixture, 8);
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toEqual({
      deliveries: 1,
      intents: 1,
      registrations: 1,
    });
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toEqual({
      deliveries: 0,
      intents: 0,
      registrations: 0,
    });
  });

  it("expires and later cleans work while provider sending remains disabled", async () => {
    const fixture = await context.createGuestParkedFixture();
    const registration = await context.addRegistration(fixture.userId);
    await context.request(fixture);
    const rows = await context.adminPool.query<{
      delivery_id: string;
      intent_id: string;
    }>(
      `SELECT delivery.id AS delivery_id, intent.id AS intent_id
       FROM staff_push_deliveries AS delivery
       INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
       WHERE intent.valet_session_id = $1`,
      [fixture.sessionId],
    );
    const send = vi.fn<StaffPushProvider["send"]>();
    const disabledWorker = new StaffPushDeliveryWorker(
      context.runtimePool,
      { ...syntheticStaffPushPolicy, sendingEnabled: false },
      { send },
      { observe: () => undefined },
    );
    await expect(disabledWorker.runOnce()).resolves.toBe(false);
    const client = await context.adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `UPDATE staff_push_intents
         SET created_at = clock_timestamp() - interval '2 seconds',
             expires_at = clock_timestamp() - interval '1 second'
         WHERE id = $1`,
        [rows.rows[0]!.intent_id],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    await runProviderIndependentStaffPushMaintenance(context.runtimePool, {
      ...syntheticStaffPushPolicy,
      sendingEnabled: false,
    });
    expect(send).not.toHaveBeenCalled();
    const expired = await context.adminPool.query<{
      attempt_count: number;
      state: string;
    }>(
      `SELECT state::text, attempt_count FROM staff_push_deliveries
       WHERE id = $1`,
      [rows.rows[0]!.delivery_id],
    );
    expect(expired.rows[0]).toEqual({ attempt_count: 0, state: "EXPIRED" });
    const aged = await context.adminPool.connect();
    try {
      await aged.query("BEGIN");
      await aged.query("SET LOCAL session_replication_role = replica");
      await aged.query(
        `UPDATE staff_push_deliveries
         SET created_at = clock_timestamp() - interval '8 days',
             terminal_at = clock_timestamp() - interval '8 days',
             updated_at = clock_timestamp() - interval '8 days'
         WHERE id = $1`,
        [rows.rows[0]!.delivery_id],
      );
      await aged.query(
        `UPDATE staff_push_intents
         SET created_at = clock_timestamp() - interval '8 days 1 second',
             expires_at = clock_timestamp() - interval '8 days'
         WHERE id = $1`,
        [rows.rows[0]!.intent_id],
      );
      await aged.query("COMMIT");
    } finally {
      aged.release();
    }
    await expect(
      cleanupStaffPushPersistence(context.runtimePool),
    ).resolves.toMatchObject({
      deliveries: 1,
      intents: 1,
    });
    await expect(
      context.runtimePool.query(
        "DELETE FROM staff_push_registrations WHERE id = $1",
        [registration.registrationId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
