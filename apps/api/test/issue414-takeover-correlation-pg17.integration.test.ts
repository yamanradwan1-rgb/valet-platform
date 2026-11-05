import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import {
  findEmergencyTakeoverAlertOccurrence,
  queryEmergencyTakeoverAlertOccurrences,
} from "../src/modules/dashboard/management-alert-sources/emergency-takeover-occurrence-reader";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

// Prepared for Prime-owned, exclusive disposable PG17 lease. Never shared DB.
const db = new Issue352TakeoverTestContext("414_takeover_correlation");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

type Mismatch =
  | "DISPATCH_ACTOR"
  | "DISPATCH_PREVIOUS"
  | "DISPATCH_NEW"
  | "AUDIT_ACTOR"
  | "AUDIT_OPERATION"
  | "AUDIT_PREVIOUS"
  | "AUDIT_NEW"
  | "AUDIT_TASK_VERSION"
  | "AUDIT_SESSION_VERSION";

describe("Issue #414 ALT-05 exact committed takeover attribution", () => {
  it("accepts the authenticated Issue #352 writer once, replays the same occurrence, denies forged join shapes", async () => {
    const source = await db.parking();
    const { admin, initiator, replacement } = await db.actors(source);
    await db.adminPool.query(
      `INSERT INTO organization_subscriptions
         (organization_id,plan_code,status,dashboard_access_enabled,
          report_exports_enabled,basic_branding_enabled)
       VALUES($1,'TEST_ENTITLED','ACTIVE',TRUE,TRUE,TRUE)
       ON CONFLICT (organization_id) DO UPDATE
       SET dashboard_access_enabled=TRUE,status='ACTIVE',
           updated_at=clock_timestamp()`,
      [source.organizationId],
    );
    const staffSessionContext = await db.credential(admin.userId, true);
    const request = {
      ...(await db.request(source, admin, replacement)),
      staffSessionContext,
    };
    const execute = createEmergencyTakeoverCommandExecutor(db.runtimePool);
    const first = await execute(request);
    expect(first).toMatchObject({ operationId: request.operationId, replayed: false });
    const readerInput = {
      context: staffSessionContext,
      scope: {
        organizationId: source.organizationId,
        locationId: source.locationId,
        membershipId: admin.membershipId,
      },
      limit: 21,
    };
    const read = () => inPostgresTransaction(db.runtimePool, (tx) =>
      queryEmergencyTakeoverAlertOccurrences(tx, readerInput),
    );
    const exact = (sourceId: string) => inPostgresTransaction(db.runtimePool, (tx) =>
      findEmergencyTakeoverAlertOccurrence(tx, { ...readerInput, sourceId }),
    );
    expect(await exact(request.operationId)).toMatchObject({
      sourceId: request.operationId,
      episodeId: request.operationId,
      category: "ALT-05",
      taskId: source.taskId,
    });
    expect(await execute(request)).toEqual({ ...first, replayed: true });
    expect((await read()).filter((row) => row.sourceId === request.operationId))
      .toHaveLength(1);

    // All fixtures have valid FKs, same Organization/Location/Task/Session,
    // exact linked Event IDs and identical timestamps. Only the provenance
    // attribution differs, so every case must fail closed before projection.
    const mismatches: readonly Mismatch[] = [
      "DISPATCH_ACTOR", "DISPATCH_PREVIOUS", "DISPATCH_NEW",
      "AUDIT_ACTOR", "AUDIT_OPERATION", "AUDIT_PREVIOUS", "AUDIT_NEW",
      "AUDIT_TASK_VERSION", "AUDIT_SESSION_VERSION",
    ];
    const forgedIds: string[] = [];
    for (const mismatch of mismatches) {
      const operationId = randomUUID();
      const dispatchId = randomUUID();
      const auditId = randomUUID();
      const occurredAt = await db.adminPool.query<{ at: Date }>(
        "SELECT clock_timestamp()::timestamptz(3) AS at",
      );
      const at = occurredAt.rows[0]!.at;
      const original = source.membershipId;
      const target = replacement.membershipId;
      const wrong = initiator.membershipId;
      await db.adminPool.query(
        `INSERT INTO dispatch_events
           (id,organization_id,location_id,task_id,valet_session_id,
            event_type,actor_membership_id,previous_assignee_membership_id,
            new_assignee_membership_id,reason,occurred_at)
         VALUES($1,$2,$3,$4,$5,'EMERGENCY_TAKEOVER',$6,$7,$8,'PRIVATE',$9)`,
        [dispatchId, source.organizationId, source.locationId,
          source.taskId, source.sessionId,
          mismatch === "DISPATCH_ACTOR" ? wrong : admin.membershipId,
          mismatch === "DISPATCH_PREVIOUS" ? wrong : original,
          mismatch === "DISPATCH_NEW" ? wrong : target, at],
      );
      const metadata = {
        operationId: mismatch === "AUDIT_OPERATION" ? randomUUID() : operationId,
        sessionId: source.sessionId,
        previousAssigneeMembershipId:
          mismatch === "AUDIT_PREVIOUS" ? wrong : original,
        newAssigneeMembershipId: mismatch === "AUDIT_NEW" ? wrong : target,
        reason: "PRIVATE",
        fromStatus: "IN_PROGRESS",
        toStatus: "IN_PROGRESS",
        fromVersion: mismatch === "AUDIT_TASK_VERSION" ? 19 : 1,
        toVersion: 2,
        fromSessionVersion: mismatch === "AUDIT_SESSION_VERSION" ? 19 : 1,
        toSessionVersion: 2,
      };
      await db.adminPool.query(
        `INSERT INTO audit_events
           (id,organization_id,location_id,valet_session_id,
            actor_membership_id,event_type,entity_type,entity_id,
            metadata_json,occurred_at)
         VALUES($1,$2,$3,$4,$5,'TASK_EMERGENCY_TAKEOVER',
                'Task',$6,$7::jsonb,$8)`,
        [auditId, source.organizationId, source.locationId, source.sessionId,
          mismatch === "AUDIT_ACTOR" ? wrong : admin.membershipId,
          source.taskId, JSON.stringify(metadata), at],
      );
      await db.adminPool.query(
        `INSERT INTO emergency_task_takeover_operations
           (organization_id,operation_id,location_id,valet_session_id,
            task_id,actor_membership_id,previous_assignee_membership_id,
            new_assignee_membership_id,expected_task_version,
            result_task_version,expected_session_version,
            result_session_version,request_fingerprint,occurred_at,
            dispatch_event_id,audit_event_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,2,1,2,$9,$10,$11,$12)`,
        [source.organizationId, operationId, source.locationId,
          source.sessionId, source.taskId, admin.membershipId, original,
          target, "a".repeat(64), at, dispatchId, auditId],
      );
      forgedIds.push(operationId);
      expect(await exact(operationId), mismatch).toBeNull();
    }
    const cases = await read();
    for (const id of forgedIds) {
      expect(cases.map((row) => row.sourceId)).not.toContain(id);
    }
    expect(cases.filter((row) => row.sourceId === request.operationId))
      .toHaveLength(1);
    expect(JSON.stringify(cases)).not.toMatch(/PRIVATE|fingerprint|reason/i);
  }, 120_000);
});
