import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { PostgresPool } from "../src/common/database/postgres";
import { locationKpiAnalytics } from "../src/modules/dashboard/analytics-kpi-query";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const url = process.env.TEST_DATABASE_URL ?? "";
const directory = process.env.ISSUE315_PG_PRIVATE_DATADIR?.replaceAll("\\", "/");
const enabled = (() => {
  if (process.platform !== "win32" || process.env.CI === "true" ||
      process.env.ISSUE315_EPHEMERAL_PG !== "I_OWN_THIS_CLUSTER" ||
      url !== process.env.MIGRATION_DATABASE_URL ||
      !directory?.includes("/tmp/issue-315-pg-qa/") ||
      !directory.endsWith("/.issue315-private-cluster")) return false;
  try {
    const target = new URL(url);
    return target.protocol === "postgresql:" && target.hostname === "127.0.0.1" &&
      target.username === "issue315_owner" && target.password.length > 0 &&
      target.pathname === "/postgres" && target.search === "" && target.hash === "" &&
      Number(target.port) >= 1024 && ![5432, 55449].includes(Number(target.port));
  } catch { return false; }
})();
const fixture = enabled ? new ManagementControlPlaneTestFixture() : undefined;

async function authority(role: "LOCATION_MANAGER" | "ORG_ADMIN") {
  const user = await fixture!.createUser();
  const membership = await fixture!.createMembership(user.id, { role });
  const location = await fixture!.addLocation(membership.organizationId);
  if (role === "LOCATION_MANAGER") {
    await fixture!.query(
      "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
      [membership.organizationId, membership.membershipId, location.locationId],
    );
  }
  const login = await fixture!.nativeLogin(user);
  if (role === "ORG_ADMIN") await fixture!.enrollAndAssure(login);
  const created = await fixture!.query<{ created_at: Date }>(
    "SELECT created_at FROM staff_auth_sessions WHERE id=$1", [login.sessionId],
  );
  const context: StaffSessionContext = {
    userId: user.id, staffAuthSessionId: login.sessionId,
    createdAt: created.rows[0]!.created_at,
    accessTokenHash: staffCredentialHash("access", login.accessToken),
  };
  return { userId: user.id, locationId: location.locationId, context };
}

function measured(pool: PostgresPool, actor: Awaited<ReturnType<typeof authority>>) {
  return locationKpiAnalytics(pool, {
    authenticatedUserId: actor.userId, locationId: actor.locationId,
    staffSessionContext: actor.context, recordManagementActivity: false,
    period: { from: "2026-07-10", to: "2026-07-10" },
  });
}

function instrumentedPool(simulateOne40001 = false) {
  const underlying = new Pool({ connectionString: fixture!.runtimeDatabaseUrl(), max: 10 });
  let failuresInjected = 0;
  const isolations: string[] = [];
  const unlocks: string[] = [];
  const wrapped = {
    connect: async () => {
      const connection = await underlying.connect();
      const query = connection.query.bind(connection);
      return {
        query: async (sql: string, args?: unknown[]) => {
          if (sql.includes("FROM retrieval_requests AS request")) {
            const isolation = await query<{ value: string }>(
              "SELECT current_setting('transaction_isolation') AS value",
            );
            isolations.push(isolation.rows[0]!.value);
            if (simulateOne40001 && failuresInjected === 0) {
              failuresInjected += 1;
              const conflict = Object.assign(new Error("synthetic serialization conflict"), {
                code: "40001",
              });
              throw conflict;
            }
          }
          if (sql.includes("pg_advisory_unlock_shared")) unlocks.push(sql);
          return query(sql, args);
        },
        release: (discard?: boolean) => connection.release(discard),
      } as unknown as PoolClient;
    },
  } as unknown as PostgresPool;
  return { pool: wrapped, close: () => underlying.end(), isolations, unlocks,
    injectedCount: () => failuresInjected };
}

describe.runIf(enabled)("#315 real PostgreSQL KPI Company Admin and retry", () => {
  beforeAll(async () => {
    const parent = new Pool({ connectionString: url });
    try {
      const row = (await parent.query(
        "SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('data_directory') AS directory",
      )).rows[0];
      expect(row).toMatchObject({
        db: "postgres", role: "issue315_owner", port: Number(new URL(url).port),
      });
      expect(String(row.directory).replaceAll("\\", "/")).toBe(directory);
    } finally { await parent.end(); }
    await fixture!.start();
  }, 150_000);
  afterAll(async () => { await fixture!.stop(); }, 90_000);

  it("preserves genuine CA MFA authorization while KPI projection remains RR", async () => {
    const admin = await authority("ORG_ADMIN");
    const db = instrumentedPool();
    try {
      const result = await measured(db.pool, admin);
      expect(result.locationId).toBe(admin.locationId);
      expect(db.isolations).toEqual(["repeatable read"]);
      expect(db.unlocks).toEqual([]);
    } finally { await db.close(); }
  }, 25_000);

  it("retries one 40001 projection abort in a new RR transaction without leaking LM lock", async () => {
    const manager = await authority("LOCATION_MANAGER");
    const db = instrumentedPool(true);
    try {
      expect((await measured(db.pool, manager)).locationId).toBe(manager.locationId);
      expect(db.injectedCount()).toBe(1);
      expect(db.isolations).toEqual(["repeatable read", "repeatable read"]);
      expect(db.unlocks).toHaveLength(2);
    } finally { await db.close(); }
  }, 25_000);
});
