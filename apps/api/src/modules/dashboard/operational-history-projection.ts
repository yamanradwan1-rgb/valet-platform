import type {
  HistoricalStaffName,
  ParkingCompletionProof,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { ParkingAuditEvidence } from "./operational-history-audit-discovery";
import { readAtomicParkingEvidence } from "./operational-history-atomic-evidence";
import {
  classifyParkingHistory,
  type ParkingTaskDispatchEvidence,
} from "./operational-history-evidence-classifier";
import {
  canonicalHistoryName,
  type CanonicalHistoryMembershipName,
} from "./operational-history-identity-projection";

export interface OperationalHistoryAttribution {
  readonly checkedInBy: HistoricalStaffName | null;
  readonly parkedBy: HistoricalStaffName | null;
  readonly parkingCompletionProof: ParkingCompletionProof;
}

interface SessionRow {
  readonly sessionId: string;
  readonly checkerId: string;
}
// The caller MUST authorize/lock the exact viewer Staff session and materialize
// a bounded, authorized page in the same transaction before invoking this read.
// Three fixed, set-based SELECTs; no per-session requests, domain writes or cap.
// Task/Dispatch/Audit share one statement snapshot under READ COMMITTED.
export async function getOperationalHistoryForSessions(
  transaction: PostgresTransaction,
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly sessionIds: readonly string[];
  },
): Promise<Map<string, OperationalHistoryAttribution>> {
  const { organizationId, locationId, sessionIds } = input;
  const result = new Map<string, OperationalHistoryAttribution>();
  if (sessionIds.length === 0) return result;
  if (new Set(sessionIds).size !== sessionIds.length) {
    throw new Error(
      "Historical projection requires distinct authorized sessions.",
    );
  }
  const scoped = [organizationId, locationId, sessionIds];
  const sessions = await transaction.query<SessionRow>(
    `SELECT session.id::text AS "sessionId",
            session.checked_in_by_membership_id::text AS "checkerId"
     FROM valet_sessions AS session
     WHERE session.organization_id = $1 AND session.location_id = $2
       AND session.id = ANY($3::uuid[])`,
    scoped,
  );
  if (sessions.rows.length !== sessionIds.length) {
    throw new Error("Historical projection session scope changed.");
  }
  const { tasks, audits } = await readAtomicParkingEvidence(transaction, {
    organizationId,
    locationId,
    sessionIds,
  });
  const taskGroups = new Map<string, ParkingTaskDispatchEvidence[]>();
  const auditGroups = new Map<string, ParkingAuditEvidence[]>();
  for (const row of tasks) {
    const group = taskGroups.get(row.sessionId) ?? [];
    group.push(row);
    taskGroups.set(row.sessionId, group);
  }
  for (const row of audits) {
    const group = auditGroups.get(row.implicatedSessionId) ?? [];
    group.push(row);
    auditGroups.set(row.implicatedSessionId, group);
  }
  const proofBySession = new Map<
    string,
    ReturnType<typeof classifyParkingHistory>
  >();
  const membershipIds = new Set(sessions.rows.map((row) => row.checkerId));
  for (const session of sessions.rows) {
    const proof = classifyParkingHistory(
      taskGroups.get(session.sessionId) ?? [],
      auditGroups.get(session.sessionId) ?? [],
      { organizationId, locationId, sessionId: session.sessionId },
    );
    proofBySession.set(session.sessionId, proof);
    if (proof.actorId !== null) membershipIds.add(proof.actorId);
  }
  const memberships = await transaction.query<CanonicalHistoryMembershipName>(
    `SELECT membership.id::text AS "membershipId",
            membership.first_name AS "firstName",
            membership.last_name AS "lastName"
     FROM organization_memberships AS membership
     WHERE membership.organization_id = $1
       AND membership.id = ANY($2::uuid[])`,
    [organizationId, [...membershipIds]],
  );
  const names = new Map(memberships.rows.map((row) => [row.membershipId, row]));
  for (const session of sessions.rows) {
    const proof = proofBySession.get(session.sessionId)!;
    result.set(session.sessionId, {
      checkedInBy: canonicalHistoryName(names.get(session.checkerId)),
      parkedBy:
        proof.proof === "PROVEN" && proof.actorId !== null
          ? canonicalHistoryName(names.get(proof.actorId))
          : null,
      parkingCompletionProof: proof.proof,
    });
  }
  return result;
}
