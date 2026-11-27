import { createServer, request } from "node:http";

const ratingPath = "/v1/guest/session/rating";
const hopHeaders = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
]);

function forwardedHeaders(headers) {
  const nominated = String(headers.connection ?? "")
    .split(",").map((name) => name.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name]) =>
    !hopHeaders.has(name) && !nominated.includes(name)));
}

function loopbackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
      !url.port || url.pathname !== "/" || url.username || url.password ||
      url.search || url.hash) {
    throw new Error("Issue463 proxy requires an explicit loopback HTTP origin.");
  }
  return url;
}

/**
 * Test-only byte-preserving forwarder. Its caller must independently attest
 * the actual API and its disposable database; this helper cannot do that.
 * Never records bodies, cookies, tokens or query strings in evidence.
 */
export async function startIssue463BrowserProxy(apiOrigin) {
  const target = loopbackOrigin(apiOrigin);
  let dropNextRatingResponse = false;
  let ratingPosts = 0;
  let droppedSuccessfulResponses = 0;
  const server = createServer((incoming, outgoing) => {
    const path = incoming.url ?? "";
    if (!path.startsWith("/v1/") || path.startsWith("//") ||
        path.includes("\\") || path.includes("#")) {
      outgoing.writeHead(404).end();
      return;
    }
    const rating = incoming.method === "POST" &&
      path.split("?")[0] === ratingPath;
    if (rating) ratingPosts++;
    const drop = rating && dropNextRatingResponse;
    if (drop) dropNextRatingResponse = false;
    const upstream = request({
      hostname: target.hostname,
      port: target.port,
      path,
      method: incoming.method,
      headers: forwardedHeaders(incoming.headers),
    }, (response) => {
      const status = response.statusCode ?? 502;
      if (drop && status >= 200 && status < 300) {
        // A successful upstream response must finish before loss injection.
        // The E2E assertion must separately verify committed database state.
        response.on("end", () => {
          droppedSuccessfulResponses++;
          outgoing.destroy();
        });
        response.on("error", () => outgoing.destroy());
        response.resume();
      } else {
        outgoing.writeHead(status, forwardedHeaders(response.headers));
        response.on("error", () => outgoing.destroy());
        response.pipe(outgoing);
      }
    });
    upstream.on("error", () => {
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(502).end();
    });
    incoming.on("aborted", () => upstream.destroy());
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Issue463 proxy has no TCP address.");
  }
  return {
    origin: "http://127.0.0.1:" + address.port,
    armLostRatingResponse() {
      if (dropNextRatingResponse) throw new Error("Loss injection already armed.");
      dropNextRatingResponse = true;
    },
    observations() {
      return { ratingPosts, droppedSuccessfulResponses };
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) =>
        error ? reject(error) : resolve()));
    },
  };
}
