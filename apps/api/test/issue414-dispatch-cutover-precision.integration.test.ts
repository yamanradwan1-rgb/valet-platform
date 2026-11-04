import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import { readCurrentUncoveredTaskAlertById } from "../src/modules/dispatch/uncovered-task-alert-query";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_cutover_precision");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue #414 W1 PG17 fractional cutover precision falsifier", () => {
  it("demonstrates that raw microsecond PG clock truncation could admit a rounded legacy episode", async () => {
    const fixture = await context.createDispatchFixture();
    const viewer = await context.addMember(fixture, "ORG_ADMIN", false);
    const queued = await context.queue(fixture);
    const row = await context.adminPool.query<{
      legacy: Date;
      raw_cutover: Date;
      rounded_cutover: Date;
      raw_is_after_legacy: boolean;
    }>(
      `SELECT
         '2026-10-01 00:00:00.500800+00'::timestamptz(3) AS legacy,
         '2026-10-01 00:00:00.500900+00'::timestamptz AS raw_cutover,
         '2026-10-01 00:00:00.500900+00'::timestamptz(3)
            AS rounded_cutover,
         '2026-10-01 00:00:00.500900+00'::timestamptz
           > '2026-10-01 00:00:00.500800+00'::timestamptz
            AS raw_is_after_legacy`,
    );
    const times = row.rows[0]!;
    expect(times.raw_is_after_legacy).toBe(true);
    expect(times.legacy.toISOString()).toBe("2026-10-01T00:00:00.501Z");
    expect(times.raw_cutover.toISOString()).toBe("2026-10-01T00:00:00.500Z");
    expect(times.rounded_cutover.toISOString()).toBe(
      "2026-10-01T00:00:00.501Z",
    );

    // Disposable DB only: simulate an old transaction-start clock whose
    // persisted millisecond rounding is later than its true instant.
    await context.adminPool.query(
      "UPDATE tasks SET created_at=$2,updated_at=$2 WHERE id=$1",
      [queued.taskId, times.legacy],
    );
    await context.adminPool.query(
      "UPDATE dispatch_events SET occurred_at=$2 WHERE task_id=$1",
      [queued.taskId, times.legacy],
    );
    const client = await context.runtimePool.connect();
    try {
      const scope = {
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        viewerUserId: viewer.userId,
        viewerMembershipId: viewer.membershipId,
        limit: 21,
        initialQueueDelaySeconds: 0,
        postDeclineDelaySeconds: 0,
        postLockClockCutover: times.raw_cutover,
      };
      // RED release gate: direct raw DB timestamp -> JS Date truncates
      // microseconds, and the old persisted .501 episode falsely passes.
      expect(
        await readCurrentUncoveredTaskAlertById(client, scope, queued.taskId),
      ).toMatchObject({ sourceId: queued.taskId, category: "ALT-02" });
      // Safe operational capture: server-side timestamptz(3) rounding
      // before transport. Equality is then correctly denied.
      expect(
        await readCurrentUncoveredTaskAlertById(
          client,
          { ...scope, postLockClockCutover: times.rounded_cutover },
          queued.taskId,
        ),
      ).toBeNull();
    } finally {
      client.release();
    }
  });

  it("fails closed when the current versioned decline Audit lacks its matching DispatchEvent", async () => {
    const fixture = await context.createDispatchFixture();
    const viewer = await context.addMember(fixture, "ORG_ADMIN", false);
    const queued = await context.queue(fixture);
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: queued.version,
        taskId: queued.taskId,
      },
    );
    const declined = await createDeclineTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: queued.taskId,
    });
    const scope = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      viewerUserId: viewer.userId,
      viewerMembershipId: viewer.membershipId,
      limit: 21,
      initialQueueDelaySeconds: 0,
      postDeclineDelaySeconds: 0,
      postLockClockCutover: new Date(0),
    };
    const tx = await context.runtimePool.connect();
    try {
      expect(
        await readCurrentUncoveredTaskAlertById(tx, scope, queued.taskId),
      ).toMatchObject({
        category: "ALT-03",
        episodeId: `${queued.taskId}:${declined.version}`,
      });
      const deleted = await context.adminPool.query(
        "DELETE FROM dispatch_events WHERE task_id=$1 AND event_type='DECLINED' RETURNING id",
        [queued.taskId],
      );
      expect(deleted.rowCount).toBe(1);
      expect(
        await readCurrentUncoveredTaskAlertById(tx, scope, queued.taskId),
      ).toBeNull();
    } finally {
      tx.release();
    }
  });

  it("fails closed when two current-version declines collide at exactly the same millisecond", async () => {
    const fixture = await context.createDispatchFixture();
    const viewer = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const queued = await context.queue(fixture);
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: queued.version,
        taskId: queued.taskId,
      },
    );
    await createDeclineTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: queued.taskId,
    });
    const scope = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      viewerUserId: viewer.userId,
      viewerMembershipId: viewer.membershipId,
      limit: 21,
      initialQueueDelaySeconds: 0,
      postDeclineDelaySeconds: 0,
      postLockClockCutover: new Date(0),
    };
    const tx = await context.runtimePool.connect();
    try {
      expect(
        await readCurrentUncoveredTaskAlertById(tx, scope, queued.taskId),
      ).toMatchObject({ category: "ALT-03" });
      const duplicate = await context.adminPool.query(
        `INSERT INTO dispatch_events (
           id,organization_id,location_id,task_id,valet_session_id,event_type,
           actor_membership_id,previous_assignee_membership_id,
           new_assignee_membership_id,occurred_at)
         SELECT gen_random_uuid(),organization_id,location_id,task_id,
                valet_session_id,event_type,actor_membership_id,
                previous_assignee_membership_id,new_assignee_membership_id,
                occurred_at
         FROM dispatch_events
         WHERE task_id=$1 AND event_type='DECLINED' RETURNING occurred_at`,
        [queued.taskId],
      );
      expect(duplicate.rowCount).toBe(1);
      expect(
        await readCurrentUncoveredTaskAlertById(tx, scope, queued.taskId),
      ).toBeNull();
    } finally {
      tx.release();
    }
  });
});
