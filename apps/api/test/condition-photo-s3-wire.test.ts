import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

import { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";
import { ConditionPhotoStorageError } from "../src/modules/vehicle-photos/private-photo-store";

const bucket = "issue215-only-test";
const first = randomUUID();
const second = randomUUID();
const key = `condition-photo/${first}/${second}`;
const bytes = Buffer.from([255, 216, 255, 217, 17, 18, 19]);
let server: Server;
let store: S3PrivatePhotoStore;
let actual: Buffer | undefined;
let gotSignedPut = false;
let gotChecksum = false;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const target = `/${bucket}/${key}`;
    if (requestUrl.pathname !== target) {
      res.writeHead(404).end();
      return;
    }
    // Test-only HTTP protocol fixture, NOT a private IAM/bucket qualification.
    if (typeof req.headers.authorization !== "string") {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "PUT") {
      gotSignedPut = req.headers["if-none-match"] === "*";
      gotChecksum = typeof req.headers["x-amz-checksum-sha256"] === "string";
      if (actual) {
        res.writeHead(412).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      actual = Buffer.concat(chunks);
      res.writeHead(200, { "x-amz-version-id": "version-a" }).end();
      return;
    }
    if (!actual) {
      res.writeHead(404).end();
      return;
    }
    if (requestUrl.searchParams.get("versionId") !== "version-a") {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": String(actual.length),
        "x-amz-version-id": "version-a",
      }).end(actual);
      return;
    }
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Length": String(actual.length),
        "x-amz-version-id": "version-a",
      }).end();
      return;
    }
    res.writeHead(405).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("No isolated loopback port.");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId: "TEST_ONLY_ACCESS", secretAccessKey: "TEST_ONLY_SECRET" },
  });
  store = new S3PrivatePhotoStore({
    bucket, bucketAlias: "test", endpoint,
    region: "us-east-1", allowTestHttp: true,
  }, client);
}, 10_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe("private S3 adapter over real loopback HTTP", () => {
  it("performs conditional signed PUT, immutable conflict, exact version GET/HEAD", async () => {
    const written = await store.putIfAbsent(key, bytes);
    expect(written).toEqual({ key, version: "version-a" });
    expect(gotSignedPut).toBe(true);
    expect(gotChecksum).toBe(true);
    await expect(store.putIfAbsent(key, bytes)).rejects.toMatchObject({
      reason: "CONFLICT",
    } satisfies Pick<ConditionPhotoStorageError, "reason">);
    const retrieved = await store.readExact(written);
    expect(retrieved.bytes).toEqual(bytes);
    expect(retrieved.version).toBe("version-a");
    expect(await store.statExact(written)).toMatchObject({
      exists: true, size: bytes.length, version: "version-a",
    });
  });
});
