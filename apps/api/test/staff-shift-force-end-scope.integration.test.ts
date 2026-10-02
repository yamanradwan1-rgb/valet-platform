import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-F persisted Shift scope independent of staff-management targets", () => {
  it.each([
    "inactive-member",
    "disabled-owner",
    "manager-owner",
    "no-owner-grants",
  ])("LM closes a covered Shift with %s", async (kind) => {
    const s = await fixture.scenario("LOCATION_MANAGER");
    if (kind === "inactive-member")
      await fixture.query(
        "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
        [s.membershipId],
      );
    if (kind === "disabled-owner")
      await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
        s.targetUser.id,
      ]);
    if (kind === "manager-owner")
      await fixture.query(
        "UPDATE organization_memberships SET role='ORG_ADMIN' WHERE id=$1",
        [s.membershipId],
      );
    if (kind === "no-owner-grants")
      await fixture.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1",
        [s.membershipId],
      );
    expect((await fixture.force(s)).status).toBe(201);
    expect(await fixture.snapshot(s.shiftId)).toMatchObject({
      status: "ENDED",
      closures: 1,
      audits: 1,
      cash_reported: null,
    });
  });

  it("conflicts on a reused Organization operation at another Shift and allows it in another Organization", async () => {
    const s = await fixture.scenario();
    expect((await fixture.force(s)).status).toBe(201);
    const otherShift = randomUUID();
    await fixture.query(
      "INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at) VALUES($1,$2,$3,$4,'ACTIVE',now())",
      [otherShift, s.organizationId, s.locationId, s.membershipId],
    );
    const response = await fixture.managementPost(
      s.path.replace(s.shiftId, otherShift),
      s.auth.accessToken,
      s.command,
    );
    expect(response.status).toBe(409);
    expect(response.body?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await fixture.snapshot(otherShift)).toMatchObject({
      status: "ACTIVE",
      closures: 0,
      audits: 0,
    });
    const foreign = await fixture.scenario();
    expect(
      (
        await fixture.force(foreign, {
          ...foreign.command,
          operationId: s.command.operationId,
        })
      ).status,
    ).toBe(201);
  });

  it("ignores another Location's open Task and leaves its entire Task/Session unchanged", async () => {
    const s = await fixture.scenario();
    const task = await fixture.task(
      { ...s, locationId: s.outsideId },
      "IN_PROGRESS",
    );
    const tasksBefore = (
      await fixture.query("SELECT * FROM tasks WHERE id=$1", [task.taskId])
    ).rows;
    const sessionsBefore = (
      await fixture.query("SELECT * FROM valet_sessions WHERE id=$1", [
        task.sessionId,
      ])
    ).rows;
    expect((await fixture.force(s)).status).toBe(201);
    expect(
      (await fixture.query("SELECT * FROM tasks WHERE id=$1", [task.taskId]))
        .rows,
    ).toEqual(tasksBefore);
    expect(
      (
        await fixture.query("SELECT * FROM valet_sessions WHERE id=$1", [
          task.sessionId,
        ])
      ).rows,
    ).toEqual(sessionsBefore);
  });
});
