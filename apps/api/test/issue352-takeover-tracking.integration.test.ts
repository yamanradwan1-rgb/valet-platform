import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import { Issue352TakeoverTestContext, takeoverTaskId } from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("tracking");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const execute = () => createEmergencyTakeoverCommandExecutor(context.runtimePool);

async function trackedParking() {
  const source = await context.createStartParkingFixture({ assignKey: false });
  await context.adminPool.query(
    `UPDATE organizations SET tracking_enabled = true,
            updated_at = clock_timestamp() WHERE id = $1`,
    [source.organizationId],
  );
  await context.start(source, { session: 1, task: 3 });
  return source;
}

async function trackers(sessionId: string) {
  const result = await context.adminPool.query<{
    assignee_membership_id: string | null;
    ended_at: Date | null;
    id: string;
    started_at: Date;
  }>(
    `SELECT id::text, assignee_membership_id::text, started_at, ended_at
     FROM task_tracking_sessions WHERE valet_session_id = $1
     ORDER BY started_at, id`,
    [sessionId],
  );
  return result.rows;
}

async function sample() {
  const now = await context.adminPool.query<{ now: Date }>(
    `SELECT clock_timestamp()::timestamptz(3) AS now`,
  );
  return {
    accuracyMeters: 8,
    capturedAt: now.rows[0]!.now.toISOString(),
    clientSampleId: randomUUID(),
    latitude: 31.9539,
    longitude: 35.9106,
  };
}

describe("Issue #352 real PostgreSQL GPS and custody provenance", () => {
  it("closes A segment and creates distinct B segment with immutable owners", async () => {
    const source = await trackedParking();
    const { initiator, replacement } = await context.actors(source);
    const before = await trackers(source.sessionId);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      assignee_membership_id: source.membershipId,
      ended_at: null,
    });
    const result = await execute()(await context.request(source, initiator, replacement));
    expect(result.replayed).toBe(false);
    const after = await trackers(source.sessionId);
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({
      id: before[0]!.id,
      assignee_membership_id: source.membershipId,
    });
    expect(after[0]?.ended_at).not.toBeNull();
    expect(after[1]).toMatchObject({
      assignee_membership_id: replacement.membershipId,
      ended_at: null,
    });
    expect(after[1]?.id).not.toBe(before[0]!.id);
    expect(after[0]?.ended_at?.getTime()).toBe(after[1]?.started_at.getTime());
  });

  it("keeps A GPS sample historical while authorizing B's new segment", async () => {
    const source = await trackedParking();
    const { initiator, replacement } = await context.actors(source);
    const ingest = createGpsIngestionCommandExecutor(context.runtimePool);
    await ingest({ authenticatedUserId: source.userId,
      sessionId: source.sessionId, samples: [await sample()] });
    const first = (await trackers(source.sessionId))[0]!;
    await execute()(await context.request(source, initiator, replacement));
    await expect(ingest({ authenticatedUserId: source.userId,
      sessionId: source.sessionId, samples: [await sample()] }))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    await ingest({ authenticatedUserId: replacement.userId,
      sessionId: source.sessionId, samples: [await sample()] });
    const after = await trackers(source.sessionId);
    const counts = await context.adminPool.query<{ count: number; tracking_session_id: string }>(
      `SELECT tracking_session_id::text, count(*)::int AS count
       FROM raw_gps_samples WHERE valet_session_id = $1
       GROUP BY tracking_session_id ORDER BY tracking_session_id`,
      [source.sessionId],
    );
    expect(counts.rows).toHaveLength(2);
    expect(counts.rows.find((row) => row.tracking_session_id === first.id)?.count)
      .toBe(1);
    expect(counts.rows.find((row) => row.tracking_session_id === after[1]?.id)?.count)
      .toBe(1);
  });

  it("does not create a movement segment when tracking policy is disabled", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    expect(await trackers(source.sessionId)).toHaveLength(0);
    await execute()(await context.request(source, initiator, replacement));
    expect(await trackers(source.sessionId)).toHaveLength(0);
    expect((await context.snapshot(source.taskId)).task_assignee)
      .toBe(replacement.membershipId);
  });

  it("fails closed rather than attributing an active legacy NULL segment to A", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id,
          task_id, assignee_membership_id, started_at)
       VALUES ($1,$2,$3,$4,$5,NULL,clock_timestamp())`,
      [randomUUID(), source.organizationId, source.locationId,
       source.sessionId, source.taskId],
    );
    const before = await context.snapshot(source.taskId);
    await expect(execute()(await context.request(source, initiator, replacement)))
      .rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
    expect((await trackers(source.sessionId))[0]?.assignee_membership_id).toBeNull();
  });

  it("does not revive A's old checkout evidence after an A→B→A cycle", async () => {
    const source = await context.retrieving();
    const { initiator, replacement } = await context.actors(source);
    await execute()(await context.request(source, initiator, replacement));
    await execute()(await context.request(source, initiator, {
      membershipId: source.membershipId, userId: source.userId,
    }));
    const session = await context.snapshot(takeoverTaskId(source));
    expect(session.task_assignee).toBe(source.membershipId);
    await expect(createMarkReadyCommandExecutor(context.runtimePool)({
      authenticatedUserId: source.userId,
      expectedSessionVersion: session.session_version,
      sessionId: source.sessionId,
    })).rejects.toMatchObject({ code: "KEY_CUSTODY_NOT_READY" });
    expect((await context.snapshot(takeoverTaskId(source))).session_state)
      .toBe("RETRIEVING");
  });
});
