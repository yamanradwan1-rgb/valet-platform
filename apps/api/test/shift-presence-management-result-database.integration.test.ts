import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("presence-management-result-db");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);
describe("forward 064 management receipt integrity and runtime least privilege", () => {
  it("runtime has SELECT/INSERT only and no trigger-helper execution or PUBLIC access", async () => {
    const privileges = await db.adminPool.query(
      `SELECT p,has_table_privilege($1,'shift_presence_management_results',p) AS allowed
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`,
      [db.runtimeRole],
    );
    for (const row of privileges.rows)
      expect(row.allowed).toBe(["SELECT", "INSERT"].includes(row.p));
    expect(
      (
        await db.adminPool.query(
          `SELECT has_function_privilege($1,'shift_presence_guard_management_result()','EXECUTE') AS allowed`,
          [db.runtimeRole],
        )
      ).rows[0].allowed,
    ).toBe(false);
    expect(
      (
        await db.adminPool
          .query(`SELECT count(*)::integer AS count FROM pg_class c,
      LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='shift_presence_management_results'::regclass AND a.grantee=0`)
      ).rows[0].count,
    ).toBe(0);
  });
  it("composite actor/Location FKs and typed receipt constraints reject forged scope and effects", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const other = await db.createFixture();
    const om = await db.manager(other);
    const insert = (
      member = m.membershipId,
      user = m.userId,
      location: string | null = null,
      kind = "COMPANY_POLICY",
      entity = f.organizationId,
      revision = 1,
      effect = "NO_CHANGE",
    ) =>
      db.adminPool.query(
        `INSERT INTO shift_presence_management_results
      (mutation_id,organization_id,location_id,actor_membership_id,actor_user_id,kind,entity_id,revision,effect) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          f.organizationId,
          location,
          member,
          user,
          kind,
          entity,
          revision,
          effect,
        ],
      );
    await expect(insert(om.membershipId, om.userId)).rejects.toMatchObject({
      code: "23503",
    });
    await expect(
      insert(
        m.membershipId,
        m.userId,
        other.locationId,
        "LOCATION_POLICY",
        other.locationId,
      ),
    ).rejects.toMatchObject({ code: "23514" }); // Guard conceals foreign Location before FK evaluation.
    await expect(insert(m.membershipId, om.userId)).rejects.toMatchObject({
      code: "23503",
    });
    await expect(
      insert(
        m.membershipId,
        m.userId,
        null,
        "COMPANY_POLICY",
        f.organizationId,
        0,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(m.membershipId, m.userId, f.locationId, "ZONE", randomUUID()),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        m.membershipId,
        m.userId,
        null,
        "COMPANY_POLICY",
        f.organizationId,
        1,
        "CHANGED",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("successful receipts reject owner history rewriting and runtime UPDATE/DELETE", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const mutationId = randomUUID();
    await db.management.setCompany(m.context, m.companyTarget, {
      mutationId,
      expectedRevision: 1,
      field: "shiftStartPresenceMode",
      value: "OFF",
    });
    for (const pool of [db.adminPool, db.runtimePool])
      for (const sql of [
        `UPDATE shift_presence_management_results SET revision=2 WHERE mutation_id=$1`,
        `DELETE FROM shift_presence_management_results WHERE mutation_id=$1`,
      ])
        await expect(pool.query(sql, [mutationId])).rejects.toMatchObject({
          code: pool === db.adminPool ? "23514" : "42501",
        });
    expect(
      (
        await db.adminPool.query(
          `SELECT effect::text,revision,audit_event_id FROM shift_presence_management_results WHERE mutation_id=$1`,
          [mutationId],
        )
      ).rows[0],
    ).toEqual({ effect: "NO_CHANGE", revision: 1, audit_event_id: null });
  });
  it("actual receipt INSERT failure rolls back an already-performed policy effect and success audit", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const mutationId = randomUUID();
    await db.adminPool
      .query(`CREATE FUNCTION public.test_reject_presence_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END $$;
      CREATE TRIGGER test_reject_presence_receipt BEFORE INSERT ON shift_presence_management_results FOR EACH ROW EXECUTE FUNCTION test_reject_presence_receipt()`);
    try {
      await expect(
        db.management.setCompany(m.context, m.companyTarget, {
          mutationId,
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        }),
      ).rejects.toThrow();
    } finally {
      await db.adminPool.query(
        `DROP TRIGGER test_reject_presence_receipt ON shift_presence_management_results; DROP FUNCTION test_reject_presence_receipt()`,
      );
    }
    expect(
      (await db.management.company(m.context, m.companyTarget)).policy,
    ).toMatchObject({ startMode: "OFF", revision: 1 });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::integer AS count FROM audit_events WHERE id=$1 UNION ALL SELECT count(*)::integer FROM shift_presence_management_results WHERE mutation_id=$1`,
          [mutationId],
        )
      ).rows,
    ).toEqual([{ count: 0 }, { count: 0 }]);
  });
});
