import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { readCurrentUncoveredTaskAlerts } from "../src/modules/dispatch/uncovered-task-alert-query";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_limit");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue #414 bound after episode evidence", () => {
  it("does not consume the final 21-row bound on ineligible Tasks", async () => {
    const fixture = await context.createDispatchFixture();
    const viewer = await context.addMember(fixture, "ORG_ADMIN", false);
    const assign = createAssignTaskCommandExecutor(context.runtimePool);
    for (let index = 0; index < 22; index += 1) {
      const sessionId = await context.addSession(fixture);
      const task = await context.queue({ ...fixture, sessionId });
      await assign({
        authenticatedUserId: fixture.userId,
        expectedVersion: task.version,
        taskId: task.taskId,
      });
    }
    const finalSessionId = await context.addSession(fixture);
    const eligible = await context.queue({
      ...fixture,
      sessionId: finalSessionId,
    });
    const tx = await context.runtimePool.connect();
    try {
      await tx.query("BEGIN READ ONLY");
      const rows = await readCurrentUncoveredTaskAlerts(tx, {
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        viewerUserId: viewer.userId,
        viewerMembershipId: viewer.membershipId,
        limit: 21,
        initialQueueDelaySeconds: 0,
        postDeclineDelaySeconds: 0,
        postLockClockCutover: new Date(0),
      });
      expect(rows).toEqual([
        expect.objectContaining({
          category: "ALT-02",
          sourceId: eligible.taskId,
        }),
      ]);
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
  }, 30_000);

  it("returns the newest 21 proven active episodes across all Tasks", async () => {
    const fixture = await context.createDispatchFixture();
    const viewer = await context.addMember(fixture, "ORG_ADMIN", false);
    const taskIds: string[] = [];
    for (let index = 0; index < 23; index += 1) {
      const sessionId = await context.addSession(fixture);
      const task = await context.queue({ ...fixture, sessionId });
      taskIds.push(task.taskId);
      // Distinct committed server timestamps make the expected order provable.
      await context.adminPool.query("SELECT pg_sleep(0.003)");
    }
    const tx = await context.runtimePool.connect();
    try {
      const rows = await readCurrentUncoveredTaskAlerts(tx, {
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        viewerUserId: viewer.userId,
        viewerMembershipId: viewer.membershipId,
        limit: 21,
        initialQueueDelaySeconds: 0,
        postDeclineDelaySeconds: 0,
        postLockClockCutover: new Date(0),
      });
      expect(rows.map((row) => row.sourceId)).toEqual(
        taskIds.slice(-21).reverse(),
      );
      expect(
        rows.every(
          (row, index) =>
            index === 0 || rows[index - 1]!.occurredAt >= row.occurredAt,
        ),
      ).toBe(true);
    } finally {
      tx.release();
    }
  }, 30_000);
});
