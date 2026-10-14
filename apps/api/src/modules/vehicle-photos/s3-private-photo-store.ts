import { createHash } from "node:crypto";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  type ConditionPhotoStorageConfig,
} from "./condition-photo-storage-config";
import {
  ConditionPhotoStorageError,
  type PrivatePhotoObject,
  type PrivatePhotoStore,
  type StoredPhotoRead,
} from "./private-photo-store";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const keyPattern = new RegExp(`^condition-photo/${uuid}/${uuid}$`, "i");
const maxBytes = 8 * 1024 * 1024;

function checkKey(key: string): void {
  if (!keyPattern.test(key)) throw new ConditionPhotoStorageError("UNAVAILABLE");
}

function providerReason(error: unknown, unknownWrite = false): ConditionPhotoStorageError {
  if (error instanceof ConditionPhotoStorageError) return error;
  const coded = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (coded.name === "AbortError" || coded.name === "TimeoutError")
    return new ConditionPhotoStorageError(unknownWrite ? "UNKNOWN" : "TIMEOUT");
  if (coded.name === "NoSuchKey")
    return new ConditionPhotoStorageError("NOT_FOUND");
  if (coded.$metadata?.httpStatusCode === 404)
    return new ConditionPhotoStorageError("UNAVAILABLE");
  if (coded.$metadata?.httpStatusCode === 412 || coded.name === "PreconditionFailed")
    return new ConditionPhotoStorageError("CONFLICT");
  return new ConditionPhotoStorageError(unknownWrite ? "UNKNOWN" : "UNAVAILABLE");
}

export class S3PrivatePhotoStore implements PrivatePhotoStore {
  private readonly s3: S3Client;

  constructor(private readonly config: ConditionPhotoStorageConfig, client?: S3Client) {
    this.s3 = client ?? new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      maxAttempts: 1,
    });
  }

  private async timed<T>(
    deadlineMs: number,
    action: (signal: AbortSignal) => Promise<T>,
    unknownWrite = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(15_000, deadlineMs));
    try {
      return await action(controller.signal);
    } catch (error) {
      throw providerReason(error, unknownWrite);
    } finally {
      clearTimeout(timer);
    }
  }

  async putIfAbsent(key: string, bytes: Buffer, deadlineMs = 15_000): Promise<PrivatePhotoObject> {
    checkKey(key);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maxBytes)
      throw new ConditionPhotoStorageError("UNAVAILABLE");
    const result = await this.timed(deadlineMs, (signal) => this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: "image/jpeg",
        ContentLength: bytes.length,
        IfNoneMatch: "*",
        ServerSideEncryption: "AES256",
        ChecksumSHA256: createHash("sha256").update(bytes).digest("base64"),
      }), { abortSignal: signal },
    ), true);
    return { key, version: result.VersionId ?? null };
  }

  async readExact(object: PrivatePhotoObject, deadlineMs = 15_000): Promise<StoredPhotoRead> {
    checkKey(object.key);
    return await this.timed(deadlineMs, async (signal) => {
      const result = await this.s3.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: object.key,
        ...(object.version === null ? {} : { VersionId: object.version }),
      }), { abortSignal: signal });
      if (!result.Body) throw new ConditionPhotoStorageError("NOT_FOUND");
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        const part = Buffer.from(chunk);
        total += part.length;
        if (total > maxBytes) throw new ConditionPhotoStorageError("UNAVAILABLE");
        chunks.push(part);
      }
      if (total === 0) throw new ConditionPhotoStorageError("UNAVAILABLE");
      if (object.version !== null && result.VersionId !== object.version)
        throw new ConditionPhotoStorageError("CONFLICT");
      return { bytes: Buffer.concat(chunks, total), version: result.VersionId ?? null };
    });
  }

  async statExact(object: PrivatePhotoObject, deadlineMs = 15_000) {
    checkKey(object.key);
    try {
      const result = await this.timed(deadlineMs, (signal) => this.s3.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: object.key,
          ...(object.version === null ? {} : { VersionId: object.version }),
        }), { abortSignal: signal },
      ));
      return {
        exists: true,
        ...(typeof result.ContentLength === "number" ? { size: result.ContentLength } : {}),
        version: result.VersionId ?? null,
      };
    } catch (error) {
      if (error instanceof ConditionPhotoStorageError && error.reason === "NOT_FOUND")
        return { exists: false };
      throw error;
    }
  }

  async deleteAbandonedExact(_object: PrivatePhotoObject): Promise<never> {
    void _object;
    // P5 must use a separately provisioned cleanup-only identity and SQL
    // tombstone fencing. Upload/runtime credentials are never delete-capable.
    throw new ConditionPhotoStorageError("UNAVAILABLE");
  }
}
