/** Offline POSITIVE model only. Never a genuine Owner-signed runtime PASS.
 * vi.mock is confined to THIS test module: production's pinned Owner SPKI
 * remains unchanged and rejects all generated temporary fixture signatures.
 */
import { createHash, generateKeyPairSync, sign, verify as realVerify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const injection = vi.hoisted(() => ({ enabled: false, testPublicKey: "" }));
vi.mock("node:crypto", async (original) => {
  const native = await original<typeof import("node:crypto")>();
  return {
    ...native,
    verify: (algorithm: string | null, data: Uint8Array,
      publicKey: unknown, signature: Uint8Array) => {
      // The test key substitutes only for the exact production Owner pin
      // inside the isolated Vitest graph. This branch does not exist in API.
      if (injection.enabled && process.env.NODE_ENV === "test" &&
          typeof publicKey === "string" && publicKey.includes(
            "MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c="))
        return native.verify(algorithm, data, injection.testPublicKey, signature);
      return native.verify(algorithm, data, publicKey as Parameters<typeof native.verify>[2],
        signature);
    },
  };
});

import {
  r2ApiBundleDigest, r2OwnedProofTarget, r2ProofApprovedAuditIds,
  readR2ProofAttestation,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-proof-attestation";
import {
  isU05LocalProofEnabled, isU05R2IndirectHttpProofCandidate,
  readU05R2IndirectProofCandidate,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-gate";

const digest = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
const sha = "a".repeat(40);
const lease = "issue300-r2-unit-positive-lease-001";
const org = "11111111-1111-4111-8111-111111111111";
const location = "22222222-2222-4222-8222-222222222222";
const auditId = "33333333-3333-4333-8333-333333333333";
const window = { from: "2026-10-18T10:00:00.000Z",
  to: "2026-10-18T11:00:00.000Z" };
const pinned = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----`;
const originalEnv = { ...process.env };
const originalEntry = process.argv[1];
let root: string;

function setRuntime(path: string, bytes: Buffer, entry: string) {
  process.argv[1] = entry;
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://${r2OwnedProofTarget.runtimeRole}:fixture@127.0.0.1:58387/${r2OwnedProofTarget.database}`,
    ISSUE300_U05_G2_PROOF_ENABLE: "1",
    ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE: "1",
    ISSUE300_R2_RUNTIME_ROLE: r2OwnedProofTarget.runtimeRole,
    ISSUE300_R2_CANDIDATE_SHA: sha,
    ISSUE300_R2_PROOF_LEASE_ID: lease,
    ISSUE300_R2_ATTESTATION_PATH: path,
    ISSUE300_R2_ATTESTATION_SHA256: digest(bytes),
  });
}

function fixture() {
  root = mkdtempSync(join(tmpdir(), "issue300-r2-u005-positive-model-"));
  const api = join(root, "apps/api/dist/main.js");
  const otherApi = join(root, "apps/api/dist/compiled-guard.js");
  const contracts = join(root, "packages/contracts/dist/index.js");
  const importedContract = join(root, "packages/contracts/dist/authorization.js");
  for (const path of [api, contracts]) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(api, "// test-only synthetic compiled API main");
  writeFileSync(otherApi, "// test-only synthetic API guard");
  writeFileSync(contracts, "// test-only synthetic contracts main");
  writeFileSync(importedContract, "// test-only synthetic contract authorization");
  const checksums = Object.fromEntries([
    ...Array.from({ length: 92 }, (_, i) =>
      [`2024010100${String(i).padStart(4, "0")}_synthetic_${i}`, digest(String(i))]),
    ["20260919004500_mgt_fix_02_pagination_snapshot_membership", "c".repeat(64)],
    ["20261018009400_issue_300_u05_birth_xid", "d".repeat(64)],
    ["20261018009500_issue_300_option_b_task_relation_provenance", "e".repeat(64)],
    ["20261018009600_issue_300_option_b_attribution_freeze", "f".repeat(64)],
  ]);
  const built = {
    apiBundleSha256: r2ApiBundleDigest(api),
    contractsBundleSha256: r2ApiBundleDigest(contracts, "index.js"),
    sourceSha256: "1".repeat(64), apiBuildReceiptSha256: "2".repeat(64),
  };
  const manifest = {
    ...r2OwnedProofTarget, ...built, candidateSha: sha, leaseId: lease,
    containerId: "3".repeat(64),
    postgresStartedAt: "2026-10-18T15:00:00.000Z",
    migrationChecksums: checksums,
  };
  const manifestFilename = `R2_OWNED_RESOURCE_MANIFEST.v1.${sha}.${lease}.json`;
  const owned = join(root, "tmp/issue300-r2-w7-acceptance-v2-owned");
  mkdirSync(owned, { recursive: true });
  const manifestFile = join(owned, manifestFilename);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(manifestFile, manifestBytes);
  const now = Date.now();
  const proof = {
    ...manifest, project: "issue300", mode: "ISOLATED_PROOF_CANDIDATE",
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    artifactVersion: 1, resourceManifestFilename: manifestFilename,
    resourceManifestSha256: digest(manifestBytes),
    migrationLedgerSha256: digest(Object.entries(checksums).sort(([a], [b]) =>
      a.localeCompare(b, "en")).map(([name, sum]) => `${name}:${sum}`).join("\n")),
    ledgerHelperFunctionSha256: "4".repeat(64),
    guardFunctionsSha256: "5".repeat(64),
    actualRoleVerified: true, migrationsApplied: 96,
    birthTriggers: 12, immutableTriggers: 6,
    allowedCohorts: ["SIGNED_HTTP_SOURCE_PARENT_CANDIDATE"],
    migrationChecksums: Object.fromEntries(Object.entries(checksums).slice(-4)),
    allowedScopes: [{ organizationId: org, locationId: location, timeline: true,
      approvedAuditEventIds: [auditId], searchWindows: [window] }],
  };
  const cert = join(owned,
    `R2_SIGNED_HTTP_LOCAL_ATTESTATION_${sha.slice(0, 12)}_${now}_${lease}.json`);
  const temporary = generateKeyPairSync("ed25519");
  injection.testPublicKey = temporary.publicKey.export({ type: "spki",
    format: "pem" }).toString();
  const issue = (payload = proof) => {
    const bytes = Buffer.from(JSON.stringify(payload));
    writeFileSync(cert, bytes);
    writeFileSync(cert + ".sig", sign(null, bytes, temporary.privateKey).toString("base64"));
    setRuntime(cert, bytes, api);
  };
  issue();
  return { api, otherApi, contracts, importedContract, manifestFile, cert,
    proof, manifest, issue, temporary };
}

