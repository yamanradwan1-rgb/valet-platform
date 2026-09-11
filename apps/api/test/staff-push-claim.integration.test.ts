import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimStaffPushDelivery,
  STAFF_PUSH_MAINTENANCE_PASS_LIMIT,
  terminalizeUnclaimableStaffPushDeliveries,
} from "../src/modules/staff-push/staff-push-claim-repository";
import {
  finalizeStaffPushDelivery,
  retryOrTerminalizeStaffPushDelivery,
} from "../src/modules/staff-push/staff-push-finalization-repository";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";

const context = new RetrievalPushTestContext("worker_claim");

async function delivery() {
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

async function bypassGuard(sql: string, values: unknown[]) {
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

describe("Staff Push atomic claim and fencing", () => {
  it("claims PENDING once and increments exactly once", async () => {
    const id = await delivery();
    const claim = await claimStaffPushDelivery(context.runtimePool, 30);
    expect(claim).toMatchObject({
      attemptCount: 1,
      deliveryId: id,
      reclaimed: false,
    });
    expect(
      await claimStaffPushDelivery(context.runtimePool, 30),
    ).toBeUndefined();
  });

  it("claims due RETRY_WAIT and ignores non-due RETRY_WAIT", async () => {
    await delivery();
    const first = (await claimStaffPushDelivery(context.runtimePool, 30))!;
    await retryOrTerminalizeStaffPushDelivery(
      context.runtimePool,
      first,
      "TRANSIENT",
      60,
    );
    expect(
      await claimStaffPushDelivery(context.runtimePool, 30),
    ).toBeUndefined();
    await bypassGuard(
      `UPDATE staff_push_deliveries
       SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE id = $1`,
      [first.deliveryId],
    );
    const retry = await claimStaffPushDelivery(context.runtimePool, 30);
    expect(retry).toMatchObject({
      attemptCount: 2,
      deliveryId: first.deliveryId,
    });
  });

  it("reclaims only an actually expired lease and rejects the old fence", async () => {
    await delivery();
    const first = (await claimStaffPushDelivery(context.runtimePool, 30))!;
    expect(
      await claimStaffPushDelivery(context.runtimePool, 30),
    ).toBeUndefined();
    await bypassGuard(
      `UPDATE staff_push_deliveries
       SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1`,
      [first.deliveryId],
    );
    const second = (await claimStaffPushDelivery(context.runtimePool, 30))!;
    expect(second).toMatchObject({ attemptCount: 2, reclaimed: true });
    expect(second.leaseToken).not.toBe(first.leaseToken);
    await expect(
      finalizeStaffPushDelivery(
        context.runtimePool,
        first,
        "PROVIDER_ACCEPTED",
        "ACCEPTED",
      ),
    ).resolves.toBe(false);
    await expect(
      finalizeStaffPushDelivery(context.runtimePool, second, "SUPPRESSED"),
    ).resolves.toBe(true);
  });

  it("gives two racing workers one current lease winner", async () => {
    await delivery();
    const claims = await Promise.all([
      claimStaffPushDelivery(context.runtimePool, 30),
      claimStaffPushDelivery(context.runtimePool, 30),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("does not claim exhausted or expired work and terminalizes recovery rows", async () => {
    const id = await delivery();
    const first = (await claimStaffPushDelivery(context.runtimePool, 30))!;
    await bypassGuard(
      `UPDATE staff_push_deliveries
       SET attempt_count = max_attempts, lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [id],
    );
    expect(
      await claimStaffPushDelivery(context.runtimePool, 30),
    ).toBeUndefined();
    await terminalizeUnclaimableStaffPushDeliveries(context.runtimePool);
    const row = await context.adminPool.query<{ state: string }>(
      "SELECT state::text FROM staff_push_deliveries WHERE id = $1",
      [first.deliveryId],
    );
    expect(row.rows[0]!.state).toBe("PERMANENT_FAILURE");

    await context.adminPool.query("DELETE FROM staff_push_deliveries");
    await context.adminPool.query("DELETE FROM staff_push_intents");
    await delivery();
    await bypassGuard(
      `UPDATE staff_push_intents
       SET created_at = clock_timestamp() - interval '2 seconds',
           expires_at = clock_timestamp() - interval '1 second'`,
      [],
    );
    expect(
      await claimStaffPushDelivery(context.runtimePool, 30),
    ).toBeUndefined();
    await terminalizeUnclaimableStaffPushDeliveries(context.runtimePool);
    const expired = await context.adminPool.query<{ state: string }>(
      "SELECT state::text FROM staff_push_deliveries",
    );
    expect(expired.rows[0]!.state).toBe("EXPIRED");

    await context.adminPool.query("DELETE FROM staff_push_deliveries");
    await context.adminPool.query("DELETE FROM staff_push_intents");
    await delivery();
    const expiringLease = (await claimStaffPushDelivery(
      context.runtimePool,
      30,
    ))!;
    await bypassGuard(
      `UPDATE staff_push_intents
       SET created_at = clock_timestamp() - interval '2 seconds',
           expires_at = clock_timestamp() - interval '1 second'`,
      [],
    );
    await bypassGuard(
      `UPDATE staff_push_deliveries
       SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [expiringLease.deliveryId],
    );
    await terminalizeUnclaimableStaffPushDeliveries(context.runtimePool);
    const expiredLease = await context.adminPool.query<{ state: string }>(
      "SELECT state::text FROM staff_push_deliveries WHERE id = $1",
      [expiringLease.deliveryId],
    );
    expect(expiredLease.rows[0]!.state).toBe("EXPIRED");
  });

  it("bounds one maintenance pass and safely drains with concurrent later passes", async () => {
    const total = STAFF_PUSH_MAINTENANCE_PASS_LIMIT + 2;
    for (let index = 0; index < total; index += 1) await delivery();
    await bypassGuard(
      `UPDATE staff_push_intents
       SET created_at = clock_timestamp() - interval '2 seconds',
           expires_at = clock_timestamp() - interval '1 second'`,
      [],
    );
    await expect(
      terminalizeUnclaimableStaffPushDeliveries(context.runtimePool),
    ).resolves.toBe(STAFF_PUSH_MAINTENANCE_PASS_LIMIT);
    const afterOne = await context.adminPool.query<{
      count: string;
      state: string;
    }>(
      `SELECT state::text, count(*)::text AS count
       FROM staff_push_deliveries GROUP BY state ORDER BY state`,
    );
    expect(afterOne.rows).toEqual([
      { count: String(STAFF_PUSH_MAINTENANCE_PASS_LIMIT), state: "EXPIRED" },
      { count: "2", state: "PENDING" },
    ]);
    const drained = await Promise.all([
      terminalizeUnclaimableStaffPushDeliveries(context.runtimePool),
      terminalizeUnclaimableStaffPushDeliveries(context.runtimePool),
    ]);
    expect(drained.reduce((sum, count) => sum + count, 0)).toBe(2);
    const final = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM staff_push_deliveries
       WHERE state <> 'EXPIRED'`,
    );
    expect(final.rows[0]!.count).toBe("0");
  });
});
