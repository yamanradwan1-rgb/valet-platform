import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { loadOwnedPlan } from "./issue300-w13-owned-target.mjs";
import { createHttpClient, firstPage } from "./issue300-w13-signed-http.mjs";

// Run capture under one attestation, then reattest after 15 minutes and
// verify with the SAME active MFA-authenticated Staff bearer. No bearer saved.
const plan = loadOwnedPlan();
const mode = process.env.ISSUE300_W13_EXPIRY_PHASE;
assert(["capture", "verify"].includes(mode));
const bearer = process.env.ISSUE300_W13_STAFF_BEARER;
assert.match(bearer ?? "", /^vsa1\.[A-Za-z0-9_-]{43}$/);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bearerDigest = hash(bearer);
const client = createHttpClient(plan.enabledApi, plan.origin);
const lane = plan.fixture.lanes[0];
assert(lane.timelinePath.startsWith("/v1/staff/management/"));
const checkpointPath = join(plan.ownDirectory, "W13_V2_EXPIRY_CHECKPOINT.json");

if (mode === "capture") {
  const first = await firstPage(client, lane.timelinePath, bearer);
  const checkpoint = {
    candidate: plan.candidate,
    leaseAtCapture: plan.lease,
    containerId: plan.proof.containerId,
    apiBundleSha256: plan.proof.apiBundleSha256,
    path: lane.timelinePath,
    bearerDigest,
    capturedAt: new Date().toISOString(),
    cursor: first.nextCursor,
    snapshotAt: first.snapshotAt,
  };
  writeFileSync(checkpointPath, JSON.stringify(checkpoint), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  globalThis.console.log(
    "CAPTURED_ONLY: genuine signed cursor stored without Staff bearer",
  );
} else {
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
  assert.equal(checkpoint.candidate, plan.candidate);
  assert.equal(checkpoint.path, lane.timelinePath);
  assert.equal(checkpoint.containerId, plan.proof.containerId);
  assert.equal(checkpoint.apiBundleSha256, plan.proof.apiBundleSha256);
  assert.equal(
    checkpoint.bearerDigest,
    bearerDigest,
    "Expiry needs the exact same MFA Staff auth session",
  );
  assert(
    Date.now() - Date.parse(checkpoint.capturedAt) >= 15 * 60_000 + 2_000,
    "Signed cursor has not reached the maximum 15-minute expiry interval",
  );
  const url = new URL(lane.timelinePath, plan.enabledApi);
  url.searchParams.set("cursor", checkpoint.cursor);
  const rejected = await client(url.pathname + url.search, bearer);
  assert.equal(rejected.status, 400, "Expired signed cursor was accepted");
  assert.equal(rejected.cache, "no-store");
  const fresh = await firstPage(client, lane.timelinePath, bearer);
  assert(
    fresh.items.length > 0,
    "Same principal must remain authorized on fresh request",
  );
  globalThis.console.log(
    JSON.stringify({
      verdict: "CURSOR_EXPIRY_HTTP_PASS",
      candidate: plan.candidate,
      sessionUnchanged: true,
      cursorIssuedBeforeExpiry: true,
      freshAuthorized: true,
    }),
  );
}
