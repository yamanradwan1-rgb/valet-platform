import {
  conditionPhotoUploadStatusSchema,
  type ConditionPhotoUploadStatus,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";

export interface ConditionPhotoReadScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly valetSessionId: string;
  readonly actorMembershipId: string;
}

interface OperationStatusRow {
  readonly client_operation_id: string;
  readonly valet_session_id: string;
  readonly status: "PENDING" | "VERIFIED" | "EXPIRED" | "REJECTED";
  readonly verified_photo_id: string | null;
  readonly verified_at: Date | null;
  readonly byte_size: number | null;
  readonly lease_live: boolean;
}

/** Reads remain side-effect free, and never project internal storage identity. */
export function projectConditionPhotoStatus(
  row: OperationStatusRow,
): ConditionPhotoUploadStatus {
  const identity = {
    operationId: row.client_operation_id,
    valetSessionId: row.valet_session_id,
  };
  if (row.status === "PENDING") {
    return conditionPhotoUploadStatusSchema.parse({
      ...identity,
      status: "PENDING",
      retryAction: row.lease_live ? "WAIT" : "RECONCILE",
      retryAfterSeconds: row.lease_live ? 5 : 1,
    });
  }
  if (row.status === "VERIFIED") {
    if (row.verified_photo_id === null || row.verified_at === null || row.byte_size === null)
      throw new Error("Verified condition-photo record is incomplete.");
    return conditionPhotoUploadStatusSchema.parse({
      ...identity,
      status: "VERIFIED",
      vehiclePhotoId: row.verified_photo_id,
      byteSize: row.byte_size,
      verifiedAt: row.verified_at.toISOString(),
      contentType: "image/jpeg",
    });
  }
  if (row.status === "EXPIRED")
    return conditionPhotoUploadStatusSchema.parse({
      ...identity,
      status: "EXPIRED",
      retryAction: "NEW_CAPTURE",
      reason: "EXPIRED",
    });

  // P1 has no persisted reason for a REJECTED transition. Never fabricate one.
  throw new Error("Rejected operation reason is not yet authoritative.");
}

const operationColumns = `
  o.client_operation_id::text, o.valet_session_id::text, o.status::text,
  o.verified_photo_id::text, v.verified_at, v.byte_size,
  EXISTS (
    SELECT 1 FROM condition_photo_upload_attempts AS a
    WHERE a.operation_id = o.id
      AND a.status IN ('WRITING', 'STORED')
      AND a.lease_expires_at > clock_timestamp()
  ) AS lease_live`;

export async function readConditionPhotoStatus(
  transaction: PostgresTransaction,
  scope: ConditionPhotoReadScope,
  clientOperationId: string,
): Promise<ConditionPhotoUploadStatus | undefined> {
  const result = await transaction.query<OperationStatusRow>(
    `SELECT ${operationColumns}
     FROM condition_photo_upload_operations AS o
     LEFT JOIN vehicle_photo_verifications AS v ON v.operation_id = o.id
     WHERE o.organization_id = $1 AND o.location_id = $2
       AND o.valet_session_id = $3 AND o.actor_membership_id = $4
       AND o.client_operation_id = $5`,
    [scope.organizationId, scope.locationId, scope.valetSessionId,
      scope.actorMembershipId, clientOperationId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : projectConditionPhotoStatus(row);
}

export async function readConditionPhotoRecovery(
  transaction: PostgresTransaction,
  scope: ConditionPhotoReadScope,
): Promise<{
  pendingOperation: ConditionPhotoUploadStatus | null;
  latestOperation: ConditionPhotoUploadStatus | null;
}> {
  const result = await transaction.query<OperationStatusRow>(
    `WITH picked AS (
       (SELECT id, 0 AS priority FROM condition_photo_upload_operations
        WHERE organization_id = $1 AND location_id = $2
          AND valet_session_id = $3 AND actor_membership_id = $4
          AND status = 'PENDING' LIMIT 1)
       UNION ALL
       (SELECT id, 1 AS priority FROM condition_photo_upload_operations
        WHERE organization_id = $1 AND location_id = $2
          AND valet_session_id = $3 AND actor_membership_id = $4
          AND status IN ('VERIFIED', 'EXPIRED', 'REJECTED')
        ORDER BY created_at DESC, id DESC LIMIT 1)
     )
     SELECT ${operationColumns}
     FROM picked JOIN condition_photo_upload_operations AS o ON o.id = picked.id
     LEFT JOIN vehicle_photo_verifications AS v ON v.operation_id = o.id
     ORDER BY picked.priority`,
    [scope.organizationId, scope.locationId, scope.valetSessionId,
      scope.actorMembershipId],
  );
  const statuses = result.rows.map(projectConditionPhotoStatus);
  return {
    pendingOperation: statuses.find((item) => item.status === "PENDING") ?? null,
    latestOperation: statuses.find((item) => item.status !== "PENDING") ?? null,
  };
}
