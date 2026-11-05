import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Issue429OcrFixture, type OcrScope } from "../src/issue429-ocr-test-fixture.js";

type Admission = {
  decision: string;
  attempt_id: string | null;
  organization_id: string | null;
  membership_id: string | null;
  location_id: string | null;
  period_id: string | null;
  account_alias: string | null;
  owner_nonce: string | null;
  revision: string | null;
  remaining_authorized_ms: number;
};

let fixture: Issue429OcrFixture;
let scope: OcrScope;

async function admit(target: OcrScope, timeout = 1000): Promise<Admission> {
  const { rows } = await fixture.runtime.query<Admission>(
    "SELECT * FROM public.ocr_admit($1,$2,$3,$4)",
    [target.sessionId,target.membershipId,target.locationId,timeout],
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function settle(
  attempt: Admission,
  outcome: "UNKNOWN" | "NOT_SENT",
  observation: "HTTP_COMPLETE" | "UNCERTAIN" | "NOT_INVOKED",
  http: "NONE" | "2XX" | "4XX" | "5XX" = "NONE",
): Promise<boolean> {
  const { rows } = await fixture.runtime.query<{ ok: boolean }>(`
    SELECT public.ocr_settle($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS ok`, [
    attempt.attempt_id, attempt.organization_id, attempt.membership_id,
    attempt.location_id, attempt.period_id, attempt.account_alias,
    attempt.owner_nonce, attempt.revision, outcome, observation, http,
    "NONE", 12,
  ]);
  return rows[0]!.ok;
}

beforeAll(async () => {
  fixture = new Issue429OcrFixture();
  await fixture.start();
  scope = await fixture.seedScope();
}, 150_000);

afterAll(async () => {
  await fixture?.close();
}, 60_000);

describe("Issue429 private OCR budget admission and period/recovery invariants", () => {
  it("creates six default-private tables, with platform OFF and no debit", async () => {
    const tableNames = [
      "ocr_platform_control", "ocr_organization_control",
      "ocr_budget_periods", "ocr_organization_allocations",
      "ocr_attempts", "ocr_control_history",
    ];
    const { rows } = await fixture.admin.query<{ name: string }>(`
      SELECT c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
        AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tableNames]);
    expect(rows.map((r)=>r.name).sort()).toEqual([...tableNames].sort());
    expect((await fixture.admin.query(
      "SELECT enabled,concurrency_cap,active_period_id FROM ocr_platform_control WHERE id=1",
    )).rows[0]).toMatchObject({
      enabled: false, concurrency_cap: 0, active_period_id: null,
    });
    const rejected = await admit(scope);
    expect(rejected.decision).toBe("DISABLED");
    expect(rejected.attempt_id).toBeNull();
    expect((await fixture.admin.query(
      "SELECT count(*)::integer AS count FROM ocr_attempts",
    )).rows[0]?.count).toBe(0);
  });

  it("rejects synthetic/broad role DML and unauthorized maintenance/operator calls", async () => {
    for (const role of [fixture.runtime,fixture.maintenance,fixture.operator]) {
      await expect(role.query("SELECT * FROM ocr_attempts LIMIT 1"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(role.query("UPDATE ocr_platform_control SET enabled=TRUE"))
        .rejects.toMatchObject({ code: "42501" });
    }
    await expect(fixture.runtime.query("SELECT ocr_detect_expired(1)"))
      .rejects.toMatchObject({ code: "42501" });
    await expect(fixture.maintenance.query(
      "SELECT ocr_operator_set_platform($1,1,TRUE,'x',2,'TEST',NULL)",
      [randomUUID()],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(fixture.operator.query("SELECT ocr_admit($1,$2,$3,1000)", [
      scope.sessionId,scope.membershipId,scope.locationId,
    ])).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects overlapping period even with different UUID; replays only identical operation", async () => {
    const op = randomUUID();
    const alias = `future_${randomUUID().slice(0, 8)}`;
    const start = new Date(Date.now()+2*3_600_000);
    const end = new Date(Date.now()+3*3_600_000);
    const sql = `SELECT ocr_operator_provision_period($1,$2,$3,$4,$5,'TEST_PERIOD',NULL) AS id`;
    const args = [op,alias,start,end,6];
    const a = await fixture.operator.query<{ id: string }>(sql,args);
    const replay = await fixture.operator.query<{ id: string }>(sql,args);
    expect(replay.rows[0]!.id).toBe(a.rows[0]!.id);
    await expect(fixture.operator.query(sql,[op,alias,start,end,7]))
      .rejects.toMatchObject({ code: "23505" });
    await expect(fixture.operator.query(sql,[
      randomUUID(),alias,new Date(start.getTime()+1000),
      new Date(end.getTime()+1000),6,
    ])).rejects.toMatchObject({ code: "23514" });
  });

  it("atomically admits only eligible identity and debits 1 unit after known COMMIT", async () => {
    await fixture.provision(scope);
    const second = await fixture.seedScope();
    const wrongOrg = await admit({
      ...scope, membershipId: second.membershipId,
    });
    expect(wrongOrg.decision).toBe("STALE_AUTH");
    const wrongLocation = await admit({
      ...scope, locationId: second.locationId,
    });
    expect(wrongLocation.decision).toBe("STALE_AUTH");

    await fixture.runtime.query("BEGIN");
    let first: Admission;
    try {
      first = await admit(scope);
      expect(first.decision).toBe("ADMITTED");
      expect(first.attempt_id).toBeTruthy();
      expect(first.owner_nonce).toBeTruthy();
      expect(first.remaining_authorized_ms).toBeGreaterThan(0);
      await fixture.runtime.query("COMMIT");
    } catch (e) {
      await fixture.runtime.query("ROLLBACK");
      throw e;
    }
    expect(await settle(first!, "UNKNOWN","HTTP_COMPLETE","2XX")).toBe(true);
    expect(await settle(first!, "NOT_SENT","NOT_INVOKED")).toBe(false);
    expect((await admit(scope)).decision).toBe("CONCURRENCY");
    const { rows: costs } = await fixture.admin.query<{
      platform_spent: string; tenant_spent: string;
    }>(`
      SELECT p.spent_units AS platform_spent,a.spent_units AS tenant_spent
      FROM ocr_budget_periods p JOIN ocr_organization_allocations a
       ON a.period_id=p.id WHERE p.id=$1 AND a.organization_id=$2`,
      [fixture.periodId,scope.organizationId]);
    expect(costs[0]).toMatchObject({platform_spent:"1",tenant_spent:"1"});
    const { rows: states } = await fixture.admin.query<{ state: string }>(
      "SELECT state::text FROM ocr_attempts WHERE id=$1", [first!.attempt_id],
    );
    expect(states[0]?.state).toBe("UNKNOWN");
    await expect(fixture.runtime.query(
      "SELECT ocr_settle($1,$2,$3,$4,$5,$6,$7,2,'COMPLETED','HTTP_COMPLETE','2XX','NONE',1)", [
        first!.attempt_id, first!.organization_id, first!.membership_id,
        first!.location_id, first!.period_id, first!.account_alias, first!.owner_nonce,
      ],
    )).resolves.toMatchObject({ rows: [{ ocr_settle: false }] });
    await fixture.operator.query(
      "SELECT ocr_operator_resolve_attempt($1,$2,$3,2,'REMOTE_COMPLETED_FENCED','RECONCILE','QA:REMOTE_COMPLETE')",
      [randomUUID(),first!.attempt_id,scope.organizationId]);
    expect((await admit(scope)).decision).toBe("ADMITTED");
  });

  it("maintains monotonic spent units after no-fetch settlement", async () => {
    const { rows: pending } = await fixture.admin.query<{
      id: string; nonce: string; revision: string;
    }>(`
      SELECT id, owner_nonce AS nonce, revision FROM ocr_attempts
      WHERE organization_id=$1 AND state='SEND_POSSIBLE' ORDER BY admitted_at DESC LIMIT 1`,
      [scope.organizationId]);
    const fresh: Admission = {
      decision:"ADMITTED", attempt_id:pending[0]!.id,
      owner_nonce:pending[0]!.nonce, revision:pending[0]!.revision,
      organization_id:scope.organizationId, membership_id:scope.membershipId,
      location_id:scope.locationId, period_id:fixture.periodId,
      account_alias:fixture.accountAlias, remaining_authorized_ms:0,
    };
    const { rows: unproved } = await fixture.runtime.query<{
      allowed: boolean;
    }>(`
      SELECT ocr_settle($1,$2,$3,$4,$5,$6,$7,$8,
        'COMPLETED','HTTP_COMPLETE','2XX','NONE',12) AS allowed`, [
      fresh.attempt_id, fresh.organization_id, fresh.membership_id,
      fresh.location_id, fresh.period_id, fresh.account_alias,
      fresh.owner_nonce, fresh.revision,
    ]);
    expect(unproved[0]?.allowed).toBe(false);
    expect(await settle(fresh,"NOT_SENT","NOT_INVOKED")).toBe(true);
    const { rows } = await fixture.admin.query<{ spent: string }>(
      "SELECT spent_units AS spent FROM ocr_budget_periods WHERE id=$1",
      [fixture.periodId],
    );
    expect(rows[0]?.spent).toBe("2");
  });

  it("rejects stale Staff expiry despite an auth-row lock delay and spends zero", async () => {
    const userId = (await fixture.admin.query<{ id: string }>(
      "SELECT user_id AS id FROM organization_memberships WHERE id=$1",
      [scope.membershipId],
    )).rows[0]!.id;
    const sessionId = randomUUID();
    await fixture.admin.query(`
      INSERT INTO staff_auth_sessions(
        id,user_id,current_access_token_hash,created_at,last_rotated_at,
        access_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,clock_timestamp()-interval '1 minute',
             clock_timestamp()-interval '1 minute',
             clock_timestamp()+interval '0.75 seconds',
             clock_timestamp()+interval '1 hour')`,
      [sessionId,userId,
        `staff-access-sha256:v1:${randomUUID().replaceAll("-", "").repeat(2)}`]);
    const locker = new Client({ connectionString: fixture.url });
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        "UPDATE staff_auth_sessions SET last_rotated_at=last_rotated_at WHERE id=$1",
        [sessionId],
      );
      const attempt = admit({ ...scope, sessionId });
      await new Promise((done)=>setTimeout(done,950));
      await locker.query("COMMIT");
      const response = await attempt;
      expect(response.decision).toBe("STALE_AUTH");
    } finally {
      await locker.query("ROLLBACK").catch(()=>{});
      await locker.end();
    }
    const { rows } = await fixture.admin.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM ocr_attempts WHERE staff_session_id=$1",
      [sessionId],
    );
    expect(rows[0]?.count).toBe(0);
  });

  it("honors global nonblocking maintenance lease and caps sweeps at ten", async () => {
    await expect(fixture.maintenance.query("SELECT ocr_detect_expired(11)"))
      .rejects.toMatchObject({ code: "22023" });
    const locker = new Client({ connectionString: fixture.url });
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query("SELECT pg_advisory_xact_lock(429,2101)");
      const { rows } = await fixture.maintenance.query<{ processed: number }>(
        "SELECT ocr_detect_expired(10) AS processed",
      );
      expect(rows[0]?.processed).toBe(0);
    } finally {
      await locker.query("ROLLBACK").catch(()=>{});
      await locker.end();
    }
    const expiry = await admit(scope,100);
    expect(expiry.decision).toBe("ADMITTED");
    await new Promise((done)=>setTimeout(done,2300));
    const { rows: processed } = await fixture.maintenance.query<{
      processed: number;
    }>("SELECT ocr_detect_expired(10) AS processed");
    expect(processed[0]?.processed).toBe(1);
    const { rows: unknown } = await fixture.admin.query<{
      state: string; first_unknown_at: Date | null;
    }>("SELECT state::text,first_unknown_at FROM ocr_attempts WHERE id=$1",
      [expiry.attempt_id]);
    expect(unknown[0]?.state).toBe("UNKNOWN");
    expect(unknown[0]?.first_unknown_at).toBeTruthy();
    expect((await admit(scope)).decision).toBe("CONCURRENCY");
  });
});
