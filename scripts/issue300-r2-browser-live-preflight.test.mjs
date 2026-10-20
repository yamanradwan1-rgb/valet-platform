/* global Buffer, URL */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkSource, checkDocker, checkProcess, checkPostgres, buildPreflight } from "./issue300-r2-browser-live-preflight.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const now = Date.parse("2026-10-18T20:00:00Z");
const head = "a".repeat(40);
const lease = "issue300-r2-w7-exclusive-browser-20261018";
const digest = "b".repeat(64);
const exact = {
  host: "127.0.0.1",
  port: 58387,
  database: "issue300_r2_w7_acceptance_v2",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  containerLabel: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
};
const resource = { ...exact, candidateSha: head, leaseId: lease, containerId: "c".repeat(64), postgresStartedAt: "2026-10-18T18:00:00.000Z" };
const env = {
  NODE_ENV: "test",
  ISSUE300_W7_OWNER_BROWSER_ISSUE_ENABLE: "1",
  ISSUE300_W7_TEST_ONLY_BROWSER_PROOF: "1",
  ISSUE300_R2_CANDIDATE_SHA: head,
  ISSUE300_W7_EXCLUSIVE_LEASE: lease,
};
const source = () => ({ head, clean: true, env, lease, resource, now });
const deny = (fn) => assert.throws(fn, /GAP|AssertionError/);

test("exact clean test-only final SHA, role/port/DB and exclusive lease", () => {
  assert.deepEqual(checkSource(source()), { head, lease });
  deny(() => checkSource({ ...source(), clean: false }));
  deny(() => checkSource({ ...source(), head: "f".repeat(40) }));
  deny(() => checkSource({ ...source(), lease: "foreign-lease" }));
  deny(() => checkSource({ ...source(), env: { ...env, NODE_ENV: "production" } }));
  deny(() => checkSource({ ...source(), env: { ...env, ISSUE300_W7_OWNER_BROWSER_ISSUE_ENABLE: "0" } }));
  deny(() => checkSource({ ...source(), env: { ...env, ISSUE300_W7_TEST_ONLY_BROWSER_PROOF: "0" } }));
  for (const [name, bad] of [
    ["host", "0.0.0.0"],
    ["port", 57285],
    ["port", 58385],
    ["database", "issue300_r2"],
    ["runtimeRole", "issue300_r2_w6_runtime"],
    ["migrationRole", "issue300_r2_owner"],
    ["containerLabel", "human"],
    ["containerName", "issue300_r2_pg17"],
    ["volume", "other"],
  ])
    deny(() => checkSource({ ...source(), resource: { ...resource, [name]: bad } }));
});

const container = () => ({
  Id: resource.containerId,
  Name: "/" + exact.containerName,
  State: { Running: true },
  Config: { Labels: { "com.vaylet.task": exact.containerLabel } },
  NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: exact.host, HostPort: "58387" }] } },
  Mounts: [{ Type: "volume", Name: exact.volume, Destination: "/var/lib/postgresql/data" }],
});

test("live exact Docker ID, PG bind, running state, volume and label", () => {
  assert.equal(checkDocker(container(), resource), resource.containerId);
  for (const bad of [
    { Id: "f".repeat(64) },
    { State: { Running: false } },
    { Name: "/another" },
    { Config: { Labels: { "com.vaylet.task": "foreign" } } },
    { NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58387" }] } } },
    { NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "57285" }] } } },
    { Mounts: [{ Type: "volume", Name: "human", Destination: "/var/lib/postgresql/data" }] },
  ])
    deny(() => checkDocker({ ...container(), ...bad }, resource));
});

const entry = (kind) => join(root, kind === "api" ? "apps/api/dist/main.js" : "apps/dashboard/.next/standalone/apps/dashboard/server.js");
const processEvidence = (kind) => ({
  port: kind === "api" ? 3167 : 3117,
  localAddress: "127.0.0.1",
  pid: kind === "api" ? 2123 : 3212,
  executablePath: "C:\\Program Files\\nodejs\\node.exe",
  commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${entry(kind)}"`,
  startedAt: new Date(now - 4000).toISOString(),
});

