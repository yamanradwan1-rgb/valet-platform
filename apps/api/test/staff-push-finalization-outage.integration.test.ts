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

interface ConnectGrant {
  readonly grantee: number;
  readonly isGrantable: boolean;
}

async function revokeOwnedRuntimeConnect(): Promise<() => Promise<void>> {
  const { databaseName, runtimeRole, adminPool } = context;
  const current = await adminPool.query<{ database: string }>(
    "SELECT current_database() AS database",
  );
  if (!databaseName.startsWith("vlt_005b_") ||
      !runtimeRole.startsWith("vlt_005b_") ||
      current.rows[0]?.database !== databaseName)
    throw new Error("Staff Push outage fixture must own its disposable database.");

  const rows = await adminPool.query<ConnectGrant>(
    `SELECT acl.grantee::integer AS grantee, acl.is_grantable AS "isGrantable"
     FROM pg_database AS db,
       LATERAL aclexplode(COALESCE(db.datacl, acldefault('d', db.datdba))) AS acl
     WHERE db.datname=$1 AND acl.privilege_type='CONNECT'
       AND acl.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname=$2))`,
    [databaseName, runtimeRole],
  );
  const publicGrants = rows.rows.filter((grant) => grant.grantee === 0);
  const roleGrants = rows.rows.filter((grant) => grant.grantee !== 0);
  if (publicGrants.length > 1 || roleGrants.length > 1)
    throw new Error("Unexpected database CONNECT grants in outage fixture.");

  const database = quotedIdentifier(databaseName);
  const role = quotedIdentifier(runtimeRole);
  const restore = async () => {
    for (const [recipient, grant] of [
      ["PUBLIC", publicGrants[0]],
      [role, roleGrants[0]],
    ] as const) {
      if (grant !== undefined)
        await adminPool.query(
          `GRANT CONNECT ON DATABASE ${database} TO ${recipient}` +
          (grant.isGrantable ? " WITH GRANT OPTION" : ""),
        );
    }
  };
  try {
    await adminPool.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
    await adminPool.query(`REVOKE CONNECT ON DATABASE ${database} FROM ${role}`);
    const permission = await adminPool.query<{ allowed: boolean }>(
      `SELECT has_database_privilege($1::name,$2::name,'CONNECT') AS allowed`,
      [runtimeRole, databaseName],
    );
    expect(permission.rows[0]?.allowed).toBe(false);
  } catch (error) {
    await restore();
    throw error;
  }
  return restore;
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
    let restoreConnect: (() => Promise<void>) | undefined;
    const firstWorker = new StaffPushDeliveryWorker(
      context.runtimePool,
      policy,
      { send },
      { observe: () => undefined },
      Math.random,
      () => 0,
      async () => {
        restoreConnect = await revokeOwnedRuntimeConnect();
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
      await restoreConnect?.();
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
