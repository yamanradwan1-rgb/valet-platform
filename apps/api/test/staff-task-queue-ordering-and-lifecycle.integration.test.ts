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
  it("orders equal created_at tasks by id regardless of insertion order", async () => {
    const actor = await harness.fixtureWithToken("VALET_SUPERVISOR");

    const earlier = new Date("2026-08-20T08:00:00.000Z");
    const tied = new Date("2026-08-20T08:30:00.000Z");
    const sortedIds = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ].sort();
    const inserted = [
      { id: sortedIds[3]!, createdAt: tied },
      { id: sortedIds[2]!, createdAt: tied },
      { id: sortedIds[1]!, createdAt: earlier },
      { id: sortedIds[0]!, createdAt: tied },
    ];
    const expectedIds = [
      sortedIds[1],
      sortedIds[0],
      sortedIds[2],
      sortedIds[3],
    ];

    for (const [i, task] of inserted.entries()) {
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
          task.id,
          actor.fixture.organizationId,
          actor.fixture.locationId,
          sId,
          task.createdAt,
        ],
      );
    }

    for (let read = 0; read < 2; read++) {
      const res = await harness.request(
        "GET",
        `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
        { token: actor.token },
      );
      expect(res.status).toBe(200);
      const tasks = res.body.tasks as Array<{ taskId: string }>;
      const matchedTaskIds = tasks
        .map((task) => task.taskId)
        .filter((id) => inserted.some((task) => task.id === id));
      expect(matchedTaskIds).toEqual(expectedIds);
    }
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
