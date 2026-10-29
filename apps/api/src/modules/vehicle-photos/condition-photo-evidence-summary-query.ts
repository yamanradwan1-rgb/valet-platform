import {
  conditionPhotoEvidenceSummarySchema,
  type ConditionPhotoEvidenceSummary,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { ConditionPhotoReadScope } from "./condition-photo-status-query";

interface EvidenceSummaryRow {
  readonly verified_total: number;
  readonly latest_verified: ReadonlyArray<{
    readonly operationId: string;
    readonly vehiclePhotoId: string;
    readonly verifiedAt: string;
    readonly status: "VERIFIED";
  }>;
}

/** One SQL statement gives an actor-scoped count and newest-four from one snapshot. */
export async function readConditionPhotoEvidenceSummary(
  transaction: PostgresTransaction,
  scope: ConditionPhotoReadScope,
): Promise<ConditionPhotoEvidenceSummary> {
  const result = await transaction.query<EvidenceSummaryRow>(
    `WITH scoped AS MATERIALIZED (
       SELECT o.client_operation_id, v.vehicle_photo_id, v.verified_at
       FROM condition_photo_upload_operations AS o
       JOIN vehicle_photo_verifications AS v
         ON v.operation_id = o.id
        AND v.vehicle_photo_id = o.verified_photo_id
        AND v.organization_id = o.organization_id
        AND v.location_id = o.location_id
        AND v.valet_session_id = o.valet_session_id
        AND v.captured_by_membership_id = o.actor_membership_id
       WHERE o.organization_id = $1 AND o.location_id = $2
         AND o.valet_session_id = $3 AND o.actor_membership_id = $4
         AND o.status = 'VERIFIED'
         AND o.purpose = 'CHECK_IN_CONDITION'
         AND v.purpose = 'CHECK_IN_CONDITION'
     ), newest AS (
       SELECT * FROM scoped
       ORDER BY verified_at DESC, client_operation_id DESC LIMIT 4
     )
     SELECT (SELECT count(*)::int FROM scoped) AS verified_total,
       COALESCE(jsonb_agg(jsonb_build_object(
         'operationId', newest.client_operation_id::text,
         'vehiclePhotoId', newest.vehicle_photo_id::text,
         'verifiedAt', to_char(newest.verified_at AT TIME ZONE 'UTC',
           'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
         'status', 'VERIFIED'
       ) ORDER BY newest.verified_at DESC, newest.client_operation_id DESC)
       FILTER (WHERE newest.client_operation_id IS NOT NULL), '[]'::jsonb)
         AS latest_verified
     FROM (SELECT 1) AS anchor LEFT JOIN newest ON TRUE`,
    [scope.organizationId, scope.locationId, scope.valetSessionId,
      scope.actorMembershipId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Condition photo evidence summary read unavailable.");
  return conditionPhotoEvidenceSummarySchema.parse({
    valetSessionId: scope.valetSessionId,
    verifiedTotal: row.verified_total,
    latestVerified: row.latest_verified,
  });
}
