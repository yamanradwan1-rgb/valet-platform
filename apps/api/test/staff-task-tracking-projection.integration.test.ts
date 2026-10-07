import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DispatchFixture } from "./dispatch-test-context";
import { createStaffTaskQueueHarness } from "./staff-task-queue-harness";

const harness = createStaffTaskQueueHarness();

beforeAll(() => harness.start(), 120_000);
beforeEach(() => harness.resetPrincipals());
afterAll(() => harness.close(), 60_000);

async function enableTracking(fixture: DispatchFixture, enabled = true) {
  await harness.context.adminPool.query(
    `UPDATE organizations SET tracking_enabled = $2 WHERE id = $1`,
    [fixture.organizationId, enabled],
  );
  await harness.context.adminPool.query(
    `UPDATE locations SET tracking_enabled_override = NULL
     WHERE organization_id = $1 AND id = $2`,
    [fixture.organizationId, fixture.locationId],
  );
}

async function addMovement(
  fixture: DispatchFixture,
  taskType: "PARKING" | "RETRIEVAL",
  sessionId = fixture.sessionId,
) {
  const taskId = randomUUID();
  const trackingSessionId = randomUUID();
  const startedAt = new Date(Date.now() - 1_000);
  const state = taskType === "PARKING" ? "PARKING" : "RETRIEVING";
  await harness.context.adminPool.query(
    `UPDATE valet_sessions SET state = $2, updated_at = transaction_timestamp()
     WHERE id = $1`,
    [sessionId, state],
  );
  await harness.context.adminPool.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type, status,
        current_assignee_membership_id, version, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6, 1,
             transaction_timestamp())`,
    [
      taskId,
      fixture.organizationId,
      fixture.locationId,
      sessionId,
      taskType,
      fixture.membershipId,
    ],
  );
  await harness.context.adminPool.query(
    `INSERT INTO task_tracking_sessions
       (id, organization_id, location_id, valet_session_id, task_id, started_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      trackingSessionId,
      fixture.organizationId,
      fixture.locationId,
      sessionId,
      taskId,
      startedAt,
    ],
  );
  return { sessionId, startedAt, taskId, taskType, trackingSessionId };
}

function trackingPath(locationId: string) {
  return `/v1/staff/tasks/queue?locationId=${locationId}&includeTracking=true`;
}

describe("#270 employee task tracking projection", () => {
  it("preserves the legacy strict response without opt-in", async () => {
    const actor = await harness.fixtureWithToken();
    const response = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: actor.token },
    );
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["tasks"]);
  });

  it("returns NONE when no authoritative tracker is eligible", async () => {
    const actor = await harness.fixtureWithToken();
    const response = await harness.request(
      "GET",
      trackingPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(response.status).toBe(200);
    expect(response.body.tracking).toEqual({ status: "NONE" });
  });

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "projects one exact %s movement and active tracker",
    async (taskType) => {
      const actor = await harness.fixtureWithToken();
      await enableTracking(actor.fixture);
      const movement = await addMovement(actor.fixture, taskType);
      const response = await harness.request(
        "GET",
        trackingPath(actor.fixture.locationId),
        { token: actor.token },
      );
      expect(response.status).toBe(200);
      expect(response.body.tracking).toEqual({
        movement: {
          sessionId: movement.sessionId,
          taskId: movement.taskId,
          taskType,
          trackingSessionId: movement.trackingSessionId,
          trackingStartedAt: movement.startedAt.toISOString(),
        },
        status: "ELIGIBLE",
      });
    },
  );

  it("stops Retrieval at READY while its Task remains IN_PROGRESS", async () => {
    const actor = await harness.fixtureWithToken();
    await enableTracking(actor.fixture);
    await addMovement(actor.fixture, "RETRIEVAL");
    await harness.context.adminPool.query(
      `UPDATE valet_sessions SET state = 'READY', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [actor.fixture.sessionId],
    );
    const response = await harness.request(
      "GET",
      trackingPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(response.body.tracking).toEqual({ status: "NONE" });
  });

  it("returns NONE for policy OFF and for OFF-to-ON without a tracker", async () => {
    const actor = await harness.fixtureWithToken();
    const movement = await addMovement(actor.fixture, "PARKING");
    await enableTracking(actor.fixture, false);
    const off = await harness.request("GET", trackingPath(actor.fixture.locationId), {
      token: actor.token,
    });
    expect(off.body.tracking).toEqual({ status: "NONE" });
    await harness.context.adminPool.query(
      `DELETE FROM task_tracking_sessions WHERE id = $1`,
      [movement.trackingSessionId],
    );
    await enableTracking(actor.fixture, true);
    const noRetroactiveTracker = await harness.request(
      "GET",
      trackingPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(noRetroactiveTracker.body.tracking).toEqual({ status: "NONE" });
  });

  it("conceals another employee tracker and foreign Location authority", async () => {
    const actor = await harness.fixtureWithToken();
    await enableTracking(actor.fixture);
    await addMovement(actor.fixture, "PARKING");
    const other = await harness.context.addMember(actor.fixture, "VALET_EMPLOYEE", true);
    const otherToken = `other-${randomUUID()}`;
    harness.principals.set(`Bearer ${otherToken}`, other.userId);
    const ownView = await harness.request(
      "GET",
      trackingPath(actor.fixture.locationId),
      { token: otherToken },
    );
    expect(ownView.status).toBe(200);
    expect(ownView.body.tracking).toEqual({ status: "NONE" });

    const foreign = await harness.context.createDispatchFixture();
    const denied = await harness.request("GET", trackingPath(foreign.locationId), {
      token: actor.token,
    });
    expect(denied.status).toBe(404);
  });

  it("fails closed when more than one movement is eligible", async () => {
    const actor = await harness.fixtureWithToken();
    await enableTracking(actor.fixture);
    await addMovement(actor.fixture, "PARKING");
    const secondSession = await harness.context.addSession(actor.fixture, "PARKING");
    await addMovement(actor.fixture, "PARKING", secondSession);
    const response = await harness.request(
      "GET",
      trackingPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(response.body.tracking).toEqual({ status: "AMBIGUOUS" });
  });
});
