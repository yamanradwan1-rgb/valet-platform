import type { PostgresTransaction } from "../../../common/database/postgres";
import { presenceManagementCanReviewPredicateSql } from "../../management/presence-management-reviewability";
import { DashboardOverviewError } from "../dashboard-overview-error";
import {
  requireManagementAlertSourceId,
  requireManagementAlertSourceScope,
  type ManagementAlertExactReaderInput,
  type ManagementAlertReaderInput,
  type ManagementAlertSourceCase,
} from "./management-alert-source-contract";

interface PresenceAlertRow {
  readonly exceptionId: string;
  readonly requestedAt: Date;
}

async function sourceCandidates(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
  sourceId?: string,
): Promise<ManagementAlertSourceCase[]> {
  const scope = await requireManagementAlertSourceScope(transaction, input);
  // Same source-specific, current-session entitlement used by Presence detail.
  const entitlement = await transaction.query<{ enabled: boolean }>(
    `SELECT public.shift_presence_lock_management_entitlement($1,$2,$3,$4) AS enabled`,
    [
      input.context.userId,
      input.context.staffAuthSessionId,
      input.context.accessTokenHash,
      scope.organizationId,
    ],
  );
  if (entitlement.rows[0]?.enabled !== true) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  const exactPredicate = sourceId === undefined ? "" : "AND e.id=$5::uuid";
  const rows = await transaction.query<PresenceAlertRow>(
    `SELECT e.id::text AS "exceptionId", e.requested_at AS "requestedAt"
     FROM shift_presence_exceptions AS e
     JOIN locations AS l ON l.id=e.location_id AND l.organization_id=e.organization_id
     JOIN users AS u ON u.id=e.user_id
     WHERE e.organization_id=$1 AND e.location_id=$2
       AND ${presenceManagementCanReviewPredicateSql}
       ${exactPredicate}
     ORDER BY e.requested_at DESC, e.id DESC
     LIMIT $4`,
    [
      scope.organizationId,
      scope.locationId,
      input.context.userId,
      input.limit,
      ...(sourceId === undefined ? [] : [sourceId]),
    ],
  );
  return rows.rows.map((row) => ({
    category: "ALT-12",
    severity: "IMPORTANT",
    sourceKind: "PRESENCE",
    sourceId: row.exceptionId,
    episodeId: row.exceptionId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    occurredAt: row.requestedAt.toISOString(),
    title: "Presence exception requires review",
  }));
}

/** ALT-12: existing per-viewer canReview predicate is inside the SQL bound. */
export async function queryPresenceReviewAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<ManagementAlertSourceCase[]> {
  return sourceCandidates(transaction, input);
}

/** Exact currently reviewable exception; returns null after review or expiry. */
export async function findPresenceReviewAlertCaseById(
  transaction: PostgresTransaction,
  input: ManagementAlertExactReaderInput,
): Promise<ManagementAlertSourceCase | null> {
  requireManagementAlertSourceId(input.sourceId);
  return (
    (
      await sourceCandidates(
        transaction,
        { context: input.context, scope: input.scope, limit: 1 },
        input.sourceId,
      )
    )[0] ?? null
  );
}
