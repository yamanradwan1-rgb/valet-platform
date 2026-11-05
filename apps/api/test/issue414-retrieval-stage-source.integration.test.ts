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
  restoreTrustedPhaseTestCutover,
  seedPhaseStage,
  setTrustedPhaseTestCutover,
} from "./issue414-retrieval-phase-source-fixture";

const db = new DashboardOverviewTestContext("414-p2-stage-source");
beforeAll(() => db.setup(), 120_000);
afterAll(async () => {
  restoreTrustedPhaseTestCutover();
  await db.teardown();
}, 120_000);

describe("Issue #414 ALT-04 current stage source proof", () => {
  it("projects current ACCEPTED then IN_PROGRESS using versioned source evidence", async () => {
    const input = await phaseReaderInput(db);
    const accepted = await seedPhaseStage(db, "ACCEPTED");
    const inProgress = await seedPhaseStage(db, "IN_PROGRESS");
    const read = () =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalStageAlertCases(tx, input),
      );
    const actual = await read();
    expect(actual).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: accepted.taskId,
          episodeId: `${accepted.taskId}:3`,
          category: "ALT-04",
        }),
        expect.objectContaining({
          sourceId: inProgress.taskId,
          episodeId: `${inProgress.taskId}:4`,
          category: "ALT-04",
        }),
      ]),
    );
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        findRetrievalStageAlertCaseById(
          tx,
          input,
          inProgress.taskId,
          `${inProgress.taskId}:4`,
        ),
      ),
    ).toMatchObject({ sourceId: inProgress.taskId });
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        findRetrievalStageAlertCaseById(
          tx,
          input,
          inProgress.taskId,
          `${inProgress.taskId}:3`,
        ),
      ),
    ).toBeNull();

    // Task remains IN_PROGRESS even after the physical Session becomes READY.
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='READY',ready_at=clock_timestamp() WHERE id=$1",
      [inProgress.sessionId],
    );
    expect((await read()).some((x) => x.sourceId === inProgress.taskId)).toBe(
      false,
    );
  });

  it("fails closed on same-ms Dispatch ambiguity, version drift and source cutoff", async () => {
    const input = await phaseReaderInput(db);
    const ambiguous = await seedPhaseStage(db, "ACCEPTED");
    const read = () =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalStageAlertCases(tx, input),
      );
    expect((await read()).some((x) => x.sourceId === ambiguous.taskId)).toBe(
      true,
    );
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,
        event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
       VALUES ($1,$2,$3,$4,$5,'ACCEPTED',$6,$6,$7)`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        ambiguous.taskId,
        ambiguous.sessionId,
        ambiguous.actorMembershipId,
        ambiguous.at,
      ],
    );
    expect((await read()).some((x) => x.sourceId === ambiguous.taskId)).toBe(
      false,
    );
    const drift = await seedPhaseStage(db, "IN_PROGRESS");
    await db.adminPool.query("UPDATE tasks SET version=version+1 WHERE id=$1", [
      drift.taskId,
    ]);
    expect((await read()).some((x) => x.sourceId === drift.taskId)).toBe(false);
    const old = await seedPhaseStage(db, "ACCEPTED");
    setTrustedPhaseTestCutover(old.at);
    const equalCutover = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryRetrievalStageAlertCases(tx, {
        ...input,
        postLockClockCutover: old.at,
      }),
    );
    expect(equalCutover.some((x) => x.sourceId === old.taskId)).toBe(false);
    const afterClock = { ...input, postLockClockCutover: new Date() };
    setTrustedPhaseTestCutover(afterClock.postLockClockCutover);
    const filtered = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryRetrievalStageAlertCases(tx, afterClock),
    );
    expect(filtered.some((x) => x.sourceId === old.taskId)).toBe(false);
  });

  it("retires prior ACCEPTED episode on current Task progression to IN_PROGRESS", async () => {
    const input = await phaseReaderInput(db);
    const stage = await seedPhaseStage(db, "ACCEPTED");
    const read = () =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalStageAlertCases(tx, input),
      );
    expect(
      (await read()).find((x) => x.sourceId === stage.taskId)?.episodeId,
    ).toBe(`${stage.taskId}:3`);
    const next = (
      await db.adminPool.query<{ at: Date }>(
        "SELECT (clock_timestamp()-interval '90 seconds')::timestamptz(3) AS at",
      )
    ).rows[0]!.at;
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
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        stage.sessionId,
        stage.actorMembershipId,
        JSON.stringify({
          fromTaskVersion: 3,
          toTaskVersion: 4,
          fromTaskStatus: "ACCEPTED",
          toTaskStatus: "IN_PROGRESS",
          toSessionState: "RETRIEVING",
          taskId: stage.taskId,
        }),
        next,
      ],
    );
    await db.adminPool.query(
      `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,
        event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,'IN_PROGRESS',$6,$6,$7)`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        stage.taskId,
        stage.sessionId,
        stage.actorMembershipId,
        next,
      ],
    );
    const projected = (await read()).filter((x) => x.sourceId === stage.taskId);
    expect(projected).toHaveLength(1);
    expect(projected[0]?.episodeId).toBe(`${stage.taskId}:4`);
    expect(projected[0]?.occurredAt).toBe(next.toISOString());
  });

  it("suppresses same-attempt ALT-04 as soon as saved SLA+grace is exceeded", async () => {
    const input = await phaseReaderInput(db);
    const stage = await seedPhaseStage(db, "ACCEPTED");
    const read = () =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalStageAlertCases(tx, input),
      );
    expect((await read()).some((x) => x.sourceId === stage.taskId)).toBe(true);
    // A saved SLA snapshot is immutable. Seed the independent candidate with
    // its SLA on INSERT; do not invent an impossible post-commit SLA rewrite.
    const overdue = await seedPhaseStage(db, "ACCEPTED", undefined, 30);
    expect((await read()).some((x) => x.sourceId === overdue.taskId)).toBe(
      false,
    );
    expect((await read()).some((x) => x.sourceId === stage.taskId)).toBe(true);
  });

  it("proves globally newest 21 eligible after 21 newer SLA-suppressed same-ms sources", async () => {
    // An earlier case in this file leaves an independently valid IN_PROGRESS
    // occurrence at now-90s. Reusing that Location contaminates the global
    // top-21 comparison, whose fixtures are intentionally at now-120s.
    // Give this pagination proof its own disposable tenant database.
    const paginationDb = new DashboardOverviewTestContext(
      "414-p2-stage-pagination",
    );
    try {
      await paginationDb.setup();
      const input = await phaseReaderInput(paginationDb);
      const timestamps = await paginationDb.adminPool.query<{
        newer: Date;
        older: Date;
      }>(
        `SELECT (clock_timestamp()-interval '80 seconds')::timestamptz(3) AS newer,
                (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS older`,
      );
      const { newer, older } = timestamps.rows[0]!;
      // A naïve candidate LIMIT 21 would lose every eligible Task here.
      const suppressed: string[] = [];
      for (let count = 0; count < 21; count += 1) {
        suppressed.push(
          (await seedPhaseStage(paginationDb, "ACCEPTED", newer, 30)).taskId,
        );
      }
      const eligible: string[] = [];
      for (let count = 0; count < 23; count += 1) {
        const source = await seedPhaseStage(paginationDb, "ACCEPTED", older);
        eligible.push(source.taskId);
      }
      const items = await inPostgresTransaction(
        paginationDb.runtimePool,
        (tx) => queryRetrievalStageAlertCases(tx, input),
      );
      expect(items).toHaveLength(21);
      const expected = eligible
        .sort((left, right) => (left < right ? 1 : -1))
        .slice(0, 21);
      expect(items.map((item) => item.sourceId)).toEqual(expected);
      expect(
        items.every((item) => item.occurredAt === older.toISOString()),
      ).toBe(true);
      expect(items.some((item) => suppressed.includes(item.sourceId))).toBe(
        false,
      );
    } finally {
      await paginationDb.teardown();
    }
  }, 60_000);
});
