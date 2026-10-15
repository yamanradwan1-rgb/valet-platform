import { createHash, timingSafeEqual } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { PrivatePhotoStore } from "../vehicle-photos/private-photo-store";

interface EvidenceScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly valetSessionId: string;
}

export interface SelectedConditionPhotoCandidate extends EvidenceScope {
  readonly photoId: string;
  readonly operationId: string;
  readonly attemptId: string;
  readonly capturedByMembershipId: string;
  readonly objectKey: string;
  readonly bucketAlias: string;
  readonly objectVersion: string | null;
  readonly contentSha256: Buffer;
  readonly byteSize: number;
}

/**
 * Opaque, request-bound receipt. The WeakMap prevents a controller, DTO or
 * forged JavaScript object from constructing a valid qualifying receipt.
 */
export interface TrustedConditionPhotoReceipt {
  readonly kind: "TRUSTED_CONDITION_PHOTO_RECEIPT";
}

interface InternalProof {
  readonly candidate: SelectedConditionPhotoCandidate;
  readonly requestNonce: string;
  readonly expiresAt: number;
}

const proofs = new WeakMap<TrustedConditionPhotoReceipt, InternalProof>();

/** Called ONLY in a scoped authorized read transaction, before storage I/O. */
export async function selectVerifiedConditionPhotoCandidates(
  transaction: PostgresTransaction,
  scope: EvidenceScope,
): Promise<SelectedConditionPhotoCandidate[]> {
  const result = await transaction.query<{
    photo_id: string;
    operation_id: string;
    attempt_id: string;
    captured_by_membership_id: string;
    object_key: string;
    bucket_alias: string;
    object_version: string | null;
    content_sha256: Buffer;
    byte_size: number;
  }>(
    `SELECT v.vehicle_photo_id::text AS photo_id,
            v.operation_id::text, v.attempt_id::text,
            v.captured_by_membership_id::text, v.object_key,
            a.bucket_alias, a.object_version, v.content_sha256, v.byte_size
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
     JOIN vehicle_photo_availability AS availability
       ON availability.vehicle_photo_id = v.vehicle_photo_id
       AND availability.organization_id = v.organization_id
       AND availability.location_id = v.location_id
       AND availability.valet_session_id = v.valet_session_id
       AND availability.state = 'AVAILABLE'
     WHERE v.organization_id = $1 AND v.location_id = $2
       AND v.valet_session_id = $3
       AND v.purpose = 'CHECK_IN_CONDITION'
     ORDER BY v.verified_at DESC, v.vehicle_photo_id DESC
     LIMIT 10`,
    [scope.organizationId, scope.locationId, scope.valetSessionId],
  );
  return result.rows.map((row) => ({
    ...scope,
    photoId: row.photo_id,
    operationId: row.operation_id,
    attemptId: row.attempt_id,
    capturedByMembershipId: row.captured_by_membership_id,
    objectKey: row.object_key,
    bucketAlias: row.bucket_alias,
    objectVersion: row.object_version,
    contentSha256: row.content_sha256,
    byteSize: row.byte_size,
  }));
}

/** MUST run outside database transactions and only with an approved private store. */
export async function proveSelectedConditionPhotoBytes(
  store: PrivatePhotoStore,
  candidate: SelectedConditionPhotoCandidate,
  expectedBucketAlias: string,
  requestNonce: string,
  deadlineMs = 15_000,
): Promise<TrustedConditionPhotoReceipt | undefined> {
  if (
    requestNonce.length < 16 ||
    candidate.bucketAlias !== expectedBucketAlias ||
    !candidate.objectVersion ||
    !Buffer.isBuffer(candidate.contentSha256) ||
    candidate.contentSha256.length !== 32 ||
    candidate.byteSize < 1 ||
    candidate.byteSize > 8 * 1024 * 1024
  ) return undefined;
  let bytes: Buffer | undefined;
  try {
    const result = await store.readExact({
      key: candidate.objectKey,
      version: candidate.objectVersion,
    }, deadlineMs);
    bytes = result.bytes;
    if (result.version !== candidate.objectVersion ||
        bytes.length !== candidate.byteSize)
      return undefined;
    const digest = createHash("sha256").update(bytes).digest();
    const matches = timingSafeEqual(digest, candidate.contentSha256);
    digest.fill(0);
    if (!matches) return undefined;
    const receipt: TrustedConditionPhotoReceipt = Object.freeze({
      kind: "TRUSTED_CONDITION_PHOTO_RECEIPT",
    });
    proofs.set(receipt, {
      candidate: Object.freeze({
        ...candidate,
        contentSha256: Buffer.from(candidate.contentSha256),
      }),
      requestNonce,
      expiresAt: Date.now() + 60_000,
    });
    return receipt;
  } catch {
    // Missing, corrupt, timed-out, ambiguous provider outcomes are not proof.
    return undefined;
  } finally {
    bytes?.fill(0);
  }
}

/** Inside existing locked Check-In transaction; no object/network I/O here. */
export async function receiptMatchesCurrentVerifiedEvidence(
  transaction: PostgresTransaction,
  scope: EvidenceScope,
  receipt: TrustedConditionPhotoReceipt | undefined,
  requestNonce: string,
): Promise<boolean> {
  if (!receipt) return false;
  const proof = proofs.get(receipt);
  // The receipt is single-use even if the transaction subsequently rolls back.
  proofs.delete(receipt);
  if (!proof || proof.requestNonce !== requestNonce ||
      Date.now() > proof.expiresAt ||
      proof.candidate.organizationId !== scope.organizationId ||
      proof.candidate.locationId !== scope.locationId ||
      proof.candidate.valetSessionId !== scope.valetSessionId)
    return false;
  const item = proof.candidate;
  const result = await transaction.query<{ qualifies: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM vehicle_photo_verifications AS v
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
       JOIN vehicle_photo_availability AS availability
         ON availability.vehicle_photo_id = v.vehicle_photo_id
       WHERE v.vehicle_photo_id = $1
         AND v.operation_id = $2 AND v.attempt_id = $3
         AND v.organization_id = $4 AND v.location_id = $5
         AND v.valet_session_id = $6
         AND v.captured_by_membership_id = $7
         AND v.purpose = 'CHECK_IN_CONDITION'
         AND v.object_key = $8 AND v.content_sha256 = $9
         AND v.byte_size = $10
         AND a.status = 'SELECTED'
         AND a.organization_id = v.organization_id
         AND a.location_id = v.location_id
         AND a.valet_session_id = v.valet_session_id
         AND a.actor_membership_id = v.captured_by_membership_id
         AND a.object_key = v.object_key
         AND a.canonical_sha256 = v.content_sha256
         AND a.canonical_byte_size = v.byte_size
         AND a.bucket_alias = $11
         AND a.object_version IS NOT DISTINCT FROM $12::text
         AND availability.state = 'AVAILABLE'
         AND availability.organization_id = v.organization_id
         AND availability.location_id = v.location_id
         AND availability.valet_session_id = v.valet_session_id
     ) AS qualifies`,
    [
      item.photoId, item.operationId, item.attemptId,
      scope.organizationId, scope.locationId, scope.valetSessionId,
      item.capturedByMembershipId, item.objectKey,
      item.contentSha256, item.byteSize,
      item.bucketAlias, item.objectVersion,
    ],
  );
  return result.rows[0]?.qualifies === true;
}
