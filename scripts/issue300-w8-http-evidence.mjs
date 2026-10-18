// Detached Ed25519 source oracle from an independently authorized DB reader.
import assert from "node:assert/strict";
import { createHash, verify } from "node:crypto";
import { safeOwnedFile, verifyProducerKeyFile } from
  "./issue300-w8-owner-root.mjs";
import { assertCompleteCohortWindow, assertWindowSourceCohort } from
  "./issue300-w8-cohort-window.mjs";

const uuid = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const idPattern = new RegExp(`^${uuid}$`, "i");
const sources = ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"];
export const u004Endpoints =
  ["search", "busySlotSearch", "timeline", "detail"];
export const u004WarmBudgets =
  {search:1500,busySlotSearch:1500,timeline:750,detail:400};
export const u004ColdBudgets =
  {search:3000,busySlotSearch:3000,timeline:1500,detail:800};
const digest = (buf) => createHash("sha256").update(buf).digest("hex");

export function verifyDetachedBytes(m, files, fingerprintExpected,
  env=process.env, trustName="ISSUE300_W8_TRUSTED_ORACLE_KEY_SHA256",
  expectedPayloadSha256) {
  assert(!env[trustName] || env[trustName]===fingerprintExpected,
    "Untrusted environment key override forbidden");
  const publicKey=verifyProducerKeyFile(files.key,fingerprintExpected,
    m.resource.dataPath);
  const bytes=safeOwnedFile(files.payload,m.resource.dataPath);
  const signature=safeOwnedFile(files.signature,m.resource.dataPath,256);
  assert.equal(signature.length, 64, "Require binary detached Ed25519 signature");
  assert(verify(null, bytes, publicKey, signature),
    "Independent detached Ed25519 evidence signature failed");
  if(expectedPayloadSha256!==undefined){
    assert.equal(digest(bytes),expectedPayloadSha256,
      "Signed source oracle raw bytes differ from Prime Owner manifest");
  }
  return JSON.parse(bytes.toString("utf8"));
}

export function verifiedSourceOracle(m, env = process.env) {
  const oracle = verifyDetachedBytes(m,{
    key:env.ISSUE300_W8_ORACLE_KEY,payload:env.ISSUE300_W8_ORACLE_JSON,
    signature:env.ISSUE300_W8_ORACLE_SIGNATURE,
  },m.oracleIssuerKeySha256,env,
  "ISSUE300_W8_TRUSTED_ORACLE_KEY_SHA256",m.sourceOracleSha256);
  assert.equal(oracle.provenance, "INDEPENDENT_SOURCE_DB_READ_ONLY");
  assert.equal(oracle.candidateSha, m.candidateSha);
  assert.equal(oracle.leaseId, m.leaseId);
  assert.equal(oracle.database, m.resource.database);
  assert.equal(oracle.containerId, m.resource.containerId);
  assert.equal(oracle.targetTier, m.targetTier);
  assert.equal(oracle.sourceFixtureHash, m.sourceFixtureHash);
  assert.equal(typeof oracle.workloadWindow?.from,"string");
  assert.equal(typeof oracle.workloadWindow?.to,"string");
  const from=Date.parse(oracle.workloadWindow.from);
  const to=Date.parse(oracle.workloadWindow.to);
  assert(Number.isFinite(from) && Number.isFinite(to));
  assertCompleteCohortWindow(oracle.workloadWindow);
  assert.equal(oracle.workloadWindow.from,m.planProbe?.from);
  assert.equal(oracle.workloadWindow.to,m.planProbe?.to);
  const runtime=oracle.apiRuntime;
  assert.equal(runtime?.kind,"OWNED_GUEST_RUNTIME_LISTENER_ATTESTATION");
  assert.equal(runtime?.host,"127.0.0.1");
  assert.equal(runtime?.port,m.resource.apiPort);
  assert.equal(runtime?.apiBundleSha256,m.resource.apiBundleSha256);
  assert.equal(runtime?.containerId,m.resource.containerId);
  assert.equal(runtime?.vmUuid,m.resource.vmUuid);
  assert.equal(runtime?.listenerProbed,true);
  assert(Number.isInteger(runtime?.apiPid) && runtime.apiPid>0);
  assert(Number.isFinite(Date.parse(runtime?.processStartedAt)));
  assert(Number.isFinite(Date.parse(runtime?.probedAt)));
  assert(Date.parse(runtime?.processStartedAt) <= Date.parse(runtime.probedAt));
  assert(Date.parse(runtime.probedAt) > Date.now()-90_000 &&
    Date.parse(runtime.probedAt) <= Date.now(),
    "Runtime listener proof stale or in future");
  assert.deepEqual(Object.keys(oracle.expected ?? {}).sort(),
    [...u004Endpoints].sort());
  const expected = oracle.expected;
  for(const name of ["search","busySlotSearch"]) {
    assert.match(expected[name].sessionId, idPattern);
    assert.match(expected[name].source, /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT)$/);
    assert.match(expected[name].eventId, idPattern);
  }
  assert.equal(expected.busySlotSearch.source,"KEY_CUSTODY");
  assert.equal(expected.busySlotSearch.keySlotId,m.scope.slotId);
  assert.equal(oracle.skew?.busySlot?.keySlotId,m.scope.slotId);
  assert.equal(oracle.skew?.busySlot?.source,"KEY_CUSTODY");
  assert(oracle.skew.busySlot.persistedCustodyRows >= m.targetTier/4);
  assert(oracle.skew.busySlot.distinctSessions >= m.targetTier/100,
    "Independently proven high-skew slot Session distribution required");
  assert.match(expected.timeline.source, /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT)$/);
  assert.match(expected.timeline.eventId, idPattern);
  assert.match(expected.detail.source, /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT)$/);
  assert.match(expected.detail.eventId, idPattern);
  assert.equal(expected.timeline.sessionId, expected.search.sessionId);
  assert.equal(expected.detail.sessionId, expected.search.sessionId);
  assert(oracle.sourceCounts &&
    sources.every((source) => oracle.sourceCounts[source] === m.targetTier/4));
  assert.deepEqual(oracle.windowSourceCounts,oracle.sourceCounts,
    "Signed in-window source counts must match full fixture cohort");
  assert.deepEqual(oracle.windowSlotSkew,oracle.skew.busySlot,
    "Signed busy-slot window must match whole busy-slot cohort");
  assertWindowSourceCohort(oracle.windowSourceCounts,
    oracle.windowSlotSkew,m.targetTier);
  for(const count of [2,8]){
    const cohort=oracle.writerCohorts?.[String(count)];
    assert.match(cohort?.rosterDigest??"",/^[a-f0-9]{64}$/);
    assert(Array.isArray(cohort.clientIds) && cohort.clientIds.length===count);
    assert.deepEqual(cohort.commandMix,{
      INCIDENT_REPORT:count/2,KEY_SLOT_ASSIGN:count/2});
  }
  return oracle;
}

