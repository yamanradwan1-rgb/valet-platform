import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("worker_finalize_outage");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Staff Push database outage after provider acceptance", () => {
  it("leaves a durable lease which is reclaimed after connectivity returns", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.request(fixture);
    const delivery = await context.adminPool.query<{ id: string }>(
      `SELECT delivery.id FROM staff_push_deliveries AS delivery
       INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
       WHERE intent.valet_session_id = $1`,
      [fixture.sessionId],
    );
    const deliveryId = delivery.rows[0]!.id;
    const send = vi.fn<StaffPushProvider["send"]>().mockResolvedValue({
      ...providerSendResult({ resultClass: "ACCEPTED" }),
    });
    let accessRevoked = false;
    const firstWorker = new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      { send },
      { observe: () => undefined },
      Math.random,
      () => 0,
      async () => {
        await context.adminPool.query(
          `REVOKE CONNECT ON DATABASE ${quotedIdentifier(context.databaseName)}
           FROM ${quotedIdentifier(context.runtimeRole)}`,
        );
        accessRevoked = true;
        await context.adminPool.query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND usename = $2 AND pid <> pg_backend_pid()`,
          [context.databaseName, context.runtimeRole],
        );
      },
    );

    try {
      await expect(firstWorker.runOnce()).rejects.toBeDefined();
    } finally {
      if (accessRevoked) {
        await context.adminPool.query(
          `GRANT CONNECT ON DATABASE ${quotedIdentifier(context.databaseName)}
           TO ${quotedIdentifier(context.runtimeRole)}`,
        );
      }
    }
    expect(send).toHaveBeenCalledOnce();
    const stranded = await context.adminPool.query<{
      attempt_count: number;
      state: string;
    }>(
      "SELECT attempt_count, state::text FROM staff_push_deliveries WHERE id = $1",
      [deliveryId],
    );
    expect(stranded.rows[0]).toEqual({ attempt_count: 1, state: "LEASED" });

    const bypass = await context.adminPool.connect();
    try {
      await bypass.query("BEGIN");
      await bypass.query("SET LOCAL session_replication_role = replica");
      await bypass.query(
        `UPDATE staff_push_deliveries
         SET lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = $1`,
        [deliveryId],
      );
      await bypass.query("COMMIT");
    } catch (error) {
      await bypass.query("ROLLBACK");
      throw error;
    } finally {
      bypass.release();
    }

    const replacement = new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      { send },
      { observe: () => undefined },
    );
    await replacement.runOnce();
    expect(send).toHaveBeenCalledTimes(2);
    const recovered = await context.adminPool.query<{
      attempt_count: number;
      state: string;
    }>(
      "SELECT attempt_count, state::text FROM staff_push_deliveries WHERE id = $1",
      [deliveryId],
    );
    expect(recovered.rows[0]).toEqual({
      attempt_count: 2,
      state: "PROVIDER_ACCEPTED",
    });
  });
});
