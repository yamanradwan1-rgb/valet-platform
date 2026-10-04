import { presenceZoneDraft } from "./shift-presence-zone-test-helper";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StaffManagementMutationService } from "../src/modules/management/staff-management-mutation.service";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { ManagementLocationService } from "../src/modules/management/management-location.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  mutationAuditCount,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-current-authority-races");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("current authority is protected through configuration commit", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "LM zone update pending vs actual grant revocation, writer %s",
    async (outcome) => {
      const f = await db.createFixture();
      const lm = await db.manager(f, "LOCATION_MANAGER");
      const ca = await db.manager(f);
      const id = await db.zone(f);
      const editableZone = (await db.management.zone(lm.context, lm.target, id))
        .zone;
      const revision = editableZone.revision;
      const draft = presenceZoneDraft(editableZone);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .saveZone(
          lm.context,
          lm.target,
          {
            ...draft,
            label: "Protected writer",
            expectedRevision: revision,
            mutationId: randomUUID(),
          },
          id,
        )
        .catch((error) => error);
      await gate.atCommit;
      const revoke = new StaffManagementMutationService(
        db.runtimePool,
      ).locationAccess(
        ca.context,
        f.organizationId,
        lm.membershipId,
        { expectedVersion: 1, locationIds: [f.locationId] },
        false,
      );
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      await revoke;
      const zone = (await db.management.zone(ca.context, ca.target, id)).zone;
      expect(zone).toMatchObject({
        revision: outcome === "ROLLBACK" ? 1 : 2,
        label: outcome === "ROLLBACK" ? draft.label : "Protected writer",
      });
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_ZONE_UPDATED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
      await expect(
        db.management.saveZone(
          lm.context,
          lm.target,
          {
            ...draft,
            expectedRevision: zone.revision,
            mutationId: randomUUID(),
          },
          id,
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "membership deactivation while Company policy write is pending, writer %s",
    async (outcome) => {
      const f = await db.createFixture();
      const subject = await db.manager(f);
      const ca = await db.manager(f);
      const gate = presenceCommitBarrier(db.runtimePool);
      const command = {
        mutationId: randomUUID(),
        expectedRevision: 1,
        field: "shiftStartPresenceMode" as const,
        value: "WARN_ONLY" as const,
      };
      const first = new PresenceManagementService(gate.pool)
        .setCompany(subject.context, subject.companyTarget, command)
        .catch((error) => error);
      await gate.atCommit;
      const deactivate = new StaffManagementMutationService(
        db.runtimePool,
      ).status(
        ca.context,
        f.organizationId,
        subject.membershipId,
        { expectedVersion: 1 },
        "INACTIVE",
      );
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      await deactivate;
      expect(
        (await db.management.company(ca.context, ca.companyTarget)).policy,
      ).toMatchObject({
        revision: outcome === "ROLLBACK" ? 1 : 2,
        startMode: outcome === "ROLLBACK" ? "OFF" : "WARN_ONLY",
      });
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_COMPANY_POLICY_CHANGED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
      await expect(
        db.management.setCompany(
          subject.context,
          subject.companyTarget,
          command,
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "Location deactivation wins before pending LM configuration, lifecycle %s",
    async (outcome) => {
      const f = await db.createFixture();
      const lm = await db.manager(f, "LOCATION_MANAGER");
      const ca = await db.manager(f);
      const locations = new ManagementLocationService(db.runtimePool);
      const before = await locations.read(
        ca.context,
        f.organizationId,
        f.locationId,
      );
      const stopped = await locations.stopIntake(
        ca.context,
        f.organizationId,
        f.locationId,
        { expectedUpdatedAt: before.updatedAt },
      );
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new ManagementLocationService(gate.pool)
        .deactivate(ca.context, f.organizationId, f.locationId, {
          expectedUpdatedAt: stopped.updatedAt,
        })
        .catch((error) => error);
      await gate.atCommit;
      const pending = db.management
        .saveZone(lm.context, lm.target, {
          mutationId: randomUUID(),
          zoneId: randomUUID(),
          code: "NEW",
          label: "Synthetic",
          latitude: 31.95,
          longitude: 35.91,
          radiusMeters: 50,
          state: "ACTIVE",
        })
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      const result = await pending;
      if (outcome === "ROLLBACK") expect(result.zone.revision).toBe(1);
      else expect(result).toMatchObject({ code: "AUTHORIZATION_DENIED" });
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_ZONE_CREATED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 1 : 0);
      expect(
        (await locations.read(ca.context, f.organizationId, f.locationId))
          .status,
      ).toBe(outcome === "ROLLBACK" ? "ACTIVE" : "INACTIVE");
    },
  );
});
