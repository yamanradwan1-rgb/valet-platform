import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";
import { expectStartParkingError } from "./start-parking-test-context";

const context = new ConfirmParkedTestContext("007c_tracking_parking");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function setPolicy(
  organizationId: string,
  locationId: string,
  company: boolean,
  override: boolean | null,
) {
  await context.adminPool.query(
    `UPDATE organizations SET tracking_enabled = $2 WHERE id = $1`,
    [organizationId, company],
  );
  await context.adminPool.query(
    `UPDATE locations SET tracking_enabled_override = $3
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, locationId, override],
  );
}

async function trackers(sessionId: string) {
  return (
    await context.adminPool.query<{
      ended_at: Date | null;
      started_at: Date;
      task_id: string;
    }>(
      `SELECT task_id::text, started_at, ended_at
       FROM task_tracking_sessions WHERE valet_session_id = $1
       ORDER BY started_at, id`,
      [sessionId],
    )
  ).rows;
}

describe("VAL-007C Parking tracking policy", () => {
  it.each([
    [false, null, 0],
    [true, null, 1],
    [false, true, 1],
    [true, false, 0],
  ] as const)(
    "resolves company %s and Location override %s",
    async (company, override, expectedCount) => {
      const fixture = await context.createStartParkingFixture();
      await setPolicy(
        fixture.organizationId,
        fixture.locationId,
        company,
        override,
      );
      const result = await context.start(fixture);
      const rows = await trackers(fixture.sessionId);
      expect(rows).toHaveLength(expectedCount);
      if (expectedCount === 1) {
        expect(rows[0]).toEqual({
          ended_at: null,
          started_at: new Date(result.parkingStartedAt),
          task_id: fixture.taskId,
        });
      }
    },
  );
});

describe("VAL-007C Parking tracking atomicity", () => {
  it("ends the exact tracker even after policy changes to OFF", async () => {
    const parking = await context.createStartParkingFixture();
    const resource = await context.addParkingResource(parking);
    const fixture = {
      ...parking,
      parkingSpotCode: resource.spot.code,
      parkingSpotId: resource.spot.id,
      parkingZoneId: resource.zone.id,
    };
    await setPolicy(fixture.organizationId, fixture.locationId, true, null);
    const started = await context.start(fixture);
    await setPolicy(fixture.organizationId, fixture.locationId, false, null);
    const completed = await context.confirm(fixture);
    expect(await trackers(fixture.sessionId)).toEqual([
      {
        ended_at: new Date(completed.parkedAt),
        started_at: new Date(started.parkingStartedAt),
        task_id: fixture.taskId,
      },
    ]);
  });

  it("allows policy-OFF Parking to finish with no tracker", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const result = await context.confirm(fixture);
    expect(result.state).toBe("PARKED");
    expect(await trackers(fixture.sessionId)).toEqual([]);
  });

  it("rolls back a tracked start when an active tracker already exists", async () => {
    const fixture = await context.createStartParkingFixture();
    await setPolicy(fixture.organizationId, fixture.locationId, true, null);
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.taskId,
      ],
    );
    await expectStartParkingError(context.start(fixture), "TASK_INVALID_STATE");
    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      parking_started_at: null,
      session_state: "AWAITING_PARKING",
      session_version: 2,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.events).toEqual([]);
    expect(await trackers(fixture.sessionId)).toHaveLength(1);
  });

  it("rejects a policy-OFF start when an active tracker already exists", async () => {
    const fixture = await context.createStartParkingFixture();
    await setPolicy(fixture.organizationId, fixture.locationId, false, null);
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.taskId,
      ],
    );
    const trackerBefore = await trackers(fixture.sessionId);

    await expectStartParkingError(context.start(fixture), "TASK_INVALID_STATE");

    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      parking_started_at: null,
      session_state: "AWAITING_PARKING",
      session_version: 2,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.events).toEqual([]);
    expect(await trackers(fixture.sessionId)).toEqual(trackerBefore);
    expect(trackerBefore[0]?.ended_at).toBeNull();
  });

  it("rejects a wrong-Task tracker and rolls back PARKED effects", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const wrong = await context.createRetrievalTask(fixture);
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        wrong.taskId,
      ],
    );
    await expectConfirmError(context.confirm(fixture), "TASK_INVALID_STATE");
    const effects = await context.completionEffects(fixture);
    expect(effects.projection).toMatchObject({
      parked_at: null,
      parking_spot_id: null,
      session_state: "PARKING",
      session_version: 3,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.events).toEqual([]);
    expect((await trackers(fixture.sessionId))[0]?.ended_at).toBeNull();
  });

  it("creates no tracker for a stale policy-ON movement attempt", async () => {
    const fixture = await context.createStartParkingFixture();
    await setPolicy(fixture.organizationId, fixture.locationId, true, null);
    await expectStartParkingError(
      context.start(fixture, { session: 1 }),
      "VERSION_CONFLICT",
    );
    expect(await trackers(fixture.sessionId)).toEqual([]);
    expect((await context.effects(fixture)).projection).toMatchObject({
      session_state: "AWAITING_PARKING",
      task_status: "ACCEPTED",
    });
  });

  it("creates no tracker for a policy-ON non-owner", async () => {
    const fixture = await context.createStartParkingFixture();
    const other = await context.addMember(fixture, "VALET_EMPLOYEE");
    await setPolicy(fixture.organizationId, fixture.locationId, true, null);
    await expectStartParkingError(
      context.start({ ...fixture, userId: other.userId }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    expect(await trackers(fixture.sessionId)).toEqual([]);
  });

  it("converges concurrent policy-ON starts to one active tracker", async () => {
    const fixture = await context.createStartParkingFixture();
    await setPolicy(fixture.organizationId, fixture.locationId, true, null);
    const attempts = await Promise.allSettled([
      context.start(fixture),
      context.start(fixture),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    expect(await trackers(fixture.sessionId)).toHaveLength(1);
  });

  it("concurrent completion cannot rewrite the first tracker end", async () => {
    const parking = await context.createStartParkingFixture();
    const resource = await context.addParkingResource(parking);
    const fixture = {
      ...parking,
      parkingSpotCode: resource.spot.code,
      parkingSpotId: resource.spot.id,
      parkingZoneId: resource.zone.id,
    };
    await setPolicy(fixture.organizationId, fixture.locationId, true, null);
    await context.start(fixture);
    const attempts = await Promise.allSettled([
      context.confirm(fixture),
      context.confirm(fixture),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const endedAt = (await trackers(fixture.sessionId))[0]?.ended_at;
    expect(endedAt).toBeInstanceOf(Date);
    await expect(
      context.runtimePool.query(
        `UPDATE task_tracking_sessions SET ended_at = NULL
         WHERE valet_session_id = $1`,
        [fixture.sessionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await trackers(fixture.sessionId))[0]?.ended_at).toEqual(endedAt);
  });
});
