import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";
import { verifySyntheticSources } from "./issue300-w8-oracle.mjs";

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
const independent = await verifySyntheticSources(
  owned,process.env.ISSUE300_W8_RUNTIME_DB_URL);
assert.deepEqual(paths.sourceCounts,independent.sourceCounts);
assert.equal(paths.scopedPersistedSourceRecords,
  independent.scopedPersistedSourceRecords);
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
const endpoints = ["search", "timeline", "detail"];
for (const endpoint of endpoints) {
  assert.match(paths.endpoints[endpoint], /^\/v1\/staff\/management\//);
}
assert.equal(new Set(Object.values(paths.endpoints)).size,3);
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
        assert.ok(body && typeof body === "object");
        if (endpoint !== "detail")
          assert.ok(Array.isArray(body.items) && body.snapshotAt);
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
for (const endpoint of endpoints)
  assert.ok(
    report.http[endpoint].samples >= 1000,
    `Insufficient actual HTTP samples: ${endpoint}`,
  );

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
const cold = securedArtifact("ISSUE300_W7_COLD_TRIALS");
const explain = securedArtifact("ISSUE300_W7_EXPLAIN_PLANS");
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
assert.ok(Date.parse(live.startedAt) <= Date.parse(startedAt));
assert.ok(Date.parse(live.finishedAt) >= Date.parse(finishedAt));
assert.ok(baseline.successfulCommands > 0);
assert.ok(baseline.writerClients >= expected.writers);
assert.ok(baseline.p95Ms >= 0 && live.p95Ms >= 0);
assert.ok(
  live.p95Ms <= baseline.p95Ms * 1.2,
  "Real writer p95 degraded by more than 20%",
);
assert.ok(
  live.p95Ms - baseline.p95Ms <= 100,
  "Real writer p95 degraded by more than 100 ms",
);
assert.ok(explain.plans?.length >= 3);
for (const item of explain.plans) {
  assert.ok(endpoints.includes(item.endpoint));
  assert.match(item.sqlSha256, /^[a-f0-9]{64}$/);
  assert.match(item.planSha256, /^[a-f0-9]{64}$/);
  assert.ok(item.role && item.fullExplainJson && item.buffers);
  assert.equal(item.candidateSha,candidate);
  assert.equal(item.containerId,owned.resource.containerId);
}

const warmBudgets = { search: 1500, timeline: 750, detail: 400 };
const coldBudgets = { search: 3000, timeline: 1500, detail: 800 };
for (const endpoint of endpoints) {
  assert.ok(
    report.http[endpoint].p95Ms <= warmBudgets[endpoint],
    `Warm HTTP p95 exceeded: ${endpoint}`,
  );
  const trials = cold.trials?.[endpoint];
  assert.ok(
    Array.isArray(trials) && trials.length >= 20,
    `20 independently prepared cold trials required for ${endpoint}`,
  );
  assert.ok(
    trials.every(
      (trial) =>
        trial.cacheResetVerified &&
        Number.isFinite(trial.httpElapsedMs) &&
        trial.httpElapsedMs >= 0,
    ),
    `Cold-cache preparation must be explicit for ${endpoint}`,
  );
  assert.ok(
    percentile(
      trials.map((r) => r.httpElapsedMs),
      0.95,
    ) <= coldBudgets[endpoint],
    `Cold p95 exceeded: ${endpoint}`,
  );
}
assert.ok(cold.methodology && !cold.globalSharedCacheFlush);
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
