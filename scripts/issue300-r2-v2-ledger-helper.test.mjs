import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  v2LedgerTarget, validateOwnerTarget, expectedLedgerFromSource,
  expectedLedgerDigest, buildV2HelperSql, verifyOwnedDocker,
  assertV2Preflight, assertOwnedClient, verifyV2LiveLedgerEvidence,
  installOwnedV2LedgerHelper,
} from "./issue300-r2-v2-ledger-helper.mjs";

const dir = mkdtempSync(join(tmpdir(), "issue300-v2-ledger-source-"));
after(() => rmSync(dir, { force: true, recursive: true }));
for (let n = 0; n < 96; n++) {
  const name = `202610${String(n).padStart(8, "0")}_owned_migration_${n}`;
  const folder = join(dir, name);
  mkdirSync(folder);
  writeFileSync(join(folder, "migration.sql"), `-- immutable ${n}\nSELECT ${n};\n`);
}
const checksums = expectedLedgerFromSource(dir);
const digest = expectedLedgerDigest(checksums);
const sha = (input) => createHash("sha256").update(input).digest("hex");
const target = v2LedgerTarget;
const manifest = {
  ...target, containerLabel: target.label, containerId: "a".repeat(64),
  leaseId: "issue300-r2-owned-v2-helper",
  candidateSha: "b".repeat(40), apiBundleSha256: "c".repeat(64),
  postgresStartedAt: "2026-10-18T18:00:00.000Z",
  migrationChecksums: checksums,
};
const ownerUrl = `postgresql://${target.migrationRole}:unused@127.0.0.1:58387/${target.database}`;
const docker = {
  Id: manifest.containerId, Name: `/${target.containerName}`,
  State: { Running: true },
  Config: { Labels: { "com.vaylet.task": target.label } },
  NetworkSettings: { Ports: { "5432/tcp": [{
    HostIp: "127.0.0.1", HostPort: "58387",
  }] } },
  Mounts: [{ Type: "volume", Name: target.volume,
    Destination: "/var/lib/postgresql/data" }],
};
const identity = {
  database: target.database, user: target.migrationRole,
  login: target.migrationRole, version: 170010, replica: false,
  started: new Date(manifest.postgresStartedAt),
};
const privileges = {
  ownerSelect: true, ownerCreate: true, runtimeSelect: false,
  runtimeInsert: false, runtimeUpdate: false, runtimeDelete: false,
  runtimeTrigger: false, runtimeTruncate: false, runtimeCreate: false,
  runtimeElevated: false, runtimeAnyTrigger: false,
  runtimeGuardFunctionExecute: false,
};

test("validates ONLY the pinned V2 loopback, DB, owner, label and volume", () => {
  assert.equal(validateOwnerTarget(ownerUrl, manifest), ownerUrl);
  for (const bad of [
    ownerUrl.replace("127.0.0.1", "localhost"),
    ownerUrl.replace("58387", "57285"),
    ownerUrl.replace(target.database, "issue300_r2"),
    ownerUrl.replace(target.migrationRole, target.runtimeRole),
    ownerUrl.replace("postgresql:", "https:"),
    ownerUrl + "?sslmode=disable",
    ownerUrl + "#extra",
    "not a URL",
  ]) assert.throws(() => validateOwnerTarget(bad, manifest));
  for (const bad of [
    { port: 57285 }, { migrationRole: "postgres" },
    { runtimeRole: "postgres" }, { containerLabel: "issue300-r2" },
    { volume: "production_volume" }, { database: "issue300_r2" },
    { containerId: "not-a-docker-id" },
  ]) assert.throws(() => validateOwnerTarget(ownerUrl, { ...manifest, ...bad }));
});

test("source fixture enforces complete, checksum-pinned 96-row manifest", () => {
  assert.equal(Object.keys(checksums).length, 96);
  assert.match(digest, /^[a-f0-9]{64}$/);
  const changed = { ...checksums, [Object.keys(checksums)[0]]: "f".repeat(64) };
  assert.notEqual(expectedLedgerDigest(changed), digest);
  assert.throws(() => expectedLedgerDigest(Object.fromEntries(
    Object.entries(checksums).slice(1))));
  assert.throws(() => expectedLedgerDigest({ ...checksums, other: "a".repeat(64) }));
  assert.throws(() => expectedLedgerDigest({ ...checksums, "bad:inject": "a".repeat(64) }));
  const alternative = join(dir, "20269999009999_extra_migration");
  mkdirSync(alternative);
  assert.throws(() => expectedLedgerFromSource(dir));
  rmSync(alternative, { recursive: true });
});

