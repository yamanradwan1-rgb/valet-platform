import { timingSafeEqual } from "node:crypto";

import type { ConditionPhotoUploadStatus } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeConditionPhotoScope } from "./condition-photo-authorization";
import { verifyStoredConditionJpeg } from "./condition-photo-jpeg-decoder";
import { ConditionPhotoStorageError, type PrivatePhotoStore } from "./private-photo-store";
import {
  finalizeConditionPhoto,
  findInternalPhotoOperation,
  markConditionPhotoStored,
  type PhotoLease,
  type VerifiedObjectFacts,
} from "./condition-photo-transactions";
import { ConditionPhotoDatabaseError, safeConditionPhotoDbError } from "./condition-photo-db-errors";
import { readConditionPhotoStatus } from "./condition-photo-status-query";
import { ConditionPhotoUploadUnavailable } from "./condition-photo-upload-executor";

interface PersistedAttemptFacts {
  readonly bucket_alias: string;
  readonly canonical_sha256: Buffer | null;
  readonly canonical_byte_size: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly object_version: string | null;
  readonly status: "WRITING" | "STORED" | "SELECTED" | "ABANDONED";
}

interface ClaimResult {
  readonly lease?: PhotoLease;
  readonly oldAttempt?: PersistedAttemptFacts;
  readonly status?: ConditionPhotoUploadStatus;
}

function pendingAction(
  operationId: string,
  sessionId: string,
  retryAction: "WAIT" | "RESEND_SAME_BYTES",
): ConditionPhotoUploadStatus {
  return {
    operationId,
    valetSessionId: sessionId,
    status: "PENDING",
    retryAction,
    retryAfterSeconds: 5,
  };
}

async function claimForReconciliation(
  pool: PostgresPool,
  credential: StaffSessionContext,
  sessionId: string,
  clientOperationId: string,
  bucketAlias: string,
): Promise<ClaimResult> {
  try {
    return await inPostgresTransaction(pool, async (tx) => {
    const scope = await authorizeConditionPhotoScope(tx, credential, sessionId);
    const operation = await findInternalPhotoOperation(tx, scope, clientOperationId);
    if (!operation) throw new ConditionPhotoDatabaseError("CONDITION_PHOTO_NOT_FOUND");
    const status = await readConditionPhotoStatus(tx, scope, clientOperationId);
    if (!status) throw new ConditionPhotoDatabaseError("CONDITION_PHOTO_NOT_FOUND");
    if (status.status !== "PENDING") return { status };
    if (status.retryAction === "WAIT") return { status };

    let lease: PhotoLease;
    try {
      const claim = await tx.query<PhotoLease>(
        `SELECT * FROM public.condition_photo_claim_upload(
          $1::uuid, $2::uuid, $3::uuid, true, $4::text)`,
        [credential.userId, scope.actorMembershipId, operation.id, bucketAlias],
      );
      if (!claim.rows[0]) throw new ConditionPhotoUploadUnavailable();
      lease = claim.rows[0];
    } catch (error) {
      if ((error as { code?: unknown }).code === "55P03")
        return { status: pendingAction(clientOperationId, sessionId, "WAIT") };
      throw error;
    }
    const stored = await tx.query<PersistedAttemptFacts>(
      `SELECT status::text, bucket_alias, object_version, canonical_sha256,
              canonical_byte_size, width, height
       FROM condition_photo_upload_attempts
       WHERE id = $1 AND operation_id = $2`,
      [lease.attempt_id, lease.operation_id],
    );
    if (!stored.rows[0]) throw new ConditionPhotoUploadUnavailable();
    if (stored.rows[0].bucket_alias !== bucketAlias)
      throw new ConditionPhotoDatabaseError("CONDITION_PHOTO_OPERATION_CONFLICT");
    return { lease, oldAttempt: stored.rows[0] };
    });
  } catch (error) {
    throw safeConditionPhotoDbError(error);
  }
}

export async function executeConditionPhotoReconcile(
  pool: PostgresPool,
  store: PrivatePhotoStore,
  bucketAlias: string,
  credential: StaffSessionContext,
  sessionId: string,
  clientOperationId: string,
): Promise<ConditionPhotoUploadStatus> {
  const claim = await claimForReconciliation(
    pool, credential, sessionId, clientOperationId, bucketAlias,
  );
  if (claim.status) return claim.status;
  const lease = claim.lease;
  const previous = claim.oldAttempt;
  if (!lease || !previous) throw new ConditionPhotoUploadUnavailable();

  let read;
  try {
    read = await store.readExact({
      key: lease.object_key,
      version: previous.object_version,
    });
  } catch (error) {
    if (error instanceof ConditionPhotoStorageError && error.reason === "NOT_FOUND") {
      // A missing object read alone is NOT authoritative proof of absence
      // after an unknown-outcome PUT on an unqualified S3-compatible store.
      // Do not authorize a blind resend until provider consistency is proved.
      return pendingAction(clientOperationId, sessionId, "WAIT");
    }
    throw new ConditionPhotoUploadUnavailable();
  }

  try {
    const inspected = await verifyStoredConditionJpeg(read.bytes);
    if (previous.status === "STORED") {
      if (previous.canonical_sha256 === null || previous.canonical_byte_size === null ||
          previous.width !== inspected.width || previous.height !== inspected.height ||
          previous.canonical_byte_size !== inspected.byteSize ||
          !timingSafeEqual(previous.canonical_sha256, inspected.canonicalSha256))
        throw new ConditionPhotoUploadUnavailable();
    }
    const facts: VerifiedObjectFacts = {
      canonicalSha256: inspected.canonicalSha256,
      byteSize: inspected.byteSize,
      width: inspected.width,
      height: inspected.height,
      objectVersion: read.version,
    };
    await markConditionPhotoStored(pool, credential, sessionId, lease, facts);
    await finalizeConditionPhoto(pool, credential, sessionId, lease, facts);
    return await inPostgresTransaction(pool, async (tx) => {
      const scope = await authorizeConditionPhotoScope(tx, credential, sessionId);
      const status = await readConditionPhotoStatus(tx, scope, clientOperationId);
      if (status?.status !== "VERIFIED")
        throw new ConditionPhotoUploadUnavailable();
      return status;
    });
  } finally {
    read.bytes.fill(0);
  }
}
