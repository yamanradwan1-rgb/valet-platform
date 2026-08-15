import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("position");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-007G live tracker and position projection", () => {
  it("shows coherent PARKING and RETRIEVAL work with no fabricated position", async () => {
    const parking = await context.createParkingTrackingFixture();
    const parkingManager = await context.manager(parking);
    const parked = await context.liveQuery({
      authenticatedUserId: parkingManager.userId,
      locationId: parking.locationId,
    });
    expect(parked.items[0]).toMatchObject({
      position: null,
      sessionState: "PARKING",
      taskType: "PARKING",
      vehicle: {
        temporaryDescriptor: expect.any(String),
        vehicleId: expect.any(String),
      },
    });

    const retrieval = await context.createRetrievalTrackingFixture();
    const retrievalManager = await context.manager(retrieval);
    const retrieved = await context.liveQuery({
      authenticatedUserId: retrievalManager.userId,
      locationId: retrieval.locationId,
    });
    expect(retrieved.items[0]).toMatchObject({
      sessionState: "RETRIEVING",
      taskType: "RETRIEVAL",
    });
  });

  it("selects the canonical latest captured_at/id position", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const capturedAt = await context.databaseTime();
    await context.seedSample(fixture, {
      capturedAt,
      id: "00000000-0000-4000-8000-000000000001",
      latitude: 31.1,
    });
    await context.seedSample(fixture, {
      capturedAt,
      id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
      latitude: 31.2,
    });
    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items[0]!.position).toMatchObject({
      capturedAt: capturedAt.toISOString(),
      freshness: "LIVE",
      latitude: 31.2,
    });
    expect(result.items[0]!.position!.capturedAt <= result.observedAt).toBe(
      true,
    );
  });

  it("projects canonical Task ownership rather than the session assignee", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    await context.adminPool.query(
      `UPDATE valet_sessions SET current_assignee_membership_id = $2 WHERE id = $1`,
      [fixture.sessionId, manager.membershipId],
    );
    const item = (
      await context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: fixture.locationId,
      })
    ).items[0]!;
    expect(item.assigneeMembershipId).toBe(fixture.membershipId);
    expect(item.assigneeMembershipId).not.toBe(manager.membershipId);
  });

  it("classifies stale samples with one DB-authored observedAt and keeps them visible", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const databaseTime = await context.databaseTime();
    await context.seedSample(fixture, {
      capturedAt: new Date(databaseTime.getTime() - 61_000),
    });
    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items[0]!.position!.freshness).toBe("STALE");
    expect(Date.parse(result.observedAt)).toBeGreaterThan(
      Date.parse(result.items[0]!.position!.capturedAt),
    );
  });

  it("omits ended trackers and incoherent movement without mutating state", async () => {
    const ended = await context.createParkingTrackingFixture();
    const manager = await context.manager(ended);
    await context.endTracker(ended);
    expect(
      (
        await context.liveQuery({
          authenticatedUserId: manager.userId,
          locationId: ended.locationId,
        })
      ).items,
    ).toEqual([]);

    const mismatch = await context.createParkingTrackingFixture();
    const mismatchManager = await context.manager(mismatch);
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'PARKED' WHERE id = $1`,
      [mismatch.sessionId],
    );
    expect(
      (
        await context.liveQuery({
          authenticatedUserId: mismatchManager.userId,
          locationId: mismatch.locationId,
        })
      ).items,
    ).toEqual([]);
    const state = await context.adminPool.query<{
      state: string;
      status: string;
    }>(
      `SELECT session.state::text, task.status::text FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.id = $2 WHERE session.id = $1`,
      [mismatch.sessionId, mismatch.movementTaskId],
    );
    expect(state.rows[0]).toEqual({ state: "PARKED", status: "IN_PROGRESS" });
  });

  it("omits wrong task status, type, or null current Task owner", async () => {
    for (const mutation of [
      `status = 'COMPLETED'`,
      `task_type = 'RETRIEVAL'`,
      `status = 'QUEUED', current_assignee_membership_id = NULL`,
    ]) {
      const fixture = await context.createParkingTrackingFixture();
      const manager = await context.manager(fixture);
      await context.adminPool.query(
        `UPDATE tasks SET ${mutation} WHERE id = $1`,
        [fixture.movementTaskId],
      );
      expect(
        (
          await context.liveQuery({
            authenticatedUserId: manager.userId,
            locationId: fixture.locationId,
          })
        ).items,
      ).toEqual([]);
    }
  });
});
