import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { isolatedLiveHistoryLabConfigured } from "./live-history-owned-lab";

const ownerDirectory =
  "D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data";
const fixture = new ManagementControlPlaneTestFixture();
const uuid = (value: string) =>
  "overlay(overlay(md5(" + value + ") placing '4' from 13) placing '8' from 17)::uuid";
const vehicleId = uuid("$1::text||':v:'||n");
const sessionId = uuid("$1::text||':s:'||n");
const taskId = uuid("$1::text||':task:'||n||':'||k");
const dispatchId = uuid("$1::text||':dispatch:'||n||':'||k");
const auditId = uuid("$1::text||':audit:'||n||':'||k");
const happened = "'2026-10-08T12:00:00Z'::timestamptz + " +
  "make_interval(secs=>((n-1)*40+k))";

async function verifyOwner() {
  const ownerUrl = process.env.TEST_DATABASE_URL;
  if (!ownerUrl || process.env.MIGRATION_DATABASE_URL !== ownerUrl)
    throw new Error("Dense100 HTTP refuses non-isolated PostgreSQL configuration.");
  const target = new URL(ownerUrl);
  if (target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" || target.port !== "55449" ||
    target.username !== "valet276test" || target.pathname !== "/postgres")
    throw new Error("Dense100 HTTP refuses an unexpected PostgreSQL target.");
  const db = new Pool({ connectionString: ownerUrl });
  try {
    const result = await db.query(
      "SELECT current_database() db,current_user usr,host(inet_server_addr()) host," +
      "inet_server_port() port,current_setting('data_directory') data",
    );
    const row = result.rows[0];
    if (row.db !== "postgres" || row.usr !== "valet276test" ||
      row.host !== "127.0.0.1" || row.port !== 55449 || row.data !== ownerDirectory)
      throw new Error("Dense100 HTTP PostgreSQL identity mismatch.");
  } finally {
    await db.end();
  }
}
beforeAll(async () => {
  await verifyOwner();
  await fixture.start();
}, 120_000);
afterAll(() => fixture.stop(), 60_000);

async function seedDense100(org: string, location: string, actor: string) {
  const args = [org, location, actor];
  await fixture.query(
    "UPDATE organization_memberships SET first_name='Dense',last_name='Parker'" +
    " WHERE organization_id=$1 AND id=$2",
    [org, actor],
  );
  await fixture.query(
    "INSERT INTO vehicles (id,organization_id,temporary_descriptor,updated_at)" +
    " SELECT " + vehicleId + ",$1::uuid,'Dense synthetic vehicle '||n,clock_timestamp()" +
    " FROM generate_series(1,100)n",
    [org],
  );
  await fixture.query(
    "INSERT INTO valet_sessions (id,organization_id,location_id,vehicle_id," +
    "state,checked_in_by_membership_id,version,updated_at," +
    "customer_access_token_hash,customer_access_expires_at,parked_at)" +
    " SELECT " + sessionId + ",$1::uuid,$2::uuid," + vehicleId +
    ",'PARKED',$3::uuid,8,clock_timestamp()," +
    "md5($1::text||':customer:'||n),clock_timestamp()+interval '1 hour'," +
    "'2026-10-08T14:00:00Z'::timestamptz" +
    " FROM generate_series(1,100)n",
    args,
  );
  await fixture.query(
    "INSERT INTO tasks (id,organization_id,location_id,valet_session_id," +
    "task_type,status,current_assignee_membership_id,version,updated_at)" +
    " SELECT " + taskId + ",$1::uuid,$2::uuid," + sessionId +
    ",'PARKING','COMPLETED',$3::uuid,5,clock_timestamp()" +
    " FROM generate_series(1,100)n CROSS JOIN generate_series(1,40)k",
    args,
  );
  await fixture.query(
    "INSERT INTO dispatch_events (id,organization_id,location_id,task_id," +
    "valet_session_id,event_type,actor_membership_id," +
    "new_assignee_membership_id,occurred_at)" +
    " SELECT " + dispatchId + ",$1::uuid,$2::uuid," + taskId +
    "," + sessionId + ",'COMPLETED',$3::uuid,$3::uuid," + happened +
    " FROM generate_series(1,100)n CROSS JOIN generate_series(1,40)k",
    args,
  );
  await fixture.query(
    "INSERT INTO audit_events (id,organization_id,location_id," +
    "valet_session_id,actor_membership_id,event_type,entity_type," +
    "entity_id,metadata_json,occurred_at)" +
    " SELECT " + auditId + ",$1::uuid,$2::uuid," + sessionId +
    ",$3::uuid,'VALET_SESSION_PARKED','VALET_SESSION'," + sessionId +
    ",jsonb_build_object(" +
    "'taskId'," + taskId + "::text," +
    "'fromTaskStatus','IN_PROGRESS','toTaskStatus','COMPLETED'," +
    "'fromTaskVersion',4,'toTaskVersion',5," +
    "'fromSessionState','PARKING','toSessionState','PARKED'," +
    "'fromSessionVersion',7,'toSessionVersion',8)," + happened +
    " FROM generate_series(1,100)n CROSS JOIN generate_series(1,40)k",
    args,
  );
  const counts = await fixture.query<{
    sessions: number; tasks: number; events: number; audits: number;
  }>(
    "SELECT (SELECT count(*)::int FROM valet_sessions WHERE organization_id=$1)" +
    " sessions,(SELECT count(*)::int FROM tasks WHERE organization_id=$1) tasks," +
    "(SELECT count(*)::int FROM dispatch_events WHERE organization_id=$1) events," +
    "(SELECT count(*)::int FROM audit_events WHERE organization_id=$1) audits",
    [org],
  );
  expect(counts.rows[0]).toEqual({
    sessions: 100, tasks: 4000, events: 4000, audits: 4000,
  });
}

