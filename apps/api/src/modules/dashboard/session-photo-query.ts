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
  const result = await tx.query<{ qualifies: boolean }>(
    `SELECT public.condition_photo_lock_management_evidence(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
      $7::uuid,$8::text,$9::bytea,$10::integer,$11::text,$12::text
    ) AS qualifies`,
    [
      candidate.photoId,scope.location.organizationId,scope.location.locationId,
      scope.sessionId,candidate.operationId,candidate.attemptId,
      candidate.capturedByMembershipId,candidate.objectKey,candidate.contentSha256,
      candidate.byteSize,candidate.bucketAlias,candidate.objectVersion,
    ],
  );
  return result.rowCount === 1 && result.rows[0]?.qualifies === true;
}
