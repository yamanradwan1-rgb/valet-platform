import { presenceZoneDraft } from "./shift-presence-zone-test-helper";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  mutationAuditCount,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-configuration-races");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("R01/R02/R03/R06 real writers with commit, rollback and unknown outcomes", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R01 two Company field writers, first %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const gate = presenceCommitBarrier(db.runtimePool);
      const firstId = randomUUID(),
        secondId = randomUUID();
      const first = new PresenceManagementService(gate.pool)
        .setCompany(m.context, m.companyTarget, {
          mutationId: firstId,
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        })
        .catch((error) => error);
      await gate.atCommit;
      const second = db.management
        .setCompany(m.context, m.companyTarget, {
          mutationId: secondId,
          expectedRevision: 1,
          field: "shiftEndPresenceMode",
          value: "WARN_ONLY",
        })
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      const [a, b] = await Promise.all([first, second]);
      if (outcome === "ROLLBACK") {
        expect(a).toMatchObject({ message: "TEST_ROLLBACK" });
        expect(b.policy).toMatchObject({
          startMode: "OFF",
          endMode: "WARN_ONLY",
          revision: 2,
        });
      } else {
        expect(b).toMatchObject({ code: "PRESENCE_CONFIGURATION_CONFLICT" });
        if (outcome === "UNKNOWN")
          expect(a).toMatchObject({ message: "TEST_COMMIT_OUTCOME_UNKNOWN" });
      }
      const current = await db.management.company(m.context, m.companyTarget);
      expect(current.policy).toMatchObject({
        revision: 2,
        startMode: outcome === "ROLLBACK" ? "OFF" : "WARN_ONLY",
        endMode: outcome === "ROLLBACK" ? "WARN_ONLY" : "OFF",
      });
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_COMPANY_POLICY_CHANGED",
        ),
      ).toBe(1);
      expect(
        await db.management.result(m.context, m.companyTarget, firstId),
      ).toMatchObject({
        attribution: outcome === "ROLLBACK" ? "UNKNOWN" : "COMMITTED",
      });
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R02/R03 same zone edit vs disable, first %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const id = await db.zone(f);
      const zone = (await db.management.zone(m.context, m.target, id)).zone;
      const editableZone = zone;
      const revision = editableZone.revision;
      const draft = presenceZoneDraft(editableZone);
      const gate = presenceCommitBarrier(db.runtimePool);
      const firstId = randomUUID();
      const first = new PresenceManagementService(gate.pool)
        .saveZone(
          m.context,
          m.target,
          {
            ...draft,
            label: "First writer",
            mutationId: firstId,
            expectedRevision: revision,
          },
          id,
        )
        .catch((error) => error);
      await gate.atCommit;
      const second = db.management
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
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      const [a, b] = await Promise.all([first, second]);
      if (outcome === "ROLLBACK") expect(b.zone.state).toBe("DISABLED");
      else expect(b).toMatchObject({ code: "PRESENCE_CONFIGURATION_CONFLICT" });
      if (outcome !== "COMMIT") expect(a).toBeInstanceOf(Error);
      const persisted = (await db.management.zone(m.context, m.target, id))
        .zone;
      expect(persisted).toMatchObject({
        revision: 2,
        state: outcome === "ROLLBACK" ? "DISABLED" : "ACTIVE",
        label: outcome === "ROLLBACK" ? draft.label : "First writer",
      });
      expect(
        (await db.management.location(m.context, m.target)).overrides.revision,
      ).toBe(1);
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_ZONE_UPDATED",
        ),
      ).toBe(1);
      expect(
        await db.management.result(m.context, m.target, firstId, {
          kind: "ZONE",
          entityId: id,
        }),
      ).toMatchObject({
        attribution: outcome === "ROLLBACK" ? "UNKNOWN" : "COMMITTED",
      });
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R06 Clear Override vs Company default, first %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      let before = await db.management.location(m.context, m.target);
      before = await db.management.changeLocation(m.context, m.target, {
        mutationId: randomUUID(),
        expectedRevision: 1,
        expectedCompanyRevision: 1,
        configurationFingerprint: before.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
        value: "OFF",
      });
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .setCompany(m.context, m.companyTarget, {
          mutationId: randomUUID(),
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        })
        .catch((error) => error);
      await gate.atCommit;
      const second = db.management
        .changeLocation(m.context, m.target, {
          mutationId: randomUUID(),
          expectedRevision: 2,
          expectedCompanyRevision: 1,
          configurationFingerprint: before.readiness.configurationFingerprint,
          field: "shiftStartPresenceMode",
        })
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      const result = await second;
      if (outcome === "ROLLBACK")
        expect(result.overrides).toMatchObject({
          startModeOverride: null,
          revision: 3,
        });
      else
        expect(result).toMatchObject({
          code: "PRESENCE_INHERITED_CONTEXT_CONFLICT",
        });
      const current = await db.management.location(m.context, m.target);
      expect(current.overrides).toMatchObject({
        startModeOverride: outcome === "ROLLBACK" ? null : "OFF",
        revision: outcome === "ROLLBACK" ? 3 : 2,
      });
      expect(current.effective.startMode).toBe("OFF");
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_LOCATION_POLICY_CHANGED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 2 : 1);
    },
  );
});
