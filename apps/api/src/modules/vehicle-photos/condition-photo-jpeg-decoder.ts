import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

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

export class ConditionPhotoDecodeError extends Error {
  constructor(readonly code: "CONDITION_PHOTO_INVALID_IMAGE" | "CONDITION_PHOTO_TOO_LARGE" | "CONDITION_PHOTO_STORAGE_UNAVAILABLE") {
    super("The condition photo could not be verified.");
  }
}

const maxBytes = 8 * 1024 * 1024;
let activeJobs = 0;

interface WorkerReply {
  readonly ok: boolean;
  readonly data?: Uint8Array;
  readonly width?: number;
  readonly height?: number;
}

function workerFilename(): { filename: string; execArgv?: string[] } {
  const compiled = join(__dirname, "condition-photo-jpeg-worker.js");
  if (existsSync(compiled)) return { filename: compiled };
  return {
    filename: join(__dirname, "condition-photo-jpeg-worker.ts"),
    execArgv: ["--import", "tsx"],
  };
}

async function transform(bytes: Buffer, verifyOnly = false): Promise<WorkerReply> {
  const options = workerFilename();
  const worker = new Worker(options.filename, {
    ...(options.execArgv ? { execArgv: options.execArgv } : {}),
    workerData: { bytes, verifyOnly },
    resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
  });
  try {
    return await new Promise<WorkerReply>((resolve, reject) => {
      let finished = false;
      const settle = (reply?: WorkerReply, error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(reply!);
      };
      const timer = setTimeout(() => settle(undefined, new Error("decode timeout")), 5000);
      worker.once("message", (reply: WorkerReply) => settle(reply));
      worker.once("error", () => settle(undefined, new Error("decode worker failure")));
      worker.once("exit", (code) => {
        if (code !== 0) settle(undefined, new Error("decode worker exited"));
      });
    });
  } finally {
    await worker.terminate();
  }
}

export async function canonicalizeConditionJpeg(
  bytes: Buffer,
): Promise<CanonicalConditionPhoto> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_TOO_LARGE");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
  if (activeJobs >= 2)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  activeJobs += 1;
  try {
    const reply = await transform(bytes);
    if (!reply.ok || !reply.data || !reply.width || !reply.height)
      throw new ConditionPhotoDecodeError("CONDITION_PHOTO_INVALID_IMAGE");
    const canonicalBytes = Buffer.from(reply.data);
    if (canonicalBytes.length === 0 || canonicalBytes.length > maxBytes)
      throw new ConditionPhotoDecodeError("CONDITION_PHOTO_TOO_LARGE");
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
  } finally {
    activeJobs -= 1;
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
  if (activeJobs >= 2)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  activeJobs += 1;
  try {
    const reply = await transform(bytes, true);
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
  } finally {
    activeJobs -= 1;
  }
}
