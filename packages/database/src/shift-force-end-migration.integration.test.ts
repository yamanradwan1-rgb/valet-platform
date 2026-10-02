import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ShiftForceEndMigrationTestFixture,
  forceEndMigration,
} from "./shift-force-end-migration-test-fixture.js";
import {
  runtimeShiftForceEndFunction,
  privateShiftForceEndFunctions,
} from "../scripts/shift-force-end-runtime-privileges.mjs";

const fixture = new ShiftForceEndMigrationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("T05-F actual migration 053 to 054 and restricted runtime", () => {
  it("deploys exactly 54 migrations fresh and on upgrade without backfill or prior function changes", async () => {
    expect(fixture.preMigrationCount).toBe(53);
    expect(
      (
        await fixture.upgrade.query(
          "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
        )
      ).rows[0],
    ).toEqual({ n: 54, latest: forceEndMigration });
    expect(
      (
        await fixture.upgrade.query(
          "SELECT count(*)::int AS n FROM shift_force_end_closures",
        )
      ).rows[0]?.n,
    ).toBe(0);
    expect(fixture.freshEvidence).toEqual({
      migrations: { n: 54, latest: forceEndMigration },
      closureCount: 0,
    });
    expect((await fixture.upgrade.query(fixture.snapshotSql)).rows).toEqual(
      fixture.before,
    );
    const after = (await fixture.upgrade.query(fixture.functionsSql)).rows;
    for (const prior of fixture.functions) expect(after).toContainEqual(prior);
  });

  it("keeps PUBLIC/private execute denied and runtime EXECUTE only after repeated provisioning", async () => {
    for (const name of [
      runtimeShiftForceEndFunction,
      ...privateShiftForceEndFunctions,
    ]) {
      const result = await fixture.upgrade.query(
        `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
        f.prosecdef,f.proconfig,NOT EXISTS(SELECT 1 FROM aclexplode(f.proacl) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied
        FROM pg_proc f WHERE f.oid=to_regprocedure($2)`,
        [fixture.runtimeRole, name],
      );
      expect(result.rows[0]).toEqual({
        allowed: name === runtimeShiftForceEndFunction,
        prosecdef: true,
        proconfig: ["search_path=pg_catalog, public"],
        public_denied: true,
      });
    }
    for (const sql of [
      "SELECT * FROM shift_force_end_closures",
      "INSERT INTO shift_force_end_closures DEFAULT VALUES",
      "UPDATE shift_force_end_closures SET ended_at=now()",
      "DELETE FROM shift_force_end_closures",
      "TRUNCATE shift_force_end_closures",
      "SELECT staff_shift_force_end_guard_history()",
      "SELECT staff_shift_force_end_guard_audit()",
    ])
      await expect(fixture.runtime.query(sql)).rejects.toMatchObject({
        code: "42501",
      });
    await expect(
      fixture.runtime.query(
        `SELECT * FROM staff_shift_force_end($1,$1,'invalid',$1,$1,$1,$2,'FORCE_END_SHIFT','test')`,
        [randomUUID(), "a".repeat(64)],
      ),
    ).rejects.toMatchObject({
      code: "42501",
      message: "STAFF_SESSION_INVALID",
    });
  });

  it("rejects existing cross-tenant Shift and actor identities", async () => {
    const org = randomUUID(),
      actor = randomUUID();
    const client = await fixture.upgrade.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'Foreign','Asia/Amman',now())",
        [org],
      );
      await client.query(
        `INSERT INTO organization_memberships(id,organization_id,user_id,role,updated_at)
        SELECT $1,$2,user_id,'ORG_ADMIN',now() FROM organization_memberships WHERE id=$3`,
        [actor, org, fixture.actor],
      );
      await client.query("SAVEPOINT tenant");
      const insert = `INSERT INTO shift_force_end_closures(shift_id,organization_id,actor_membership_id,operation_id,request_fingerprint,ended_at)
        VALUES($1,$2,$3,$4,$5,now())`;
      for (const [tenant, manager] of [
        [org, actor],
        [fixture.org, actor],
      ]) {
        await expect(
          client.query(insert, [
            fixture.shift,
            tenant,
            manager,
            randomUUID(),
            "a".repeat(64),
          ]),
        ).rejects.toMatchObject({ code: "23503" });
        await client.query("ROLLBACK TO SAVEPOINT tenant");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("enforces tenant Shift/actor FKs, fingerprints and unique operation/Shift identity", async () => {
    const insert = `INSERT INTO shift_force_end_closures(shift_id,organization_id,actor_membership_id,
      operation_id,request_fingerprint,ended_at) VALUES($1,$2,$3,$4,$5,now())`;
    for (const [shift, actor, fingerprint, code] of [
      [randomUUID(), fixture.actor, "a".repeat(64), "23503"],
      [fixture.shift, randomUUID(), "a".repeat(64), "23503"],
      [fixture.shift, fixture.actor, "invalid", "23514"],
    ])
      await expect(
        fixture.upgrade.query(insert, [
          shift,
          fixture.org,
          actor,
          randomUUID(),
          fingerprint,
        ]),
      ).rejects.toMatchObject({ code });
    const client = await fixture.upgrade.connect();
    try {
      await client.query("BEGIN");
      const operation = randomUUID();
      await client.query(insert, [
        fixture.shift,
        fixture.org,
        fixture.actor,
        operation,
        "a".repeat(64),
      ]);
      await client.query("SAVEPOINT duplicate");
      await expect(
        client.query(insert, [
          fixture.shift,
          fixture.org,
          fixture.actor,
          randomUUID(),
          "a".repeat(64),
        ]),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate");
      const otherShift = (
        await client.query(
          "SELECT id FROM shifts WHERE status='ACTIVE' LIMIT 1",
        )
      ).rows[0].id;
      await expect(
        client.query(insert, [
          otherShift,
          fixture.org,
          fixture.actor,
          operation,
          "a".repeat(64),
        ]),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate");
      await expect(
        client.query("DELETE FROM shift_force_end_closures WHERE shift_id=$1", [
          fixture.shift,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
