import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { PostgresPool } from "../src/common/database/postgres";
import { locationKpiAnalytics } from "../src/modules/dashboard/analytics-kpi-query";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const parentUrl = process.env.TEST_DATABASE_URL ?? "";
const privateDirectory = process.env.ISSUE315_PG_PRIVATE_DATADIR?.replaceAll("\\", "/");
const permitted = (() => {
  if (process.platform !== "win32" || process.env.CI === "true" ||
      process.env.ISSUE315_EPHEMERAL_PG !== "I_OWN_THIS_CLUSTER" ||
      parentUrl !== process.env.MIGRATION_DATABASE_URL ||
      !privateDirectory?.includes("/tmp/issue-315-pg-qa/") ||
      !privateDirectory.endsWith("/.issue315-private-cluster")) return false;
  try {
    const url = new URL(parentUrl);
    return url.protocol === "postgresql:" && url.hostname === "127.0.0.1" &&
      url.username === "issue315_owner" && url.password.length > 0 &&
      url.pathname === "/postgres" && url.search === "" && url.hash === "" &&
      Number(url.port) >= 1024 && ![5432, 55449].includes(Number(url.port));
  } catch { return false; }
})();

type Actor = {
  userId: string;
  membershipId: string;
  adminMembershipId: string;
  organizationId: string;
  locationId: string;
  session: StaffSessionContext;
};
const fixture = permitted ? new ManagementControlPlaneTestFixture() : null;
const period = { from: "2026-07-10", to: "2026-07-10" };
const expectedError = { code: "AUTHORIZATION_DENIED" };

async function makeActor(): Promise<Actor> {
  const user = await fixture!.createUser();
  const membership = await fixture!.createMembership(user.id, { role: "LOCATION_MANAGER" });
  const location = await fixture!.addLocation(membership.organizationId);
  const admin = await fixture!.createUser();
  const adminMembershipId = await fixture!.addMembership(membership.organizationId, admin.id, "ORG_ADMIN");
  await fixture!.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
    [membership.organizationId, membership.membershipId, location.locationId],
  );
  const login = await fixture!.nativeLogin(user);
  const created = await fixture!.query<{ created_at: Date }>(
    "SELECT created_at FROM staff_auth_sessions WHERE id=$1", [login.sessionId],
  );
  return {
    userId: user.id, membershipId: membership.membershipId,
    adminMembershipId, organizationId: membership.organizationId,
    locationId: location.locationId,
    session: {
      userId: user.id, staffAuthSessionId: login.sessionId,
      accessTokenHash: staffCredentialHash("access", login.accessToken),
      createdAt: created.rows[0]!.created_at,
    },
  };
}

function kpi(pool: PostgresPool, actor: Actor) {
  return locationKpiAnalytics(pool, {
    authenticatedUserId: actor.userId, locationId: actor.locationId,
    staffSessionContext: actor.session, period, recordManagementActivity: false,
  });
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function monitoredPool(options: {
  gate?: ReturnType<typeof deferred>;
  entered?: ReturnType<typeof deferred>;
  trace: string[];
  snapshots: string[];
}) {
  const actual = new Pool({ connectionString: fixture!.runtimeDatabaseUrl(), max: 12 });
  const clientPids: number[] = [];
  const wrapped = {
    connect: async () => {
      const client = await actual.connect();
      clientPids.push(Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid));
      const original = client.query.bind(client);
      let sampled = false;
      const proxy = {
        query: async (sql: string, parameters?: unknown[]) => {
          if (sql.includes("FROM retrieval_requests AS request") && !sampled) {
            sampled = true;
            const sample = await original<{ isolation: string; snapshot: string }>(
              `SELECT current_setting('transaction_isolation') AS isolation,
                      txid_current_snapshot()::text AS snapshot`,
            );
            expect(sample.rows[0]?.isolation).toBe("repeatable read");
            options.snapshots.push(sample.rows[0]!.snapshot);
            options.trace.push("sla-projection");
            options.entered?.resolve();
            if (options.gate) await options.gate.promise;
          }
          if (sql.includes("FROM incidents AS incident CROSS JOIN bounds")) {
            const sample = await original<{ snapshot: string }>(
              "SELECT txid_current_snapshot()::text AS snapshot",
            );
            options.snapshots.push(sample.rows[0]!.snapshot);
            options.trace.push("key-projection");
          }
          return original(sql, parameters);
        },
        release: () => client.release(),
      } as unknown as PoolClient;
      return proxy;
    },
  } as unknown as PostgresPool;
  return { pool: wrapped, pids: clientPids, close: () => actual.end() };
}

async function writer() {
  const client = await fixture!.databasePool().connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='6s'");
  return client;
}
async function revoke(client: PoolClient, actor: Actor) {
  const version = await client.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1", [actor.membershipId],
  );
  const result = await client.query<{ result_code: string }>(
    `SELECT result_code FROM staff_management_set_location_access(
       $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid[],$6::boolean)`,
    [actor.adminMembershipId, actor.organizationId, actor.membershipId,
      version.rows[0]!.version, [actor.locationId], false],
  );
  expect(result.rows[0]?.result_code).toBe("OK");
}
async function waitForBlocked(pids: readonly number[]) {
  await expect.poll(async () => {
    const result = await fixture!.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE pid=ANY($1::integer[]) AND wait_event_type='Lock'",
      [pids],
    );
    return result.rows.length > 0;
  }, { interval: 25, timeout: 2200 }).toBe(true);
}
async function finish(client: PoolClient) {
  await client.query("ROLLBACK").catch(() => undefined);
  client.release();
}
async function awaitStage(stage: Promise<void>, attempt: Promise<unknown>) {
  void attempt.catch(() => undefined);
  await Promise.race([
    stage,
    attempt.then(() => { throw new Error("KPI finished before projection gate"); },
      (error: unknown) => { throw error; }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("KPI projection gate timeout")), 5000)),
  ]);
}