test("function body embeds exactly 96 signed checksums, no DML or unsafe search path", () => {
  const plan = buildV2HelperSql(checksums);
  assert.equal(plan.expectedDigest, digest);
  assert.match(plan.ddl, /CREATE FUNCTION public\.issue300_r2_v2_migration_ledger_sha256\(\)/);
  assert.doesNotMatch(plan.ddl, /CREATE OR REPLACE|INSERT INTO|DELETE FROM|UPDATE public\./);
  assert.match(plan.ddl, /LANGUAGE sql STABLE SECURITY DEFINER/);
  assert.match(plan.ddl, /SET search_path = pg_catalog, pg_temp/);
  assert.match(plan.ddl, /FROM public\._prisma_migrations/);
  assert.match(plan.ddl, /count\(\*\) FROM actual\) = 96/);
  assert.match(plan.ddl, /a\.finished_at IS NULL OR a\.rolled_back_at IS NOT NULL/);
  assert.match(plan.ddl, /IS DISTINCT FROM e\.checksum/);
  assert.match(plan.ddl, /ORDER BY migration_name COLLATE "C"/);
  assert.match(plan.ddl, /pg_catalog\.sha256/);
  assert.equal((plan.ddl.match(/\('202610\d{8}_owned_migration_/g) ?? []).length, 96);
  assert.equal(plan.acl.length, 2);
  assert.match(plan.acl[0], /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
  assert.match(plan.acl[1], new RegExp(`GRANT EXECUTE ON FUNCTION .* TO ${target.runtimeRole}`));
  assert(plan.acl.every((sql) => !/GRANT SELECT|GRANT INSERT|GRANT UPDATE/i.test(sql)));
  assert.match(plan.fingerprintSql, /pg_get_functiondef/);
});

test("Docker ownership is exact and cannot borrow human or wildcard ports", () => {
  assert.doesNotThrow(() => verifyOwnedDocker(manifest, docker));
  const edits = [
    { Id: "d".repeat(64) },
    { Name: "/human_pg17" },
    { State: { Running: false } },
    { Config: { Labels: { "com.vaylet.task": "human" } } },
    { NetworkSettings: { Ports: { "5432/tcp": [{
      HostIp: "0.0.0.0", HostPort: "58387",
    }] } } },
    { NetworkSettings: { Ports: { "5432/tcp": [{
      HostIp: "127.0.0.1", HostPort: "57285",
    }] } } },
    { Mounts: [{ Type: "volume", Name: "human_data",
      Destination: "/var/lib/postgresql/data" }] },
  ];
  for (const value of edits)
    assert.throws(() => verifyOwnedDocker(manifest, { ...docker, ...value }));
});

test("actual owner and runtime ACL preflight deny any privileged/broad role", () => {
  assert.doesNotThrow(() => assertV2Preflight(identity, privileges));
  for (const value of [
    { database: "issue300_r2" }, { user: target.runtimeRole },
    { login: "postgres" }, { version: 170009 }, { replica: true },
  ]) assert.throws(() => assertV2Preflight({ ...identity, ...value }, privileges));
  for (const value of [
    { ownerSelect: false }, { ownerCreate: false },
    { runtimeSelect: true }, { runtimeInsert: true },
    { runtimeUpdate: true }, { runtimeDelete: true },
    { runtimeTrigger: true }, { runtimeTruncate: true },
    { runtimeCreate: true }, { runtimeElevated: true },
    { runtimeAnyTrigger: true }, { runtimeGuardFunctionExecute: true },
  ]) assert.throws(() => assertV2Preflight(identity, { ...privileges, ...value }));
});

test("wrong supplied PG client fails before ANY SQL including BEGIN/LOCK", () => {
  const owned = { connectionParameters: {
    host: target.host, port: target.port, database: target.database,
    user: target.migrationRole,
  } };
  assert.doesNotThrow(() => assertOwnedClient(owned));
  for (const override of [{ host: "localhost" }, { port: 57285 },
    { database: "issue300_r2" }, { user: "postgres" }]) {
    assert.throws(() => assertOwnedClient({ connectionParameters: {
      ...owned.connectionParameters, ...override,
    } }));
  }
});

test("signed runtime digest and live helper definition BOTH must remain fresh", () => {
  const accepted = {
    signedDigest: digest, liveDigest: digest,
    signedFunctionFingerprint: sha("original function"),
    liveFunctionFingerprint: sha("original function"),
    runtimeLedgerSelect: false,
  };
  assert.equal(verifyV2LiveLedgerEvidence(accepted), true);
  assert.equal(verifyV2LiveLedgerEvidence({
    ...accepted, liveDigest: sha("changed migration"),
  }), false);
  assert.equal(verifyV2LiveLedgerEvidence({
    ...accepted, liveFunctionFingerprint: sha("same-OID CREATE OR REPLACE"),
  }), false);
  assert.equal(verifyV2LiveLedgerEvidence({
    ...accepted, runtimeLedgerSelect: true,
  }), false);
  assert.equal(verifyV2LiveLedgerEvidence({
    ...accepted, signedFunctionFingerprint: "untrusted",
  }), false);
});

test("installer fails before any DB query without explicit owner/test lease", async () => {
  let calls = 0;
  const admin = { query: async () => { calls++; throw Error("unexpected DB access"); } };
  for (const env of [
    { NODE_ENV: "production" },
    { NODE_ENV: "test" },
    { NODE_ENV: "test",
      ISSUE300_R2_V2_LEDGER_HELPER_ENABLE: "INSTALL_EXACT_OWNED_V2",
      ISSUE300_R2_PROOF_LEASE_ID: "wrong-lease" },
  ]) {
    await assert.rejects(installOwnedV2LedgerHelper({
      admin, ownerDatabaseUrl: ownerUrl, manifest, env,
    }));
  }
  assert.equal(calls, 0);
});
