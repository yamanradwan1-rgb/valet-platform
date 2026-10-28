import { createHash } from "node:crypto";
import { ConditionPhotoDecodeError } from "./condition-photo-decode-error";
import { conditionPhotoDecodeQueue } from "./condition-photo-decode-queue";
import { runConditionPhotoWorker } from "./condition-photo-worker-runner";
import { conditionPhotoProcessingMetrics as metrics } from "./condition-photo-processing-metrics";

export interface CanonicalConditionPhoto {
  readonly sourceSha256: Buffer;
  readonly sourceByteSize: number;
  readonly canonicalSha256: Buffer;
  readonly canonicalByteSize: number;
  readonly canonicalBytes: Buffer;
  readonly width: number;
  readonly height: number;
  readonly normalizationVersion: 1;
}

export { ConditionPhotoDecodeError } from "./condition-photo-decode-error";

const maxBytes = 8 * 1024 * 1024;

export async function canonicalizeConditionJpeg(
  bytes: Buffer,
  signal?: AbortSignal,
): Promise<CanonicalConditionPhoto> {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > maxBytes
  ) {
    metrics.failures.tooLarge++;
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_TOO_LARGE");
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    metrics.failures.invalidImage++;
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
  }
  try {
    const reply = await conditionPhotoDecodeQueue.execute(
      bytes.length,
      (abort) => runConditionPhotoWorker(bytes, false, abort),
      signal,
    );
    if (!reply.ok || !reply.data || !reply.width || !reply.height) {
      metrics.failures.invalidImage++;
      throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
    }
    const canonicalBytes = Buffer.from(reply.data);
    if (canonicalBytes.length === 0 || canonicalBytes.length > maxBytes)
      throw new ConditionPhotoDecodeError("CONDITION_PHOTO_TOO_LARGE");
    metrics.decoded++;
    return {
      sourceSha256: createHash("sha256").update(bytes).digest(),
      sourceByteSize: bytes.length,
      canonicalSha256: createHash("sha256").update(canonicalBytes).digest(),
      canonicalByteSize: canonicalBytes.length,
      canonicalBytes,
      width: reply.width,
      height: reply.height,
      normalizationVersion: 1,
    };
  } catch (error) {
    if (error instanceof ConditionPhotoDecodeError) throw error;
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
  }
}

/** Reconcile only immutable bytes already stored by a trusted server attempt. */
export async function verifyStoredConditionJpeg(bytes: Buffer): Promise<{
  readonly canonicalSha256: Buffer;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}> {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes.length > maxBytes)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
  try {
    const reply = await conditionPhotoDecodeQueue.execute(bytes.length, () =>
      runConditionPhotoWorker(bytes, true),
    );
    if (!reply.ok || !reply.width || !reply.height || !reply.data)
      throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
    if (!Buffer.from(reply.data).equals(bytes))
      throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
    return {
      canonicalSha256: createHash("sha256").update(bytes).digest(),
      byteSize: bytes.length,
      width: reply.width,
      height: reply.height,
    };
  } catch (error) {
    if (error instanceof ConditionPhotoDecodeError) throw error;
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
  }
}
