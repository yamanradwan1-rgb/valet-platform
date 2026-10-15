import { timingSafeEqual } from "node:crypto";

import { ConditionPhotoDecodeError, verifyStoredConditionJpeg } from "./condition-photo-jpeg-decoder";
import { ConditionPhotoStorageError, type PrivatePhotoStore } from "./private-photo-store";

interface VerifiedCandidate {
  readonly photoId: string;
  readonly objectKey: string;
  readonly version: string;
  readonly byteSize: number;
  readonly sha256: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bucketAlias: string;
  readonly availability: "AVAILABLE";
}

export interface PhotoIntegrityJournal {
  /** A bounded, independently authorized SECURITY DEFINER read. */
  availableCandidates(limit: number): Promise<readonly VerifiedCandidate[]>;
  /** Atomic AVAILABLE -> UNAVAILABLE + append-only SYSTEM audit event. */
  markUnavailable(photoId: string, reason: "MISSING_OBJECT" | "CONTENT_MISMATCH"): Promise<boolean>;
}

export interface PhotoIntegrityMetrics {
  readonly checked: number;
  readonly changed: number;
  readonly unavailable: number;
  readonly unknown: number;
  readonly rejected: number;
}

const keyPattern = /^condition-photo\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function inspectConditionPhotoIntegrity(
  journal: PhotoIntegrityJournal,
  store: Pick<PrivatePhotoStore, "readExact">,
  bucketAlias: string,
  options: { batchSize?: number; strongVersionedReadProved?: boolean } = {},
): Promise<PhotoIntegrityMetrics> {
  const limit = options.batchSize ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Condition photo integrity batch size is invalid.");
  const candidates = await journal.availableCandidates(limit);
  if (candidates.length > limit) throw new Error("Unbounded integrity discovery.");
  const metrics = { checked: 0, changed: 0, unavailable: 0, unknown: 0, rejected: 0 };
  for (const candidate of candidates) {
    if (candidate.availability !== "AVAILABLE" ||
        candidate.bucketAlias !== bucketAlias ||
        !uuidPattern.test(candidate.photoId) ||
        !keyPattern.test(candidate.objectKey) ||
        !candidate.version || candidate.version.length > 240 ||
        !Buffer.isBuffer(candidate.sha256) || candidate.sha256.length !== 32 ||
        !Number.isSafeInteger(candidate.byteSize) || candidate.byteSize < 1 ||
        candidate.byteSize > 8 * 1024 * 1024) {
      metrics.rejected++;
      continue;
    }
    let reason: "MISSING_OBJECT" | "CONTENT_MISMATCH" | undefined;
    let bytes: Buffer | undefined;
    try {
      const exact = await store.readExact({ key: candidate.objectKey, version: candidate.version });
      bytes = exact.bytes;
      if (exact.version !== candidate.version || bytes.length !== candidate.byteSize) {
        reason = "CONTENT_MISMATCH";
      } else {
        const found = await verifyStoredConditionJpeg(bytes);
        if (found.width !== candidate.width || found.height !== candidate.height ||
            !timingSafeEqual(found.canonicalSha256, candidate.sha256))
          reason = "CONTENT_MISMATCH";
      }
    } catch (error) {
      if (error instanceof ConditionPhotoStorageError) {
        if (error.reason === "NOT_FOUND" && options.strongVersionedReadProved)
          reason = "MISSING_OBJECT";
        else metrics.unknown++;
      } else if (error instanceof ConditionPhotoDecodeError &&
                 error.code === "CONDITION_PHOTO_INVALID_IMAGE" && bytes) {
        reason = "CONTENT_MISMATCH";
      } else metrics.unknown++;
    } finally {
      bytes?.fill(0);
    }
    metrics.checked++;
    if (!reason) continue;
    try {
      if (await journal.markUnavailable(candidate.photoId, reason)) metrics.changed++;
      metrics.unavailable++;
    } catch { metrics.unknown++; }
  }
  return metrics;
}
