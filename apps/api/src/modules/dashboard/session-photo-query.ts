import { timingSafeEqual } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  selectVerifiedConditionPhotoCandidates,
  type SelectedConditionPhotoCandidate,
} from "../valet-sessions/condition-photo-qualified-receipt";
import type { DashboardLocationScope } from "./dashboard-location-authorization";

export interface DashboardSessionPhotoScope {
  readonly location: DashboardLocationScope;
  readonly sessionId: string;
}

/** Exact session binding must be checked even for empty manifests. */
export async function requireExactDashboardPhotoSession(
  tx: PostgresTransaction,
  scope: DashboardSessionPhotoScope,
): Promise<boolean> {
  const response = await tx.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM valet_sessions AS session
       WHERE session.id = $1::uuid
         AND session.organization_id = $2::uuid
         AND session.location_id = $3::uuid
     ) AS exists`,
    [scope.sessionId, scope.location.organizationId, scope.location.locationId],
  );
  return response.rows[0]?.exists === true;
}

export async function verifiedDashboardPhotoCandidates(
  tx: PostgresTransaction,
  scope: DashboardSessionPhotoScope,
): Promise<SelectedConditionPhotoCandidate[]> {
  return await selectVerifiedConditionPhotoCandidates(tx, {
    organizationId: scope.location.organizationId,
    locationId: scope.location.locationId,
    valetSessionId: scope.sessionId,
  });
}

/** Verified timestamp is an extra read-only scoped projection; never modify P3 selector. */
export async function verifiedPhotoDisplayTimes(
  tx: PostgresTransaction,
  scope: DashboardSessionPhotoScope,
  candidates: readonly SelectedConditionPhotoCandidate[],
): Promise<Map<string, string> | null> {
  if (candidates.length === 0) return new Map();
  if (candidates.length > 10) return null;
  const result = await tx.query<{ photo_id: string; verified_at: Date }>(
    `SELECT v.vehicle_photo_id::text AS photo_id, v.verified_at
     FROM vehicle_photo_verifications AS v
     WHERE v.organization_id = $1::uuid AND v.location_id = $2::uuid
       AND v.valet_session_id = $3::uuid
       AND v.purpose = 'CHECK_IN_CONDITION'
       AND v.vehicle_photo_id = ANY($4::uuid[])`,
    [
      scope.location.organizationId,
      scope.location.locationId,
      scope.sessionId,
      candidates.map((candidate) => candidate.photoId),
    ],
  );
  const times = new Map<string, string>();
  for (const row of result.rows) {
    if (!(row.verified_at instanceof Date) || !Number.isFinite(row.verified_at.getTime()))
      return null;
    if (times.has(row.photo_id)) return null;
    times.set(row.photo_id, row.verified_at.toISOString());
  }
  return times.size === candidates.length ? times : null;
}

/** Full immutable identity check after external I/O, not merely matching photoId. */
export function unchangedVerifiedPhoto(
  previous: SelectedConditionPhotoCandidate,
  current: SelectedConditionPhotoCandidate,
): boolean {
  return previous.photoId === current.photoId &&
    previous.organizationId === current.organizationId &&
    previous.locationId === current.locationId &&
    previous.valetSessionId === current.valetSessionId &&
    previous.operationId === current.operationId &&
    previous.attemptId === current.attemptId &&
    previous.capturedByMembershipId === current.capturedByMembershipId &&
    previous.objectKey === current.objectKey &&
    previous.bucketAlias === current.bucketAlias &&
    previous.objectVersion !== null &&
    previous.objectVersion === current.objectVersion &&
    previous.byteSize === current.byteSize &&
    Buffer.isBuffer(previous.contentSha256) &&
    Buffer.isBuffer(current.contentSha256) &&
    previous.contentSha256.length === 32 &&
    current.contentSha256.length === 32 &&
    timingSafeEqual(previous.contentSha256, current.contentSha256);
}

/**
 * Keep all exact verified evidence and AVAILABLE rows locked through the
 * HTTP response enqueue in the caller's short, final READ COMMITTED txn.
 * No S3 I/O takes place with any database lock held.
 */
export async function lockExactVerifiedPhotoForDelivery(
  tx: PostgresTransaction,
  scope: DashboardSessionPhotoScope,
  candidate: SelectedConditionPhotoCandidate,
): Promise<boolean> {
  const result = await tx.query<{ photo_id: string }>(
    `SELECT v.vehicle_photo_id::text AS photo_id
     FROM vehicle_photo_verifications AS v
     JOIN condition_photo_upload_operations AS o
       ON o.id = v.operation_id AND o.status = 'VERIFIED'
       AND o.verified_photo_id = v.vehicle_photo_id
       AND o.purpose = v.purpose
       AND o.organization_id = v.organization_id
       AND o.location_id = v.location_id
       AND o.valet_session_id = v.valet_session_id
       AND o.actor_membership_id = v.captured_by_membership_id
     JOIN condition_photo_upload_attempts AS a
       ON a.id = v.attempt_id AND a.operation_id = v.operation_id
       AND a.status = 'SELECTED' AND a.object_key = v.object_key
       AND a.organization_id = v.organization_id
       AND a.location_id = v.location_id
       AND a.valet_session_id = v.valet_session_id
       AND a.actor_membership_id = v.captured_by_membership_id
       AND a.canonical_sha256 = v.content_sha256
       AND a.canonical_byte_size = v.byte_size
       AND a.bucket_alias = $11 AND a.object_version = $12
     JOIN vehicle_photo_availability AS availability
       ON availability.vehicle_photo_id = v.vehicle_photo_id
       AND availability.organization_id = v.organization_id
       AND availability.location_id = v.location_id
       AND availability.valet_session_id = v.valet_session_id
       AND availability.state = 'AVAILABLE'
     WHERE v.vehicle_photo_id = $1::uuid
       AND v.organization_id = $2::uuid AND v.location_id = $3::uuid
       AND v.valet_session_id = $4::uuid
       AND v.operation_id = $5::uuid AND v.attempt_id = $6::uuid
       AND v.captured_by_membership_id = $7::uuid
       AND v.purpose = 'CHECK_IN_CONDITION'
       AND v.object_key = $8 AND v.content_sha256 = $9
       AND v.byte_size = $10
     FOR SHARE OF v,o,a,availability`,
    [
      candidate.photoId,scope.location.organizationId,scope.location.locationId,
      scope.sessionId,candidate.operationId,candidate.attemptId,
      candidate.capturedByMembershipId,candidate.objectKey,candidate.contentSha256,
      candidate.byteSize,candidate.bucketAlias,candidate.objectVersion,
    ],
  );
  return result.rowCount === 1 && result.rows[0]?.photo_id === candidate.photoId;
}