export function verifyPinnedRoutes(paths, m, oracle) {
  assert.deepEqual(Object.keys(paths).sort(), [...u004Endpoints].sort());
  const prefix = `/v1/staff/management/organizations/${m.scope.organizationId}` +
    `/locations/${m.scope.locationId}/audit-investigations`;
  const expected = oracle.expected;
  const result = {};
  for (const name of u004Endpoints) {
    const raw = paths[name];
    assert.equal(typeof raw, "string");
    assert(!raw.includes("%") && !raw.includes("#") &&
      !raw.includes("//"), "No encoded or alternate route form");
    const parsed = new URL(raw, "http://127.0.0.1");
    assert.equal(parsed.origin, "http://127.0.0.1");
    assert.equal(parsed.hash, "");
    if (name === "search" || name === "busySlotSearch") {
      assert.equal(parsed.pathname, prefix + "/sessions");
      const keys=name==="search" ? ["from","limit","to"] :
        ["from","keySlotId","limit","to"];
      assert.deepEqual([...parsed.searchParams.keys()].sort(),keys,
        "Search workloads must be BROAD, without sessionId");
      assert.equal(parsed.searchParams.has("sessionId"),false);
      if(name==="busySlotSearch")
        assert.equal(parsed.searchParams.get("keySlotId"),
          expected.busySlotSearch.keySlotId);
      else assert.equal(parsed.searchParams.has("keySlotId"),false);
      assert.equal(parsed.searchParams.get("limit"), "100");
      const from = Date.parse(parsed.searchParams.get("from"));
      const to = Date.parse(parsed.searchParams.get("to"));
      assert(Number.isFinite(from) && Number.isFinite(to) && from < to);
      assert.equal(parsed.searchParams.get("from"),oracle.workloadWindow.from);
      assert.equal(parsed.searchParams.get("to"),oracle.workloadWindow.to);
    } else if (name === "timeline") {
      assert.equal(parsed.pathname, prefix +
        `/sessions/${expected.timeline.sessionId}/timeline`);
      assert.deepEqual([...parsed.searchParams.keys()], ["limit"]);
      assert.equal(parsed.searchParams.get("limit"), "100");
    } else {
      assert.equal(parsed.pathname, prefix +
        `/sessions/${expected.detail.sessionId}/events/` +
        `${expected.detail.source}/${expected.detail.eventId}`);
      assert.equal(parsed.search, "");
    }
    result[name] = raw;
  }
  assert.equal(new Set(Object.values(result)).size, u004Endpoints.length);
  return result;
}

export function assertExpectedHttp(endpoint, body, oracle) {
  assert(u004Endpoints.includes(endpoint));
  assert(body && typeof body === "object" && !Array.isArray(body));
  const id = oracle.expected[endpoint];
  if (endpoint === "search" || endpoint === "busySlotSearch") {
    assert(Array.isArray(body.items) && body.items.length > 0);
    assert(typeof body.snapshotAt === "string" && body.snapshotAt.length > 0);
    const session = body.items.find((r) => r.sessionId === id.sessionId);
    assert(session, "Independent signed expected Search Session missing");
    assert(Number.isInteger(session.matchingRecordCount) &&
      session.matchingRecordCount > 0);
    assert(Array.isArray(session.matchReasons) &&
      session.matchReasons.some((r) =>
        r.source === id.source && r.eventId === id.eventId &&
        (endpoint!=="busySlotSearch" || r.matchedBy==="KEY_SLOT")),
      "Independent signed source event absent from Search witnesses");
  } else if (endpoint === "timeline") {
    assert(Array.isArray(body.items) && body.items.length > 0);
    assert(typeof body.snapshotAt === "string" && body.snapshotAt.length > 0);
    assert(body.items.some((r) =>
      r.key?.source === id.source && r.key?.eventId === id.eventId),
    "Independent signed Timeline event ID missing");
  } else {
    assert.equal(body.sessionId, id.sessionId);
    assert.equal(body.source, id.source);
    assert.equal(body.key?.source, id.source);
    assert.equal(body.key?.eventId, id.eventId);
  }
  return true;
}
