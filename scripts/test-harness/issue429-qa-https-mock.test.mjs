import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { resolve } from "node:path";
import { test } from "node:test";

import { startIssue429HttpsMock } from "./issue429-qa-https-mock.mjs";
import { createIssue429TlsFixture } from "./issue429-qa-tls-fixture.mjs";

const openssl = process.env.ISSUE429_QA_OPENSSL ?? "openssl";
let available = false;
try {
  execFileSync(openssl, ["version"], { timeout: 3_000, stdio: "ignore" });
  available = true;
} catch { /* A missing local OpenSSL is NOT a TLS verification PASS. */ }

function call(url, ca, authorization) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "POST", ca, rejectUnauthorized: true,
      headers: { Authorization: authorization, "Content-Type": "application/octet-stream" },
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.once("error", reject);
    request.end(Buffer.from([255, 216, 255, 217]));
  });
}

test("real TLS mock accepts authenticated calls and never retains image or token", {
  skip: !available ? "OpenSSL unavailable: real ephemeral HTTPS proof NOT RUN" : false,
}, async () => {
  const fixture = createIssue429TlsFixture(resolve(import.meta.dirname, "../.."), openssl);
  const mock = await startIssue429HttpsMock({
    certificate: fixture.certificate,
    privateKey: fixture.privateKey,
    expectedToken: "issue429-synthetic-only",
  });
  try {
    const wrong = await call(mock.endpoint, fixture.certificate, "Token wrong");
    assert.equal(wrong.status, 403);
    const valid = await call(mock.endpoint, fixture.certificate,
      "Token issue429-synthetic-only");
    assert.equal(valid.status, 201);
    assert.deepEqual(JSON.parse(valid.body), { results: [] });
    const observed = mock.snapshot();
    assert.deepEqual({ received: observed.received, completed: observed.completed,
      rejected: observed.rejected, active: observed.active }, {
      received: 1, completed: 1, rejected: 1, active: 0,
    });
    assert.ok(!JSON.stringify(observed).includes("issue429-synthetic-only"));
    assert.ok(!JSON.stringify(observed).includes("255,216,255,217"));
  } finally {
    await mock.close();
    fixture.close();
  }
});
