import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { listDashboardTasks } from "../src/modules/dashboard/overview-retrieval-tasks-query";

const context = new ParkingCancellationTestContext("341_native_projection");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("#341 native cancellation to Dashboard provenance", () => {
  it.each(["QUEUED", "ASSIGNED", "ACCEPTED", "REASSIGNED"])(
    "projects real %s cancellation truth",
    async (status) => {
      const { fixture, input } = await context.target(
        status === "REASSIGNED" ? "ACCEPTED" : status,
      );
      const manager = await context.addMember(
        fixture,
        "LOCATION_MANAGER",
        false,
      );
      let canceller = {
        membershipId: fixture.membershipId,
        userId: fixture.userId,
      };
      if (status === "REASSIGNED") {
        const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
        canceller = await context.addMember(fixture);
        await createReassignTaskCommandExecutor(context.runtimePool)({
          authenticatedUserId: supervisor.userId,
          taskId: fixture.taskId,
          expectedVersion: 3,
          targetAssigneeMembershipId: canceller.membershipId,
          reason: "Synthetic reassignment",
        });
        const shift = await context.adminPool.query<{ id: string }>(
          `SELECT id FROM shifts WHERE membership_id=$1 AND status='ACTIVE'`,
          [canceller.membershipId],
        );
        input.authenticatedUserId = canceller.userId;
        input.expectedShiftId = shift.rows[0]!.id;
        input.expectedTaskVersion = 4;
      }
      await context.adminPool.query(
        `UPDATE organization_subscriptions SET status='ACTIVE',dashboard_access_enabled=TRUE
      WHERE organization_id=$1`,
        [fixture.organizationId],
      );
      await context.adminPool.query(
        `UPDATE organization_memberships SET first_name='Synthetic',last_name='Canceller' WHERE id=$1`,
        [canceller.membershipId],
      );
      await context.cancel(input);
      const page = await listDashboardTasks(context.runtimePool, {
        authenticatedUserId: manager.userId,
        locationId: fixture.locationId,
        limit: 100,
      });
      const task = page.items.find((entry) => entry.taskId === fixture.taskId);
      expect(task).toMatchObject({
        status: "CANCELLED",
        currentAssigneeMembershipId:
          status === "QUEUED" ? null : canceller.membershipId,
        cancellation: { kind: "STAFF", displayName: "Synthetic Canceller" },
      });
      if (status === "QUEUED") expect(task?.assignee).toBeNull();
      else expect(task?.assignee?.membershipId).toBe(canceller.membershipId);
    },
  );
});
