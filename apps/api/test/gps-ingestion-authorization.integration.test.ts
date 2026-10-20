import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GpsIngestionTestContext,
  type TrackingFixture,
} from "./gps-ingestion-test-context";

describe("VAL-007D GPS ingestion authorization", () => {
  const context = new GpsIngestionTestContext("authorization");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  async function expectDenied(
    fixture: TrackingFixture,
    userId = fixture.userId,
    code = "TASK_NOT_FOUND_OR_FORBIDDEN",
  ) {
    await expect(
      context.ingest(fixture, [await context.sample()], userId),
    ).rejects.toMatchObject({ code });
    expect(await context.rawSamples(fixture)).toHaveLength(0);
  }

  it("accepts Parking GPS from the exact current Task owner", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const sample = await context.sample();
    await expect(context.ingest(fixture, [sample])).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "ACCEPTED" },
    ]);
    expect(await context.rawSamples(fixture)).toHaveLength(1);
  });

  it("accepts Retrieval GPS from the exact current Task owner", async () => {
    const fixture = await context.createRetrievalTrackingFixture();
    const sample = await context.sample();
    await expect(context.ingest(fixture, [sample])).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "ACCEPTED" },
    ]);
  });

  it("re-evaluates policy and rejects when it is OFF", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `UPDATE locations SET tracking_enabled_override = false WHERE id = $1`,
      [fixture.locationId],
    );
    await expectDenied(fixture, fixture.userId, "TASK_INVALID_STATE");
  });

  it("rejects a missing or ended active tracker", async () => {
    const missing = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `DELETE FROM task_tracking_sessions WHERE id = $1`,
      [missing.trackingSessionId],
    );
    await expectDenied(missing, missing.userId, "TASK_INVALID_STATE");

    const ended = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `UPDATE task_tracking_sessions SET ended_at = transaction_timestamp()
       WHERE id = $1`,
      [ended.trackingSessionId],
    );
    await expectDenied(ended, ended.userId, "TASK_INVALID_STATE");
  });

  it("denies a wrong owner, including a supervisor submitting for another owner", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    await expectDenied(fixture, supervisor.userId);

    const other = await context.addMember(fixture);
    await context.adminPool.query(
      `UPDATE tasks SET current_assignee_membership_id = $2 WHERE id = $1`,
      [fixture.movementTaskId, other.membershipId],
    );
    await expectDenied(fixture);
  });

  it("allows a supervisor who is the exact Task owner", async () => {
    const fixture =
      await context.createParkingTrackingFixture("VALET_SUPERVISOR");
    const sample = await context.sample();
    await expect(context.ingest(fixture, [sample])).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "ACCEPTED" },
    ]);
  });

  it("denies ended Shift, revoked access, and inactive membership", async () => {
    const ended = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [ended.membershipId],
    );
    await expectDenied(ended);

    const revoked = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [revoked.membershipId, revoked.locationId],
    );
    await expectDenied(revoked);

    const inactive = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      [inactive.membershipId],
    );
    await expectDenied(inactive);
  });

  it("preserves non-disclosing cross-tenant and wrong-Location denial", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const foreign = await context.createFixture();
    await expectDenied(fixture, foreign.userId);

    const wrongLocation = await context.createParkingTrackingFixture();
    const otherLocationId = await context.addLocation(wrongLocation);
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [wrongLocation.membershipId],
    );
    await context.startShift({ ...wrongLocation, locationId: otherLocationId });
    await expectDenied(wrongLocation);
  });

  it("rejects physical-state and Task type/status mismatches", async () => {
    const physical = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'PARKED' WHERE id = $1`,
      [physical.sessionId],
    );
    await expectDenied(physical, physical.userId, "TASK_INVALID_STATE");

    const type = await context.createParkingTrackingFixture();
    const retrievalTaskId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO tasks (id, organization_id, location_id, valet_session_id,
        task_type, status, current_assignee_membership_id, version, updated_at)
       SELECT $2, organization_id, location_id, valet_session_id,
         'RETRIEVAL', status, current_assignee_membership_id, version, updated_at
         FROM tasks WHERE id = $1`,
      [type.movementTaskId, retrievalTaskId],
    );
    // The original PARKING task may no longer be active. Keep exactly one
    // in-progress task so the guard reaches the intended type/state check.
    await context.adminPool.query(
      "UPDATE tasks SET status = 'COMPLETED' WHERE id = $1",
      [type.movementTaskId],
    );
    await context.adminPool.query(
      `UPDATE task_tracking_sessions SET task_id = $2 WHERE id = $1`,
      [type.trackingSessionId, retrievalTaskId],
    );
    await expectDenied(type, type.userId, "TASK_INVALID_STATE");

    const status = await context.createParkingTrackingFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'ACCEPTED' WHERE id = $1`,
      [status.movementTaskId],
    );
    await expectDenied(status);
  });
});
