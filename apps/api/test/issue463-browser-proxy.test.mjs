import { Buffer } from "node:buffer";
import { URL } from "node:url";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { test } from "node:test";
import { startIssue463BrowserProxy } from "./issue463-browser-proxy.mjs";

async function upstream(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function withProxy(handler, body) {
  const target = await upstream(handler);
  const proxy = await startIssue463BrowserProxy(target.origin);
  try { await body(proxy); }
  finally { await proxy.close(); await target.close(); }
}

function send(origin, payload, path = "/v1/guest/session/rating") {
  return new Promise((resolve, reject) => {
    const outgoing = request(new URL(path, origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": payload.length,
        cookie: "fixture=synthetic",
        "x-vaylet-guest-session": "v1",
      },
    }, (response) => {
      const parts = [];
      response.on("data", (part) => parts.push(part));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: Buffer.concat(parts),
        headers: response.headers,
      }));
      response.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

test("forwards exact bytes and cookie/CSRF headers, preserves response cookies", async () => {
  const payload = Buffer.from([123, 34, 120, 34, 58, 34, 0xc3, 0x28, 34, 125]);
  let received;
  await withProxy((req, res) => {
    const parts = [];
    req.on("data", (part) => parts.push(part));
    req.on("end", () => {
      received = { body: Buffer.concat(parts), headers: req.headers };
      res.writeHead(400, {
        "content-type": "application/json",
        "set-cookie": ["first=1; HttpOnly", "second=2; Secure"],
      }).end('{"code":"REQUEST_INVALID"}');
    });
  }, async (proxy) => {
    const result = await send(proxy.origin, payload);
    assert.deepEqual(received.body, payload);
    assert.equal(received.headers.cookie, "fixture=synthetic");
    assert.equal(received.headers["x-vaylet-guest-session"], "v1");
    assert.equal(result.status, 400);
    assert.deepEqual(result.headers["set-cookie"], [
      "first=1; HttpOnly", "second=2; Secure",
    ]);
    assert.deepEqual(proxy.observations(), {
      ratingPosts: 1, droppedSuccessfulResponses: 0,
    });
  });
});

test("drops exactly one completed successful rating response and never resends", async () => {
  let posts = 0;
  let completed = 0;
  await withProxy((req, res) => {
    posts++;
    req.resume();
    req.on("end", () => {
      completed++;
      res.writeHead(200, { "content-type": "application/json" })
        .end('{"rating":5}');
    });
  }, async (proxy) => {
    proxy.armLostRatingResponse();
    await assert.rejects(send(proxy.origin, Buffer.from('{"rating":5}')));
    assert.equal(posts, 1);
    assert.equal(completed, 1);
    assert.deepEqual(proxy.observations(), {
      ratingPosts: 1, droppedSuccessfulResponses: 1,
    });
    assert.equal((await send(proxy.origin, Buffer.from('{"rating":5}'))).status, 200);
    assert.equal(posts, 2);
    assert.equal(proxy.observations().droppedSuccessfulResponses, 1);
  });
});

test("failure response is not disguised as a lost successful response", async () => {
  await withProxy((req, res) => {
    req.resume();
    req.on("end", () => res.writeHead(409).end("conflict"));
  }, async (proxy) => {
    proxy.armLostRatingResponse();
    const result = await send(proxy.origin, Buffer.from("{}"));
    assert.equal(result.status, 409);
    assert.equal(result.body.toString(), "conflict");
    assert.equal(proxy.observations().droppedSuccessfulResponses, 0);
  });
});

test("rejects external and ambiguous origins before opening a proxy", async () => {
  for (const origin of [
    "http://example.com:1234", "https://127.0.0.1:1234",
    "http://127.0.0.1:1234/v1", "http://127.0.0.1",
    "http://user:password@127.0.0.1:1234",
  ]) await assert.rejects(startIssue463BrowserProxy(origin));
});
