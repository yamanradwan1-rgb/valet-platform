import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { readTarget, assertOwnedUri, assertLeaseActive } from "./issue300-w8-target.mjs";
import { verifySyntheticSources } from "./issue300-w8-oracle.mjs";
import { verifiedSourceOracle, verifyPinnedRoutes, assertExpectedHttp,
  u004Endpoints, u004WarmBudgets, u004ColdBudgets } from
  "./issue300-w8-http-evidence.mjs";
import { verifyColdArtifact } from "./issue300-w8-cold.mjs";
import { runtimeContinuity } from "./issue300-w8-runtime-continuity.mjs";
import { assertComparableWriters } from "./issue300-w8-writer-proof.mjs";
import { assertReaderCoverage } from "./issue300-w8-reader-coverage.mjs";
import { verifyPhaseSeal } from "./issue300-w8-phase-seal.mjs";

// W7 measures actual HTTP. Prime/W6 must run authentic independent operational
// writers concurrently; a SQL fixture loop must never masquerade as a writer.
const mode = process.env.ISSUE300_W7_LOAD_MODE;
assert.ok(["normal", "stress"].includes(mode));
const expected =
  mode === "normal" ? { readers: 5, writers: 2 } : { readers: 25, writers: 8 };
const candidate = process.env.ISSUE300_R2_CANDIDATE_SHA;
const lease = process.env.ISSUE300_W7_EXCLUSIVE_LEASE;
const apiRaw = process.env.ISSUE300_R2_API_URL;
const token = process.env.ISSUE300_W7_STAFF_BEARER;
const origin = process.env.ISSUE300_R2_DASHBOARD_ORIGIN;
const owned = readTarget();
assert.ok(
  candidate &&
    lease &&
    apiRaw &&
    token &&
    origin &&
    process.env.ISSUE300_W7_LOAD_PATHS,
);
const api = new URL(apiRaw);
assertOwnedUri(apiRaw,owned,"api");
assertOwnedUri(origin,owned,"dashboard");
assert.equal(candidate,owned.candidateSha);
assert.equal(lease,owned.leaseId);
const paths = JSON.parse(
  readFileSync(process.env.ISSUE300_W7_LOAD_PATHS, "utf8"),
);
const signed = verifiedSourceOracle(owned);
const liveProcess=runtimeContinuity(owned,signed);
verifyPinnedRoutes(paths.endpoints,owned,signed);
const independent = await verifySyntheticSources(
  owned,process.env.ISSUE300_W8_RUNTIME_DB_URL);
assert.deepEqual(paths.sourceCounts,independent.sourceCounts);
assert.equal(paths.scopedPersistedSourceRecords,
  independent.scopedPersistedSourceRecords);
assert.deepEqual(independent.slotSkew,signed.skew.busySlot);
assert.deepEqual(paths.busySlotSkew,signed.skew.busySlot);
assert.equal(paths.targetTier,owned.targetTier);
assert.equal(paths.candidateSha, candidate);
assert.equal(paths.leaseId, lease);
assert.equal(paths.database, owned.resource.database);
assert.equal(paths.databaseHost, "127.0.0.1");
assert.equal(paths.databasePort, owned.resource.dbPort);
assert.equal(paths.containerId, owned.resource.containerId);
assert.equal(paths.apiBundleSha256, owned.resource.apiBundleSha256);
assert.equal(paths.sourceFixtureHash, owned.sourceFixtureHash);
assert.ok(
  [100_000, 1_000_000].includes(paths.targetTier),
  "Exactly one of the approved 100k or 1m workload tiers is required",
);
assert.ok(
  paths.scopedPersistedSourceRecords >= paths.targetTier,
  "Actual mixed-source counts below specified fixture tier",
);
assert.ok(
  paths.sourceCounts &&
    ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"].every(
      (kind) => paths.sourceCounts[kind] > 0,
    ),
);
const endpoints = u004Endpoints;
assert.ok(process.env.ISSUE300_W7_WRITER_BASELINE);
assert.ok(process.env.ISSUE300_W7_WRITER_LIVE);
assert.ok(process.env.ISSUE300_W7_COLD_TRIALS);
assert.ok(process.env.ISSUE300_W7_EXPLAIN_PLANS);
const durationMs = 600_000;
const raw = Object.fromEntries(endpoints.map((endpoint) => [endpoint, []]));
let unsuccessful = 0;
let abortReaders = false;
const startedAt = new Date().toISOString();
const started = performance.now();
const end = started + durationMs;

