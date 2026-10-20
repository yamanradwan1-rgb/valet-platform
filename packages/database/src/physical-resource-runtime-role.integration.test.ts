import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminPool,
  runtimePool,
  runtimeRole,
  fixture,
  expectDenied,
  startPhysicalResourceRuntime,
  stopPhysicalResourceRuntime,
} from "./physical-resource-runtime-test-fixture";
beforeAll(startPhysicalResourceRuntime, 120_000);
afterAll(stopPhysicalResourceRuntime, 60_000);

describe("Issue #232 physical-resource runtime boundary", () => {
  it("denies direct runtime INSERT and exposes only reviewed create functions", async () => {
    await expectDenied(
      runtimePool.query(
        `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
         VALUES($1,$2,$3,'DENIED',clock_timestamp())`,
        [randomUUID(), randomUUID(), randomUUID()],
      ),
    );
    await expectDenied(
      runtimePool.query(
        `INSERT INTO parking_spots(
           id,organization_id,location_id,code,label,updated_at)
         VALUES($1,$2,$3,'DENIED','Denied',clock_timestamp())`,
        [randomUUID(), randomUUID(), randomUUID()],
      ),
    );
    const grants = await adminPool.query<{ allowed: boolean; name: string }>(
      `SELECT function.proname AS name,
              has_function_privilege($1,function.oid,'EXECUTE') AS allowed
       FROM pg_proc AS function
       JOIN pg_namespace AS namespace ON namespace.oid=function.pronamespace
       WHERE namespace.nspname='public'
         AND function.proname LIKE 'management_physical_resource_%'
       ORDER BY function.proname`,
      [runtimeRole],
    );
    expect(grants.rows).toEqual([
      { allowed: false, name: "management_physical_resource_append_audit" },
      { allowed: false, name: "management_physical_resource_authorize_actor" },
      { allowed: true, name: "management_physical_resource_create_key_slot" },
      { allowed: true, name: "management_physical_resource_create_key_slot" },
      {
        allowed: true,
        name: "management_physical_resource_create_parking_spot",
      },
      {
        allowed: true,
        name: "management_physical_resource_create_parking_zone",
      },
      { allowed: false, name: "management_physical_resource_find_replay" },
      {
        allowed: false,
        name: "management_physical_resource_guard_audit_event",
      },
    ]);
    const keySlotOverloads = await adminPool.query<{
      allowed: boolean;
      arg_count: number;
    }>(
      `SELECT function.pronargs::int AS arg_count,
              has_function_privilege($1,function.oid,'EXECUTE') AS allowed
       FROM pg_proc AS function
       JOIN pg_namespace AS namespace ON namespace.oid=function.pronamespace
       WHERE namespace.nspname='public'
         AND function.proname='management_physical_resource_create_key_slot'
       ORDER BY function.pronargs`,
      [runtimeRole],
    );
    expect(keySlotOverloads.rows).toEqual([
      { arg_count: 6, allowed: true },
      { arg_count: 7, allowed: true },
    ]);
  });

  it("creates, persists, audits and reconciles an idempotent Key Slot", async () => {
    const f = await fixture();
    const operationId = randomUUID();
    const fingerprint = "a".repeat(64);
    const first = await runtimePool.query<{
      changed: boolean;
      resource_id: string;
      result_code: string;
    }>(
      `SELECT * FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [
        f.adminMembershipId,
        f.organizationId,
        f.locationA,
        operationId,
        fingerprint,
        "K-01",
      ],
    );
    expect(first.rows[0]?.result_code).toBe("OK");
    expect(first.rows[0]?.changed).toBe(true);
    const replay = await runtimePool.query(
      `SELECT * FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [
        f.adminMembershipId,
        f.organizationId,
        f.locationA,
        operationId,
        fingerprint,
        "K-01",
      ],
    );
    expect(replay.rows[0]).toMatchObject({
      changed: false,
      resource_id: first.rows[0]?.resource_id,
      result_code: "OK",
    });
    const persisted = await adminPool.query(
      `SELECT slot.code,slot.status::text AS status,audit.event_type,audit.metadata_json
       FROM key_slots AS slot
       JOIN audit_events AS audit ON audit.entity_id=slot.id
       WHERE slot.id=$1`,
      [first.rows[0]?.resource_id],
    );
    expect(persisted.rows[0]).toMatchObject({
      code: "K-01",
      event_type: "KEY_SLOT_CREATED",
      status: "ACTIVE",
    });
    expect(persisted.rows[0]?.metadata_json).toMatchObject({
      resourceCode: "K-01",
      resourceType: "KEY_SLOT",
    });
  });

  it("allows Location-scoped duplicate codes but rejects same-Location duplicates", async () => {
    const f = await fixture();
    const create = (locationId: string, op: string) =>
      runtimePool.query<{ result_code: string }>(
        `SELECT result_code FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
        [
          f.adminMembershipId,
          f.organizationId,
          locationId,
          op,
          "b".repeat(64),
          "K-01",
        ],
      );
    expect((await create(f.locationA, randomUUID())).rows[0]?.result_code).toBe(
      "OK",
    );
    expect((await create(f.locationB, randomUUID())).rows[0]?.result_code).toBe(
      "OK",
    );
    expect((await create(f.locationA, randomUUID())).rows[0]?.result_code).toBe(
      "RESOURCE_CODE_CONFLICT",
    );
  });

  it("serializes concurrent exact-code creation to one resource and one audit", async () => {
    const f = await fixture();
    const create = (operationId: string) =>
      runtimePool.query<{ result_code: string }>(
        `SELECT result_code FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
        [
          f.adminMembershipId,
          f.organizationId,
          f.locationA,
          operationId,
          "f".repeat(64),
          "K-RACE",
        ],
      );
    const results = await Promise.all([
      create(randomUUID()),
      create(randomUUID()),
    ]);
    expect(results.map((result) => result.rows[0]?.result_code).sort()).toEqual(
      ["OK", "RESOURCE_CODE_CONFLICT"],
    );
    const counts = await adminPool.query<{ audits: string; slots: string }>(
      `SELECT
         (SELECT count(*) FROM key_slots WHERE location_id=$1 AND code='K-RACE')::text AS slots,
         (SELECT count(*) FROM audit_events
          WHERE location_id=$1 AND event_type='KEY_SLOT_CREATED'
            AND metadata_json->>'resourceCode'='K-RACE')::text AS audits`,
      [f.locationA],
    );
    expect(counts.rows[0]).toEqual({ audits: "1", slots: "1" });
  });

  it("requires an ACTIVE same-Location zone and enforces LM Location grant", async () => {
    const f = await fixture();
    const call = (locationId: string, zoneId: string) =>
      runtimePool.query<{ result_code: string }>(
        `SELECT result_code FROM management_physical_resource_create_parking_spot(
           $1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          f.managerMembershipId,
          f.organizationId,
          locationId,
          randomUUID(),
          "c".repeat(64),
          zoneId,
          "P-01",
          "Front 01",
        ],
      );
    expect((await call(f.locationA, f.zoneA)).rows[0]?.result_code).toBe("OK");
    expect((await call(f.locationA, f.zoneB)).rows[0]?.result_code).toBe(
      "PARKING_ZONE_INVALID",
    );
    await expectDenied(call(f.locationB, f.zoneB));
  });

  it("rejects operation-id reuse with a different fingerprint", async () => {
    const f = await fixture();
    const operationId = randomUUID();
    await runtimePool.query(
      `SELECT * FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [
        f.adminMembershipId,
        f.organizationId,
        f.locationA,
        operationId,
        "d".repeat(64),
        "K-02",
      ],
    );
    const conflict = await runtimePool.query<{ result_code: string }>(
      `SELECT result_code FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [
        f.adminMembershipId,
        f.organizationId,
        f.locationA,
        operationId,
        "e".repeat(64),
        "K-02",
      ],
    );
    expect(conflict.rows[0]?.result_code).toBe("IDEMPOTENCY_CONFLICT");
  });
});
