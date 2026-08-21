import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createStaffTaskQueueHarness } from "./staff-task-queue-harness";

const harness = createStaffTaskQueueHarness();

beforeAll(async () => {
  await harness.start();
}, 120_000);

beforeEach(() => harness.resetPrincipals());

afterAll(async () => {
  await harness.close();
}, 60_000);

describe("VUI-003A2 staff task queue ordering, lifecycle & mutations", () => {
  it("enforces deterministic queue ordering by created_at ascending then id", async () => {
    const actor = await harness.fixtureWithToken("VALET_SUPERVISOR");

    const t1 = new Date("2026-08-20T08:00:00.000Z");
    const t2 = new Date("2026-08-20T08:30:00.000Z");
    const t3 = new Date("2026-08-20T09:00:00.000Z");

    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
    const timestamps = [t1, t2, t3];

    for (let i = 0; i < 3; i++) {
      const vId = randomUUID();
      const sId = randomUUID();
      await harness.context.adminPool.query(
        `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
         VALUES ($1, $2, $3, transaction_timestamp())`,
        [vId, actor.fixture.organizationId, `Ordered Vehicle ${i}`],
      );
      await harness.context.adminPool.query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            organization_id, location_id, vehicle_id, state,
            checked_in_by_membership_id, version, updated_at)
         VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
                 $3, $4, $5, 'AWAITING_PARKING', $6, 1, transaction_timestamp())`,
        [
          sId,
          `hash-${randomUUID()}`,
          actor.fixture.organizationId,
          actor.fixture.locationId,
          vId,
          actor.fixture.membershipId,
        ],
      );
      await harness.context.adminPool.query(
        `INSERT INTO tasks
           (id, organization_id, location_id, valet_session_id, task_type, status, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PARKING', 'QUEUED', 1, $5, $5)`,
        [
          ids[i],
          actor.fixture.organizationId,
          actor.fixture.locationId,
          sId,
          timestamps[i],
        ],
      );
    }

    const res = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: actor.token },
    );
    expect(res.status).toBe(200);
    const tasks = res.body.tasks as Array<{ taskId: string }>;
    const matchedTaskIds = tasks
      .map((t) => t.taskId)
      .filter((id) => (ids as string[]).includes(id));
    expect(matchedTaskIds).toEqual(ids);
  });

  it("excludes COMPLETED and CANCELLED terminal tasks from queue projection", async () => {
    const actor = await harness.fixtureWithToken("VALET_EMPLOYEE");

    const completedTaskId = randomUUID();
    const cancelledTaskId = randomUUID();

    for (const [taskId, status] of [
      [completedTaskId, "COMPLETED"],
      [cancelledTaskId, "CANCELLED"],
    ] as const) {
      const vId = randomUUID();
      const sId = randomUUID();
      await harness.context.adminPool.query(
        `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
         VALUES ($1, $2, $3, transaction_timestamp())`,
        [vId, actor.fixture.organizationId, `Terminal ${status}`],
      );
      await harness.context.adminPool.query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            organization_id, location_id, vehicle_id, state,
            checked_in_by_membership_id, version, updated_at)
         VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
                 $3, $4, $5, 'PARKED', $6, 1, transaction_timestamp())`,
        [
          sId,
          `hash-${randomUUID()}`,
          actor.fixture.organizationId,
          actor.fixture.locationId,
          vId,
          actor.fixture.membershipId,
        ],
      );
      await harness.context.adminPool.query(
        `INSERT INTO tasks
           (id, organization_id, location_id, valet_session_id, task_type, status, version, updated_at)
         VALUES ($1, $2, $3, $4, 'PARKING', $5, 1, transaction_timestamp())`,
        [
          taskId,
          actor.fixture.organizationId,
          actor.fixture.locationId,
          sId,
          status,
        ],
      );
    }

    const res = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: actor.token },
    );
    expect(res.status).toBe(200);
    const tasks = res.body.tasks as Array<{ taskId: string }>;
    const taskIds = tasks.map((t) => t.taskId);
    expect(taskIds).not.toContain(completedTaskId);
    expect(taskIds).not.toContain(cancelledTaskId);
  });

  it("proves mutation responses preserve canonical TaskProjection shape without queue fields", async () => {
    const actor = await harness.fixtureWithToken("VALET_SUPERVISOR");

    // Queue a parking task
    const queued = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${actor.fixture.sessionId}/parking-task/queue`,
      { body: {}, token: actor.token },
    );
    expect(queued.status).toBe(200);
    expect(queued.body).not.toHaveProperty("vehicle");
    expect(queued.body).not.toHaveProperty("parkingZone");
    expect(queued.body).not.toHaveProperty("parkingSpot");
    expect(queued.body).not.toHaveProperty("retrievalRequestedAt");

    const taskId = queued.body.taskId as string;
    const targetMember = await harness.context.addMember(actor.fixture);

    // Assign mutation
    const assigned = await harness.request(
      "POST",
      `/v1/staff/tasks/${taskId}/assign`,
      {
        body: {
          expectedVersion: 1,
          targetAssigneeMembershipId: targetMember.membershipId,
        },
        token: actor.token,
      },
    );
    expect(assigned.status).toBe(200);
    expect(assigned.body).toEqual({
      createdAt: expect.any(String),
      currentAssigneeMembershipId: targetMember.membershipId,
      sessionId: actor.fixture.sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "PARKING",
      version: 2,
    });
    expect(assigned.body).not.toHaveProperty("vehicle");
    expect(assigned.body).not.toHaveProperty("parkingZone");
    expect(assigned.body).not.toHaveProperty("parkingSpot");
    expect(assigned.body).not.toHaveProperty("retrievalRequestedAt");
  });
});