function percentile(samples, fraction) {
  assert.ok(samples.length);
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

async function reader(index) {
  let iteration = index;
  while (performance.now() < end && !abortReaders) {
    assertLeaseActive(owned);
    liveProcess.check();
    const endpoint = endpoints[iteration++ % endpoints.length];
    const path = paths.endpoints[endpoint];
    const at = performance.now();
    let status;
    try {
      const reply = await fetch(new URL(path, api), {
        headers: { Authorization: `Bearer ${token}`, Origin: origin },
        signal: AbortSignal.timeout(15_000),
      });
      status = reply.status;
      if (status === 200) {
        assert(reply.headers.get("cache-control")?.includes("no-store"),
          "HTTP evidence must be no-store");
        const body = await reply.json();
        assertExpectedHttp(endpoint,body,signed);
      }
    } catch {
      status = 0;
    }
    const elapsedMs = performance.now() - at;
    raw[endpoint].push({
      elapsedMs,
      status,
      epochMs: Date.now(),
      reader: index,
    });
    if (status !== 200) unsuccessful++;
    if ([401, 403, 503].includes(status)) {
      abortReaders = true;
      throw new Error(
        `Abort on auth/availability denial ${endpoint}: ${status}`,
      );
    }
  }
}

// The elapsed measured interval must overlap separate real domain writers.
const failures = await Promise.allSettled(
  Array.from({ length: expected.readers }, (_, i) => reader(i)),
);
const finishedAt = new Date().toISOString();
const processContinuity=liveProcess.finish(startedAt,finishedAt);
const report = {
  candidate,
  lease,
  candidateSha:candidate,
  leaseId:lease,
  database:owned.resource.database,
  containerId:owned.resource.containerId,
  apiBundleSha256:owned.resource.apiBundleSha256,
  mode,
  targetTier: paths.targetTier,
  sourceCounts: paths.sourceCounts,
  startedAt,
  finishedAt,
  durationMs,
  readers: expected.readers,
  requiredWriterClients: expected.writers,
  actualElapsedMs: performance.now() - started,
  raw,
  http: {},
  unsuccessful,
  processContinuity,
  resource: { containerId:owned.resource.containerId,
    dbPort:owned.resource.dbPort,apiPort:owned.resource.apiPort },
};
for (const endpoint of endpoints) {
  const rows = raw[endpoint].filter((r) => r.status === 200);
  const times = rows.map((r) => r.elapsedMs);
  report.http[endpoint] = {
    samples: times.length,
    p50Ms: times.length ? percentile(times, 0.5) : null,
    p95Ms: times.length ? percentile(times, 0.95) : null,
    maxMs: times.length
      ? times.reduce((high, item) => Math.max(high, item), 0)
      : null,
  };
}
assert.ok(process.env.ISSUE300_W7_RESULTS_PATH);
writeFileSync(
  process.env.ISSUE300_W7_RESULTS_PATH,
  JSON.stringify(report, null, 2),
  { flag: "wx", mode: 0o600 },
);

assert.ok(
  failures.every((outcome) => outcome.status === "fulfilled"),
  "At least one HTTP reader aborted",
);
assert.ok(report.actualElapsedMs >= 600_000);
assert.equal(unsuccessful, 0, "Every HTTP sample must be successful");
assertReaderCoverage(raw,expected.readers,startedAt,finishedAt,endpoints);

// Writers must ENVELOPE the 600s reads, so their final proof is published
// *after* readers complete. Bounded wait is not part of measured HTTP p95.
const writerProofDeadline = performance.now() + 90_000;
while (!existsSync(process.env.ISSUE300_W7_WRITER_LIVE) &&
  performance.now() < writerProofDeadline)
  await new Promise((resolve) => setTimeout(resolve, 500));
assert(existsSync(process.env.ISSUE300_W7_WRITER_LIVE),
  "No completed live canonical writer envelope proof");

function securedArtifact(envName) {
  const item = JSON.parse(readFileSync(process.env[envName], "utf8"));
  assert.equal(item.candidateSha, candidate);
  assert.equal(item.leaseId, lease);
  assert.equal(item.database, owned.resource.database);
  assert.equal(item.containerId, owned.resource.containerId);
  assert.equal(item.apiBundleSha256, owned.resource.apiBundleSha256);
  assert.equal(item.targetTier, paths.targetTier);
  return item;
}

const baseline = securedArtifact("ISSUE300_W7_WRITER_BASELINE");
const live = securedArtifact("ISSUE300_W7_WRITER_LIVE");
assert.equal(baseline.mode,"baseline");
assert.equal(live.mode,mode);
const cold = securedArtifact("ISSUE300_W7_COLD_TRIALS");
const explain = securedArtifact("ISSUE300_W7_EXPLAIN_PLANS");
verifyColdArtifact(cold,owned,signed);
assert.equal(live.writerKind, "ACTUAL_OPERATIONAL_HTTP_OR_DOMAIN_COMMAND");
assert.ok(live.writerClients >= expected.writers);
assert.ok(typeof baseline.hardwareId === "string" && baseline.hardwareId);
assert.ok(
  typeof live.sourceFixtureHash === "string" &&
    /^[a-f0-9]{64}$/.test(live.sourceFixtureHash),
);
assert.equal(baseline.hardwareId, live.hardwareId);
assert.equal(live.hardwareId, owned.resource.hardwareId);
assert.equal(baseline.sourceFixtureHash, live.sourceFixtureHash);
assert.equal(live.sourceFixtureHash, paths.sourceFixtureHash);
assert.ok(Array.isArray(live.writerClientIds));
assert.ok(new Set(live.writerClientIds).size >= expected.writers);
assert.ok(live.successfulCommands > 0);
assert.equal(live.failedCommands, 0);
assert.equal(live.deadlocks, 0);
assert.equal(live.lockTimeouts, 0);
assertComparableWriters(baseline,live,signed,expected.writers);
assert.ok(Date.parse(live.startedAt) <= Date.parse(startedAt));
assert.ok(Date.parse(live.finishedAt) >= Date.parse(finishedAt));
assert.ok(baseline.successfulCommands > 0);
assert.ok(baseline.writerClients >= expected.writers);
// assertComparableWriters above enforces both p95 gates per pinned cohort.
assert.equal(explain.plans?.length,endpoints.length);
assert.deepEqual(explain.plans.map((p)=>p.endpoint),endpoints);
for (const item of explain.plans) {
  assert.ok(endpoints.includes(item.endpoint));
  assert.match(item.sqlSha256, /^[a-f0-9]{64}$/);
  assert.match(item.planSha256, /^[a-f0-9]{64}$/);
  assert.ok(item.role && item.fullExplainJson && item.buffers);
  assert.equal(item.candidateSha,candidate);
  assert.equal(item.containerId,owned.resource.containerId);
  assert(item.fullExplainJson[0]?.Plan?.["Actual Rows"]>0,
    "No false-fast empty EXPLAIN allowed");
  assert.equal(item.expectedSourceId,signed.expected[item.endpoint].eventId);
  assert.equal(item.expectedSessionId,signed.expected[item.endpoint].sessionId);
}

const warmBudgets = u004WarmBudgets;
for (const endpoint of endpoints) {
  assert.ok(
    report.http[endpoint].p95Ms <= warmBudgets[endpoint],
    `Warm HTTP p95 exceeded: ${endpoint}`,
  );
}
assert.ok(cold.methodology && !cold.globalSharedCacheFlush);
const signedDeadline=performance.now()+45_000;
while ((!existsSync(process.env.ISSUE300_W8_PHASE_SEAL_JSON) ||
  !existsSync(process.env.ISSUE300_W8_PHASE_SEAL_SIG)) &&
  performance.now()<signedDeadline){
  assertLeaseActive(owned);
  await new Promise((ok)=>setTimeout(ok,500));
}
verifyPhaseSeal(owned,report,baseline,live);
assertLeaseActive(owned);
console.log(
  JSON.stringify({
    verdict: "PASS",
    proof: "ACTUAL_HTTP_LOAD_PLUS_ATTESTED_WRITERS",
    candidate,
    mode,
    tier: paths.targetTier,
    p95: Object.fromEntries(
      endpoints.map((key) => [key, report.http[key].p95Ms]),
    ),
    rawOutput: process.env.ISSUE300_W7_RESULTS_PATH,
  }),
);
