import { presenceZoneDraft } from "./shift-presence-zone-test-helper";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { ManagementLocationService } from "../src/modules/management/management-location.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  mutationAuditCount,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-readiness-races");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("R04/R05 fanout, phantoms and release-closed readiness", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R04 disabling last zone vs strict Company entry, zone %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const id = await db.zone(f);
      const editableZone = (await db.management.zone(m.context, m.target, id))
        .zone;
      const revision = editableZone.revision;
      const draft = presenceZoneDraft(editableZone);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .saveZone(
          m.context,
          m.target,
          {
            ...draft,
            state: "DISABLED",
            mutationId: randomUUID(),
            expectedRevision: revision,
          },
          id,
        )
        .catch((error) => error);
      await gate.atCommit;
      const strict = db.management
        .setCompany(m.context, m.companyTarget, {
          mutationId: randomUUID(),
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "REQUIRE",
        })
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      expect(await strict).toMatchObject({
        code:
          outcome === "ROLLBACK"
            ? "PRESENCE_STRICT_ROLLOUT_CLOSED"
            : "PRESENCE_NOT_READY",
      });
      expect(
        (await db.management.company(m.context, m.companyTarget)).policy,
      ).toMatchObject({ startMode: "OFF", revision: 1 });
      expect(
        (await db.management.zone(m.context, m.target, id)).zone,
      ).toMatchObject({
        revision: outcome === "ROLLBACK" ? 1 : 2,
        state: outcome === "ROLLBACK" ? "ACTIVE" : "DISABLED",
      });
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_COMPANY_POLICY_CHANGED",
        ),
      ).toBe(0);
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R05 Location creation cannot escape Company strict fanout, creator %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      await db.zone(f);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new ManagementLocationService(gate.pool)
        .create(m.context, f.organizationId, {
          operationId: randomUUID(),
          name: "New inheritor",
          code: randomUUID(),
          addressText: "Synthetic",
          timezone: "Asia/Amman",
          currency: "JOD",
        })
        .catch((error) => error);
      await gate.atCommit;
      const strict = db.management
        .setCompany(m.context, m.companyTarget, {
          mutationId: randomUUID(),
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "REQUIRE",
        })
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      expect(await strict).toMatchObject({
        code:
          outcome === "ROLLBACK"
            ? "PRESENCE_STRICT_ROLLOUT_CLOSED"
            : "PRESENCE_NOT_READY",
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM locations WHERE organization_id=$1`,
            [f.organizationId],
          )
        ).rows[0].count,
      ).toBe(outcome === "ROLLBACK" ? 1 : 2);
      expect(
        (await db.management.company(m.context, m.companyTarget)).policy
          .revision,
      ).toBe(1);
      expect(
        await mutationAuditCount(db, f.organizationId, "LOCATION_CREATED"),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_COMPANY_POLICY_CHANGED",
        ),
      ).toBe(0);
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "currency correction enters settings before lifecycle, zone writer %s",
    async (outcome) => {
      const f = await db.createFixture({ locationStatus: "INACTIVE" });
      const m = await db.manager(f);
      const id = await db.zone(f);
      const locations = new ManagementLocationService(db.runtimePool);
      const location = await locations.read(
        m.context,
        f.organizationId,
        f.locationId,
      );
      const editableZone = (await db.management.zone(m.context, m.target, id))
        .zone;
      const revision = editableZone.revision;
      const draft = presenceZoneDraft(editableZone);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .saveZone(
          m.context,
          m.target,
          {
            ...draft,
            label: "Configuration writer",
            mutationId: randomUUID(),
            expectedRevision: revision,
          },
          id,
        )
        .catch((error) => error);
      await gate.atCommit;
      const correction = locations.correctCurrency(
        m.context,
        f.organizationId,
        f.locationId,
        { newCurrency: "USD", expectedUpdatedAt: location.updatedAt },
      );
      await observePresenceCommandWait(db);
      const wait = await db.adminPool.query(
        `SELECT query FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'`,
        [db.runtimeRole],
      );
      expect(wait.rows[0].query).toContain("management-settings-org:");
      gate.finish(outcome);
      await first;
      expect((await correction).currency).toBe("USD");
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "LOCATION_CURRENCY_CORRECTED",
        ),
      ).toBe(1);
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_ZONE_UPDATED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
    },
  );
});
