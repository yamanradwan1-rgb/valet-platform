import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findRetrievalReadyAlertCaseById,
  queryRetrievalReadyAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-ready-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  phaseReaderInput,
  restoreTrustedPhaseTestCutover,
  seedPhaseReady,
  setTrustedPhaseTestCutover,
} from "./issue414-retrieval-phase-source-fixture";

const db = new DashboardOverviewTestContext("414-p2-ready-source");
beforeAll(() => db.setup(), 120_000);
afterAll(async () => {
  restoreTrustedPhaseTestCutover();
  await db.teardown();
}, 120_000);

describe("Issue #414 ALT-06 original READY phase source proof", () => {
  it("retains same audited READY anchor across handoff, abort and reinitiate", async () => {
    const input = await phaseReaderInput(db);
    const source = await seedPhaseReady(db);
    const read = () => inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, input));
    const find = (expectedEpisodeId: string) =>
      inPostgresTransaction(db.runtimePool, tx =>
        findRetrievalReadyAlertCaseById(tx, input, source.sessionId,
          expectedEpisodeId));
    expect(await find(source.auditId)).toMatchObject({
      category: "ALT-06", sourceId: source.sessionId,
      episodeId: source.auditId, occurredAt: source.at.toISOString(),
    });
    expect(await find(randomUUID())).toBeNull();
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='HANDOFF_PENDING',handoff_pending_at=clock_timestamp() WHERE id=$1",
      [source.sessionId],
    );
    expect(await find(source.auditId)).toMatchObject({ episodeId: source.auditId });
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='READY',handoff_pending_at=NULL WHERE id=$1",
      [source.sessionId],
    );
    expect(await find(source.auditId)).toMatchObject({ episodeId: source.auditId });
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='HANDOFF_PENDING',handoff_pending_at=clock_timestamp() WHERE id=$1",
      [source.sessionId],
    );
    expect(await find(source.auditId)).toMatchObject({ episodeId: source.auditId });
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='COMPLETED',completed_at=clock_timestamp() WHERE id=$1",
      [source.sessionId],
    );
    expect((await read()).some(x => x.sourceId === source.sessionId)).toBe(false);
  });

  it("fails closed on same-ms duplicate READY Audit and unproven pre-cutover source", async () => {
    const input = await phaseReaderInput(db);
    const source = await seedPhaseReady(db);
    const read = () => inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, input));
    expect((await read()).some(x => x.sourceId === source.sessionId)).toBe(true);
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      `INSERT INTO audit_events
        (id,organization_id,location_id,valet_session_id,
         actor_membership_id,event_type,entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'VALET_SESSION_READY','VALET_SESSION',$4,$6::jsonb,$7)`,
      [randomUUID(), fixture.organizationId, fixture.locationId,
        source.sessionId, fixture.membershipId,
        JSON.stringify({ fromState: "RETRIEVING", toState: "READY",
          taskId: source.taskId, toVersion: 9 }), source.at],
    );
    expect((await read()).some(x => x.sourceId === source.sessionId)).toBe(false);
    const newer = await seedPhaseReady(db);
    setTrustedPhaseTestCutover(newer.at);
    const equalCutover = await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, {
        ...input, postLockClockCutover: newer.at,
      }));
    expect(equalCutover.some(x => x.sourceId === newer.sessionId)).toBe(false);
    setTrustedPhaseTestCutover(new Date());
    const gated = await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, {
        ...input, postLockClockCutover:
          new Date(process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER!),
      }));
    expect(gated.some(x => x.sourceId === newer.sessionId)).toBe(false);
  });

  it("denies stale LM grant before examining handoff source", async () => {
    const input = await phaseReaderInput(db);
    await seedPhaseReady(db);
    await db.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [input.scope.membershipId],
    );
    await expect(inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, input)))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("does not expose a READY Session through another granted LM Location", async () => {
    const input = await phaseReaderInput(db);
    const source = await seedPhaseReady(db);
    const fixture = await db.managerFixture();
    const otherLocationId = await db.addLocation(fixture);
    const otherScope = {
      ...input,
      scope: { ...input.scope, locationId: otherLocationId },
    };
    expect((await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, otherScope)))
      .some(item => item.sourceId === source.sessionId)).toBe(false);
    expect(await inPostgresTransaction(db.runtimePool, tx =>
      findRetrievalReadyAlertCaseById(tx, otherScope,
        source.sessionId, source.auditId))).toBeNull();
  });

  it("fails closed without throwing on a persisted out-of-range JSON version", async () => {
    const input = await phaseReaderInput(db);
    const valid = await seedPhaseReady(db);
    const corrupt = await seedPhaseReady(db);
    await db.adminPool.query(
      `UPDATE audit_events
       SET metadata_json=jsonb_set(metadata_json,'{toVersion}',
         '9999999999999999999999999999999999999999999999'::jsonb)
       WHERE id=$1`,
      [corrupt.auditId],
    );
    const actual = await inPostgresTransaction(db.runtimePool, tx =>
      queryRetrievalReadyAlertCases(tx, input));
    expect(actual.some(item => item.sourceId === valid.sessionId)).toBe(true);
    expect(actual.some(item => item.sourceId === corrupt.sessionId)).toBe(false);
  });
});