beforeEach(() => { injection.enabled = false; injection.testPublicKey = ""; });
afterEach(() => {
  injection.enabled = false;
  injection.testPublicKey = "";
  process.argv[1] = originalEntry;
  for (const key of Object.keys(process.env))
    if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("TEST-ONLY ephemeral Ed25519 whole R2 certificate → U005 gate", () => {
  it("genuine production Owner pin rejects a synthetic certificate", () => {
    const f = fixture();
    const bytes = readFileSync(f.cert);
    const sig = Buffer.from(readFileSync(f.cert + ".sig", "utf8"), "base64");
    expect(realVerify(null, bytes, pinned, sig)).toBe(false);
    expect(readR2ProofAttestation()).toBeNull();
    expect(isU05LocalProofEnabled()).toBe(false);
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    injection.enabled = true;
    process.env.NODE_ENV = "production";
    expect(readR2ProofAttestation()).toBeNull();
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it("model-only verifier accepts exact signed file and enables only signed U005 scopes", () => {
    fixture();
    injection.enabled = true;
    const parsed = readR2ProofAttestation();
    expect(parsed?.leaseId).toBe(lease);
    expect(isU05LocalProofEnabled()).toBe(true);
    expect(isU05R2IndirectHttpProofCandidate()).toBe(true);
    expect(readU05R2IndirectProofCandidate()?.candidateSha).toBe(sha);
    expect(r2ProofApprovedAuditIds(org, location, window, parsed)).toEqual([auditId]);
    expect(r2ProofApprovedAuditIds(org, location, undefined, parsed)).toEqual([auditId]);
    expect(r2ProofApprovedAuditIds(org, "44444444-4444-4444-8444-444444444444",
      window, parsed)).toBeNull();
    expect(r2ProofApprovedAuditIds(org, location, {
      from: window.to, to: "2026-10-18T12:00:00.000Z",
    }, parsed)).toBeNull();
    injection.enabled = false;
    expect(readR2ProofAttestation()).toBeNull();
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it("even test model fails closed for stale lease, wrong scope, unsigned or changed build", () => {
    const f = fixture();
    injection.enabled = true;
    expect(readR2ProofAttestation()).not.toBeNull();
    process.env.ISSUE300_R2_PROOF_LEASE_ID = "issue300-r2-foreign-lease-999";
    expect(readR2ProofAttestation()).toBeNull();
    process.env.ISSUE300_R2_PROOF_LEASE_ID = lease;
    f.issue({ ...f.proof, expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    f.issue();
    writeFileSync(f.importedContract, "// forged compiled contracts artifact");
    expect(readR2ProofAttestation()).toBeNull();
    writeFileSync(f.importedContract, "// test-only synthetic contract authorization");
    writeFileSync(f.otherApi, "// forged compiled API artifact");
    expect(readR2ProofAttestation()).toBeNull();
    writeFileSync(f.otherApi, "// test-only synthetic API guard");
    writeFileSync(f.manifestFile, JSON.stringify({ ...f.manifest,
      sourceSha256: "7".repeat(64) }));
    expect(readR2ProofAttestation()).toBeNull();
    writeFileSync(f.manifestFile, JSON.stringify(f.manifest));
    writeFileSync(f.cert + ".sig", Buffer.alloc(64, 3).toString("base64"));
    expect(readR2ProofAttestation()).toBeNull();
  });
});
