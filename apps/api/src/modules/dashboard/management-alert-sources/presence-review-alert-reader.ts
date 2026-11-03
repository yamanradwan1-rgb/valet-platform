import type { PostgresTransaction } from "../../../common/database/postgres";
import { DashboardOverviewError } from "../dashboard-overview-error";
import {
  requireManagementAlertSourceScope,
  type ManagementAlertReaderInput,
  type ManagementAlertSourceCase,
} from "./management-alert-source-contract";

interface PresenceAlertRow {
  readonly exceptionId: string;
  readonly requestedAt: Date;
}

/** ALT-12: the existing Presence canReview predicate belongs inside the SQL bound. */
export async function queryPresenceReviewAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
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
  const rows = await transaction.query<PresenceAlertRow>(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
     SELECT e.id::text AS "exceptionId", e.requested_at AS "requestedAt"
     FROM shift_presence_exceptions AS e
     JOIN locations AS l ON l.id=e.location_id AND l.organization_id=e.organization_id
     JOIN users AS u ON u.id=e.user_id
     JOIN organization_memberships AS requester
       ON requester.id=e.membership_id
      AND requester.user_id=e.user_id
      AND requester.organization_id=e.organization_id
     CROSS JOIN instant
     WHERE e.organization_id=$1 AND e.location_id=$2
       AND e.status='PENDING' AND instant.at<e.expires_at
       AND e.user_id<>$3 AND u.status='ACTIVE'
       AND requester.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
       AND (
         (e.action='START' AND requester.status='ACTIVE' AND l.status='ACTIVE'
           AND EXISTS (SELECT 1 FROM membership_location_access AS access
             WHERE access.membership_id=requester.id
               AND access.organization_id=e.organization_id
               AND access.location_id=e.location_id))
         OR (e.action='END' AND EXISTS (SELECT 1 FROM shifts AS shift
           WHERE shift.id=e.shift_id AND shift.membership_id=requester.id
             AND shift.location_id=e.location_id AND shift.organization_id=e.organization_id
             AND shift.status='ACTIVE'))
       )
       AND EXISTS (
         SELECT 1 FROM shift_presence_challenges AS challenge
         JOIN shift_presence_operations AS operation
           ON operation.id=challenge.operation_row_id
         WHERE challenge.id=e.challenge_id
           AND challenge.consumed_at IS NULL
           AND instant.at<challenge.expires_at
           AND operation.status='PENDING' AND instant.at<operation.expires_at
       )
     ORDER BY e.requested_at DESC, e.id DESC
     LIMIT $4`,
    [scope.organizationId, scope.locationId, input.context.userId, input.limit],
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