describe.runIf(permitted)("#315 real PostgreSQL KPI snapshot and revocation", () => {
  beforeAll(async () => {
    const check = new Pool({ connectionString: parentUrl });
    try {
      const identity = (await check.query(
        "SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('data_directory') AS directory",
      )).rows[0];
      expect(identity).toMatchObject({
        db: "postgres", role: "issue315_owner",
        port: Number(new URL(parentUrl).port),
      });
      expect(String(identity.directory).replaceAll("\\", "/")).toBe(privateDirectory);
    } finally { await check.end(); }
    await fixture!.start();
  }, 150_000);
  afterAll(async () => { await fixture!.stop(); }, 90_000);

  it("allows real LM KPI and retains one RR snapshot across SQL projection", async () => {
    const actor = await makeActor();
    const vehicleId = randomUUID();
    const valetSessionId = randomUUID();
    await fixture!.query(
      "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'KPI race',now())",
      [vehicleId, actor.organizationId],
    );
    await fixture!.query(
      `INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,
       organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,created_at,updated_at)
       VALUES($1,$2,now()+interval '1 day',$3,$4,$5,'PARKED',$6,$7,now())`,
      [valetSessionId, randomUUID(), actor.organizationId, actor.locationId,
        vehicleId, actor.membershipId, "2026-07-10T08:00:00Z"],
    );
    await fixture!.query(
      `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
       status,severity,type,description,reported_by_membership_id,created_at)
       VALUES($1,$2,$3,$4,'OPEN','LOW','KEY_MISSING','KPI snapshot',$5,$6)`,
      [randomUUID(), actor.organizationId, actor.locationId, valetSessionId,
        actor.membershipId, "2026-07-10T10:00:00Z"],
    );
    const trace: string[] = [];
    const snapshots: string[] = [];
    const db = monitoredPool({ trace, snapshots });
    try {
      const result = await kpi(db.pool, actor);
      expect(result.locationId).toBe(actor.locationId);
      expect(result.timezone).toBe("Asia/Amman");
      expect(result.keyExceptions.count).toBe(1);
      expect(trace).toEqual(["sla-projection", "key-projection"]);
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]).toBe(snapshots[1]);
    } finally { await db.close(); }
  }, 20_000);

  it("reader-first: canonical revoker waits until RR KPI commits; next read denies", async () => {
    const actor = await makeActor();
    const gate = deferred();
    const entered = deferred();
    const db = monitoredPool({ gate, entered, trace: [], snapshots: [] });
    let revoker: PoolClient | undefined;
    try {
      const reading = kpi(db.pool, actor);
      await awaitStage(entered.promise, reading);
      revoker = await writer();
      const pid = Number((await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
      const pending = revoke(revoker, actor);
      void pending.catch(() => undefined);
      await waitForBlocked([pid]);
      gate.resolve();
      expect((await reading).locationId).toBe(actor.locationId);
      await pending;
      await revoker.query("COMMIT");
      await expect(kpi(db.pool, actor)).rejects.toMatchObject(expectedError);
    } finally {
      gate.resolve();
      if (revoker) await finish(revoker);
      await db.close();
    }
  }, 24_000);

  it("revoker-first: KPI waits then denies committed grant change", async () => {
    const actor = await makeActor();
    const db = monitoredPool({ trace: [], snapshots: [] });
    const revoker = await writer();
    try {
      await revoke(revoker, actor);
      const reading = kpi(db.pool, actor);
      void reading.catch(() => undefined);
      await expect.poll(() => db.pids.length, { timeout: 2000 }).toBeGreaterThan(0);
      await waitForBlocked(db.pids);
      await revoker.query("COMMIT");
      await expect(reading).rejects.toMatchObject(expectedError);
      await expect(kpi(db.pool, actor)).rejects.toMatchObject(expectedError);
    } finally {
      await finish(revoker);
      await db.close();
    }
  }, 24_000);

  it("two simultaneous RR readers each hold canonical grant writer until both finish", async () => {
    const actor = await makeActor();
    const gateA = deferred();
    const gateB = deferred();
    const enteredA = deferred();
    const enteredB = deferred();
    const a = monitoredPool({ gate: gateA, entered: enteredA, trace: [], snapshots: [] });
    const b = monitoredPool({ gate: gateB, entered: enteredB, trace: [], snapshots: [] });
    let revoker: PoolClient | undefined;
    try {
      const first = kpi(a.pool, actor);
      const second = kpi(b.pool, actor);
      await awaitStage(enteredA.promise, first);
      await awaitStage(enteredB.promise, second);
      revoker = await writer();
      const pid = Number((await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
      const pending = revoke(revoker, actor);
      void pending.catch(() => undefined);
      await waitForBlocked([pid]);
      gateA.resolve();
      expect((await first).locationId).toBe(actor.locationId);
      // The other session still protects its own RR KPI projection.
      await waitForBlocked([pid]);
      gateB.resolve();
      expect((await second).locationId).toBe(actor.locationId);
      await pending;
      await revoker.query("COMMIT");
    } finally {
      gateA.resolve();
      gateB.resolve();
      if (revoker) await finish(revoker);
      await a.close();
      await b.close();
    }
  }, 24_000);
});
