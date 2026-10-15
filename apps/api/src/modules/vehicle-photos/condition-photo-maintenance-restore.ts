import { createHash, timingSafeEqual } from "node:crypto";

import type { PrivatePhotoStore } from "./private-photo-store";

/** Facts exported from a particular restored DB verification row. */
export interface RestoredPhotoReference {
  readonly operationId: string;
  readonly attemptId: string;
  readonly photoId: string;
  readonly key: string;
  readonly version: string;
  readonly contentSha256: Buffer;
  readonly byteSize: number;
}

/** Only compares a specific restored DB row with its restored object version. */
export async function checkPairedPhotoRestore(
  dbRecord: RestoredPhotoReference,
  restoreStore: Pick<PrivatePhotoStore, "readExact">,
): Promise<"MATCH" | "MISMATCH" | "UNKNOWN"> {
  const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  if (!uuid.test(dbRecord.operationId) || !uuid.test(dbRecord.attemptId) ||
      !uuid.test(dbRecord.photoId) ||
      dbRecord.key !== `condition-photo/${dbRecord.operationId}/${dbRecord.attemptId}` ||
      !dbRecord.version || dbRecord.version === "null" ||
      dbRecord.version.length > 240 ||
      !Buffer.isBuffer(dbRecord.contentSha256) ||
      dbRecord.contentSha256.length !== 32 ||
      !Number.isSafeInteger(dbRecord.byteSize) ||
      dbRecord.byteSize < 1 || dbRecord.byteSize > 8 * 1024 * 1024)
    return "MISMATCH";

  let bytes: Buffer | undefined;
  try {
    const exact = await restoreStore.readExact({
      key: dbRecord.key, version: dbRecord.version,
    });
    bytes = exact.bytes;
    if (exact.version !== dbRecord.version || bytes.length !== dbRecord.byteSize)
      return "MISMATCH";
    const digest = createHash("sha256").update(bytes).digest();
    return timingSafeEqual(digest, dbRecord.contentSha256) ? "MATCH" : "MISMATCH";
  } catch {
    // Restore provider errors do not establish deletion or successful restore.
    return "UNKNOWN";
  } finally {
    bytes?.fill(0);
  }
}