describe.runIf(isolatedLiveHistoryLabConfigured())(
  "#276 Dense100 native HTTP with 4,000 canonical Audits", () => {
  it("validates indexed Dense100 true HTTP and conflicting evidence", async () => {
    const user = await fixture.createUser();
    const manager = await fixture.createMembership(user.id, { role: "LOCATION_MANAGER" });
    const location = await fixture.addLocation(manager.organizationId);
    await fixture.query(
      "INSERT INTO membership_location_access(organization_id,membership_id,location_id)" +
      " VALUES($1,$2,$3)",
      [manager.organizationId, manager.membershipId, location.locationId],
    );
    const auth = await fixture.nativeLogin(user);
    await seedDense100(manager.organizationId, location.locationId, manager.membershipId);
    const url = "/v1/staff/dashboard/locations/" + location.locationId +
      "/overview/live-sessions?limit=100";
    const indexNames = [
      "audit_events_parked_org_entity_idx",
      "audit_events_parked_org_task_ref_idx",
    ];
    // The fresh Prisma migration 079 now creates both indexes on its EMPTY
    // Audit table. This integration test must verify that the actual schema
    // deploy installed them; do not secretly repair missing deployment by
    // creating them in the test after populating Dense100 history.
    const ready = await fixture.query<{
      indexname: string; indisvalid: boolean; indisready: boolean;
    }>(
      "SELECT idx.indexname,pgidx.indisvalid,pgidx.indisready" +
      " FROM pg_indexes idx JOIN pg_class cl ON cl.relname=idx.indexname" +
      " AND cl.relnamespace='public'::regnamespace" +
      " JOIN pg_index pgidx ON pgidx.indexrelid=cl.oid" +
      " WHERE idx.schemaname='public' AND idx.tablename='audit_events'" +
      " AND idx.indexname=ANY($1::text[]) ORDER BY idx.indexname",
      [indexNames],
    );
    expect(ready.rows).toHaveLength(2);
    expect(ready.rows.every((r) => r.indisready && r.indisvalid)).toBe(true);
    await fixture.query("ANALYZE public.audit_events");
    async function request() {
      const response = await fixture.request(url, {
        authorization: "Bearer " + auth.accessToken,
        method: "GET",
      });
      if (response.status !== 200) {
        const activity = await fixture.query<{
          state: string | null; waitType: string | null; count: number;
        }>(
          'SELECT state,wait_event_type AS "waitType",count(*)::int AS count' +
          ' FROM pg_stat_activity WHERE datname=current_database()' +
          " GROUP BY state,wait_event_type ORDER BY state,wait_event_type",
        );
        console.error("[#276 Dense100 runtime failure diagnostics]", JSON.stringify({
          responseStatus: response.status,
          code: response.body?.code,
          activity: activity.rows,
        }));
      }
      expect(response.status, JSON.stringify(response.body).slice(0,500)).toBe(200);
      expect(response.body?.items).toHaveLength(100);
      expect(response.body?.nextCursor).toBeNull();
      for (const item of response.body?.items as Array<Record<string, unknown>>) {
        expect(item.parkingCompletionProof).toBe("PROVEN");
        expect(item.parkedBy).toEqual({ firstName: "Dense", lastName: "Parker" });
        expect(item.checkedInBy).toEqual({ firstName: "Dense", lastName: "Parker" });
      }
      return createHash("sha256").update(JSON.stringify(response.body)).digest("hex");
    }
    // Warm request is excluded from the timings; all measured calls are real
    // HTTP, exact auth, scoped read, history classifier and strict DTO checks.
    const truth = await request();
    const app = (fixture as unknown as { app: INestApplication }).app;
    const runtimePool = app.get<Pool>(RUNTIME_POSTGRES_POOL);
    for (const concurrency of [1, 4, 8, 16]) {
        const before = performance.now();
        const poolBefore = runtimePoolSnapshot(runtimePool);
        const times = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
          const t = performance.now();
          expect(await request()).toBe(truth);
          return Number((performance.now() - t).toFixed(2));
        }));
        const poolAfter = runtimePoolSnapshot(runtimePool);
        const completed = times.filter((result): result is PromiseFulfilledResult<number> =>
          result.status === "fulfilled").map((r) => r.value);
        const rejected = times.filter((result): result is PromiseRejectedResult =>
          result.status === "rejected");
        console.log("[#276 Dense100 true authenticated HTTP]", JSON.stringify({
          phase: "with-dec103-indexes", concurrentRequests: concurrency, pageSessions: 100,
          canonicalAuditEvents: 4000,
          wallMs: Number((performance.now() - before).toFixed(2)),
          maxRequestMs: Math.max(...completed),
          minRequestMs: Math.min(...completed),
          ok: completed.length, failed: rejected.length,
          poolBefore, poolAfter,
        }));
        if (rejected.length > 0) throw rejected[0]!.reason;
    }

    // DEC-102/103 adversarial read: one Audit with the WRONG Location and
    // only a Task-ID reference must invalidate that session, not be omitted
    // in favor of one of its 40 matching historical completions.
    const implicated = await fixture.query<{
      taskId: string; sessionId: string;
    }>(
      'SELECT id::text AS "taskId",valet_session_id::text AS "sessionId"' +
      " FROM tasks WHERE organization_id=$1 ORDER BY id LIMIT 1",
      [manager.organizationId],
    );
    const target = implicated.rows[0]!;
    const wrongLocation = await fixture.addLocation(manager.organizationId);
    await fixture.query(
      "INSERT INTO audit_events(id,organization_id,location_id,valet_session_id," +
      "actor_membership_id,event_type,entity_type,entity_id,metadata_json,occurred_at)" +
      " VALUES($1,$2,$3,NULL,$4,'VALET_SESSION_PARKED','VALET_SESSION',$5," +
      "jsonb_build_object('taskId',$6::text),clock_timestamp())",
      [
        randomUUID(), manager.organizationId, wrongLocation.locationId,
        manager.membershipId, randomUUID(), target.taskId,
      ],
    );
    // Foreign-Organization Audit even with a matching taskId must never be
    // discovered or surfaced inside this authorized Organization page.
    const otherOrg = await fixture.createOrganization();
    const otherLocation = await fixture.addLocation(otherOrg);
    await fixture.query(
      "INSERT INTO audit_events(id,organization_id,location_id,valet_session_id," +
      "actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)" +
      " VALUES($1,$2,$3,NULL,'SYSTEM','VALET_SESSION_PARKED','VALET_SESSION',$4," +
      "jsonb_build_object('taskId',$5::text),clock_timestamp())",
      [randomUUID(), otherOrg, otherLocation.locationId, randomUUID(), target.taskId],
    );
    const changed = await fixture.request(url, {
      authorization: "Bearer " + auth.accessToken,
      method: "GET",
    });
    expect(changed.status).toBe(200);
    const entries = changed.body?.items as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(100);
    const invalid = entries.filter((x) => x.parkingCompletionProof === "UNVERIFIABLE");
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ sessionId: target.sessionId, parkedBy: null });
    expect(entries.filter((x) => x.parkingCompletionProof === "PROVEN")).toHaveLength(99);
    console.log("[#276 Dense100 contradictory C-reference]", JSON.stringify({
      anomalousSessions: invalid.length, stillProvenSessions: 99,
      foreignAuditDoesNotOverrideScope: true,
    }));
    // This is an independent CA + fresh MFA assurance read stress, not a
    // bypass of CA step-up. Same 100-session authorized Location/same bearer.
    const caUser = await fixture.createUser();
    await fixture.addMembership(manager.organizationId, caUser.id, "ORG_ADMIN");
    const ca = await fixture.nativeLogin(caUser);
    const factor = await fixture.enrollAndAssure(ca);
    expect((await fixture.stepUp(ca, factor.secret)).status).toBe(200);
    const caStart = performance.now();
    const caResponses = await Promise.all(Array.from({ length: 16 }, () =>
      fixture.request(url, {
        authorization: "Bearer " + ca.accessToken,
        method: "GET",
      }),
    ));
    console.log("[#276 Dense100 CA MFA HTTP]", JSON.stringify({
      requests: caResponses.length, statuses: caResponses.map((r) => r.status),
      wallMs: +(performance.now() - caStart).toFixed(2),
    }));
    expect(caResponses.map((r) => r.status)).toEqual(Array(16).fill(200));
    expect(caResponses.every((r) =>
      Array.isArray(r.body?.items) && r.body.items.length === 100,
    )).toBe(true);
  }, 160_000);
});
