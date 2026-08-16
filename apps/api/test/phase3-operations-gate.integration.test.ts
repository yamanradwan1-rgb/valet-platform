import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type GateFixture,
  Phase3OperationsGateContext,
} from "./phase3-operations-gate-test-context";
const context = new Phase3OperationsGateContext("flow");
function number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expect(typeof value).toBe("number");
  return value as number;
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expect(typeof value).toBe("string");
  return value as string;
}

const post = (fixture: GateFixture, path: string, body: unknown) =>
  context.request("POST", path, { body, token: fixture.accessToken });

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-005H production API operations gate", () => {
  it("composes the canonical employee Parking flow with response-fed versions", async () => {
    const fixture = await context.createGateFixture();
    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;

    const key = await post(fixture, `${sessionPath}/key-slot/assign`, {
      expectedVersion: 1,
      keySlotCode: fixture.keySlotCode,
    });
    expect(key).toMatchObject({ status: 200, body: { version: 2 } });
    let sessionVersion = number(key.body, "version");

    const queued = await post(fixture, `${sessionPath}/parking-task/queue`, {});
    expect(queued).toMatchObject({
      status: 200,
      body: {
        currentAssigneeMembershipId: null,
        sessionId: fixture.sessionId,
        status: "QUEUED",
        taskType: "PARKING",
        version: 1,
      },
    });
    const taskId = text(queued.body, "taskId");
    let taskVersion = number(queued.body, "version");
    const queue = await context.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${fixture.locationId}`,
      { token: fixture.accessToken },
    );
    expect(queue.body.tasks).toEqual([queued.body]);

    const assigned = await post(fixture, `/v1/staff/tasks/${taskId}/assign`, {
      expectedVersion: taskVersion,
    });
    expect(assigned).toMatchObject({
      status: 200,
      body: {
        currentAssigneeMembershipId: fixture.membershipId,
        sessionId: fixture.sessionId,
        status: "ASSIGNED",
        taskId,
        version: 2,
      },
    });
    taskVersion = number(assigned.body, "version");

    const blockedEnd = await post(
      fixture,
      `/v1/staff/shifts/${fixture.shiftId}/end`,
      { cashReported: "0" },
    );
    expect(blockedEnd).toMatchObject({
      status: 409,
      body: { code: "OPEN_TASK_HANDOFF_REQUIRED" },
    });

    const accepted = await post(fixture, `/v1/staff/tasks/${taskId}/accept`, {
      expectedVersion: taskVersion,
    });
    expect(accepted).toMatchObject({
      status: 200,
      body: {
        currentAssigneeMembershipId: fixture.membershipId,
        status: "ACCEPTED",
        version: 3,
      },
    });
    taskVersion = number(accepted.body, "version");

    const started = await post(fixture, `${sessionPath}/start-parking`, {
      expectedSessionVersion: sessionVersion,
      expectedTaskVersion: taskVersion,
    });
    expect(started).toMatchObject({
      status: 200,
      body: {
        sessionId: fixture.sessionId,
        sessionVersion: 3,
        state: "PARKING",
        taskId,
        taskStatus: "IN_PROGRESS",
        taskVersion: 4,
      },
    });
    sessionVersion = number(started.body, "sessionVersion");
    taskVersion = number(started.body, "taskVersion");

    const parked = await post(fixture, `${sessionPath}/confirm-parked`, {
      expectedSessionVersion: sessionVersion,
      expectedTaskVersion: taskVersion,
      parkingSpotCode: fixture.parkingSpotCode,
    });
    expect(parked).toMatchObject({
      status: 200,
      body: {
        parkingSpotCode: fixture.parkingSpotCode,
        parkingSpotId: fixture.parkingSpotId,
        parkingZoneId: fixture.parkingZoneId,
        sessionId: fixture.sessionId,
        sessionVersion: 4,
        state: "PARKED",
        taskId,
        taskStatus: "COMPLETED",
        taskVersion: 5,
      },
    });

    const stale = await post(fixture, `${sessionPath}/confirm-parked`, {
      expectedSessionVersion: sessionVersion,
      expectedTaskVersion: taskVersion,
      parkingSpotCode: fixture.parkingSpotCode,
    });
    expect(stale).toMatchObject({
      status: 409,
      body: { code: "VERSION_CONFLICT" },
    });

    const projection = await context.finalProjection(fixture.sessionId, taskId);
    expect(projection).toMatchObject({
      key_slot_id: fixture.keySlotId,
      legacy_assignee: null,
      parking_spot_id: fixture.parkingSpotId,
      parking_zone_id: fixture.parkingZoneId,
      session_state: "PARKED",
      session_version: 4,
      task_assignee: fixture.membershipId,
      task_status: "COMPLETED",
      task_type: "PARKING",
      task_version: 5,
    });
    expect(
      new Date(String(projection.parking_started_at)).getTime(),
    ).toBeLessThanOrEqual(new Date(String(projection.parked_at)).getTime());
    expect(
      await context.eventTypes("key_custody_events", fixture.sessionId),
    ).toEqual(["SLOT_ASSIGNED", "CHECKED_OUT", "RETURNED_TO_SLOT"]);
    expect(await context.eventTypes("dispatch_events", taskId)).toEqual([
      "QUEUED",
      "ASSIGNED",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);

    const audits = await context.auditEvents(fixture.sessionId, taskId);
    expect(audits.map((event) => event.event_type)).toEqual([
      "VALET_SESSION_KEY_SLOT_ASSIGNED",
      "TASK_ASSIGNED",
      "TASK_ACCEPTED",
      "VALET_SESSION_PARKING_STARTED",
      "VALET_SESSION_PARKED",
    ]);
    for (const audit of audits) {
      expect(audit).toMatchObject({
        actor_membership_id: fixture.membershipId,
        location_id: fixture.locationId,
        organization_id: fixture.organizationId,
      });
      expect(JSON.stringify(audit.metadata_json).toLowerCase()).not.toMatch(
        /authorization|cookie|bearer|access.?token|refresh.?token|password|qr.?secret|payment|gps/,
      );
    }

    const guest = await context.request("GET", "/v1/guest/session", {
      token: fixture.guestToken,
    });
    expect(guest).toMatchObject({
      status: 200,
      body: { state: "PARKED", valetSessionId: fixture.sessionId },
    });
    expect(JSON.stringify(guest.body)).not.toMatch(
      /keySlot|parkingZone|parkingSpot|assignee|coordinates|gps/i,
    );
    expect(
      await post(fixture, `/v1/staff/shifts/${fixture.shiftId}/end`, {
        cashReported: "0",
      }),
    ).toMatchObject({ status: 200, body: { status: "ENDED" } });
  });

  it("preserves semantic queue reuse and append-only decline history", async () => {
    const fixture = await context.createGateFixture();
    const path = `/v1/staff/valet-sessions/${fixture.sessionId}/parking-task/queue`;
    const first = await post(fixture, path, {});
    const retry = await post(fixture, path, {});
    expect(retry.body).toEqual(first.body);
    const taskId = text(first.body, "taskId");
    const assigned = await post(fixture, `/v1/staff/tasks/${taskId}/assign`, {
      expectedVersion: number(first.body, "version"),
    });
    const declined = await post(fixture, `/v1/staff/tasks/${taskId}/decline`, {
      expectedVersion: number(assigned.body, "version"),
      reason: "  End of lane  ",
    });
    expect(declined).toMatchObject({
      status: 200,
      body: { currentAssigneeMembershipId: null, status: "QUEUED", version: 3 },
    });
    expect(await context.eventTypes("dispatch_events", taskId)).toEqual([
      "QUEUED",
      "ASSIGNED",
      "DECLINED",
    ]);
    const history = await context.adminPool.query<{
      actor_membership_id: string;
      previous_assignee_membership_id: string;
      reason: string;
    }>(
      `SELECT actor_membership_id::text, previous_assignee_membership_id::text,
              reason FROM dispatch_events
       WHERE task_id = $1 AND event_type = 'DECLINED'`,
      [taskId],
    );
    expect(history.rows[0]).toEqual({
      actor_membership_id: fixture.membershipId,
      previous_assignee_membership_id: fixture.membershipId,
      reason: "End of lane",
    });
  });

  it("conceals cross-Organization and wrong-Location operations", async () => {
    const target = await context.createGateFixture();
    const foreign = await context.createGateFixture();
    const wrongLocationToken = await context.authorizeWrongLocation(target);
    const queued = await post(
      target,
      `/v1/staff/valet-sessions/${target.sessionId}/parking-task/queue`,
      {},
    );
    for (const token of [foreign.accessToken, wrongLocationToken]) {
      const attempts = [
        await context.request(
          "POST",
          `/v1/staff/valet-sessions/${target.sessionId}/key-slot/assign`,
          {
            body: { expectedVersion: 1, keySlotCode: target.keySlotCode },
            token,
          },
        ),
        await context.request(
          "POST",
          `/v1/staff/tasks/${text(queued.body, "taskId")}/assign`,
          { body: { expectedVersion: 1 }, token },
        ),
        await context.request(
          "POST",
          `/v1/staff/valet-sessions/${target.sessionId}/start-parking`,
          {
            body: { expectedSessionVersion: 1, expectedTaskVersion: 1 },
            token,
          },
        ),
        await context.request(
          "POST",
          `/v1/staff/valet-sessions/${target.sessionId}/confirm-parked`,
          {
            body: {
              expectedSessionVersion: 1,
              expectedTaskVersion: 1,
              parkingSpotCode: target.parkingSpotCode,
            },
            token,
          },
        ),
      ];
      for (const attempt of attempts) {
        expect(attempt.status).toBe(404);
        expect(JSON.stringify(attempt.body)).not.toMatch(
          /constraint|SELECT|valet_sessions_|tasks_/i,
        );
      }
    }
  });
});
