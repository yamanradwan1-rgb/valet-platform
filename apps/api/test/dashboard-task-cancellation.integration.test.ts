import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDashboardTasks } from "../src/modules/dashboard/overview-retrieval-tasks-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("task_cancellation");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("#341 cancelled task attribution", () => {
  it.each(["PARKING", "RETRIEVAL"] as const)(
    "keeps the saved %s assignee distinct from the cancelling actor",
    async (taskType) => {
      const manager = await context.managerFixture();
      const assigned = await context.createActor(manager, "VALET_EMPLOYEE");
      const cancelling = taskType === "PARKING" ? assigned : null;
      await context.adminPool.query(
        `UPDATE organization_memberships SET first_name='Synthetic',last_name='Worker' WHERE id=$1`,
        [assigned.membershipId],
      );
      const sessionId = await context.seedSession({
        state: "AWAITING_PARKING",
      });
      const taskId = await context.seedTask({
        sessionId,
        taskType,
        status: "CANCELLED",
        assigneeMembershipId: assigned.membershipId,
      });
      const time = new Date("2026-10-25T09:00:00.000Z");
      await context.adminPool.query(
        `INSERT INTO dispatch_events(id,organization_id,location_id,valet_session_id,task_id,
      event_type,actor_membership_id,previous_assignee_membership_id,new_assignee_membership_id,occurred_at)
      VALUES($1,$2,$3,$4,$5,'CANCELLED',$6,$7,$7,$8)`,
        [
          randomUUID(),
          manager.organizationId,
          manager.locationId,
          sessionId,
          taskId,
          cancelling?.membershipId ?? null,
          assigned.membershipId,
          time,
        ],
      );
      if (taskType === "RETRIEVAL") {
        await context.adminPool.query(
          `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,actor_type,
        event_type,entity_type,entity_id,metadata_json,occurred_at)
        VALUES($1,$2,$3,$4,'GUEST','RETRIEVAL_CANCELLED','VALET_SESSION',$4,$5::jsonb,$6)`,
          [
            randomUUID(),
            manager.organizationId,
            manager.locationId,
            sessionId,
            JSON.stringify({ task_id: taskId }),
            time,
          ],
        );
      }
      const read = () =>
        listDashboardTasks(context.runtimePool, {
          authenticatedUserId: manager.userId,
          locationId: manager.locationId,
          limit: 100,
        });
      const result = (await read()).items.find(
        (item) => item.taskId === taskId,
      );
      expect(result).toMatchObject({
        currentAssigneeMembershipId: assigned.membershipId,
        assignee: { membershipId: assigned.membershipId },
        cancellation: {
          kind: cancelling ? "STAFF" : "GUEST",
          displayName: cancelling ? "Synthetic Worker" : null,
          occurredAt: time.toISOString(),
        },
      });
      await context.adminPool.query(
        `UPDATE organization_memberships SET status='INACTIVE',last_name=NULL WHERE id=$1`,
        [assigned.membershipId],
      );
      if (cancelling) {
        expect(
          (await read()).items.find((item) => item.taskId === taskId)
            ?.cancellation,
        ).toMatchObject({ kind: "STAFF", displayName: null });
      }
    },
  );
  it("does not invent an assignee or actor when history is absent", async () => {
    const manager = await context.managerFixture();
    const sessionId = await context.seedSession({ state: "AWAITING_PARKING" });
    const taskId = await context.seedTask({
      sessionId,
      taskType: "PARKING",
      status: "CANCELLED",
    });
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: manager.userId,
      locationId: manager.locationId,
      limit: 100,
    });
    expect(result.items.find((item) => item.taskId === taskId)).toMatchObject({
      currentAssigneeMembershipId: null,
      assignee: null,
      cancellation: { kind: "UNKNOWN", displayName: null, occurredAt: null },
    });
  });
});
