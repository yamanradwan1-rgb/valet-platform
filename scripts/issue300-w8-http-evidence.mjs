// Detached Ed25519 source oracle from an independently authorized DB reader.
import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

const uuid = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const idPattern = new RegExp(`^${uuid}$`, "i");
const sources = ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"];
const endpoints = ["search", "timeline", "detail"];
const digest = (buf) => createHash("sha256").update(buf).digest("hex");

function ownedPath(path, root) {
  assert(typeof path === "string" && path.length > 0);
  const full = realpathSync(path);
  const directory = resolve(root);
  assert(full.toLowerCase().startsWith((directory + sep).toLowerCase()),
    "Oracle evidence must be in owned private D-drive folder");
  return full;
}

export function verifyDetachedBytes(m, files, fingerprintExpected,
  env=process.env, trustName="ISSUE300_W8_TRUSTED_ORACLE_KEY_SHA256") {
  const keyPath = ownedPath(files.key, m.resource.dataPath);
  const sourcePath = ownedPath(files.payload, m.resource.dataPath);
  const signaturePath = ownedPath(files.signature, m.resource.dataPath);
  const publicKey = createPublicKey(readFileSync(keyPath));
  assert.equal(publicKey.asymmetricKeyType, "ed25519");
  const fingerprint = digest(publicKey.export({type:"spki",format:"der"}));
  assert.match(env[trustName] ?? "", /^[a-f0-9]{64}$/);
  assert.equal(fingerprint, env[trustName]);
  assert.equal(fingerprint, fingerprintExpected);
  const bytes = readFileSync(sourcePath);
  const signature = readFileSync(signaturePath);
  assert.equal(signature.length, 64, "Require binary detached Ed25519 signature");
  assert(verify(null, bytes, publicKey, signature),
    "Independent detached Ed25519 evidence signature failed");
  return JSON.parse(bytes.toString("utf8"));
}

export function verifiedSourceOracle(m, env = process.env) {
  const oracle = verifyDetachedBytes(m,{
    key:env.ISSUE300_W8_ORACLE_KEY,payload:env.ISSUE300_W8_ORACLE_JSON,
    signature:env.ISSUE300_W8_ORACLE_SIGNATURE,
  },m.oracleIssuerKeySha256,env);
  assert.equal(oracle.provenance, "INDEPENDENT_SOURCE_DB_READ_ONLY");
  assert.equal(oracle.candidateSha, m.candidateSha);
  assert.equal(oracle.leaseId, m.leaseId);
  assert.equal(oracle.database, m.resource.database);
  assert.equal(oracle.containerId, m.resource.containerId);
  assert.equal(oracle.targetTier, m.targetTier);
  assert.equal(oracle.sourceFixtureHash, m.sourceFixtureHash);
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
    [...endpoints].sort());
  const expected = oracle.expected;
  assert.match(expected.search.sessionId, idPattern);
  assert.match(expected.search.source, /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT)$/);
  assert.match(expected.search.eventId, idPattern);
  assert.match(expected.timeline.source, /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT)$/);
  assert.match(expected.timeline.eventId, idPattern);
  assert.match(expected.detail.source, /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT)$/);
  assert.match(expected.detail.eventId, idPattern);
  assert.equal(expected.timeline.sessionId, expected.search.sessionId);
  assert.equal(expected.detail.sessionId, expected.search.sessionId);
  assert(oracle.sourceCounts &&
    sources.every((source) => oracle.sourceCounts[source] === m.targetTier/4));
  return oracle;
}

export function verifyPinnedRoutes(paths, m, oracle) {
  assert.deepEqual(Object.keys(paths).sort(), [...endpoints].sort());
  const prefix = `/v1/staff/management/organizations/${m.scope.organizationId}` +
    `/locations/${m.scope.locationId}/audit-investigations`;
  const expected = oracle.expected;
  const result = {};
  for (const name of endpoints) {
    const raw = paths[name];
    assert.equal(typeof raw, "string");
    assert(!raw.includes("%") && !raw.includes("#") &&
      !raw.includes("//"), "No encoded or alternate route form");
    const parsed = new URL(raw, "http://127.0.0.1");
    assert.equal(parsed.origin, "http://127.0.0.1");
    assert.equal(parsed.hash, "");
    if (name === "search") {
      assert.equal(parsed.pathname, prefix + "/sessions");
      assert.deepEqual([...parsed.searchParams.keys()].sort(),
        ["from", "limit", "sessionId", "to"]);
      assert.equal(parsed.searchParams.get("sessionId"),
        expected.search.sessionId);
      assert.equal(parsed.searchParams.get("limit"), "100");
      const from = Date.parse(parsed.searchParams.get("from"));
      const to = Date.parse(parsed.searchParams.get("to"));
      assert(Number.isFinite(from) && Number.isFinite(to) && from < to);
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
  assert.equal(new Set(Object.values(result)).size, 3);
  return result;
}

export function assertExpectedHttp(endpoint, body, oracle) {
  assert(endpoints.includes(endpoint));
  assert(body && typeof body === "object" && !Array.isArray(body));
  const id = oracle.expected[endpoint];
  if (endpoint === "search") {
    assert(Array.isArray(body.items) && body.items.length > 0);
    assert(typeof body.snapshotAt === "string" && body.snapshotAt.length > 0);
    const session = body.items.find((r) => r.sessionId === id.sessionId);
    assert(session, "Independent signed expected Search Session missing");
    assert(Number.isInteger(session.matchingRecordCount) &&
      session.matchingRecordCount > 0);
    assert(Array.isArray(session.matchReasons) &&
      session.matchReasons.some((r) =>
        r.source === id.source && r.eventId === id.eventId),
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
