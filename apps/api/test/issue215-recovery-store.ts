import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

import { S3Client } from "@aws-sdk/client-s3";
import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";

const bucket = "issue215-recovery-fixture";
const alias = "issue215_test";

/** A deterministic signed-HTTP transport fixture; #282 qualifies the real provider. */
export class Issue215RecoveryStore {
  private readonly server: Server;
  private readonly objects = new Map<string, { bytes: Buffer; version: string }>();
  private readBarrier: { reached: () => void; release: Promise<void> } | undefined;
  endpoint = "";
  store!: S3PrivatePhotoStore;

  constructor() {
    this.server = createServer(async (req, res) => {
      if (typeof req.headers.authorization !== "string") {
        res.writeHead(403).end();
        return;
      }
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const base = `/${bucket}/`;
      if (!requestUrl.pathname.startsWith(base)) {
        res.writeHead(404).end();
        return;
      }
      const key = requestUrl.pathname.slice(base.length);
      if (!/^condition-photo\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i.test(key)) {
        res.writeHead(403).end();
        return;
      }
      const existing = this.objects.get(key);
      if (req.method === "PUT") {
        if (req.headers["if-none-match"] !== "*" ||
            typeof req.headers["x-amz-checksum-sha256"] !== "string") {
          res.writeHead(403).end();
          return;
        }
        if (existing) {
          res.writeHead(412).end();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const part of req) chunks.push(Buffer.from(part));
        const version = randomUUID();
        this.objects.set(key, { bytes: Buffer.concat(chunks), version });
        res.writeHead(200, { "x-amz-version-id": version }).end();
        return;
      }
      if (req.method === "GET" && this.readBarrier) {
        const barrier = this.readBarrier;
        this.readBarrier = undefined;
        barrier.reached();
        await barrier.release;
      }
      if (!existing) {
        res.writeHead(404, { "Content-Type": "application/xml" })
          .end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      const requestedVersion = requestUrl.searchParams.get("versionId");
      if (requestedVersion !== null && requestedVersion !== existing.version) {
        res.writeHead(404, { "Content-Type": "application/xml" })
          .end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      if (req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": existing.bytes.length,
          "x-amz-version-id": existing.version,
        }).end(existing.bytes);
      } else if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Length": existing.bytes.length,
          "x-amz-version-id": existing.version,
        }).end();
      } else {
        res.writeHead(405).end();
      }
    });
  }

  get bucketAlias() { return alias; }
  get config() {
    return { bucket, bucketAlias: alias, endpoint: this.endpoint,
      region: "us-east-1", allowTestHttp: true };
  }

  async start(): Promise<void> {
    await new Promise<void>((ok) => this.server.listen(0, "127.0.0.1", ok));
    const address = this.server.address();
    if (typeof address === "string" || address === null)
      throw new Error("Recovery store loopback port unavailable.");
    this.endpoint = `http://127.0.0.1:${address.port}`;
    const client = new S3Client({
      endpoint: this.endpoint, forcePathStyle: true, region: "us-east-1",
      maxAttempts: 1,
      credentials: { accessKeyId: "TEST_ONLY", secretAccessKey: "TEST_ONLY" },
    });
    this.store = new S3PrivatePhotoStore(this.config, client);
  }

  blockNextRead(reached: () => void, release: Promise<void>): void {
    this.readBarrier = { reached, release };
  }

  has(key: string): boolean { return this.objects.has(key); }

  async close(): Promise<void> {
    this.readBarrier = undefined;
    this.server.closeAllConnections();
    await new Promise<void>((ok) => this.server.close(() => ok()));
  }
}
