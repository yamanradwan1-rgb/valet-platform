import { ApiTransportValidationError } from "../src/common/http/api-errors";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { TaskRouteTestContext } from "./task-route-test-context";
import { expectRouteDenied } from "./route-history-test-context";

const context = new TaskRouteTestContext("discovery");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("Issue 343 protected Task recording discovery", () => {
  it("requires completed Parking/Retrieval, and returns only scoped ended recordings", async () => {
    for (const type of ["PARKING", "RETRIEVAL"] as const) {
      const f =
        type === "PARKING"
          ? await context.createParkingTrackingFixture()
          : await context.createRetrievalTrackingFixture();
      const manager = await context.createActor(f, "LOCATION_MANAGER");
      const session = await context.credential(manager.userId);
      await expectRouteDenied(context.discover(session, f.movementTaskId));
      await context.endTracker(f);
      // An old ended takeover segment does not unlock an active Task.
      await expectRouteDenied(context.discover(session, f.movementTaskId));
      await context.adminPool.query(
        `UPDATE tasks SET status = 'COMPLETED' WHERE id = $1`,
        [f.movementTaskId],
      );
      const result = await context.discover(session, f.movementTaskId);
      expect(result.recordings).toHaveLength(1);
      expect(result.recordings[0]).toMatchObject({
        trackingSessionId: f.trackingSessionId,
        assigneeMembershipId: f.membershipId,
      });
      expect(result.nextCursor).toBeNull();
      expect(JSON.stringify(result)).not.toMatch(
        /latitude|longitude|currentAssignee|email/,
      );
    }
  });

  it("proves two-principal object isolation, exact Location grants and role/Shift authority", async () => {
    const f = await context.createParkingTrackingFixture();
    const foreign = await context.createParkingTrackingFixture();
    await context.complete(f);
    await context.complete(foreign);
    const manager = await context.createActor(f, "LOCATION_MANAGER");
    const managerSession = await context.credential(manager.userId);
    const otherManager = await context.createActor(foreign, "LOCATION_MANAGER");
    const otherSession = await context.credential(otherManager.userId);
    expect(
      (await context.discover(managerSession, f.movementTaskId)).recordings,
    ).toHaveLength(1);
    expect(
      (await context.discover(otherSession, foreign.movementTaskId)).recordings,
    ).toHaveLength(1);
    await expectRouteDenied(
      context.discover(managerSession, foreign.movementTaskId),
    );
    await expectRouteDenied(context.discover(otherSession, f.movementTaskId));
    await expectRouteDenied(context.discover(managerSession, randomUUID()));
    const otherLocation = await context.createLocation(f);
    for (const [role, options] of [
      ["VALET_EMPLOYEE", {}],
      ["ORG_ADMIN", {}],
      ["LOCATION_MANAGER", { access: false }],
      ["LOCATION_MANAGER", { locationId: otherLocation }],
      ["VALET_SUPERVISOR", {}],
      ["VALET_SUPERVISOR", { activeShift: true, locationId: otherLocation }],
    ] as const) {
      const actor = await context.createActor(f, role, options);
      await expectRouteDenied(
        context.discover(
          await context.credential(actor.userId),
          f.movementTaskId,
        ),
      );
    }
    const supervisor = await context.createActor(f, "VALET_SUPERVISOR", {
      activeShift: true,
    });
    const supervisorSession = await context.credential(supervisor.userId);
    expect(
      (await context.discover(supervisorSession, f.movementTaskId)).recordings,
    ).toHaveLength(1);
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp() WHERE membership_id = $1`,
      [supervisor.membershipId],
    );
    await expectRouteDenied(
      context.discover(supervisorSession, f.movementTaskId),
    );
  });

  it("paginates immutable segments, preserves unknown provenance, and binds cursors to Task", async () => {
    const f = await context.createParkingTrackingFixture();
    await context.complete(f);
    const manager = await context.createActor(f, "LOCATION_MANAGER");
    const session = await context.credential(manager.userId);
    const id = randomUUID();
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
       (id, organization_id, location_id, valet_session_id, task_id, started_at, ended_at, assignee_membership_id)
       SELECT $1, organization_id, location_id, valet_session_id, task_id,
              started_at + interval '1 second', ended_at + interval '2 seconds', NULL
       FROM task_tracking_sessions WHERE id = $2`,
      [id, f.trackingSessionId],
    );
    const first = await context.discover(
      session,
      f.movementTaskId,
      undefined,
      1,
    );
    expect(first.nextCursor).not.toBeNull();
    const second = await context.discover(
      session,
      f.movementTaskId,
      first.nextCursor!,
      1,
    );
    expect(second.recordings).toMatchObject([
      { trackingSessionId: id, assigneeMembershipId: null },
    ]);
    expect(second.nextCursor).toBeNull();
    expect(first.recordings[0]!.trackingSessionId).not.toBe(id);
    await expect(
      context.discover(session, f.movementTaskId, "broken"),
    ).rejects.toBeInstanceOf(ApiTransportValidationError);
    const other = await context.createParkingTrackingFixture();
    await context.complete(other);
    const otherManager = await context.createActor(other, "LOCATION_MANAGER");
    await expect(
      context.discover(
        await context.credential(otherManager.userId),
        other.movementTaskId,
        first.nextCursor!,
      ),
    ).rejects.toThrow();
    await context.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      [manager.membershipId],
    );
    await expectRouteDenied(
      context.discover(session, f.movementTaskId, first.nextCursor!),
    );
  });

  it("rechecks inactive User/member/Organization/Location and revoked session", async () => {
    for (const target of [
      "user",
      "membership",
      "organization",
      "location",
      "session",
    ] as const) {
      const f = await context.createParkingTrackingFixture();
      await context.complete(f);
      const manager = await context.createActor(f, "LOCATION_MANAGER");
      const session = await context.credential(manager.userId);
      const queries = {
        user: [
          `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
          manager.userId,
        ],
        membership: [
          `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
          manager.membershipId,
        ],
        organization: [
          `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
          f.organizationId,
        ],
        location: [
          `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
          f.locationId,
        ],
        session: [
          `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1`,
          session.staffAuthSessionId,
        ],
      };
      const [sql, id] = queries[target]!;
      await context.adminPool.query(sql!, [id]);
      await expect(
        context.discover(session, f.movementTaskId),
      ).rejects.toThrow();
    }
  });
});

it("never discovers an active tracker even on an inconsistent completed Task", async () => {
  const f = await context.createParkingTrackingFixture();
  const manager = await context.createActor(f, "LOCATION_MANAGER");
  const session = await context.credential(manager.userId);
  await context.adminPool.query(
    `UPDATE tasks SET status = 'COMPLETED' WHERE id = $1`,
    [f.movementTaskId],
  );
  expect(await context.discover(session, f.movementTaskId)).toEqual({
    recordings: [],
    nextCursor: null,
  });
  await expectRouteDenied(
    context.query({
      authenticatedUserId: manager.userId,
      trackingSessionId: f.trackingSessionId,
    }),
  );
});
