import { createServer } from "node:https";

/** Real TLS socket and bounded synthetic response; no uploaded bytes retained. */
export async function startIssue429HttpsMock({
  certificate,
  privateKey,
  expectedToken,
  initialReply = { status: 201, body: { results: [] }, delayMs: 0 },
}) {
  if (!certificate || !privateKey || !expectedToken) {
    throw new Error("HTTPS mock requires test TLS materials and an ephemeral token.");
  }
  let reply = initialReply;
  let received = 0;
  let completed = 0;
  let rejected = 0;
  let active = 0;
  let peakActive = 0;
  let maximumUploadBytes = 0;
  const server = createServer({ key: privateKey, cert: certificate }, async (request, response) => {
    if (request.method !== "POST" || request.url !== "/ocr") {
      rejected += 1;
      response.writeHead(404).end();
      request.resume();
      return;
    }
    if (request.headers.authorization !== `Token ${expectedToken}`) {
      rejected += 1;
      response.writeHead(403).end();
      request.resume();
      return;
    }
    active += 1;
    received += 1;
    peakActive = Math.max(peakActive, active);
    try {
      let totalBytes = 0;
      for await (const chunk of request) {
        totalBytes += chunk.length;
        if (totalBytes > 2 * 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
      }
      maximumUploadBytes = Math.max(maximumUploadBytes, totalBytes);
      if (reply.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      }
      const body = JSON.stringify(reply.body);
      response.writeHead(reply.status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(body),
      });
      response.end(body);
      completed += 1;
    } catch {
      if (!response.headersSent) response.writeHead(500).end();
    } finally {
      active -= 1;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("HTTPS mock failed to bind an ephemeral loopback port.");
  }
  return {
    endpoint: `https://127.0.0.1:${address.port}/ocr`,
    setReply(nextReply) {
      if (active !== 0) throw new Error("Cannot switch behavior during provider work.");
      if (!Number.isInteger(nextReply.status) ||
          !Number.isInteger(nextReply.delayMs) || nextReply.delayMs < 0 ||
          nextReply.delayMs > 20_000) {
        throw new Error("Invalid bounded HTTPS mock reply.");
      }
      reply = nextReply;
    },
    snapshot: () => ({
      received, completed, rejected, active, peakActive, maximumUploadBytes,
    }),
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
