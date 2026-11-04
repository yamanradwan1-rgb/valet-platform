import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCurrentUncoveredTaskAlerts } from "../src/modules/dispatch/uncovered-task-alert-query";
import { requestGuestRetrieval } from "../src/modules/retrieval/guest-retrieval-request-command";
import { resolveAndLockGuestSessionById } from "../src/modules/valet-sessions/guest-access-session-resolution";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_guest_queue_clock");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function requestInTransaction(sessionId: string): Promise<void> {
  const tx = await context.runtimePool.connect();
  try {
    await tx.query("BEGIN");
    const session = await resolveAndLockGuestSessionById(tx, sessionId);
    await requestGuestRetrieval(
      tx,
      session,
      { intentTtlSeconds: 300, maxAttempts: 4, policyVersion: 1 },
      false,
    );
    await tx.query("COMMIT");
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}

describe("Issue #414 initial guest Retrieval queue postlock timestamp", () => {
  it("holds one coherent Session/Request/Task/Dispatch/Audit time after a blocked Session lock", async () => {
    const fixture = await context.createDispatchFixture({
      sessionState: "PARKED",
    });
    const blocker = await context.adminPool.connect();
    await blocker.query("BEGIN");
    let held = true;
    try {
      await blocker.query(
        "SELECT id FROM valet_sessions WHERE id=$1 FOR UPDATE",
        [fixture.sessionId],
      );
      const pending = requestInTransaction(fixture.sessionId);
      // Keep the competing operation handled if this lock assertion fails.
      void pending.catch(() => undefined);
      let blocked = false;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const activity = await context.adminPool.query<{ blocked: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_stat_activity
             WHERE datname=current_database()
               AND wait_event_type='Lock'
               -- pg_stat_activity.query can truncate this long SQL statement
               -- before its trailing FOR UPDATE OF session.
               AND query LIKE '%FROM valet_sessions AS session%'
           ) AS blocked`,
        );
        if (activity.rows[0]?.blocked) {
          blocked = true;
          break;
        }
        await context.adminPool.query("SELECT pg_sleep(0.01)");
      }
      expect(blocked).toBe(true);
      await context.adminPool.query("SELECT pg_sleep(0.3)");
      const releasedAt = (
        await blocker.query<{ at: Date }>("SELECT clock_timestamp() AS at")
      ).rows[0]!.at;
      await blocker.query("COMMIT");
      held = false;
      await pending;

      const recorded = await context.adminPool.query<{
        audit_at: Date;
        dispatch_at: Date;
        requested_at: Date;
        session_at: Date;
        task_at: Date;
      }>(
        `SELECT audit.occurred_at AS audit_at,
                dispatch.occurred_at AS dispatch_at,
                request.requested_at,
                session.retrieval_requested_at AS session_at,
                task.created_at AS task_at
         FROM valet_sessions AS session
         INNER JOIN retrieval_requests AS request
           ON request.valet_session_id=session.id
         INNER JOIN tasks AS task
           ON task.valet_session_id=session.id AND task.task_type='RETRIEVAL'
         INNER JOIN dispatch_events AS dispatch
           ON dispatch.task_id=task.id AND dispatch.event_type='QUEUED'
         INNER JOIN audit_events AS audit
           ON audit.valet_session_id=session.id
          AND audit.event_type='RETRIEVAL_REQUESTED'
         WHERE session.id=$1 AND session.state='REQUESTED'`,
        [fixture.sessionId],
      );
      expect(recorded.rows).toHaveLength(1);
      const row = recorded.rows[0]!;
      expect(row.task_at.getTime()).toBeGreaterThanOrEqual(
        releasedAt.getTime() - 1,
      );
      for (const time of [
        row.audit_at,
        row.dispatch_at,
        row.requested_at,
        row.session_at,
      ]) {
        expect(time).toEqual(row.task_at);
      }
      const manager = await context.addMember(
        fixture,
        "LOCATION_MANAGER",
        false,
      );
      const readTx = await context.runtimePool.connect();
      try {
        expect(
          await readCurrentUncoveredTaskAlerts(readTx, {
            organizationId: fixture.organizationId,
            locationId: fixture.locationId,
            viewerUserId: manager.userId,
            viewerMembershipId: manager.membershipId,
            limit: 21,
            initialQueueDelaySeconds: 0,
            postDeclineDelaySeconds: 0,
            postLockClockCutover: new Date(0),
          }),
        ).toEqual([
          expect.objectContaining({
            category: "ALT-02",
            title: "Unassigned retrieval task",
          }),
        ]);
      } finally {
        readTx.release();
      }
    } finally {
      if (held) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });
});
