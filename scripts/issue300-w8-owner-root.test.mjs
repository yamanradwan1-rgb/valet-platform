import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import {
  assertProducerCommitments,
  assertSignature,
  readSignedW8Manifest,
  safeOwnedFile,
  verifyProducerKeyFile,
} from "./issue300-w8-owner-root.mjs";

const digest = (b) => createHash("sha256").update(b).digest("hex");
const fingerprint = (key) =>
  digest(key.export({ type: "spki", format: "der" }));
function context(t) {
  const parent = mkdtempSync(join(tmpdir(), "w8-root-test-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const owned = join(parent, "owned");
  mkdirSync(owned);
  const keys = Array.from({ length: 5 }, () => generateKeyPairSync("ed25519"));
  const manifest = {
    provenance: "PRIME_OWNER_SIGNED_W8_RESOURCE_V2",
    candidateSha: "a".repeat(40),
    leaseId: "issue300-r2-w8-test-lease-123",
    targetTier: 100_000,
    sourceFixtureHash: "b".repeat(64),
    sourceOracleSha256: "c".repeat(64),
    oracleIssuerKeySha256: fingerprint(keys[0].publicKey),
    guestBootIssuerKeySha256: fingerprint(keys[1].publicKey),
    coldTrialIssuerKeySha256: fingerprint(keys[2].publicKey),
    runtimeIssuerKeySha256: fingerprint(keys[3].publicKey),
    phaseSealIssuerKeySha256: fingerprint(keys[4].publicKey),
    scope: {
      organizationId: "00000000-0000-4000-8000-000000000011",
      locationId: "00000000-0000-4000-8000-000000000012",
      slotId: "00000000-0000-4000-8000-000000000013",
    },
    resource: {
      containerId: "d".repeat(64),
      apiBundleSha256: "e".repeat(64),
      database: "issue300_r2_w7_acceptance_alpha",
      container: "issue300-r2-w7-acceptance-alpha",
      dbPort: 58411,
      dbHost: "127.0.0.1",
      apiHost: "127.0.0.1",
      apiPort: 32101,
      dashboardPort: 32102,
      apiPid: 4321,
      apiProcessStartedAt: "2026-10-18T19:00:00Z",
      vmUuid: "00000000-0000-4000-8000-000000000014",
    },
  };
  const file = join(owned, "R2_OWNED_RESOURCE_MANIFEST.json");
  const bytes = Buffer.from(JSON.stringify(manifest));
  const outsider = generateKeyPairSync("ed25519");
  writeFileSync(file, bytes);
  writeFileSync(
    `${file}.sig`,
    sign(null, bytes, outsider.privateKey).toString("base64"),
  );
  return { parent, owned, file, bytes, keys, manifest, outsider };
}

test("Owner SPKI cannot be changed by signed manifest/env/local self-sign", (t) => {
  const fixture = context(t);
  assert.doesNotThrow(() => assertProducerCommitments(fixture.manifest));
  assertSignature(
    fixture.bytes,
    sign(null, fixture.bytes, fixture.outsider.privateKey).toString("base64"),
    fixture.outsider.publicKey,
  ); // test algorithm only, no production override
  assert.throws(
    () => readSignedW8Manifest(fixture.file, fixture.owned),
    /Prime Owner Ed25519/,
  ); // signed by a LOCAL key, not Owner SPKI
  assert.throws(
    () => readSignedW8Manifest(fixture.file, fixture.owned),
    /Prime Owner Ed25519/,
  ); // env can't override Owner public SPKI
});

test("raw signature missing, tampered bytes and bad encoding fail closed", (t) => {
  const f = context(t);
  writeFileSync(`${f.file}.sig`, "self-signed");
  assert.throws(() => readSignedW8Manifest(f.file, f.owned), /Base64/);
  writeFileSync(
    `${f.file}.sig`,
    sign(null, f.bytes, f.outsider.privateKey).toString("base64"),
  );
  writeFileSync(
    f.file,
    JSON.stringify({ ...f.manifest, targetTier: 1_000_000 }),
  );
  assert.throws(() => readSignedW8Manifest(f.file, f.owned));
});

test("tier, candidate, lease, sources and all producer fingerprints mandatory", (t) => {
  const { manifest: m } = context(t);
  const changes = [
    { provenance: "PRIME_OWNER_SIGNED_W8_RESOURCE_V1" },
    { targetTier: 1 },
    { candidateSha: "f" },
    { leaseId: "owner-unknown" },
    { sourceFixtureHash: "z".repeat(64) },
    { sourceOracleSha256: null },
    { oracleIssuerKeySha256: null },
    { runtimeIssuerKeySha256: m.oracleIssuerKeySha256 },
    { guestBootIssuerKeySha256: "0" },
    { coldTrialIssuerKeySha256: null },
    { phaseSealIssuerKeySha256: null },
    { phaseSealIssuerKeySha256: m.runtimeIssuerKeySha256 },
    { resource: { ...m.resource, apiBundleSha256: "untrusted" } },
    { resource: { ...m.resource, containerId: "untrusted" } },
    { resource: { ...m.resource, vmUuid: null } },
    { resource: { ...m.resource, apiPid: 0 } },
    { resource: { ...m.resource, apiProcessStartedAt: "not-a-date" } },
    { scope: { ...m.scope, locationId: null } },
  ];
  for (const change of changes)
    assert.throws(() => assertProducerCommitments({ ...m, ...change }));
});

test("no private key/password/URL/bearer can be laundered via manifest", (t) => {
  const { manifest: m } = context(t);
  for (const extra of [
    { databaseUrl: "postgresql://user:password@127.0.0.1:58387/private" },
    { credentials: { password: "p" } },
    { sessionBearer: "token" },
    { notes: "-----BEGIN PRIVATE KEY-----" },
    { resource: { ...m.resource, password: "no" } },
  ])
    assert.throws(
      () => assertProducerCommitments({ ...m, ...extra }),
      /credential/,
    );
});

test("producer signing key fingerprint pinned by Owner, no env override", (t) => {
  const f = context(t);
  const path = join(f.owned, "producer.pem");
  writeFileSync(
    path,
    f.keys[0].publicKey.export({ type: "spki", format: "pem" }),
  );
  assert.equal(
    verifyProducerKeyFile(path, f.manifest.oracleIssuerKeySha256, f.owned)
      .asymmetricKeyType,
    "ed25519",
  );
  assert.throws(
    () =>
      verifyProducerKeyFile(path, f.manifest.runtimeIssuerKeySha256, f.owned),
    /signed into Prime/,
  );
});

test("canonical path rejects traversal, symlink and foreign siblings", (t) => {
  const f = context(t);
  assert.deepEqual(safeOwnedFile(f.file, f.owned), f.bytes);
  assert.throws(() => safeOwnedFile(join(f.owned, "..", "outside"), f.owned));
  const link = join(f.owned, "linked.json");
  try {
    symlinkSync(f.file, link, "file");
  } catch (e) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(e.code))
      return t.skip("symlink unavailable");
    throw e;
  }
  assert.throws(() => safeOwnedFile(link, f.owned), /symlink\/junction/);
  assert.throws(
    () => safeOwnedFile(`${f.file}:evil`, f.owned),
    /alternate stream/,
  );
});

test("unsigned nested owned folder/junction cannot replace canonical manifest", (t) => {
  const f = context(t);
  const link = join(f.parent, "redirect");
  try {
    symlinkSync(
      f.owned,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (e) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(e.code))
      return t.skip("junction unavailable");
    throw e;
  }
  assert.throws(
    () =>
      readSignedW8Manifest(join(link, "R2_OWNED_RESOURCE_MANIFEST.json"), link),
    /symlink\/junction|redirected reparse/,
  );
});
