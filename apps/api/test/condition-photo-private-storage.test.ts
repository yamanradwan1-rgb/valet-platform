import { Readable } from "node:stream";

import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { resolveConditionPhotoStorageConfig } from "../src/modules/vehicle-photos/condition-photo-storage-config";
import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";

const object = {
  key: "condition-photo/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",
  version: null,
};
const config = {
  bucket: "issue215-private-fixture",
  bucketAlias: "test_private",
  region: "us-east-1",
  endpoint: "http://127.0.0.1:9000",
  allowTestHttp: true,
};

describe("condition photo private storage boundary", () => {
  it("rejects absent, unsafe, or caller-controlled endpoint settings", () => {
    expect(resolveConditionPhotoStorageConfig({})).toBeUndefined();
    expect(() => resolveConditionPhotoStorageConfig({
      NODE_ENV: "production",
      CONDITION_PHOTO_STORAGE_ENABLED: "true",
      CONDITION_PHOTO_PRIVATE_BUCKET: config.bucket,
      CONDITION_PHOTO_BUCKET_ALIAS: config.bucketAlias,
      CONDITION_PHOTO_STORAGE_REGION: config.region,
      CONDITION_PHOTO_STORAGE_ENDPOINT: config.endpoint,
    })).toThrow();
    expect(() => resolveConditionPhotoStorageConfig({
      NODE_ENV: "production",
      CONDITION_PHOTO_STORAGE_ENABLED: "true",
      CONDITION_PHOTO_PRIVATE_BUCKET: config.bucket,
      CONDITION_PHOTO_BUCKET_ALIAS: config.bucketAlias,
      CONDITION_PHOTO_STORAGE_REGION: config.region,
      CONDITION_PHOTO_STORAGE_ENDPOINT: "https://s3.example.invalid/",
    })).toThrow();
    expect(resolveConditionPhotoStorageConfig({
      NODE_ENV: "test",
      CONDITION_PHOTO_STORAGE_ENABLED: "true",
      CONDITION_PHOTO_ALLOW_TEST_HTTP: "true",
      CONDITION_PHOTO_PRIVATE_BUCKET: config.bucket,
      CONDITION_PHOTO_BUCKET_ALIAS: config.bucketAlias,
      CONDITION_PHOTO_STORAGE_REGION: config.region,
      CONDITION_PHOTO_STORAGE_ENDPOINT: config.endpoint,
    })).toEqual(config);
  });

  it("uses write-once conditional PUT with server-side encryption", async () => {
    const send = vi.fn(async (...args: unknown[]) => {
      void args;
      return { VersionId: "version-a" };
    });
    const store = new S3PrivatePhotoStore(config, { send } as unknown as S3Client);
    const bytes = Buffer.from("synthetic-test-jpeg");
    const result = await store.putIfAbsent(object.key, bytes);
    expect(result).toEqual({ ...object, version: "version-a" });
    const command = send.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> };
    expect(command.input.IfNoneMatch).toBe("*");
    expect(command.input.ServerSideEncryption).toBe("AES256");
    expect(command.input.ContentType).toBe("image/jpeg");
    expect(command.input.Body).toBe(bytes);
  });

  it("reads actual bounded bytes, not ETag or HEAD", async () => {
    const send = vi.fn(async (...args: unknown[]) => {
      void args;
      return {
        Body: Readable.from([Buffer.from("synthetic"), Buffer.from("jpeg")]),
        VersionId: "version-a",
      };
    });
    const store = new S3PrivatePhotoStore(config, { send } as unknown as S3Client);
    const output = await store.readExact({ ...object, version: "version-a" });
    expect(output.bytes.toString()).toBe("syntheticjpeg");
    const command = send.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> };
    expect(command.input.VersionId).toBe("version-a");
  });

  it("rejects unsafe keys and cannot delete using upload credentials", async () => {
    const send = vi.fn();
    const store = new S3PrivatePhotoStore(config, { send } as unknown as S3Client);
    await expect(store.putIfAbsent("../../secrets", Buffer.from("bytes")))
      .rejects.toThrow();
    await expect(store.deleteAbandonedExact(object)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("does not misinterpret a missing bucket or ambiguous 404 as confirmed missing bytes", async () => {
    for (const name of ["NoSuchBucket", "NotFound", "Unknown"]) {
      const missingBucket = Object.assign(new Error("not available"), {
        name,
        $metadata: { httpStatusCode: 404 },
      });
      const send = vi.fn(async () => { throw missingBucket; });
      const store = new S3PrivatePhotoStore(config, { send } as unknown as S3Client);
      await expect(store.readExact(object)).rejects.toMatchObject({
        reason: "UNAVAILABLE",
      });
    }
  });
});
