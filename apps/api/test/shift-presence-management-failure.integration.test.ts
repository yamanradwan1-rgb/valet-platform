import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";

const db = new PresenceServerTestContext("presence-management-failure");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
  await db.adminPool
    .query(`CREATE FUNCTION gpsb_fail_presence_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id::text=current_setting('gpsb.failed_audit',true) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic presence audit failure';
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER gpsb_fail_presence_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION gpsb_fail_presence_audit()`);
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("management audit failure after the protected mutation", () => {
  it.each(["POLICY", "ZONE", "REVIEW"] as const)(
    "%s is completely rolled back",
    async (kind) => {
      const a = await pendingPresenceException(db);
      // Policy writes remain OFF/WARN; strict fixture exists only for the review case.
      if (kind !== "REVIEW") await db.policy(a.fixture, "OFF");
      const mutationId = randomUUID();
      const zoneId = randomUUID();
      const client = await db.runtimePool.connect();
      await client.query(`SELECT set_config('gpsb.failed_audit',$1,false)`, [
        mutationId,
      ]);
      const pool = { connect: async () => client };
      // Prevent service transaction release from returning the connection before cleanup.
      const originalRelease = client.release.bind(client);
      client.release = () => undefined;
      const { PresenceManagementService } =
        await import("../src/modules/management/presence-management.service");
      const service = new PresenceManagementService(
        pool as typeof db.runtimePool,
      );
      const initial = await db.management.company(
        a.manager.context,
        a.manager.companyTarget,
      );
      try {
        const operation =
          kind === "POLICY"
            ? service.setCompany(a.manager.context, a.manager.companyTarget, {
                mutationId,
                expectedRevision: initial.policy.revision,
                field: "shiftStartPresenceMode",
                value: "WARN_ONLY",
              })
            : kind === "ZONE"
              ? service.saveZone(a.manager.context, a.manager.target, {
                  mutationId,
                  zoneId,
                  code: "AUDIT",
                  label: "Synthetic",
                  latitude: 31.95,
                  longitude: 35.91,
                  radiusMeters: 100,
                  state: "ACTIVE",
                })
              : service.review(
                  a.manager.context,
                  a.manager.target,
                  String(a.exception.exceptionId),
                  {
                    mutationId,
                    expectedRevision: 1,
                  },
                  "APPROVED",
                );
        await expect(operation).rejects.toMatchObject({ code: "23514" });
        expect(
          (
            await db.management.company(
              a.manager.context,
              a.manager.companyTarget,
            )
          ).policy,
        ).toEqual(initial.policy);
        expect(
          (
            await db.adminPool.query(
              `SELECT id FROM shift_presence_zones WHERE id=$1`,
              [zoneId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await db.presence.exception(
              a.requester.context,
              String(a.exception.exceptionId),
            )
          ).status,
        ).toBe("PENDING");
        expect(
          (
            await db.adminPool.query(
              `SELECT id FROM audit_events WHERE id=$1`,
              [mutationId],
            )
          ).rowCount,
        ).toBe(0);
        expect(await db.facts(a.fixture)).toEqual({
          shifts: 0,
          decisions: 0,
          starts: 0,
          ends: 0,
        });
      } finally {
        await client.query(`RESET gpsb.failed_audit`);
        originalRelease();
      }
    },
  );
});
