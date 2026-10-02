import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-F typed audit and protected history", () => {
  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "projects the bounded reason to authorized %s audit only",
    async (role) => {
      const s = await fixture.scenario(role);
      expect((await fixture.force(s)).status).toBe(201);
      const path = `/v1/staff/management/organizations/${s.organizationId}/locations/${s.locationId}/audit-events?limit=100`;
      const audit = await fixture.managementGet(path, s.auth.accessToken);
      expect(audit.status).toBe(200);
      const items = audit.body?.items as Array<{
        eventType: string;
        details: object;
        entity: object;
      }>;
      const forced = items.find(
        (item) => item.eventType === "SHIFT_FORCE_ENDED",
      );
      expect(forced?.entity).toEqual({ id: s.shiftId, type: "SHIFT" });
      expect(forced?.details).toEqual({
        kind: "SHIFT",
        fromStatus: "ACTIVE",
        toStatus: "ENDED",
        closureKind: "ADMIN_FORCE_END",
        cashReconciliationState: "PENDING",
        targetMembershipId: s.membershipId,
        operationId: s.command.operationId,
        reason: s.command.reason,
      });
      expect(JSON.stringify(audit.body?.nextCursor)).not.toContain(
        s.command.reason,
      );

      const user = await fixture.createUser();
      const supervisor = await fixture.addMembership(
        s.organizationId,
        user.id,
        "VALET_SUPERVISOR",
      );
      await fixture.grant(s.organizationId, supervisor, s.locationId);
      await fixture.query(
        "INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at) VALUES($1,$2,$3,$4,'ACTIVE',now())",
        [randomUUID(), s.organizationId, s.locationId, supervisor],
      );
      const auth = await fixture.nativeLogin(user);
      const restricted = await fixture.managementGet(path, auth.accessToken);
      expect(restricted.status).toBe(200);
      expect(JSON.stringify(restricted.body)).not.toContain(
        "SHIFT_FORCE_ENDED",
      );
      expect(JSON.stringify(restricted.body)).not.toContain(s.command.reason);
    },
  );

  it("rejects runtime cash/status rewrites and fake audit insertion after closure", async () => {
    const s = await fixture.scenario();
    expect((await fixture.force(s)).status).toBe(201);
    const before = await fixture.snapshot(s.shiftId);
    const runtime = fixture.runtimePool();
    try {
      await expect(
        runtime.query(
          "UPDATE shifts SET status='ACTIVE',ended_at=NULL WHERE id=$1",
          [s.shiftId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        runtime.query(
          "UPDATE shifts SET cash_expected=0,cash_reported=0,cash_variance=0,cash_currency='JOD',cash_reported_at=now(),cash_reported_by_membership_id=$2 WHERE id=$1",
          [s.shiftId, s.membershipId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        runtime.query(
          `INSERT INTO audit_events(id,organization_id,location_id,actor_membership_id,actor_type,
        event_type,entity_type,entity_id,metadata_json,occurred_at)
        VALUES($1,$2,$3,$4,'MEMBERSHIP','SHIFT_FORCE_ENDED','Shift',$5,'{}',now())`,
          [
            randomUUID(),
            s.organizationId,
            s.locationId,
            s.actorMembershipId,
            s.shiftId,
          ],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.end();
    }
    expect(await fixture.snapshot(s.shiftId)).toEqual(before);
  });
});
