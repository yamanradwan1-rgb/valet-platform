import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findRetrievalSlaAlertCaseById,
  queryRetrievalSlaAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-sla-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const db = new DashboardOverviewTestContext("414-alert-retrieval-phase");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

async function currentReader() {
  const fixture = await db.managerFixture();
  const context = await db.staffSessionContext(fixture.userId);
  const scope = {
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    membershipId: fixture.membershipId,
  };
  const list = () =>
    inPostgresTransaction(db.runtimePool, (tx) =>
      queryRetrievalSlaAlertCases(tx, {
        context,
        scope,
        limit: 21,
        graceSeconds: 0,
      }),
    );
  const exact = (sourceId: string) =>
    inPostgresTransaction(db.runtimePool, (tx) =>
      findRetrievalSlaAlertCaseById(tx, {
        context,
        scope,
        sourceId,
        graceSeconds: 0,
      }),
    );
  return { list, exact };
}

describe("Issue #414 ALT-01 persisted attempt lifecycle and SLA boundary", () => {
  it("tracks ACCEPTED/RETRIEVING, then retires on READY even with a live ACCEPTED request", async () => {
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      "UPDATE locations SET sla_target_seconds=30 WHERE id=$1",
      [fixture.locationId],
    );
    const sessionId = await db.seedSession({ state: "REQUESTED" });
    const requestId = await db.seedRetrievalRequest({
      requestedAgoMinutes: 10,
      sessionId,
      status: "OPEN",
    });
    await db.adminPool.query(
      `UPDATE valet_sessions SET retrieval_requested_at=
         (SELECT requested_at FROM retrieval_requests WHERE id=$2)
       WHERE id=$1`,
      [sessionId, requestId],
    );
    const reader = await currentReader();
    expect((await reader.list()).map((item) => item.sourceId)).toContain(
      requestId,
    );
    await db.adminPool.query(
      "UPDATE retrieval_requests SET status='ACCEPTED' WHERE id=$1",
      [requestId],
    );
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='RETRIEVING',retrieval_started_at=clock_timestamp() WHERE id=$1",
      [sessionId],
    );
    expect((await reader.list()).map((item) => item.sourceId)).toContain(
      requestId,
    );
    expect(await reader.exact(requestId)).toMatchObject({
      sourceId: requestId,
      valetSessionId: sessionId,
      severity: "CRITICAL",
    });
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='READY',ready_at=clock_timestamp() WHERE id=$1",
      [sessionId],
    );
    const live = await db.adminPool.query(
      "SELECT 1 FROM retrieval_requests WHERE id=$1 AND status='ACCEPTED'",
      [requestId],
    );
    expect(live.rowCount).toBe(1);
    expect(await reader.list()).toEqual([]);
    expect(await reader.exact(requestId)).toBeNull();
  });

  it("does not alert before saved SLA equality, then alerts after strict crossing", async () => {
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      "UPDATE locations SET sla_target_seconds=30 WHERE id=$1",
      [fixture.locationId],
    );
    const sessionId = await db.seedSession({ state: "REQUESTED" });
    const requestId = randomUUID();
    await db.adminPool.query(
      `INSERT INTO retrieval_requests
         (id,organization_id,valet_session_id,requested_by_type,status,requested_at)
       VALUES($1,$2,$3,'CUSTOMER','OPEN',clock_timestamp()-interval '28 seconds')`,
      [requestId, fixture.organizationId, sessionId],
    );
    await db.adminPool.query(
      `UPDATE valet_sessions SET retrieval_requested_at=
         (SELECT requested_at FROM retrieval_requests WHERE id=$2)
       WHERE id=$1`,
      [sessionId, requestId],
    );
    const reader = await currentReader();
    // PostgreSQL clock_timestamp cannot be frozen: prove each side of equality.
    expect((await reader.list()).map((item) => item.sourceId)).not.toContain(
      requestId,
    );
    await db.adminPool.query("SELECT pg_sleep(2.5)");
    expect((await reader.list()).map((item) => item.sourceId)).toContain(
      requestId,
    );
  });
});
