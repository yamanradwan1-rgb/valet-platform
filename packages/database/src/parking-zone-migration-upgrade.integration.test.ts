import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminPool,
  runtimePool,
  fixture,
  startPhysicalResourceUpgrade,
  finishPhysicalResourceUpgrade,
  stopPhysicalResourceRuntime,
} from "./physical-resource-runtime-test-fixture";

beforeAll(startPhysicalResourceUpgrade, 120_000);
afterAll(stopPhysicalResourceRuntime, 60_000);

describe("Issue #236 forward upgrade from actual migration 047", () => {
  it("preserves KeySlot/Spot IDs, codes, audit metadata and replay, then permits zone creation", async () => {
    const baseline = await adminPool.query(
      "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
    );
    expect(baseline.rows[0]).toEqual({
      n: 47,
      latest: "20260929004700_map_setup_client_cas",
    });
    const absent = await adminPool.query(
      "SELECT to_regprocedure('public.management_physical_resource_create_parking_zone(uuid,uuid,uuid,uuid,text,text,text)') AS zone_function",
    );
    expect(absent.rows[0]?.zone_function).toBeNull();
    const f = await fixture();
    const key = [
      f.adminMembershipId,
      f.organizationId,
      f.locationA,
      randomUUID(),
      "a".repeat(64),
      "K-V2",
    ];
    const spot = [
      f.adminMembershipId,
      f.organizationId,
      f.locationA,
      randomUUID(),
      "b".repeat(64),
      f.zoneA,
      "P-V2",
      "Front",
    ];
    const keySql =
      "SELECT * FROM public.management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)";
    const spotSql =
      "SELECT * FROM public.management_physical_resource_create_parking_spot($1,$2,$3,$4,$5,$6,$7,$8)";
    const keyBefore = (await adminPool.query(keySql, key)).rows[0];
    const spotBefore = (await adminPool.query(spotSql, spot)).rows[0];
    const snapshotSql = `SELECT entity_id,entity_type,event_type,idempotency_key,metadata_json FROM audit_events WHERE organization_id=$1 ORDER BY event_type`;
    const auditBefore = (await adminPool.query(snapshotSql, [f.organizationId]))
      .rows;
    await finishPhysicalResourceUpgrade();
    expect((await runtimePool.query(keySql, key)).rows[0]).toEqual({
      ...keyBefore,
      changed: false,
    });
    expect((await runtimePool.query(spotSql, spot)).rows[0]).toEqual({
      ...spotBefore,
      changed: false,
    });
    expect(
      (await adminPool.query(snapshotSql, [f.organizationId])).rows,
    ).toEqual(auditBefore);
    const rows = await runtimePool.query(
      "SELECT code FROM key_slots WHERE id=$1 UNION ALL SELECT code FROM parking_spots WHERE id=$2",
      [keyBefore.resource_id, spotBefore.resource_id],
    );
    expect(rows.rows).toEqual([{ code: "K-V2" }, { code: "P-V2" }]);
    const zone = await runtimePool.query(
      "SELECT * FROM public.management_physical_resource_create_parking_zone($1,$2,$3,$4,$5,$6,$7)",
      [
        f.managerMembershipId,
        f.organizationId,
        f.locationA,
        randomUUID(),
        "c".repeat(64),
        "NEW",
        "New zone",
      ],
    );
    expect(zone.rows[0]).toMatchObject({ changed: true, result_code: "OK" });
    expect(
      (await adminPool.query(snapshotSql, [f.organizationId])).rows,
    ).toHaveLength(3);
  }, 120_000);
});
