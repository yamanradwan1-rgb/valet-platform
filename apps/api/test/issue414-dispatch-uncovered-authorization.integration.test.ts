import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCurrentUncoveredTaskAlertById } from "../src/modules/dispatch/uncovered-task-alert-query";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_auth");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue #414 current Task source scope defense", () => {
  it("uses persisted viewer identity, role, and exact Location grant", async () => {
    const fixture = await context.createDispatchFixture();
    const queued = await context.queue(fixture);
    const manager = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const scope = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      viewerUserId: manager.userId,
      viewerMembershipId: manager.membershipId,
      limit: 21,
      initialQueueDelaySeconds: 0,
      postDeclineDelaySeconds: 0,
      postLockClockCutover: new Date(0),
    };
    const tx = await context.runtimePool.connect();
    try {
      await tx.query("BEGIN READ ONLY");
      const source = (overrides: Partial<typeof scope> = {}) =>
        readCurrentUncoveredTaskAlertById(
          tx,
          { ...scope, ...overrides },
          queued.taskId,
        );
      expect(await source()).not.toBeNull();
      expect(await source({ viewerUserId: randomUUID() })).toBeNull();
      expect(await source({ organizationId: randomUUID() })).toBeNull();
      expect(await source({ locationId: randomUUID() })).toBeNull();
      expect(
        await source({
          viewerUserId: fixture.userId,
          viewerMembershipId: fixture.membershipId,
        }),
      ).toBeNull();
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
    await context.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [manager.membershipId],
    );
    const readTx = await context.runtimePool.connect();
    try {
      expect(
        await readCurrentUncoveredTaskAlertById(readTx, scope, queued.taskId),
      ).toBeNull();
    } finally {
      readTx.release();
    }
  });
});
