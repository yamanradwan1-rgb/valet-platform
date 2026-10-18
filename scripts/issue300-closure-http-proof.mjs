import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Independently inspect genuine signed HTTP pages from a task-owned candidate.
// Prime's exclusive resource lease and independent fixture-ID manifest are required.
const lease = process.env.ISSUE300_W7_EXCLUSIVE_LEASE;
const candidate = process.env.ISSUE300_R2_CANDIDATE_SHA;
const manifestPath = process.env.ISSUE300_W7_SOURCE_MANIFEST;
const rawApi = process.env.ISSUE300_R2_API_URL;
const rawDisabledApi = process.env.ISSUE300_W7_DISABLED_API_URL;
const token = process.env.ISSUE300_W7_STAFF_BEARER;
const phase = process.env.ISSUE300_W7_HTTP_PHASE ?? "single";
const checkpointPath = process.env.ISSUE300_W7_HTTP_CHECKPOINT;
assert.ok(
  lease && candidate && manifestPath && rawApi && rawDisabledApi && token,
  "GAP: candidate, lease, source oracle, proof/default APIs and MFA required",
);
const api = new URL(rawApi);
const disabledApi = new URL(rawDisabledApi);
assert.equal(api.hostname, "127.0.0.1");
assert.match(api.port, /^\d{4,5}$/);
assert.equal(api.pathname, "/");
assert.equal(disabledApi.hostname, "127.0.0.1");
assert.match(disabledApi.port, /^\d{4,5}$/);
assert.notEqual(disabledApi.origin, api.origin);
assert.equal(disabledApi.pathname, "/");
const fixture = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
assert.equal(fixture.candidateSha, candidate);
assert.equal(fixture.leaseId, lease);
assert.equal(fixture.database, "issue300_r2");
assert.equal(fixture.databaseHost, "127.0.0.1");
assert.equal(fixture.databasePort, 57285);
assert.ok(
  ["ACTUAL_DOMAIN_WRITER", "DISPOSABLE_SQL_FIXTURE"].includes(fixture.writerKind),
  "Writer provenance must be explicit",
);
assert.ok(["CA", "LM"].includes(fixture.viewerRole), "Only actual CA/LM staff sessions can qualify");
assert.ok(
  fixture.actualMfaSessionAttested === true,
  "W4 must independently attest current exact-session authentication/MFA",
);
assert.ok(
  fixture.ordinaryRuntimeRoleAttested === true,
  "W6 must attest the provisioned ordinary PostgreSQL runtime role",
);
assert.ok(
  fixture.oracleSource && fixture.oracleSource !== "API_RESPONSE",
  "Expected source IDs must originate from independent database/writer evidence",
);
assert.match(fixture.searchPath, /^\/v1\/staff\/management\//);
assert.match(fixture.timelinePath, /^\/v1\/staff\/management\//);
assert.equal(
  fixture.guardedCohortPath,
  fixture.timelinePath,
  "Default gate denial must exercise exactly the positive candidate cohort",
);
assert.ok(Array.isArray(fixture.expectedTimelineOrderedKeys));
assert.ok(Array.isArray(fixture.expectedSearchOrderedSessionIds));
assert.ok(fixture.expectedSearchMatchingCounts && typeof fixture.expectedSearchMatchingCounts === "object");

async function get(path, authorization = token, target = api) {
  const url = new URL(path, target);
  assert.equal(url.origin, target.origin);
  const response = await fetch(url, {
    headers: {
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      Origin: process.env.ISSUE300_R2_DASHBOARD_ORIGIN,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* Fail below on non-JSON proof data. */
  }
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    body,
  };
}

function identity(item) {
  return item.key ? `${item.key.source}:${item.key.eventId}` : item.sessionId;
}

function witnessIds(items) {
  return items.flatMap((item) => (item.matchReasons ?? []).map((reason) => `${reason.source}:${reason.eventId}`));
}

function assertExactOracle(search, timeline, searchOrder, timelineOrder, counts) {
  assert.deepEqual(
    timeline.all.map(identity),
    timelineOrder,
    "Complete signed Timeline keys differ from independently ordered source IDs",
  );
  assert.deepEqual(
    search.all.map((r) => r.sessionId),
    searchOrder,
    "Complete signed Search Session order differs from independent source oracle",
  );
  for (const result of search.all) {
    assert.ok(
      Object.hasOwn(counts, result.sessionId),
      "Search returned a Session not present in the independent ID oracle",
    );
    assert.equal(
      result.matchingRecordCount,
      counts[result.sessionId],
      "Source-qualified matching count differs from independent witness union",
    );
  }
}

async function firstPage(path) {
  const reply = await get(path);
  assert.equal(reply.status, 200, "A 503 guarded cohort is GAP, not PASS");
  assert.equal(reply.cache, "no-store");
  assert.ok(reply.body.snapshotAt);
  return reply.body;
}

async function pages(path, initial = undefined) {
  const all = [...(initial?.items ?? [])];
  let snapshot = initial?.snapshotAt;
  let cursor = initial?.nextCursor;
  let count = 0;
  if (!initial) {
    const first = await firstPage(path);
    return pages(path, first);
  }
  while (cursor) {
    const request = new URL(path, api);
    request.searchParams.set("cursor", cursor);
    const reply = await get(request.pathname + request.search);
    assert.equal(reply.status, 200, "Fail closed: non-200 is not an accepted page");
    assert.equal(reply.cache, "no-store");
    assert.equal(reply.body.snapshotAt, snapshot, "Signed S0 changed across pages");
    all.push(...reply.body.items);
    cursor = reply.body.nextCursor;
    assert.ok(++count <= 1000, "Cursor did not exhaust within bounded pages");
  }
  assert.equal(new Set(all.map(identity)).size, all.length, "Duplicate page identity");
  return { all, snapshot, count: count + 1 };
}

// Separate independently configured ordinary/default instance must keep the
// same unproven indirect cohort denied. Do not change code or flags to bypass.
const defaultGate = await get(fixture.guardedCohortPath, token, disabledApi);
assert.notEqual(defaultGate.status, 200, "Default/production-safe API unexpectedly exposed guarded indirect cohort");
assert.ok(
  [403, 404, 503].includes(defaultGate.status),
  "Default gate must return a controlled denial, not a server failure",
);

if (phase === "capture") {
  assert.ok(checkpointPath, "Capture needs a task-owned local checkpoint file");
  const search = await firstPage(fixture.searchPath);
  const timeline = await firstPage(fixture.timelinePath);
  assert.ok(
    search.nextCursor && timeline.nextCursor,
    "Need actual Search AND Timeline second pages for S0 continuation proof",
  );
  const checkpoint = {
    candidate,
    lease,
    capturedAt: new Date().toISOString(),
    search,
    timeline,
  };
  writeFileSync(resolve(checkpointPath), JSON.stringify(checkpoint, null, 2), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      verdict: "CAPTURED_ONLY",
      proof: "SIGNED_HTTP_S0",
      candidate,
      snapshotCaptured: true,
      next: "commit held writer, then verify",
    }),
  );
} else {
  assert.ok(["verify", "single"].includes(phase), "Invalid proof phase");
  let initialSearch;
  let initialTimeline;
  let checkpoint;
  if (phase === "verify") {
    assert.ok(
      checkpointPath && process.env.ISSUE300_W7_COMMIT_CERTIFICATE,
      "Independent 2-connection held-writer attestation required",
    );
    checkpoint = JSON.parse(readFileSync(resolve(checkpointPath), "utf8"));
    const certificate = JSON.parse(readFileSync(resolve(process.env.ISSUE300_W7_COMMIT_CERTIFICATE), "utf8"));
    assert.equal(checkpoint.candidate, candidate);
    assert.equal(checkpoint.lease, lease);
    assert.equal(certificate.candidateSha, candidate);
    assert.equal(certificate.leaseId, lease);
    assert.equal(certificate.writerKind, fixture.writerKind);
    assert.ok(certificate.twoIndependentConnections === true);
    assert.ok(
      Date.parse(certificate.writerBeginAt) <= Date.parse(checkpoint.capturedAt),
      "Held writer must precede HTTP S0",
    );
    assert.ok(Date.parse(certificate.committedAt) > Date.parse(checkpoint.capturedAt), "COMMIT must follow HTTP S0");
    assert.deepEqual(
      [...certificate.lateSourceIds].sort(),
      [...fixture.lateTimelineSourceIds].sort(),
      "Late IDs must be backed by the independent writer certificate",
    );
    initialSearch = checkpoint.search;
    initialTimeline = checkpoint.timeline;
  }
  const oldSearch = initialSearch && (await pages(fixture.searchPath, initialSearch));
  const oldTimeline = initialTimeline && (await pages(fixture.timelinePath, initialTimeline));
  if (oldTimeline) {
    assertExactOracle(
      oldSearch,
      oldTimeline,
      fixture.expectedS0SearchOrderedSessionIds,
      fixture.expectedS0TimelineOrderedKeys,
      fixture.expectedS0SearchMatchingCounts,
    );
    for (const sourceId of fixture.lateTimelineSourceIds)
      assert.ok(
        !oldTimeline.all.some((item) => identity(item) === sourceId),
        `S0 retroactive late parent/source admission: ${sourceId}`,
      );
    for (const sourceId of fixture.lateSearchSourceIds ?? [])
      assert.ok(!witnessIds(oldSearch.all).includes(sourceId), `Search S0 added a later parent/source: ${sourceId}`);
  }
  const search = await pages(fixture.searchPath);
  const timeline = await pages(fixture.timelinePath);
  assertExactOracle(
    search,
    timeline,
    fixture.expectedSearchOrderedSessionIds,
    fixture.expectedTimelineOrderedKeys,
    fixture.expectedSearchMatchingCounts,
  );
  // Exact independent ordered arrays above also exclude unexpected/foreign
  // source IDs and catch omitted Session IDs, not just selected known positives.
  if (phase === "verify") {
    for (const id of fixture.lateTimelineSourceIds)
      assert.ok(
        timeline.all.some((r) => identity(r) === id),
        `Fresh S1 failed to admit newly committed source/parent: ${id}`,
      );
    for (const id of fixture.lateSearchSourceIds ?? [])
      assert.ok(witnessIds(search.all).includes(id), `Fresh Search S1 failed to admit newly related source: ${id}`);
    assert.notEqual(oldTimeline.snapshot, timeline.snapshot);
  }
  const firstCursor = initialTimeline?.nextCursor;
  if (firstCursor) {
    const wrongPurpose = new URL(fixture.searchPath, api);
    wrongPurpose.searchParams.set("cursor", firstCursor);
    assert.notEqual(
      (await get(wrongPurpose.pathname + wrongPurpose.search)).status,
      200,
      "Timeline cursor cannot authorize Search",
    );
    const middle = Math.floor(firstCursor.length / 2);
    const wrongScope =
      firstCursor.slice(0, middle) + (firstCursor[middle] === "A" ? "B" : "A") + firstCursor.slice(middle + 1);
    const tampered = new URL(fixture.timelinePath, api);
    tampered.searchParams.set("cursor", wrongScope);
    assert.notEqual((await get(tampered.pathname + tampered.search)).status, 200, "Tampered cursor accepted");
  }
  assert.notEqual((await get(fixture.searchPath, null)).status, 200, "Anonymous request unexpectedly authorized");
  console.log(
    JSON.stringify({
      verdict: fixture.writerKind === "ACTUAL_DOMAIN_WRITER" ? "PASS" : "PARTIAL",
      sourceFixtureKind: fixture.writerKind,
      proof:
        phase === "verify"
          ? "ACTUAL_SIGNED_HTTP_S0_S1_PLUS_EXTERNAL_HELD_WRITER_CERT"
          : "ACTUAL_SIGNED_HTTP_CURRENT_SNAPSHOT",
      candidate,
      searchPages: search.count,
      timelinePages: timeline.count,
      oldSearchPages: oldSearch?.count,
      oldTimelinePages: oldTimeline?.count,
      oracle: fixture.oracleSource,
    }),
  );
}
