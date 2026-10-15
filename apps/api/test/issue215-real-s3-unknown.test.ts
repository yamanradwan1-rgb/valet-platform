import { randomUUID } from "node:crypto";
import { createServer, request, type Server } from "node:http";

import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";

const enabled = process.env.ISSUE215_REAL_S3_ENABLED === "true";
const endpoint = process.env.ISSUE215_S3_ENDPOINT ?? "";
const bucket = process.env.ISSUE215_S3_BUCKET ?? "";
const accessKeyId = process.env.ISSUE215_S3_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.ISSUE215_S3_SECRET_ACCESS_KEY ?? "";
if (enabled && (
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint) ||
  bucket !== "issue215-s3-worker4" ||
  !/^issue215app[a-f0-9]{10}$/.test(accessKeyId) ||
  !/^[a-f0-9]{56}$/.test(secretAccessKey)
)) throw new Error("Unknown-outcome tests require isolated Issue #215 MinIO credentials.");

function storeAt(host: string): S3PrivatePhotoStore {
  const client = new S3Client({
    region: "us-east-1", endpoint: host, forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1,
  });
  return new S3PrivatePhotoStore({
    bucket, bucketAlias: "issue215_local", region: "us-east-1",
    endpoint: host, allowTestHttp: true,
  }, client);
}

async function proxyServer(mode: "discard-put-ack" | "hang-get"): Promise<{
  endpoint: string;
  upstreamAcknowledged: () => boolean;
  close: () => Promise<void>;
}> {
  let upstreamAck = false;
  const server: Server = createServer((incoming, outgoing) => {
    if (mode === "hang-get" && incoming.method === "GET") {
      incoming.resume();
      return;
    }
    const destination = new URL(incoming.url ?? "/", endpoint);
    // Preserve the signed Host header while forwarding to the actual MinIO
    // loopback server. Only the response acknowledgement is fault injected.
    const upstream = request(destination, {
      method: incoming.method,
      headers: incoming.headers,
    }, (response) => {
      if (mode === "discard-put-ack" && incoming.method === "PUT" &&
          response.statusCode !== undefined && response.statusCode < 300) {
        upstreamAck = true;
        response.resume();
        response.on("end", () => outgoing.destroy());
        return;
      }
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const bound = server.address();
  if (!bound || typeof bound === "string") throw new Error("Proxy lacks a loopback port.");
  return {
    endpoint: `http://127.0.0.1:${bound.port}`,
    upstreamAcknowledged: () => upstreamAck,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe.skipIf(!enabled)("issue #215 real MinIO external-I/O failure injection", () => {
  it("survives a persisted conditional PUT with lost HTTP acknowledgment by exact-byte readback", async () => {
    const proxy = await proxyServer("discard-put-ack");
    const key = `condition-photo/${randomUUID()}/${randomUUID()}`;
    const bytes = Buffer.from(`issue215-lost-ack-${randomUUID()}`);
    try {
      await expect(storeAt(proxy.endpoint).putIfAbsent(key, bytes))
        .rejects.toMatchObject({ reason: "UNKNOWN" });
      expect(proxy.upstreamAcknowledged()).toBe(true);

      const direct = storeAt(endpoint);
      const metadata = await direct.statExact({ key, version: null });
      expect(metadata).toMatchObject({ exists: true, size: bytes.length });
      if (!metadata.exists || !("version" in metadata) || !metadata.version)
        throw new Error("Provider did not return a qualifying exact object version.");
      const exactVersion = metadata.version;
      expect(await direct.readExact({ key, version: exactVersion }))
        .toMatchObject({ bytes, version: exactVersion });
      await expect(direct.putIfAbsent(key, bytes))
        .rejects.toMatchObject({ reason: "CONFLICT" });
    } finally {
      await proxy.close();
    }
  });

  it("fails closed on a stalled exact-version GET and leaves the real object readable", async () => {
    const direct = storeAt(endpoint);
    const key = `condition-photo/${randomUUID()}/${randomUUID()}`;
    const bytes = Buffer.from(`issue215-read-timeout-${randomUUID()}`);
    const object = await direct.putIfAbsent(key, bytes);
    const proxy = await proxyServer("hang-get");
    try {
      await expect(storeAt(proxy.endpoint).readExact(object, 100))
        .rejects.toMatchObject({ reason: "TIMEOUT" });
      expect((await direct.readExact(object)).bytes).toEqual(bytes);
    } finally {
      await proxy.close();
    }
  });
});
