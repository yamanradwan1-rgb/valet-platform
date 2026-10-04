import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PresenceTestContext, type PresenceFixture } from "./shift-presence-test-context.js";
import { presenceAllocation } from "./shift-presence-fixture.js";

const context = new PresenceTestContext();
let legacy: PresenceFixture;
beforeAll(() => context.setup(async () => { legacy = await context.fixture(); }), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("DEC-099 persistence and OFF release gate", () => {
  it("deploys migration 058 and backfills defaults on existing rows", async () => {
    const f = legacy;
    const result = await context.admin.query(`SELECT o.shift_start_presence_mode,o.shift_end_presence_mode,
      o.shift_presence_max_accuracy_meters,o.shift_presence_max_fix_age_seconds,
      l.shift_start_presence_mode_override,l.shift_end_presence_mode_override,l.shift_presence_revision
      FROM organizations o JOIN locations l ON l.organization_id=o.id WHERE l.id=$1`, [f.locationId]);
    expect(result.rows[0]).toEqual({ shift_start_presence_mode: "OFF", shift_end_presence_mode: "OFF",
      shift_presence_max_accuracy_meters: 50, shift_presence_max_fix_age_seconds: 30,
      shift_start_presence_mode_override: null, shift_end_presence_mode_override: null, shift_presence_revision: 1 });
    expect((await context.admin.query(`SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name='20261004005800_shift_presence_foundation' AND finished_at IS NOT NULL`)).rows[0].count).toBe(1);
    for (const mode of ["WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"]) {
      await expect(context.admin.query(`UPDATE organizations SET shift_start_presence_mode=$2 WHERE id=$1`, [f.organizationId, mode])).rejects.toMatchObject({ code: "23514" });
      await expect(context.admin.query(`UPDATE locations SET shift_end_presence_mode_override=$2 WHERE id=$1`, [f.locationId, mode])).rejects.toMatchObject({ code: "23514" });
    }
  });
  it("enforces Company/Location threshold bounds and database revisions", async () => {
    const f = await context.fixture();
    for (const value of [0, 201]) {
      await expect(context.admin.query(`UPDATE organizations SET shift_presence_max_accuracy_meters=$2 WHERE id=$1`, [f.organizationId, value])).rejects.toMatchObject({ code: "23514" });
    }
    await context.admin.query(`UPDATE organizations SET shift_presence_max_accuracy_meters=25 WHERE id=$1 AND shift_presence_revision=1`, [f.organizationId]);
    expect((await context.admin.query(`SELECT shift_presence_revision FROM organizations WHERE id=$1`, [f.organizationId])).rows[0].shift_presence_revision).toBe(2);
    expect((await context.admin.query(`UPDATE organizations SET shift_presence_max_accuracy_meters=30 WHERE id=$1 AND shift_presence_revision=1 RETURNING id`, [f.organizationId])).rowCount).toBe(0);
    await expect(context.admin.query(`UPDATE organizations SET shift_presence_revision=8 WHERE id=$1`, [f.organizationId])).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects cross-tenant zones, duplicate code, and invalid configuration coordinates", async () => {
    const f = await context.fixture();
    const other = await context.fixture();
    const insert = (organization = f.organizationId, code = "ENTRY", lat: number | string = 0, lon: number | string = 0, radius = 100) => context.runtime.query(
      `INSERT INTO shift_presence_zones(id,organization_id,location_id,code,label,latitude,longitude,radius_meters) VALUES ($1,$2,$3,$4,'Synthetic zone',$5,$6,$7)`,
      [randomUUID(), organization, f.locationId, code, lat, lon, radius]);
    await expect(insert(other.organizationId)).rejects.toMatchObject({ code: "23503" });
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    for (const [lat, lon, radius] of [[91, 0, 100], [0, -181, 100], ["NaN", 0, 100], [0, "Infinity", 100], [0, 0, 4], [0, 0, 1001]] as const) {
      await expect(insert(f.organizationId, randomUUID(), lat, lon, radius)).rejects.toMatchObject({ code: "23514" });
    }
    await expect(context.admin.query(`DELETE FROM shift_presence_zones WHERE location_id=$1`, [f.locationId])).rejects.toMatchObject({ code: "23514" });
  });
  it("binds START/END targets and exact actor to persisted scope", async () => {
    const f = await context.fixture();
    const other = await context.fixture();
    const insert = (action: string, shift: string | null, user = f.userId, member = f.membershipId) => context.runtime.query(
      `INSERT INTO shift_presence_operations(id,organization_id,location_id,user_id,membership_id,operation_id,action,shift_id,target_fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), f.organizationId, f.locationId, user, member, randomUUID(), action, shift, "a".repeat(64)]);
    await insert("START", null);
    await insert("END", f.shiftId);
    await expect(insert("START", f.shiftId)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("END", null)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("END", other.shiftId)).rejects.toMatchObject({ code: "23503" });
    await expect(insert("START", null, other.userId)).rejects.toMatchObject({ code: "23503" });
    await expect(insert("START", null, other.userId, other.membershipId)).rejects.toMatchObject({ code: "23503" });
  });
  it("has no durable employee measurement columns or generic JSON", async () => {
    const rows = await context.admin.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'shift_presence_%'`);
    const coordinateColumns = rows.rows.filter((r) => /latitude|longitude/.test(r.column_name));
    expect(coordinateColumns.map((r) => r.table_name)).toEqual(["shift_presence_zones", "shift_presence_zones"]);
    expect(rows.rows.some((r) => /json/.test(r.data_type))).toBe(false);
    expect(rows.rows.filter((r) => r.table_name === "shift_presence_decisions")
      .some((r) => /request_fingerprint|target_fingerprint/.test(r.column_name))).toBe(false);
    expect(rows.rows.filter((r) => r.table_name !== "shift_presence_zones").some((r) => /captured_at|accuracy_meters|distance|note|token|verifier/.test(r.column_name))).toBe(false);
  });
  it("rejects exception allocation against a terminal intent even before challenge expiry", async () => {
    const f = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    await context.runtime.query(`UPDATE shift_presence_operations SET status='DENIED',terminal_at=clock_timestamp() WHERE id=$1`, [a.operationRowId]);
    await expect(context.runtime.query(`INSERT INTO shift_presence_exceptions
      (id,organization_id,location_id,user_id,membership_id,action,challenge_id,reason,expires_at)
      VALUES ($1,$2,$3,$4,$5,'START',$6,'GPS_UNAVAILABLE',now()+interval '300 seconds')`,
    [randomUUID(), f.organizationId, f.locationId, f.userId, f.membershipId, a.challengeId])).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects fabricated applied mode or policy revision in immutable facts", async () => {
    const f = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    await context.runtime.query(`UPDATE shift_presence_operations SET request_fingerprint=$2 WHERE id=$1`, [a.operationRowId, "b".repeat(64)]);
    const insert = (mode: string, companyRevision: number, locationRevision: number) => context.runtime.query(`INSERT INTO shift_presence_decisions
      (id,organization_id,location_id,user_id,membership_id,action,operation_id,challenge_id,
       policy_fingerprint,applied_mode,company_policy_revision,location_policy_revision,classification,reason,accuracy_band,freshness_band)
      VALUES ($1,$2,$3,$4,$5,'START',$6,$7,$8,$9,$10,$11,'CONFIDENT_OUTSIDE','OUTSIDE','ACCEPTABLE','ACCEPTABLE')`,
    [randomUUID(), f.organizationId, f.locationId, f.userId, f.membershipId, a.operationId, a.challengeId,
      "c".repeat(64), mode, companyRevision, locationRevision]);
    await expect(insert("REQUIRE", 1, 1)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("OFF", 2, 1)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("OFF", 1, 2)).rejects.toMatchObject({ code: "23514" });
    await insert("OFF", 1, 1);
  });
  it("rejects same-Organization cross-Location END targets and challenge substitutions", async () => {
    const f = await context.fixture();
    const otherLocation = randomUUID();
    await context.admin.query(`INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
      VALUES ($1,$2,'Other','OTHER','Synthetic','Asia/Amman','JOD',now())`, [otherLocation, f.organizationId]);
    await expect(context.runtime.query(`INSERT INTO shift_presence_operations
      (id,organization_id,location_id,user_id,membership_id,operation_id,action,shift_id,target_fingerprint)
      VALUES ($1,$2,$3,$4,$5,$6,'END',$7,$8)`,
    [randomUUID(), f.organizationId, otherLocation, f.userId, f.membershipId, randomUUID(), f.shiftId, "a".repeat(64)])).rejects.toMatchObject({ code: "23503" });
    const a = await presenceAllocation(context.runtime, f);
    await expect(context.runtime.query(`INSERT INTO shift_presence_challenges
      (id,organization_id,location_id,user_id,membership_id,action,operation_row_id)
      VALUES ($1,$2,$3,$4,$5,'START',$6)`,
    [randomUUID(), f.organizationId, otherLocation, f.userId, f.membershipId, a.operationRowId])).rejects.toMatchObject({ code: "23514" });
    await expect(context.runtime.query(`INSERT INTO shift_presence_exceptions
      (id,organization_id,location_id,user_id,membership_id,action,challenge_id,reason,expires_at)
      VALUES ($1,$2,$3,$4,$5,'START',$6,'GPS_UNAVAILABLE',now()+interval '300 seconds')`,
    [randomUUID(), f.organizationId, otherLocation, f.userId, f.membershipId, a.challengeId])).rejects.toMatchObject({ code: "23514" });
  });
});
