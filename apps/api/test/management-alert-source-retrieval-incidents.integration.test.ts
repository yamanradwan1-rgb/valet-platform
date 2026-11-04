import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findRetrievalSlaAlertCaseById,
  queryRetrievalSlaAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-sla-alert-reader";
import {
  findIncidentAlertCaseById,
  queryIncidentAlertCases,
} from "../src/modules/dashboard/management-alert-sources/incident-alert-reader";
import type { ManagementAlertReaderInput } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const db = new DashboardOverviewTestContext(
  "414-alert-sources-retrieval-incidents",
);

beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

async function readerInput(limit = 21): Promise<ManagementAlertReaderInput> {
  const fixture = await db.managerFixture();
  return {
    context: await db.staffSessionContext(fixture.userId),
    scope: {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      membershipId: fixture.membershipId,
    },
    limit,
  };
}

describe("Issue #414 P1 authoritative ALT-01 and ALT-08 source probes", () => {
  it("exposes only the current covered overdue retrieval attempt, retires cancel/READY and honors grace", async () => {
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      "UPDATE locations SET sla_target_seconds=30 WHERE id=$1",
      [fixture.locationId],
    );
    const sessionId = await db.seedSession({ state: "REQUESTED" });
    const oldRequest = await db.seedRetrievalRequest({
      sessionId,
      requestedAgoMinutes: 10,
      status: "OPEN",
    });
    await db.adminPool.query(
      "UPDATE retrieval_requests SET status='CANCELLED' WHERE id=$1",
      [oldRequest],
    );
    const requestId = await db.seedRetrievalRequest({
      sessionId,
      requestedAgoMinutes: 2,
      status: "OPEN",
    });
    await db.adminPool.query(
      `UPDATE valet_sessions SET retrieval_requested_at=
         (SELECT requested_at FROM retrieval_requests WHERE id=$2)
       WHERE id=$1`,
      [sessionId, requestId],
    );
    const input = await readerInput();
    const read = (graceSeconds: number) =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalSlaAlertCases(tx, { ...input, graceSeconds }),
      );
    expect((await read(0)).map((item) => item.sourceId)).toEqual([requestId]);
    const cases = await read(60);
    expect(cases).toMatchObject([
      {
        category: "ALT-01",
        severity: "CRITICAL",
        sourceKind: "RETRIEVAL",
        episodeId: requestId,
        title: "Retrieval SLA exceeded",
      },
    ]);
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        findRetrievalSlaAlertCaseById(tx, {
          context: input.context,
          scope: input.scope,
          sourceId: requestId,
          graceSeconds: 60,
        }),
      ),
    ).toMatchObject({ sourceId: requestId, valetSessionId: sessionId });
    await db.adminPool.query(
      "UPDATE retrieval_requests SET status='CANCELLED' WHERE id=$1",
      [requestId],
    );
    expect(await read(0)).toEqual([]);
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        findRetrievalSlaAlertCaseById(tx, {
          context: input.context,
          scope: input.scope,
          sourceId: requestId,
          graceSeconds: 0,
        }),
      ),
    ).toBeNull();
    await db.adminPool.query(
      "UPDATE valet_sessions SET state='READY', ready_at=clock_timestamp() WHERE id=$1",
      [sessionId],
    );
    expect(await read(0)).toEqual([]);
  });

  it("excludes NULL saved SLA, is strict at unbreached elapsed time and rejects invalid personal grace", async () => {
    const fixture = await db.managerFixture();
    await db.adminPool.query(
      "UPDATE locations SET sla_target_seconds=NULL WHERE id=$1",
      [fixture.locationId],
    );
    const uncovered = await db.seedSession({ state: "REQUESTED" });
    const uncoveredRequest = await db.seedRetrievalRequest({
      sessionId: uncovered,
      requestedAgoMinutes: 10,
      status: "OPEN",
    });
    await db.adminPool.query(
      `UPDATE valet_sessions SET retrieval_requested_at=
         (SELECT requested_at FROM retrieval_requests WHERE id=$2)
       WHERE id=$1`,
      [uncovered, uncoveredRequest],
    );
    await db.adminPool.query(
      "UPDATE locations SET sla_target_seconds=300 WHERE id=$1",
      [fixture.locationId],
    );
    const recent = await db.seedSession({ state: "REQUESTED" });
    const recentRequest = await db.seedRetrievalRequest({
      sessionId: recent,
      requestedAgoMinutes: 1,
      status: "OPEN",
    });
    await db.adminPool.query(
      `UPDATE valet_sessions SET retrieval_requested_at=
         (SELECT requested_at FROM retrieval_requests WHERE id=$2)
       WHERE id=$1`,
      [recent, recentRequest],
    );
    const input = await readerInput();
    const result = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryRetrievalSlaAlertCases(tx, { ...input, graceSeconds: 0 }),
    );
    expect(result.map((item) => item.sourceId)).not.toContain(uncoveredRequest);
    expect(result.map((item) => item.sourceId)).not.toContain(recentRequest);
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalSlaAlertCases(tx, { ...input, graceSeconds: 61 }),
      ),
    ).rejects.toThrow("ALT-01 grace");
  });

  it("filters severity/status before LIMIT, preserves exact incident ID and redacts narrative", async () => {
    const fixture = await db.managerFixture();
    const sessionId = await db.seedSession({ state: "PARKED" });
    const qualified = await Promise.all(
      Array.from({ length: 22 }, () =>
        db.seedIncident({ sessionId, status: "OPEN" }),
      ),
    );
    const critical = randomUUID();
    await db.adminPool.query(
      `INSERT INTO incidents
        (id,organization_id,location_id,valet_session_id,status,severity,type,
         description,reported_by_membership_id,created_at)
       VALUES($1,$2,$3,$4,'OPEN','CRITICAL','KEY_MISSING','private incident',$5,
         clock_timestamp()-interval '1 day')`,
      [
        critical,
        fixture.organizationId,
        fixture.locationId,
        sessionId,
        fixture.membershipId,
      ],
    );
    const investigating = await db.seedIncident({
      sessionId,
      status: "INVESTIGATING",
    });
    const resolved = await db.seedIncident({ sessionId, status: "RESOLVED" });
    for (let i = 0; i < 26; i++) {
      await db.adminPool.query(
        `INSERT INTO incidents
          (id,organization_id,location_id,valet_session_id,status,severity,type,
           description,reported_by_membership_id)
         VALUES($1,$2,$3,$4,'OPEN','LOW','OTHER','private incident',$5)`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.locationId,
          sessionId,
          fixture.membershipId,
        ],
      );
    }
    const input = await readerInput();
    const cases = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryIncidentAlertCases(tx, input),
    );
    expect(cases).toHaveLength(21);
    expect(cases.some((item) => qualified.includes(item.sourceId))).toBe(true);
    expect(cases.map((item) => item.sourceId)).not.toContain(resolved);
    expect(cases.map((item) => item.sourceId)).toContain(investigating);
    expect(
      cases.every((item) =>
        Object.keys(item).every(
          (key) => !["description", "resolutionNotes", "type"].includes(key),
        ),
      ),
    ).toBe(true);
    expect(
      cases.some(
        (item) => item.sourceId === critical && item.severity === "CRITICAL",
      ),
    ).toBe(true);
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        findIncidentAlertCaseById(tx, {
          context: input.context,
          scope: input.scope,
          sourceId: resolved,
        }),
      ),
    ).toBeNull();
  });

  it("denies a forged scope and a current Location Manager with no grant", async () => {
    const fixture = await db.managerFixture();
    const input = await readerInput();
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryIncidentAlertCases(tx, {
          ...input,
          scope: { ...input.scope, organizationId: randomUUID() },
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const stranger = await db.createActor(fixture, "LOCATION_MANAGER", {
      access: false,
    });
    const context = await db.staffSessionContext(stranger.userId);
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryIncidentAlertCases(tx, {
          ...input,
          context,
          scope: { ...input.scope, membershipId: stranger.membershipId },
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
