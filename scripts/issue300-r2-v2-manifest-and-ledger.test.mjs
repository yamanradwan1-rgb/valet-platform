import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import {
  prepareSourceRecord, assertLease, assembleOwnedManifest,
  issueWithClients, runCli, assertImmutableReplay,
} from "./issue300-r2-v2-manifest-and-ledger.mjs";
import { expectedLedgerFromSource } from "./issue300-r2-v2-ledger-helper.mjs";

const target = {
  database: "issue300_r2_w7_acceptance_v2",
  host: "127.0.0.1", port: 58387,
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  containerLabel: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
};
const checksums = expectedLedgerFromSource();
const lease = "issue300-r2-owned-v2-source-lease";
const binding = {
  candidateSha: "a".repeat(40), leaseId: lease,
  apiBundleSha256: "b".repeat(64),
  contractsBundleSha256: "d".repeat(64),
  sourceSha256: "f".repeat(64),
  apiBuildReceiptSha256: "9".repeat(64),
};
const prepared = prepareSourceRecord(binding.candidateSha, binding, checksums, lease);
const env = {
  NODE_ENV: "test",
  ISSUE300_R2_V2_MANIFEST_ENABLE: "ISSUE_EXACT_OWNED_V2",
  ISSUE300_R2_V2_LEDGER_HELPER_ENABLE: "INSTALL_EXACT_OWNED_V2",
  ISSUE300_R2_PROOF_LEASE_ID: lease,
  ISSUE300_R2_CANDIDATE_SHA: prepared.candidateSha,
};
const ownerUrl =
  `postgresql://${target.migrationRole}:unused@127.0.0.1:58387/${target.database}`;
const container = {
  Id: "c".repeat(64), Name: `/${target.containerName}`,
  State: { Running: true },
  Config: { Labels: { "com.vaylet.task": target.containerLabel } },
  NetworkSettings: { Ports: { "5432/tcp": [{
    HostIp: target.host, HostPort: String(target.port),
  }] } },
  Mounts: [{ Type: "volume", Name: target.volume,
    Destination: "/var/lib/postgresql/data" }],
};
const started = new Date("2026-10-18T20:00:00.000Z");
const identity = {
  database: target.database, role: target.migrationRole,
  login: target.migrationRole, version: 170010,
  replica: false, started,
};
const history = Object.entries(checksums).map(([migration_name, checksum]) => ({
  migration_name, checksum, finished_at: started, rolled_back_at: null,
}));
const clientParams = (user) => ({
  host: target.host, port: target.port,
  database: target.database, user,
});
function fakeClients({ helperPresent = false } = {}) {
  const calls = [];
  const admin = {
    connectionParameters: clientParams(target.migrationRole),
    query: async (sql) => {
      calls.push(sql);
      if (sql === "BEGIN READ ONLY" || sql === "ROLLBACK") return {};
      if (sql.includes("current_database()")) return { rows: [identity] };
      if (sql.includes("SELECT migration_name")) return { rows: history };
      if (sql.includes("to_regprocedure")) return {
        rowCount: 1, rows: [{ present: helperPresent }],
      };
      throw Error("Unexpected SQL");
    },
  };
  const runtime = { connectionParameters: clientParams(target.runtimeRole) };
  return { admin, runtime, calls };
}
function fixture(options = {}) {
  const io = fakeClients(options);
  const events = [];
  const deps = {
    ...io, prepared, fresh: prepared, env, docker: container,
    ownerDatabaseUrl: ownerUrl,
    install: async ({ manifest, admin }) => {
      assert.equal(manifest.database, target.database);
      assert.equal(admin, io.admin);
      events.push("install");
    },
    attest: async (_admin, _runtime, signed) => {
      assert.equal(signed, prepared.migrationLedgerSha256);
      events.push("attest");
      return "d".repeat(64);
    },
    publish: (manifest) => {
      events.push("publish");
      assert.equal(manifest.ledgerHelperFunctionSha256, "d".repeat(64));
      assert.equal(manifest.migrationChecksums, checksums);
      return { path: "<ignored-v2-owned>/R2_OWNED_RESOURCE_MANIFEST.json",
        sha256: "e".repeat(64), reused: false };
    },
  };
  return { ...io, events, deps };
}

