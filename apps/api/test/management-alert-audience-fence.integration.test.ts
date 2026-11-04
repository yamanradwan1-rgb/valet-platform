import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeManagementAlertPhaseOneAudience } from "../src/modules/dashboard/management-alert-audience-authorization";
import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";

const fixture = new ManagementAlertMfaFixture();
let runtime: Pool;

const orgFence = `SELECT pg_advisory_xact_lock(
  hashtextextended('staff-management-org:' || $1::text, 0))`;

beforeAll(async () => {
  await fixture.start();
  runtime = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
}, 180_000);
afterAll(async () => {
  if (runtime) await runtime.end();
  await fixture.stop();
}, 60_000);

async function readerContext(token: string, sessionId: string, userId: string) {
  return fixture.contextFor(token, sessionId, userId);
}

function authorize(
  reader: PoolClient,
  context: StaffSessionContext,
  locationId: string,
) {
  return authorizeManagementAlertPhaseOneAudience(
    reader as unknown as PostgresTransaction,
    { category: "ALT-08", context, locationId },
  );
}

async function pid(client: PoolClient): Promise<number> {
  const row = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  return row.rows[0]!.pid;
}

async function expectBlocked(backendPid: number): Promise<void> {
  await vi.waitFor(
    async () => {
      const state = await fixture.query<{ blockers: number }>(
        "SELECT cardinality(pg_blocking_pids($1))::integer AS blockers",
        [backendPid],
      );
      expect(state.rows[0]?.blockers).toBeGreaterThan(0);
    },
    { interval: 50, timeout: 5000 },
  );
}

async function freshRead(
  reader: PoolClient,
  context: StaffSessionContext,
  locationId: string,
) {
  await reader.query("BEGIN");
  const value = await authorize(reader, context, locationId);
  await reader.query("COMMIT");
  return value;
}

describe("Issue #414 Management audience: in-flight PostgreSQL revocation fencing (PG17, bypass OFF)", () => {
  it.each(["LM_GRANT", "CA_ENTITLEMENT", "CA_MEMBERSHIP"] as const)(
    "blocks behind uncommitted %s revocation, then rechecks fresh scope",
    async (kind) => {
      const company = await fixture.createAssuredAdmin();
      const organizationId = company.membership.organizationId;
      const locationId = company.location.locationId;
      const manager =
        kind === "LM_GRANT"
          ? await fixture.createManager(organizationId)
          : null;
      if (manager !== null)
        await fixture.grantLocation(
          organizationId,
          manager.membershipId,
          locationId,
        );
      const context =
        manager === null
          ? await readerContext(
              company.auth.accessToken,
              company.auth.sessionId,
              company.user.id,
            )
          : await readerContext(
              manager.auth.accessToken,
              manager.auth.sessionId,
              manager.user.id,
            );
      const reader = await runtime.connect();
      const writer = await fixture.databasePool().connect();
      let pending: ReturnType<typeof authorize> | undefined;
      try {
        await writer.query("BEGIN");
        await writer.query(orgFence, [organizationId]);
        if (kind === "LM_GRANT") {
          await writer.query(
            "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
            [manager!.membershipId, locationId],
          );
        } else if (kind === "CA_ENTITLEMENT") {
          await writer.query(
            "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
            [organizationId],
          );
        } else {
          await writer.query(
            "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
            [company.membership.membershipId],
          );
        }
        await reader.query("BEGIN");
        const readerPid = await pid(reader);
        pending = authorize(reader, context, locationId);
        await expectBlocked(readerPid);
        await writer.query("COMMIT");
        expect(await pending).toBeNull();
        await reader.query("COMMIT");
        expect(await freshRead(reader, context, locationId)).toBeNull();
      } finally {
        await writer.query("ROLLBACK");
        await reader.query("ROLLBACK");
        if (pending !== undefined) await Promise.allSettled([pending]);
        writer.release();
        reader.release();
      }
    },
  );

  it("holds its read fence through the source query until a grant writer commits", async () => {
    const company = await fixture.createAssuredAdmin();
    const org = company.membership.organizationId;
    const locationId = company.location.locationId;
    const manager = await fixture.createManager(org);
    await fixture.grantLocation(org, manager.membershipId, locationId);
    const context = await readerContext(
      manager.auth.accessToken,
      manager.auth.sessionId,
      manager.user.id,
    );
    const reader = await runtime.connect();
    const writer = await fixture.databasePool().connect();
    let pendingFence: Promise<unknown> | undefined;
    try {
      await reader.query("BEGIN");
      expect(await authorize(reader, context, locationId)).toMatchObject({
        organizationId: org,
        membershipId: manager.membershipId,
      });
      // The actual source query executes under this same transaction.
      await reader.query(
        "SELECT count(*)::integer AS n FROM audit_events WHERE organization_id=$1",
        [org],
      );
      await writer.query("BEGIN");
      const writerPid = await pid(writer);
      pendingFence = writer.query(orgFence, [org]);
      await expectBlocked(writerPid);
      await reader.query("COMMIT");
      await pendingFence;
      await writer.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [manager.membershipId, locationId],
      );
      await writer.query("COMMIT");
      expect(await freshRead(reader, context, locationId)).toBeNull();
    } finally {
      await reader.query("ROLLBACK");
      await writer.query("ROLLBACK");
      if (pendingFence !== undefined) await Promise.allSettled([pendingFence]);
      reader.release();
      writer.release();
    }
  });

  it("holds the exact Staff session row against concurrent revocation, then denies reuse", async () => {
    const company = await fixture.createAssuredAdmin();
    const context = await readerContext(
      company.auth.accessToken,
      company.auth.sessionId,
      company.user.id,
    );
    const reader = await runtime.connect();
    const writer = await fixture.databasePool().connect();
    let pendingRevoke: Promise<unknown> | undefined;
    try {
      await reader.query("BEGIN");
      expect(
        await authorize(reader, context, company.location.locationId),
      ).not.toBeNull();
      await writer.query("BEGIN");
      const writerPid = await pid(writer);
      pendingRevoke = writer.query(
        "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
        [company.auth.sessionId],
      );
      await expectBlocked(writerPid);
      await reader.query("COMMIT");
      await pendingRevoke;
      await writer.query("COMMIT");
      expect(
        await freshRead(reader, context, company.location.locationId),
      ).toBeNull();
    } finally {
      await reader.query("ROLLBACK");
      await writer.query("ROLLBACK");
      if (pendingRevoke !== undefined)
        await Promise.allSettled([pendingRevoke]);
      reader.release();
      writer.release();
    }
  });
});
