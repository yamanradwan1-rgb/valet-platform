import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  openIssue215HttpDatabase,
  type Issue215HttpDatabase,
} from "./issue215-http-fixture-database";

const photoEvidenceTables = [
  "vehicle_photo_verifications",
  "vehicle_photo_availability",
  "condition_photo_upload_attempts",
  "condition_photo_upload_operations",
] as const;

const newViewBudgetScope = "v1:dashboard-session-photo-view-user";

describe("#309 PG17 concrete runtime blockers without photo VIEW permission", () => {
  let db: Issue215HttpDatabase;
  let runtime: Pool;

  beforeAll(async () => {
    db = await openIssue215HttpDatabase();
    runtime = new Pool({ connectionString: db.runtimeUrl, max: 1 });
  }, 240_000);

  afterAll(async () => {
    try { await runtime?.end(); }
    finally { await db?.close(); }
  }, 90_000);

  it("scope fails SQLSTATE 23514 even for the correctly provisioned runtime role", async () => {
    const identity = await runtime.query<{
      readonly actor: string;
      readonly canInsertTable: boolean;
      readonly canInsertScope: boolean;
      readonly canInsertKey: boolean;
      readonly canInsertState: boolean;
      readonly constraintSql: string;
    }>(`
      SELECT current_user AS actor,
             has_table_privilege(current_user,'public.anti_abuse_events','INSERT') AS "canInsertTable",
             has_column_privilege(current_user,'public.anti_abuse_events','scope','INSERT') AS "canInsertScope",
             has_column_privilege(current_user,'public.anti_abuse_events','key_hash','INSERT') AS "canInsertKey",
             has_column_privilege(current_user,'public.anti_abuse_events','state','INSERT') AS "canInsertState",
             pg_get_constraintdef(oid) AS "constraintSql"
        FROM pg_constraint
       WHERE conrelid = 'public.anti_abuse_events'::regclass
         AND conname = 'anti_abuse_events_scope_check'
    `);
    expect(identity.rows).toHaveLength(1);
    expect(identity.rows[0]?.actor).toMatch(/^vlt_t_role_215_/);
    // Runtime is deliberately granted INSERT on these named columns only;
    // whole-table INSERT is denied by the least-privilege provisioner.
    expect(identity.rows[0]).toMatchObject({
      canInsertTable: false, canInsertScope: true,
      canInsertKey: true, canInsertState: true,
    });
    expect(identity.rows[0]?.constraintSql).not.toContain(newViewBudgetScope);

    // This fixture owns a brand-new disposable database. A refused INSERT
    // leaves zero events, proving the CHECK alone breaks the new API budget.
    const keyHash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
    await expect(runtime.query(
      `INSERT INTO public.anti_abuse_events(scope,key_hash,state)
       VALUES ($1,$2,'COUNTED')`, [newViewBudgetScope, keyHash],
    )).rejects.toMatchObject({
      code: "23514", constraint: "anti_abuse_events_scope_check",
    });
    const events = await runtime.query<{ readonly count: number }>(
      "SELECT count(*)::int AS count FROM public.anti_abuse_events",
    );
    expect(events.rows[0]?.count).toBe(0);
  }, 60_000);

  it("plain SELECT works but FOR SHARE fails SQLSTATE 42501 on all four private evidence relations", async () => {
    const actor = await runtime.query<{ readonly role: string }>(
      'SELECT current_user AS role',
    );
    expect(actor.rows[0]?.role).toMatch(/^vlt_t_role_215_/);
    for (const table of photoEvidenceTables) {
      const grants = await runtime.query<{
        readonly canRead: boolean;
        readonly canUpdate: boolean;
      }>(`
        SELECT has_table_privilege(current_user,$1,'SELECT') AS "canRead",
               has_table_privilege(current_user,$1,'UPDATE') AS "canUpdate"
      `, [`public.${table}`]);
      expect(grants.rows[0]).toEqual({ canRead: true, canUpdate: false });
      const base = `SELECT 1 FROM public.${table} AS photo WHERE FALSE`;
      await expect(runtime.query(base)).resolves.toMatchObject({ rowCount: 0 });
      await expect(runtime.query(`${base} FOR SHARE OF photo`)).rejects.toMatchObject({
        code: "42501",
      });
    }
  }, 60_000);
});