test("prepare-source produces only bounded migration/checksum and candidate digest", () => {
  assert.equal(Object.keys(prepared.migrationChecksums).length, 96);
  assert.match(prepared.migrationLedgerSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(prepared).sort(),
    ["apiBuildReceiptSha256", "apiBundleSha256", "candidateSha",
      "contractsBundleSha256", "leaseId", "migrationChecksums",
      "migrationLedgerSha256", "sourceSha256"].sort());
  assert(!JSON.stringify(prepared).includes("password"));
  assert.throws(() => prepareSourceRecord("x", binding, checksums, lease));
  assert.throws(() => prepareSourceRecord(binding.candidateSha,
    { ...binding, contractsBundleSha256: "x" }, checksums, lease));
});
test("issue refuses absent/production/wrong lease before touching DB", async () => {
  for (const bad of [
    { NODE_ENV: "production" },
    { ISSUE300_R2_V2_MANIFEST_ENABLE: "1" },
    { ISSUE300_R2_PROOF_LEASE_ID: "wrong" },
    { ISSUE300_R2_CANDIDATE_SHA: "wrong" },
  ]) assert.throws(() => assertLease({ ...env, ...bad }));
  await assert.rejects(runCli(["--issue"], {}),
    /AssertionError|ERR_ASSERTION/);
  await assert.rejects(runCli(["--issue", "--prepare-source"], {}),
    /AssertionError|ERR_ASSERTION/);
});
test("sanitized owned manifest matches exact live V2 Docker, owner and 96 ledger", () => {
  const manifest = assembleOwnedManifest(prepared, container, identity, history, lease);
  assert.equal(manifest.database, target.database);
  assert.equal(manifest.apiOrigin, "http://127.0.0.1:3167");
  assert.equal(manifest.containerId, container.Id);
  assert.equal(manifest.contractsBundleSha256, binding.contractsBundleSha256);
  assert.equal(manifest.apiBuildReceiptSha256, binding.apiBuildReceiptSha256);
  assert.equal(manifest.sourceSha256, binding.sourceSha256);
  assert.equal(manifest.postgresStartedAt, started.toISOString());
  assert.deepEqual(manifest.migrationChecksums, checksums);
  for (const pair of [
    { docker: { ...container, Name: "/issue300_r2_pg17" } },
    { docker: { ...container, NetworkSettings: { Ports: {
      "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58387" }],
    } } } },
    { identity: { ...identity, role: "postgres" } },
    { identity: { ...identity, database: "issue300_r2" } },
    { rows: history.slice(1) },
    { rows: [{ ...history[0], checksum: "f".repeat(64) }, ...history.slice(1)] },
    { rows: [{ ...history[0], rolled_back_at: started }, ...history.slice(1)] },
    { rows: [{ ...history[0], finished_at: null }, ...history.slice(1)] },
  ]) assert.throws(() => assembleOwnedManifest(
    prepared, pair.docker ?? container, pair.identity ?? identity,
    pair.rows ?? history, lease));
});
test("missing helper installs once in-memory before publishing final manifest", async () => {
  const { deps, events, calls } = fixture({ helperPresent: false });
  const result = await issueWithClients(deps);
  assert.deepEqual(events, ["install", "attest", "publish"]);
  assert.equal(result.candidateSha, prepared.candidateSha);
  assert.deepEqual(calls.slice(0, 2).map((s) =>
    s === "BEGIN READ ONLY" ? "BEGIN" : "IDENTITY"), ["BEGIN", "IDENTITY"]);
  assert(calls.includes("ROLLBACK"));
});
test("existing reviewed helper is reused but never CREATE OR REPLACE", async () => {
  const { deps, events } = fixture({ helperPresent: true });
  await issueWithClients({ ...deps, env: {
    ...env, ISSUE300_R2_V2_LEDGER_HELPER_ENABLE: undefined,
  } });
  assert.deepEqual(events, ["attest", "publish"]);
});
test("immutable manifest/receipt permit only byte-identical replays", () => {
  const first = Buffer.from(JSON.stringify({ ...prepared, leaseId: lease }));
  assert.doesNotThrow(() => assertImmutableReplay(first, Buffer.from(first)));
  assert.throws(() => assertImmutableReplay(first,
    Buffer.from(JSON.stringify({ ...prepared, leaseId: "new-lease" }))),
  /V2_IMMUTABLE_RECORD_MISMATCH_NEVER_OVERWRITE/);
  assert.throws(() => assertImmutableReplay(first, "not bytes"));
});
test("helper installation requires independent explicit opt-in", async () => {
  const { deps, calls, events } = fixture({ helperPresent: false });
  await assert.rejects(issueWithClients({ ...deps, env: {
    ...env, ISSUE300_R2_V2_LEDGER_HELPER_ENABLE: undefined,
  } }), /V2_INSTALL_REQUIRES_SEPARATE_OWNER_APPROVAL/);
  assert(calls.includes("ROLLBACK"));
  assert.deepEqual(events, []);
});
test("tampered helper refuses publication, no attempt to reinstall", async () => {
  const { deps, events } = fixture({ helperPresent: true });
  await assert.rejects(issueWithClients({ ...deps, attest: async () => {
    throw Error("V2_LEDGER_HELPER_CATALOG_UNTRUSTED");
  } }), /V2_LEDGER_HELPER_CATALOG_UNTRUSTED/);
  assert.deepEqual(events, []);
});
test("wrong client and stale source fail before first SQL or Docker issue", async () => {
  for (const changes of [
    { fresh: { ...prepared, candidateSha: "c".repeat(40) } },
    { ownerDatabaseUrl: ownerUrl.replace("58387", "57285") },
    { admin: { connectionParameters: clientParams("postgres"), query: () => {
      throw Error("should not query");
    } } },
    { runtime: { connectionParameters: clientParams("postgres") } },
    { docker: { ...container, Name: "/human_pg" } },
  ]) {
    const { deps, calls, events } = fixture();
    await assert.rejects(issueWithClients({ ...deps, ...changes }));
    assert.equal(calls.length, 0);
    assert.deepEqual(events, []);
  }
});
