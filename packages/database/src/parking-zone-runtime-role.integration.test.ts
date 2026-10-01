import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminPool,
  runtimePool,
  runtimeRole,
  fixture,
  expectDenied,
  runScript,
  startPhysicalResourceRuntime,
  stopPhysicalResourceRuntime,
} from "./physical-resource-runtime-test-fixture";

beforeAll(startPhysicalResourceRuntime, 120_000);
afterAll(stopPhysicalResourceRuntime, 60_000);
const sql =
  "SELECT * FROM public.management_physical_resource_create_parking_zone($1,$2,$3,$4,$5,$6,$7)";

describe("Issue #236 restricted Parking Zone runtime", () => {
  it("permits only the reviewed zone entrypoint and provisioning is idempotent", async () => {
    const f = await fixture();
    const params = [
      f.managerMembershipId,
      f.organizationId,
      f.locationA,
      randomUUID(),
      "a".repeat(64),
      "ZONE",
      "Zone",
    ];
    const created = (await runtimePool.query(sql, params)).rows[0];
    expect(created).toMatchObject({ changed: true, result_code: "OK" });
    expect((await runtimePool.query(sql, params)).rows[0]).toEqual({
      ...created,
      changed: false,
    });
    const credentials = runtimePool.options.connectionString;
    runScript(["scripts/provision-runtime-role.mjs"], credentials);
    runScript(["scripts/provision-runtime-role.mjs"], credentials);
    expect((await runtimePool.query(sql, params)).rows[0]).toMatchObject({
      result_code: "OK",
      changed: false,
    });
    await expectDenied(
      runtimePool.query(
        `INSERT INTO parking_zones(id,organization_id,location_id,code,label,updated_at)
      VALUES($1,$2,$3,'BAD','Bad',clock_timestamp())`,
        [randomUUID(), f.organizationId, f.locationA],
      ),
    );
    for (const statement of [
      "SELECT public.management_physical_resource_authorize_actor($1,$2,$3)",
      "WITH scope AS (SELECT $1::uuid,$2::uuid,$3::uuid) SELECT * FROM public.management_physical_resource_find_replay($2,$4,'PARKING_ZONE_CREATED',$5)",
      "SELECT public.management_physical_resource_append_audit($2,$3,$1,'PARKING_ZONE_CREATED','ParkingZone',$4,$5,'BAD',$4)",
    ])
      await expectDenied(
        runtimePool.query(
          statement,
          params.slice(0, statement.includes("$5") ? 5 : 3),
        ),
      );
    await expectDenied(
      runtimePool.query(
        `INSERT INTO audit_events(id,organization_id,location_id,actor_membership_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP','PARKING_ZONE_CREATED','ParkingZone',$1,'{}',clock_timestamp())`,
        [randomUUID(), f.organizationId, f.locationA, f.managerMembershipId],
      ),
    );
    const security = await adminPool.query(
      `SELECT p.prosecdef,p.proconfig,
      NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_denied,
      pg_get_userbyid(p.proowner)<>$1 AS runtime_is_not_owner
      FROM pg_proc p WHERE p.oid='public.management_physical_resource_create_parking_zone(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure`,
      [runtimeRole],
    );
    expect(security.rows[0]).toMatchObject({
      prosecdef: true,
      proconfig: ["search_path=pg_catalog, public"],
      public_denied: true,
      runtime_is_not_owner: true,
    });
  }, 120_000);
  it("serializes same-operation callers and conflicts across the shared resource family", async () => {
    const f = await fixture();
    const params = [
      f.adminMembershipId,
      f.organizationId,
      f.locationA,
      randomUUID(),
      "b".repeat(64),
      "ZONE",
      "Zone",
    ];
    const results = await Promise.all([
      runtimePool.query(sql, params),
      runtimePool.query(sql, params),
    ]);
    expect(results.map((r) => r.rows[0]?.changed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]?.rows[0]?.resource_id).toBe(
      results[1]?.rows[0]?.resource_id,
    );
    const conflict = await runtimePool.query(
      "SELECT * FROM public.management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)",
      params.slice(0, 6),
    );
    expect(conflict.rows[0]?.result_code).toBe("IDEMPOTENCY_CONFLICT");
    const count = await adminPool.query(
      "SELECT count(*)::text FROM audit_events WHERE organization_id=$1 AND idempotency_key=$2",
      [f.organizationId, params[3]],
    );
    expect(count.rows[0]?.count).toBe("1");
  });
});
