import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const url = process.env.TEST_DATABASE_URL ?? "";
const directory = process.env.ISSUE315_PG_PRIVATE_DATADIR?.replaceAll("\\", "/");
const enabled = (() => {
  if (process.platform !== "win32" || process.env.CI === "true" ||
      process.env.ISSUE315_EPHEMERAL_PG !== "I_OWN_THIS_CLUSTER" ||
      url !== process.env.MIGRATION_DATABASE_URL ||
      !directory?.includes("/tmp/issue-315") ||
      !directory.endsWith("/.issue315-private-cluster")) return false;
  try {
    const target = new URL(url);
    return target.protocol === "postgresql:" &&
      target.hostname === "127.0.0.1" && target.username === "issue315_owner" &&
      target.password.length > 0 && target.pathname === "/postgres" &&
      target.search === "" && target.hash === "" &&
      Number(target.port) >= 1024 && ![5432, 55449].includes(Number(target.port));
  } catch { return false; }
})();
const fixture = enabled ? new ManagementControlPlaneTestFixture() : undefined;

type Actor = {
  context: StaffSessionContext;
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
};

async function actor(): Promise<Actor> {
  const user = await fixture!.createUser();
  const member = await fixture!.createMembership(user.id, { role: "LOCATION_MANAGER" });
  const location = await fixture!.addLocation(member.organizationId);
  await fixture!.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
    [member.organizationId, member.membershipId, location.locationId],
  );
  const login = await fixture!.nativeLogin(user);
  const result = await fixture!.query<{ created_at: Date }>(
    "SELECT created_at FROM staff_auth_sessions WHERE id=$1", [login.sessionId],
  );
  return {
    userId: user.id, membershipId: member.membershipId,
    organizationId: member.organizationId, locationId: location.locationId,
    sessionId: login.sessionId,
    context: {
      accessTokenHash: staffCredentialHash("access", login.accessToken),
      createdAt: result.rows[0]!.created_at,
      staffAuthSessionId: login.sessionId, userId: user.id,
    },
  };
}

async function connection(isolation = "READ COMMITTED"): Promise<PoolClient> {
  const c = await fixture!.databasePool().connect();
  await c.query(`BEGIN ISOLATION LEVEL ${isolation}`);
  await c.query("SET LOCAL statement_timeout='5s'");
  await c.query("SET LOCAL lock_timeout='3s'");
  return c;
}
async function release(...clients: PoolClient[]) {
  for (const c of clients) {
    await c.query("ROLLBACK").catch(() => undefined);
    c.release();
  }
}
const read = (c: PoolClient, a: Actor,
  capability: "LOCATION_DASHBOARD_READ" | "REPORT_EXPORT" = "LOCATION_DASHBOARD_READ") =>
  authorizeDashboardReadLocation(c, {
    authenticatedUserId: a.userId, targetLocationId: a.locationId,
    staffSessionContext: a.context, capability,
  });
const advisory = (c: PoolClient, a: Actor) =>
  c.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))",
    [a.organizationId],
  );
async function backend(c: PoolClient) {
  return Number((await c.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
}
async function waitLock(pid: number) {
  await expect.poll(async () => (await fixture!.query<{ wait_event_type: string | null }>(
    "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid],
  )).rows[0]?.wait_event_type, { timeout: 1800, interval: 30 }).toBe("Lock");
}

describe.runIf(enabled)("Issue #315 isolated PG extended concurrency and fault matrix", () => {
  beforeAll(async () => {
    const parent = new Pool({ connectionString: url });
    try {
      const row = (await parent.query(
        "SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('data_directory') AS dir",
      )).rows[0];
      expect(row).toMatchObject({ db: "postgres", role: "issue315_owner", port: Number(new URL(url).port) });
      expect(String(row.dir).replaceAll("\\", "/")).toBe(directory);
      expect((await parent.query("SHOW transaction_isolation")).rows[0]?.transaction_isolation)
        .toBe("read committed");
    } finally { await parent.end(); }
    await fixture!.start();
  }, 150_000);
  afterAll(async () => { await fixture!.stop(); }, 90_000);

  it("revoker-first DELETE followed by same-transaction regrant yields valid current authority", async () => {
    const a = await actor();
    const writer = await connection();
    const reader = await connection();
    try {
      await advisory(writer, a);
      await writer.query("DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [a.membershipId, a.locationId]);
      await writer.query("INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
        [a.organizationId, a.membershipId, a.locationId]);
      const pid = await backend(reader);
      const pending = read(reader, a);
      await waitLock(pid);
      await writer.query("COMMIT");
      expect(await pending).toMatchObject({ membershipId: a.membershipId });
    } finally { await release(writer, reader); }
  });

  it("multiple concurrent revokers serialize without deadlock", async () => {
    const a = await actor();
    const first = await connection();
    const second = await connection();
    const reader = await connection();
    try {
      await advisory(first, a);
      const secondPid = await backend(second);
      const secondLock = advisory(second, a);
      await waitLock(secondPid);
      const readerPid = await backend(reader);
      const pendingRead = read(reader, a);
      await waitLock(readerPid);
      await first.query("DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [a.membershipId, a.locationId]);
      await first.query("COMMIT");
      await secondLock;
      await second.query("DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [a.membershipId, a.locationId]);
      await second.query("COMMIT");
      expect(await pendingRead).toBeNull();
    } finally { await release(first, second, reader); }
  });

  it("blocked reader fails under bounded lock_timeout, not PG deadlock", async () => {
    const a = await actor();
    const writer = await connection();
    const reader = await connection();
    try {
      await advisory(writer, a);
      await reader.query("SET LOCAL lock_timeout='250ms'");
      await expect(read(reader, a)).rejects.toMatchObject({ code: "55P03" });
      await writer.query("COMMIT");
    } finally { await release(writer, reader); }
  });

  it.each(["REPEATABLE READ", "SERIALIZABLE"])(
    "fails closed on non-READ COMMITTED %s snapshot", async isolation => {
      const a = await actor();
      const c = await connection(isolation);
      try { expect(await read(c, a)).toBeNull(); }
      finally { await release(c); }
    },
  );

  it("REPORT_EXPORT checks exact current Staff session revocation", async () => {
    const a = await actor();
    const active = await connection();
    try { expect(await read(active, a, "REPORT_EXPORT")).not.toBeNull(); }
    finally { await release(active); }
    await fixture!.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId],
    );
    const invalid = await connection();
    try { expect(await read(invalid, a, "REPORT_EXPORT")).toBeNull(); }
    finally { await release(invalid); }
  });

  it("disabled Staff user and inactive membership deny all dashboard reads", async () => {
    for (const revoke of [
      "UPDATE users SET status='DISABLED' WHERE id=$1",
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
    ]) {
      const a = await actor();
      await fixture!.query(revoke, [revoke.includes("organization_memberships") ? a.membershipId : a.userId]);
      const c = await connection();
      try { expect(await read(c, a)).toBeNull(); }
      finally { await release(c); }
    }
  });

  it("documents the raw privileged revoker-first uncommitted grant bypass", async () => {
    const a = await actor();
    const writer = await connection();
    const reader = await connection();
    try {
      await writer.query("DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [a.membershipId, a.locationId]);
      // Privileged raw SQL bypasses the canonical org advisory. In READ
      // COMMITTED, the reader still sees the row while DELETE is uncommitted.
      expect(await read(reader, a)).not.toBeNull();
      await writer.query("COMMIT");
      const fresh = await connection();
      try { expect(await read(fresh, a)).toBeNull(); }
      finally { await release(fresh); }
    } finally { await release(writer, reader); }
  });
});
