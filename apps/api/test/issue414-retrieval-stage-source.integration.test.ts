import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findRetrievalStageAlertCaseById,
  queryRetrievalStageAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-stage-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  phaseReaderInput,
  seedPhaseStage,
} from "./issue414-retrieval-phase-source-fixture";

const db = new DashboardOverviewTestContext("414-p2-stage-source");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

describe("Issue #414 ALT-04 current stage source proof", () => {
  it("projects current ACCEPTED then IN_PROGRESS using versioned source evidence", async () => {
    const input = await phaseReaderInput(db);
    const accepted = await seedPhaseStage(db, "ACCEPTED");
    const inProgress = await seedPhaseStage(db, "IN_PROGRESS");
    const read = () => inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, input));
    const actual = await read();
    expect(actual).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: accepted.taskId,
        episodeId: `${accepted.taskId}:3`, category: "ALT-04" }),
      expect.objectContaining({ sourceId: inProgress.taskId,
        episodeId: `${inProgress.taskId}:4`, category: "ALT-04" }),
    ]));
    expect(await inPostgresTransaction(db.runtimePool, tx =>
      findRetrievalStageAlertCaseById(tx, input,
        inProgress.taskId, `${inProgress.taskId}:4`)))
      .toMatchObject({ sourceId: inProgress.taskId });
    expect(await inPostgresTransaction(db.runtimePool, tx =>
      findRetrievalStageAlertCaseById(tx, input,
        inProgress.taskId, `${inProgress.taskId}:3`))).toBeNull();

    // Task remains IN_PROGRESS even after the physical Session becomes READY.
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='READY',ready_at=clock_timestamp() WHERE id=$1",
      [inProgress.sessionId],
    );
    expect((await read()).some(x => x.sourceId === inProgress.taskId)).toBe(false);
  });

  it("fails closed on same-ms Dispatch ambiguity, version drift and source cutoff", async () => {
    const input = await phaseReaderInput(db);
    const ambiguous = await seedPhaseStage(db, "ACCEPTED");
    const read = () => inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, input));
    expect((await read()).some(x => x.sourceId === ambiguous.taskId)).toBe(true);
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,
        event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
       VALUES ($1,$2,$3,$4,$5,'ACCEPTED',$6,$6,$7)`,
      [randomUUID(), fixture.organizationId, fixture.locationId,
        ambiguous.taskId, ambiguous.sessionId, fixture.membershipId, ambiguous.at],
    );
    expect((await read()).some(x => x.sourceId === ambiguous.taskId)).toBe(false);
    const drift = await seedPhaseStage(db, "IN_PROGRESS");
    await db.adminPool.query(
      "UPDATE tasks SET version=version+1 WHERE id=$1", [drift.taskId],
    );
    expect((await read()).some(x => x.sourceId === drift.taskId)).toBe(false);
    const old = await seedPhaseStage(db, "ACCEPTED");
    const equalCutover = await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, {
        ...input, postLockClockCutover: old.at,
      }));
    expect(equalCutover.some(x => x.sourceId === old.taskId)).toBe(false);
    const afterClock = { ...input, postLockClockCutover: new Date() };
    const filtered = await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, afterClock));
    expect(filtered.some(x => x.sourceId === old.taskId)).toBe(false);
  });

  it("retires prior ACCEPTED episode on current Task progression to IN_PROGRESS", async () => {
    const input = await phaseReaderInput(db);
    const stage = await seedPhaseStage(db, "ACCEPTED");
    const read = () => inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, input));
    expect((await read()).find(x => x.sourceId === stage.taskId)?.episodeId)
      .toBe(`${stage.taskId}:3`);
    const next = (await db.adminPool.query<{ at: Date }>(
      "SELECT (clock_timestamp()-interval '90 seconds')::timestamptz(3) AS at",
    )).rows[0]!.at;
    await db.adminPool.query(
      "UPDATE tasks SET status='IN_PROGRESS',version=4,updated_at=$2 WHERE id=$1",
      [stage.taskId, next],
    );
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='RETRIEVING',retrieval_started_at=$2 WHERE id=$1",
      [stage.sessionId, next],
    );
    await db.adminPool.query(
      "UPDATE retrieval_requests SET status='ACCEPTED' WHERE id=$1",
      [stage.requestId],
    );
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      `INSERT INTO audit_events
       (id,organization_id,location_id,valet_session_id,
        actor_membership_id,event_type,entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'VALET_SESSION_RETRIEVAL_STARTED',
         'VALET_SESSION',$4,$6::jsonb,$7)`,
      [randomUUID(), fixture.organizationId, fixture.locationId,
        stage.sessionId, fixture.membershipId,
        JSON.stringify({ fromTaskVersion: 3, toTaskVersion: 4,
          fromTaskStatus: "ACCEPTED", toTaskStatus: "IN_PROGRESS",
          toSessionState: "RETRIEVING", taskId: stage.taskId }), next],
    );
    await db.adminPool.query(
      `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,
        event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,'IN_PROGRESS',$6,$6,$7)`,
      [randomUUID(), fixture.organizationId, fixture.locationId,
        stage.taskId, stage.sessionId, fixture.membershipId, next],
    );
    const projected = (await read()).filter(x => x.sourceId === stage.taskId);
    expect(projected).toHaveLength(1);
    expect(projected[0]?.episodeId).toBe(`${stage.taskId}:4`);
    expect(projected[0]?.occurredAt).toBe(next.toISOString());
  });

  it("suppresses same-attempt ALT-04 as soon as saved SLA+grace is exceeded", async () => {
    const input = await phaseReaderInput(db);
    const stage = await seedPhaseStage(db, "ACCEPTED");
    const read = () => inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, input));
    expect((await read()).some(x => x.sourceId === stage.taskId)).toBe(true);
    await db.adminPool.query(
      "UPDATE retrieval_requests SET sla_target_seconds_snapshot=30 WHERE id=$1",
      [stage.requestId],
    );
    expect((await read()).some(x => x.sourceId === stage.taskId)).toBe(false);
  });

  it("proves globally newest 21 eligible after 21 newer SLA-suppressed same-ms sources", async () => {
    const input = await phaseReaderInput(db);
    const timestamps = await db.adminPool.query<{
      newer: Date; older: Date;
    }>(
      `SELECT (clock_timestamp()-interval '80 seconds')::timestamptz(3) AS newer,
              (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS older`,
    );
    const { newer, older } = timestamps.rows[0]!;
    // A naïve candidate LIMIT 21 would lose every eligible Task here.
    for (let count = 0; count < 21; count += 1) {
      const stale = await seedPhaseStage(db, "ACCEPTED", newer);
      await db.adminPool.query(
        "UPDATE retrieval_requests SET sla_target_seconds_snapshot=30 WHERE id=$1",
        [stale.requestId],
      );
    }
    const eligible: string[] = [];
    for (let count = 0; count < 23; count += 1) {
      const source = await seedPhaseStage(db, "ACCEPTED", older);
      eligible.push(source.taskId);
    }
    const items = await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, input));
    expect(items).toHaveLength(21);
    const expected = eligible.sort((left, right) => left < right ? 1 : -1)
      .slice(0, 21);
    expect(items.map(item => item.sourceId)).toEqual(expected);
    expect(items.every(item => item.occurredAt === older.toISOString()))
      .toBe(true);
  }, 60_000);

  it("denies revoked exact LM grant before source selection", async () => {
    const input = await phaseReaderInput(db);
    await seedPhaseStage(db, "ACCEPTED");
    await db.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [input.scope.membershipId],
    );
    await expect(inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalStageAlertCases(tx, input)))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
