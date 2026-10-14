import type { StaffSessionContext } from "../auth/staff-session-context";

import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeConditionPhotoScope } from "./condition-photo-authorization";
import {
  readConditionPhotoStatus,
  type ConditionPhotoReadScope,
} from "./condition-photo-status-query";
import {
  ConditionPhotoDatabaseError,
  safeConditionPhotoDbError,
} from "./condition-photo-db-errors";

interface InternalOperationRow {
  readonly id: string;
  readonly client_operation_id: string;
  readonly source_sha256: Buffer;
  readonly source_byte_size: number;
  readonly normalization_version: number;
  readonly status: "PENDING" | "VERIFIED" | "EXPIRED" | "REJECTED";
}

export interface PhotoLease {
  readonly operation_id: string;
  readonly attempt_id: string;
  readonly object_key: string;
  readonly lease_owner: string;
  readonly lease_expires_at: Date;
}

export interface VerifiedObjectFacts {
  readonly canonicalSha256: Buffer;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly objectVersion: string | null;
}

export async function findInternalPhotoOperation(
  transaction: PostgresTransaction,
  scope: ConditionPhotoReadScope,
  clientOperationId: string,
): Promise<InternalOperationRow | undefined> {
  const result = await transaction.query<InternalOperationRow>(
    `SELECT id::text, client_operation_id::text, source_sha256,
            source_byte_size, normalization_version, status::text
     FROM condition_photo_upload_operations
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND actor_membership_id = $4
       AND client_operation_id = $5`,
    [scope.organizationId, scope.locationId, scope.valetSessionId,
      scope.actorMembershipId, clientOperationId],
  );
  return result.rows[0];
}

/** Server-side source fingerprint establishes idempotency before any object PUT. */
export async function reserveConditionPhoto(
  pool: PostgresPool,
  credential: StaffSessionContext,
  sessionId: string,
  clientOperationId: string,
  sourceSha256: Buffer,
  sourceByteSize: number,
  bucketAlias: string,
): Promise<{ readonly lease?: PhotoLease; readonly replayVerified: boolean }> {
  try {
    return await inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeConditionPhotoScope(transaction, credential, sessionId);
    const existing = await findInternalPhotoOperation(transaction, scope, clientOperationId);
    if (existing?.status === "VERIFIED") {
      const matches = existing.source_sha256.equals(sourceSha256) &&
        existing.source_byte_size === sourceByteSize && existing.normalization_version === 1;
      if (!matches) throw new ConditionPhotoDatabaseError("CONDITION_PHOTO_OPERATION_CONFLICT");
      const current = await readConditionPhotoStatus(transaction, scope, clientOperationId);
      if (current?.status !== "VERIFIED") throw new Error("Incomplete verified replay.");
      return { replayVerified: true };
    }
    const result = await transaction.query<PhotoLease>(
      `SELECT * FROM public.condition_photo_reserve_upload(
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::bytea,
        $6::integer, $7::integer, $8::text)`,
      [credential.userId, scope.actorMembershipId, sessionId, clientOperationId,
        sourceSha256, sourceByteSize, 1, bucketAlias],
    );
    const lease = result.rows[0];
    if (!lease) throw new Error("Upload reservation returned no lease.");
    const attempt = await transaction.query<{ bucket_alias: string }>(
      `SELECT bucket_alias FROM condition_photo_upload_attempts
       WHERE id = $1 AND operation_id = $2
         AND organization_id = $3 AND location_id = $4
         AND valet_session_id = $5 AND actor_membership_id = $6`,
      [lease.attempt_id, lease.operation_id, scope.organizationId,
        scope.locationId, sessionId, scope.actorMembershipId],
    );
    if (attempt.rows[0]?.bucket_alias !== bucketAlias)
      throw new ConditionPhotoDatabaseError("CONDITION_PHOTO_OPERATION_CONFLICT");
    return { lease, replayVerified: false };
    });
  } catch (error) {
    throw safeConditionPhotoDbError(error);
  }
}

/** All protected P1 functions execute only after exact bearer/scope locking. */
async function scopedFunction<T>(
  pool: PostgresPool,
  credential: StaffSessionContext,
  sessionId: string,
  action: (tx: PostgresTransaction, scope: ConditionPhotoReadScope) => Promise<T>,
): Promise<T> {
  try {
    return await inPostgresTransaction(pool, async (tx) => {
      const scope = await authorizeConditionPhotoScope(tx, credential, sessionId);
      return await action(tx, scope);
    });
  } catch (error) {
    throw safeConditionPhotoDbError(error);
  }
}

export async function markConditionPhotoStored(
  pool: PostgresPool, credential: StaffSessionContext,
  sessionId: string, lease: PhotoLease, facts: VerifiedObjectFacts,
): Promise<void> {
  await scopedFunction(pool, credential, sessionId, async (tx, scope) => {
    await tx.query(
      `SELECT public.condition_photo_mark_stored($1::uuid,$2::uuid,$3::uuid,
        $4::uuid,$5::uuid,$6::text,$7::bytea,$8::integer,$9::integer,$10::integer)`,
      [credential.userId, scope.actorMembershipId, lease.operation_id,
        lease.attempt_id, lease.lease_owner, facts.objectVersion,
        facts.canonicalSha256, facts.byteSize, facts.width, facts.height],
    );
  });
}

export async function finalizeConditionPhoto(
  pool: PostgresPool, credential: StaffSessionContext,
  sessionId: string, lease: PhotoLease, facts: VerifiedObjectFacts,
): Promise<string> {
  return await scopedFunction(pool, credential, sessionId, async (tx, scope) => {
    const result = await tx.query<{ vehicle_photo_id: string }>(
      `SELECT public.condition_photo_finalize_upload($1::uuid,$2::uuid,$3::uuid,
        $4::uuid,$5::uuid,$6::text,$7::bytea,$8::integer,$9::integer,$10::integer)
       AS vehicle_photo_id`,
      [credential.userId, scope.actorMembershipId, lease.operation_id,
        lease.attempt_id, lease.lease_owner, facts.objectVersion,
        facts.canonicalSha256, facts.byteSize, facts.width, facts.height],
    );
    const id = result.rows[0]?.vehicle_photo_id;
    if (!id) throw new Error("Finalization returned no verified photo.");
    return id;
  });
}

export async function recordConditionPhotoFailure(
  pool: PostgresPool, credential: StaffSessionContext, sessionId: string,
  lease: PhotoLease,
  safeCode: "STORAGE_UNAVAILABLE" | "STORAGE_TIMEOUT" |
    "STORAGE_OUTCOME_UNKNOWN" | "READBACK_UNAVAILABLE" | "VERIFIER_UNAVAILABLE",
): Promise<void> {
  await scopedFunction(pool, credential, sessionId, async (tx, scope) => {
    await tx.query(
      `SELECT public.condition_photo_record_failure(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text)`,
      [credential.userId, scope.actorMembershipId, lease.operation_id,
        lease.attempt_id, lease.lease_owner, safeCode],
    );
  });
}
