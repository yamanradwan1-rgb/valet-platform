import { timingSafeEqual } from "node:crypto";

import type { ConditionPhotoUploadStatus } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { canonicalizeConditionJpeg } from "./condition-photo-jpeg-decoder";
import {
  ConditionPhotoStorageError,
  type PrivatePhotoStore,
} from "./private-photo-store";
import {
  finalizeConditionPhoto,
  markConditionPhotoStored,
  recordConditionPhotoFailure,
  reserveConditionPhoto,
  type PhotoLease,
} from "./condition-photo-transactions";
import { authorizeConditionPhotoScope } from "./condition-photo-authorization";
import { readConditionPhotoStatus } from "./condition-photo-status-query";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";

export class ConditionPhotoUploadUnavailable extends Error {
  readonly code = "CONDITION_PHOTO_STORAGE_UNAVAILABLE";
  constructor() { super("Photo storage is temporarily unavailable."); }
}

async function authorizedStatus(
  pool: PostgresPool,
  credential: StaffSessionContext,
  sessionId: string,
  clientOperationId: string,
): Promise<ConditionPhotoUploadStatus> {
  return await inPostgresTransaction(pool, async (tx) => {
    const scope = await authorizeConditionPhotoScope(tx, credential, sessionId);
    const result = await readConditionPhotoStatus(tx, scope, clientOperationId);
    if (!result) throw new Error("Expected photo operation is not persisted.");
    return result;
  });
}

async function recordUnknownSafely(
  pool: PostgresPool,
  credential: StaffSessionContext,
  sessionId: string,
  lease: PhotoLease,
  error: unknown,
): Promise<void> {
  const reason = error instanceof ConditionPhotoStorageError && error.reason === "TIMEOUT"
    ? "STORAGE_TIMEOUT" :
    error instanceof ConditionPhotoStorageError && error.reason === "UNKNOWN"
      ? "STORAGE_OUTCOME_UNKNOWN" : "STORAGE_UNAVAILABLE";
  try {
    await recordConditionPhotoFailure(pool, credential, sessionId, lease, reason);
  } catch {
    // Do not overwrite/relax the authoritative state after a possible commit,
    // revocation, lease expiry, or database outage.
  }
}

export interface ConditionPhotoUploadExecution {
  readonly status: ConditionPhotoUploadStatus;
  readonly newCommit: boolean;
}

export async function executeConditionPhotoUpload(
  pool: PostgresPool,
  store: PrivatePhotoStore,
  bucketAlias: string,
  credential: StaffSessionContext,
  sessionId: string,
  clientOperationId: string,
  bytes: Buffer,
): Promise<ConditionPhotoUploadExecution> {
  // Image bytes are fully decoded/normalized before any durable reservation.
  const canonical = await canonicalizeConditionJpeg(bytes);
  let lease: PhotoLease | undefined;
  try {
    const reserved = await reserveConditionPhoto(
      pool, credential, sessionId, clientOperationId,
      canonical.sourceSha256, canonical.sourceByteSize, bucketAlias,
    );
    if (reserved.replayVerified)
      return {
        status: await authorizedStatus(pool, credential, sessionId, clientOperationId),
        newCommit: false,
      };
    lease = reserved.lease;
    if (!lease) throw new ConditionPhotoUploadUnavailable();

    let storedVersion: string | null = null;
    try {
      const written = await store.putIfAbsent(lease.object_key, canonical.canonicalBytes);
      storedVersion = written.version;
    } catch (error) {
      if (!(error instanceof ConditionPhotoStorageError) || error.reason !== "CONFLICT")
        throw error;
      // Write-once key already exists. Only the exact read-back can establish
      // whether it contains our canonical bytes; never overwrite the key.
    }
    const readBack = await store.readExact({ key: lease.object_key, version: storedVersion });
    try {
      if (readBack.bytes.length !== canonical.canonicalBytes.length ||
          !timingSafeEqual(readBack.bytes, canonical.canonicalBytes))
        throw new ConditionPhotoStorageError("CONFLICT");
      const facts = {
        canonicalSha256: canonical.canonicalSha256,
        byteSize: canonical.canonicalByteSize,
        width: canonical.width,
        height: canonical.height,
        objectVersion: readBack.version,
      };
      await markConditionPhotoStored(pool, credential, sessionId, lease, facts);
      await finalizeConditionPhoto(pool, credential, sessionId, lease, facts);
      const status = await authorizedStatus(pool, credential, sessionId, clientOperationId);
      if (status.status !== "VERIFIED")
        throw new Error("Successful finalization has no verification receipt.");
      return { status, newCommit: true };
    } finally {
      readBack.bytes.fill(0);
    }
  } catch (error) {
    if (lease) await recordUnknownSafely(pool, credential, sessionId, lease, error);
    if (error instanceof ConditionPhotoStorageError)
      throw new ConditionPhotoUploadUnavailable();
    throw error;
  } finally {
    canonical.canonicalBytes.fill(0);
  }
}