test("API/Dashboard PID owning exact port and exact compiled entrypoint/epoch", () => {
  for (const kind of ["api", "dashboard"]) {
    const evidence = processEvidence(kind);
    const result = checkProcess(evidence, kind, digest, head, now - 5000, now);
    assert.equal(result.identity.pid, evidence.pid);
    assert.equal(result.signed.bundleSha256, digest);
    for (const bad of [
      { port: 3165 },
      { localAddress: "0.0.0.0" },
      { pid: 0 },
      { commandLine: evidence.commandLine + ' "' + entry(kind) + '"' },
      { commandLine: evidence.commandLine.replace(entry(kind), "C:\\bad.js") },
      { executablePath: "C:\\Windows\\System32\\cmd.exe" },
      { startedAt: new Date(now - 6000).toISOString() },
      { startedAt: new Date(now + 1000).toISOString() },
    ])
      deny(() => checkProcess({ ...evidence, ...bad }, kind, digest, head, now - 5000, now));
    deny(() => checkProcess(evidence, kind, "invalid", head, now - 5000, now));
    deny(() => checkProcess(evidence, kind, digest, "wrong", now - 5000, now));
  }
});

const migrations = Object.fromEntries(
  Array.from({ length: 96 }, (_, i) => [`migration_${String(i).padStart(3, "0")}`, createHash("sha256").update(String(i)).digest("hex")]),
);
const rows = () => ({
  identity: { name: exact.database, role: exact.migrationRole, version: 170010, started: new Date(resource.postgresStartedAt) },
  runtime: { role: exact.runtimeRole, login: exact.runtimeRole, audit_update: false, ledger_read: false },
  roleFlags: { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false, rolinherit: false },
  triggers: { birth: 12, immutable: 6 },
  migrations: Object.entries(migrations).map(([migration_name, checksum]) => ({ migration_name, checksum, finished_at: new Date(now), rolled_back_at: null })),
});

test("read-only PG identity, 96 source checksums, ACL, triggers and roles", () => {
  const manifest = { ...resource, migrationChecksums: migrations };
  assert.doesNotThrow(() => checkPostgres(rows(), manifest, migrations));
  for (const bad of [
    { identity: { ...rows().identity, name: "human" } },
    { identity: { ...rows().identity, version: 160000 } },
    { runtime: { ...rows().runtime, audit_update: true } },
    { runtime: { ...rows().runtime, ledger_read: true } },
    { roleFlags: { ...rows().roleFlags, rolsuper: true } },
    { triggers: { birth: 11, immutable: 6 } },
    { migrations: rows().migrations.slice(1) },
    { migrations: rows().migrations.map((r, i) => (i === 0 ? { ...r, checksum: "f".repeat(64) } : r)) },
  ])
    deny(() => checkPostgres({ ...rows(), ...bad }, manifest, migrations));
  deny(() => checkPostgres(rows(), manifest, { ...migrations, migration_000: "e".repeat(64) }));
});

test("issuer-compatible exact manifest + wrong signing key denied", () => {
  const api = checkProcess(processEvidence("api"), "api", digest, head, now - 5000, now);
  const dashboard = checkProcess(processEvidence("dashboard"), "dashboard", digest, head, now - 5000, now);
  const body = buildPreflight({ head, lease, now, resource, dockerId: resource.containerId, api, dashboard });
  assert.equal(body.kind, "ISSUE300_W7_V2_INDEPENDENT_LIVE_PREFLIGHT_V1");
  assert.equal(body.dashboardOrigin, "http://127.0.0.1:3117");
  assert.equal(body.apiOrigin, "http://127.0.0.1:3167");
  assert.equal(body.apiRewriteOrigin, "http://127.0.0.1:3167");
  assert.equal(body.postgres.port, 58387);
  assert.equal(body.postgres.label, exact.containerLabel);
  assert.deepEqual(
    Object.keys(body).sort(),
    [
      "kind",
      "candidateSha",
      "leaseId",
      "issuedAt",
      "expiresAt",
      "dashboardOrigin",
      "apiOrigin",
      "apiRewriteOrigin",
      "dashboard",
      "api",
      "postgres",
      "testOnly",
      "exclusiveLeaseVerified",
    ].sort(),
  );
  const issuerTrusted = createPublicKey({
    key: Buffer.from("MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=", "base64"),
    format: "der",
    type: "spki",
  });
  const attacker = generateKeyPairSync("ed25519");
  const payload = Buffer.from(JSON.stringify(body));
  const signature = sign(null, payload, attacker.privateKey);
  assert.equal(verify(null, payload, attacker.publicKey, signature), true);
  assert.equal(verify(null, payload, issuerTrusted, signature), false);
  deny(() => buildPreflight({ head, lease, now, resource, dockerId: "foreign", api, dashboard }));
});
