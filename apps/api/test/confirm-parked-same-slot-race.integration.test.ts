import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("sameslotrace");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

type PostBindingFixture = Awaited<
  ReturnType<typeof context.createPostBindingFixture>
>;

async function addCompetingUnboundFixture(
  base: PostBindingFixture,
): Promise<PostBindingFixture> {
  const sessionId = await context.addSession(base);
  const queued = await context.queue({ ...base, sessionId });
  const assigned = await createAssignTaskCommandExecutor(context.runtimePool)({
    authenticatedUserId: base.userId,
    expectedVersion: queued.version,
    taskId: queued.taskId,
  });
  await createAcceptTaskCommandExecutor(context.runtimePool)({
    authenticatedUserId: base.userId,
    expectedVersion: assigned.version,
    taskId: queued.taskId,
  });
  const competitor: PostBindingFixture = {
    ...base,
    sessionId,
    taskId: queued.taskId,
  };
  await context.start(competitor, { session: 1, task: 3 });
  const resource = await context.addParkingResource(competitor);
  return {
    ...competitor,
    parkingSpotCode: resource.spot.code,
    parkingSpotId: resource.spot.id,
    parkingZoneId: resource.zone.id,
  };
}

async function physicalSnapshot(fixture: PostBindingFixture) {
  const session = await context.adminPool.query(
    `SELECT state::text, version, key_slot_id::text,
            parking_spot_id::text, parked_at
     FROM valet_sessions WHERE id = $1`,
    [fixture.sessionId],
  );
  const task = await context.adminPool.query(
    `SELECT status::text, version FROM tasks WHERE id = $1`,
    [fixture.taskId],
  );
  const events = await context.adminPool.query<{ count: number }>(
    `SELECT
       (SELECT count(*)::integer FROM key_custody_events
        WHERE valet_session_id = $1)
       + (SELECT count(*)::integer FROM audit_events
          WHERE valet_session_id = $1)
       + (SELECT count(*)::integer FROM dispatch_events
          WHERE task_id = $2) AS count`,
    [fixture.sessionId, fixture.taskId],
  );
  const tracking = await context.adminPool.query(
    `SELECT ended_at, started_at FROM task_tracking_sessions
     WHERE valet_session_id = $1 ORDER BY started_at, id`,
    [fixture.sessionId],
  );
  return {
    events: events.rows[0]?.count,
    session: session.rows[0],
    task: task.rows[0],
    tracking: tracking.rows,
  };
}

describe("DEC-068 same-slot binding race", () => {
  it("lets exactly one unbound session bind a contested free slot", async () => {
    const first = await context.createPostBindingFixture();
    const second = await addCompetingUnboundFixture(first);
    expect(second.keySlotCode).toBe(first.keySlotCode);
    // Shared monotonic custody ids make the winner's intra-transaction event
    // order assertable via ORDER BY id despite identical operation timestamps.
    let custodyEventSeq = 0;
    const custodyEventIdFactory = () => {
      custodyEventSeq += 1;
      return `00000000-0000-4000-8000-${String(custodyEventSeq).padStart(12, "0")}`;
    };
    const snapshots = [
      await physicalSnapshot(first),
      await physicalSnapshot(second),
    ];
    const results = await Promise.allSettled([
      context.confirm(
        first,
        { sessionVersion: 2, taskVersion: 4 },
        { custodyEventIdFactory },
      ),
      context.confirm(
        second,
        { sessionVersion: 2, taskVersion: 4 },
        { custodyEventIdFactory },
      ),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: "KEY_CUSTODY_NOT_READY" },
    });
    const winnerIndex = results[0].status === "fulfilled" ? 0 : 1;
    const winner = winnerIndex === 0 ? first : second;
    const loser = winnerIndex === 0 ? second : first;
    const winnerEffects = await context.completionEffects(winner);
    expect(winnerEffects.projection).toMatchObject({
      key_slot_id: winner.keySlotId,
      parking_spot_id: winner.parkingSpotId,
      session_state: "PARKED",
      session_version: 3,
      task_status: "COMPLETED",
      task_version: 5,
    });
    const winnerCustody = await context.adminPool.query<{ event_type: string }>(
      `SELECT event_type::text FROM key_custody_events
       WHERE valet_session_id = $1 ORDER BY id`,
      [winner.sessionId],
    );
    expect(winnerCustody.rows.map((event) => event.event_type)).toEqual([
      "SLOT_ASSIGNED",
      "RETURNED_TO_SLOT",
    ]);
    const winnerAudits = await context.adminPool.query<{ event_type: string }>(
      `SELECT event_type::text FROM audit_events
       WHERE valet_session_id = $1
         AND event_type IN
           ('VALET_SESSION_KEY_SLOT_ASSIGNED', 'VALET_SESSION_PARKED')`,
      [winner.sessionId],
    );
    expect(winnerAudits.rows.map((audit) => audit.event_type).sort()).toEqual([
      "VALET_SESSION_KEY_SLOT_ASSIGNED",
      "VALET_SESSION_PARKED",
    ]);
    const loserAfter = await physicalSnapshot(loser);
    expect(loserAfter).toEqual(snapshots[winnerIndex === 0 ? 1 : 0]);
  });
});
