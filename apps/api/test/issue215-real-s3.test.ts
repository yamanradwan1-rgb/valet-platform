import { createHash, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";

// Ordinary unit/CI runs cannot accidentally pass off a fake server as real S3.
// scripts/issue215-local-s3/run.mjs enables this suite with disposable credentials.
const enabled = process.env.ISSUE215_REAL_S3_ENABLED === "true";
const environment = process.env;
const endpoint = environment.ISSUE215_S3_ENDPOINT ?? "";
const bucket = environment.ISSUE215_S3_BUCKET ?? "";
const accessKeyId = environment.ISSUE215_S3_ACCESS_KEY_ID ?? "";
const secretAccessKey = environment.ISSUE215_S3_SECRET_ACCESS_KEY ?? "";
if (enabled && (
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint) ||
  bucket !== "issue215-s3-worker4" ||
  !/^issue215app[a-f0-9]{10}$/.test(accessKeyId) ||
  !/^[a-f0-9]{56}$/.test(secretAccessKey)
)) throw new Error("Issue #215 real S3 test requires its own disposable loopback identity.");

const client = enabled
  ? new S3Client({
    region: "us-east-1", endpoint, forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1,
  })
  : undefined;
const store = client
  ? new S3PrivatePhotoStore({
    region: "us-east-1", endpoint, bucket, bucketAlias: "issue215_local",
    allowTestHttp: true,
  }, client)
  : undefined;
const photoKey = () => `condition-photo/${randomUUID()}/${randomUUID()}`;
const payload = (tag: string) =>
  Buffer.from(`local-S3-SDK-integration-${tag}-${randomUUID()}`, "utf8");
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");

async function denied(action: Promise<unknown>): Promise<void> {
  await expect(action).rejects.toMatchObject({
    $metadata: { httpStatusCode: 403 },
  });
}

describe.skipIf(!enabled)("issue #215 real MinIO private provider qualification", () => {
  it("writes canonical-byte surrogate exactly once and verifies full versioned GET/HEAD with SSE", async () => {
    const key = photoKey();
    const bytes = payload("exact-version");
    const object = await store!.putIfAbsent(key, bytes);
    expect(object.version).toBeTruthy();
    expect(object.version).not.toBe("null");
    await expect(store!.putIfAbsent(key, payload("overwrite")))
      .rejects.toMatchObject({ reason: "CONFLICT" });

    const read = await store!.readExact(object);
    expect(read.version).toBe(object.version);
    expect(read.bytes).toEqual(bytes);
    expect(sha(read.bytes)).toBe(sha(bytes));
    expect(await store!.statExact(object)).toMatchObject({
      exists: true, size: bytes.length, version: object.version,
    });
    const meta = await client!.send(new HeadObjectCommand({
      Bucket: bucket, Key: key, VersionId: object.version!,
    }));
    expect(meta.ServerSideEncryption).toBe("AES256");
    expect(meta.VersionId).toBe(object.version);
  });

  it("refuses wrong object versions and missing objects without qualifying bytes", async () => {
    const key = photoKey();
    const bytes = payload("version-confusion");
    const object = await store!.putIfAbsent(key, bytes);
    const wrong = { key, version: randomUUID() };
    await expect(store!.readExact(wrong)).rejects.toThrow();
    await expect(store!.statExact(wrong)).rejects.toThrow();
    expect((await store!.readExact(object)).bytes).toEqual(bytes);
    const nonexistent = { key: photoKey(), version: object.version };
    await expect(store!.readExact(nonexistent)).rejects.toThrow();
  });

  it("allows just one creator under simultaneous conditional PUT attempts", async () => {
    const key = photoKey();
    const writes = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        store!.putIfAbsent(key, payload(`concurrent-${index}`))),
    );
    const accepted = writes.filter((result) => result.status === "fulfilled");
    const rejected = writes.filter((result) => result.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const result of rejected) {
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ reason: "CONFLICT" });
    }
  });

  it("blocks anonymous GET/LIST and signed runtime LIST, DELETE and cross-prefix access", async () => {
    const key = photoKey();
    const object = await store!.putIfAbsent(key, payload("private"));
    const uri = `${endpoint}/${bucket}/${key}?versionId=${encodeURIComponent(object.version!)}`;
    const anonymousGet = await fetch(uri);
    expect(anonymousGet.status).toBe(403);
    const anonymousList = await fetch(`${endpoint}/${bucket}?list-type=2`);
    expect(anonymousList.status).toBe(403);

    await denied(client!.send(new ListObjectsV2Command({ Bucket: bucket })));
    await denied(client!.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
    await denied(client!.send(new DeleteObjectCommand({
      Bucket: bucket, Key: key, VersionId: object.version!,
    })));
    await denied(client!.send(new PutObjectCommand({
      Bucket: bucket, Key: `other-purpose/${randomUUID()}`,
      Body: Buffer.from("disallowed"), IfNoneMatch: "*",
    })));
    await denied(client!.send(new GetObjectCommand({
      Bucket: bucket, Key: `other-purpose/${randomUUID()}`,
    })));
    await expect(store!.deleteAbandonedExact(object))
      .rejects.toMatchObject({ reason: "UNAVAILABLE" });
    expect((await store!.readExact(object)).version).toBe(object.version);
  });
});
