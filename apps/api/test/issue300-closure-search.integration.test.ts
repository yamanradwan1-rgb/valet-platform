import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { auditInvestigationIntegritySql } from "../src/modules/management/audit-investigation/search/search-page-query";
import { auditInvestigationSelectorStatements } from "../src/modules/management/audit-investigation/search/search-selector-query";
import { searchWitnessSql } from "../src/modules/management/audit-investigation/search/search-witness-sql";

const org = "10000000-0000-4000-8000-000000000001";
const loc = "10000000-0000-4000-8000-000000000002";
const member = "10000000-0000-4000-8000-000000000003";
const session = "10000000-0000-4000-8000-000000000004";
const secondSession = "10000000-0000-4000-8000-000000000005";
const task = "10000000-0000-4000-8000-000000000006";
const otherTask = "10000000-0000-4000-8000-000000000007";
const retrieval = "10000000-0000-4000-8000-000000000008";
const foreignTask = "10000000-0000-4000-8000-000000000009";
const vehicle = "10000000-0000-4000-8000-000000000010";
const event = "10000000-0000-4000-8000-000000000011";
const from = "2026-10-18T10:00:00.000Z";
const to = "2026-10-18T11:00:00.000Z";

// Deliberately skipped until Prime grants the exclusive disposable DB lease.
// These tests use TEMP tables only and roll back, without real application rows.
const url = process.env.ISSUE300_R2_W2_TEST_URL;
const dbAuthorized = (() => {
  if (process.env.ISSUE300_R2_W2_DB_LEASE !== "GRANTED" || !url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "127.0.0.1" &&
      parsed.port === "57285" &&
      parsed.pathname === "/issue300_r2" &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
})();

describe.skipIf(!dbAuthorized)(
  "W2 disposable PostgreSQL selector/coverage parity",
  () => {
    let client: Client;
    beforeAll(async () => {
      client = new Client({
        connectionString: url,
        application_name: "issue300_r2_w2_temp",
      });
      await client.connect();
      const identity = await client.query("SELECT current_database() AS name");
      expect(identity.rows[0]?.name).toBe("issue300_r2");
      await client.query("BEGIN");
      await client.query("SET LOCAL search_path TO pg_temp, public");
      const tables = [
        "CREATE TEMP TABLE organization_memberships(id uuid, organization_id uuid, first_name text, last_name text)",
        "CREATE TEMP TABLE locations(id uuid, organization_id uuid, status text)",
        "CREATE TEMP TABLE valet_sessions(id uuid, organization_id uuid, location_id uuid, vehicle_id uuid, pagination_birth_xid xid8)",
        "CREATE TEMP TABLE tasks(id uuid, organization_id uuid, location_id uuid, valet_session_id uuid, task_type text, pagination_birth_xid xid8)",
        "CREATE TEMP TABLE incidents(id uuid, organization_id uuid, location_id uuid, valet_session_id uuid, reported_by_membership_id uuid, pagination_birth_xid xid8)",
        "CREATE TEMP TABLE key_custody_events(organization_id uuid, location_id uuid, actor_membership_id uuid)",
        "CREATE TEMP TABLE dispatch_events(organization_id uuid, location_id uuid, actor_membership_id uuid, previous_assignee_membership_id uuid, new_assignee_membership_id uuid)",
        "CREATE TEMP TABLE audit_events(id uuid, organization_id uuid, location_id uuid, valet_session_id uuid, entity_type text, entity_id uuid, event_type text, metadata_json jsonb, actor_membership_id uuid, actor_type text, occurred_at timestamptz, created_at timestamptz, pagination_birth_xid xid8)",
      ];
      for (const sql of tables) await client.query(sql);
      await client.query(
        "INSERT INTO organization_memberships VALUES ($1,$2,'Ada','Test')",
        [member, org],
      );
      await client.query("INSERT INTO locations VALUES ($1,$2,'ACTIVE')", [
        loc,
        org,
      ]);
      await client.query(
        "INSERT INTO valet_sessions VALUES ($1,$3,$4,$5,NULL),($2,$3,$4,$5,NULL)",
        [session, secondSession, org, loc, vehicle],
      );
      await client.query(
        "INSERT INTO tasks VALUES ($1,$5,$6,$7,'PARKING',NULL),($2,$5,$6,$7,'PARKING',NULL),($3,$5,$6,$7,'RETRIEVAL',NULL),($4,$8,$6,$7,'PARKING',NULL)",
        [
          task,
          otherTask,
          retrieval,
          foreignTask,
          org,
          loc,
          session,
          "20000000-0000-4000-8000-000000000001",
        ],
      );
    });
    afterAll(async () => {
      if (client) {
        await client.query("ROLLBACK");
        await client.end();
      }
    });

    async function seed(
      entityType: string,
      entityId: string,
      taskId?: unknown,
      direct: string | null = session,
      location = loc,
      eventType = "VALET_SESSION_PARKED",
    ) {
      await client.query("DELETE FROM audit_events");
      const metadata = taskId === undefined ? {} : { taskId };
      await client.query(
        `INSERT INTO audit_events VALUES (
        $1,$2,$3,$4,$5,$6,$10,$7,$8,'MEMBERSHIP',
        $9,$9,NULL)`,
        [
          event,
          org,
          location,
          direct,
          entityType,
          entityId,
          JSON.stringify(metadata),
          member,
          from,
          eventType,
        ],
      );
    }
    async function isSelectable() {
      const response = await client.query(
        auditInvestigationSelectorStatements.memberSql,
        [org, loc, null, 2, null, ["VALET_SESSION_PARKED", "TASK_ASSIGNED"]],
      );
      return response.rows.length === 1;
    }

    // Run the actual Audit arm, not a second implementation of its joins.
    const auditArm = searchWitnessSql
      .slice(
        searchWitnessSql.indexOf("SELECT 'AUDIT'"),
        searchWitnessSql.indexOf("  UNION ALL\n  SELECT 'KEY_CUSTODY'"),
      )
      .replaceAll("$15::text[]", "$7::text[]")
      .replaceAll("$10::pg_snapshot", "$6::pg_snapshot")
      .replaceAll("$9::timestamptz", "$5::timestamptz");
    async function searchAuditRows() {
      const boundary = (
        await client.query(
          "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
        )
      ).rows[0] as { now: Date; snapshot: string };
      const response = await client.query(auditArm, [
        org,
        loc,
        from,
        to,
        boundary.now,
        boundary.snapshot,
        ["VALET_SESSION_PARKED", "TASK_ASSIGNED"],
      ]);
      return response.rows as Array<{
        id: string;
        session_id: string;
        actor_id: string | null;
      }>;
    }
    async function integrityFlag() {
      const { now, snapshot } = (
        await client.query(
          "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
        )
      ).rows[0] as { now: Date; snapshot: string };
      return (
        await client.query(auditInvestigationIntegritySql, [
          org,
          loc,
          from,
          to,
          now,
          snapshot,
        ])
      ).rows[0]?.hasAnomaly as boolean;
    }
    it("rejects present JSON-null and excludes absent PARKED hints from member evidence", async () => {
      await seed("ValetSession", session, null);
      expect(await isSelectable()).toBe(false);
      await seed("ValetSession", session);
      expect(await isSelectable()).toBe(false);
      expect(await searchAuditRows()).toHaveLength(1);
    });
    it("keeps absent metadata with a legacy Session entity as EVENT only", async () => {
      await seed("ValetSession", session, undefined, null);
      expect(await isSelectable()).toBe(false);
      const rows = await searchAuditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.session_id).toBe(session);
      expect(rows[0]?.actor_id).toBeNull();
      expect(await integrityFlag()).toBe(false);
      await seed("ValetSession", session, null, null);
      expect(await searchAuditRows()).toEqual([]);
    });
    it("requires exact Task identity even for two PARKING Tasks in one Session", async () => {
      await seed("Task", task, otherTask);
      expect(await isSelectable()).toBe(false);
      await seed("Task", task, task);
      expect(await isSelectable()).toBe(true);
    });
    it("rejects wrong Task type, unknown PARKED entity and foreign-scope Task", async () => {
      await seed("Task", retrieval);
      expect(await isSelectable()).toBe(false);
      await seed("Other", task, task);
      expect(await isSelectable()).toBe(false);
      await seed("Task", foreignTask);
      expect(await isSelectable()).toBe(false);
    });
    it("rejects cross-Session metadata and wrong Location", async () => {
      await client.query("UPDATE tasks SET valet_session_id=$1 WHERE id=$2", [
        secondSession,
        otherTask,
      ]);
      await seed("ValetSession", session, otherTask);
      expect(await isSelectable()).toBe(false);
      await seed(
        "ValetSession",
        session,
        undefined,
        session,
        "20000000-0000-4000-8000-000000000002",
      );
      expect(await isSelectable()).toBe(false);
    });
    it("denies sole membership and Search witness via legacy Task-only association", async () => {
      await seed("Task", task, task, null);
      expect(await isSelectable()).toBe(false);
      expect(await searchAuditRows()).toEqual([]);
      await seed("Task", task, undefined, null, loc, "TASK_ASSIGNED");
      expect(await isSelectable()).toBe(false);
      expect(await searchAuditRows()).toEqual([]);
      await seed("Incident", task, undefined, null, loc, "TASK_ASSIGNED");
      expect(await isSelectable()).toBe(false);
      expect(await searchAuditRows()).toEqual([]);
    });
    it("preserves direct and explicit Session anchors with legacy actor limits", async () => {
      await seed("ValetSession", session, task, null);
      expect(await isSelectable()).toBe(false);
      expect(await searchAuditRows()).toEqual([
        {
          source: "AUDIT",
          id: event,
          session_id: session,
          occurred_at: new Date(from),
          slot_id: null,
          actor_id: null,
          previous_id: null,
          new_id: null,
          reporter_id: null,
        },
      ]);
      await seed("ValetSession", session, task);
      expect(await isSelectable()).toBe(true);
      expect((await searchAuditRows())[0]?.actor_id).toBe(member);
      await seed("ValetSession", session);
      expect(await isSelectable()).toBe(false);
      expect((await searchAuditRows())[0]?.actor_id).toBeNull();
    });
    it("does not leak foreign parent existence through integrity coverage", async () => {
      await seed("ValetSession", session, foreignTask);
      const foreignFlag = await integrityFlag();
      await seed(
        "ValetSession",
        session,
        "30000000-0000-4000-8000-000000000099",
      );
      const unknownFlag = await integrityFlag();
      expect(foreignFlag).toBe(unknownFlag);
      expect(foreignFlag).toBe(false);
    });
    it("marks malformed scoped Audit generically, never an absent late parent", async () => {
      await seed("ValetSession", session, null);
      expect(await integrityFlag()).toBe(true);
      await seed("ValetSession", session, ["not-a-uuid"]);
      expect(await integrityFlag()).toBe(true);
      await seed("Task", "30000000-0000-4000-8000-000000000001");
      expect(await integrityFlag()).toBe(false);
    });
    it("reports independently provable same-scope contradictions without exposing source IDs", async () => {
      await client.query("UPDATE tasks SET valet_session_id=$1 WHERE id=$2", [
        secondSession,
        otherTask,
      ]);
      await seed("ValetSession", session, otherTask, null);
      expect(await searchAuditRows()).toEqual([]);
      expect(await integrityFlag()).toBe(true);
      await seed("ValetSession", secondSession, undefined, session);
      expect(await searchAuditRows()).toEqual([]);
      expect(await integrityFlag()).toBe(true);
    });
  },
);
