import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  isU05LocalProofEnabled,
  isU05R2IndirectHttpProofCandidate,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-gate";
import {
  requireU05StableIndirectCohort,
  U05IndirectCohortNotStable,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-indirect-guard";
import { r2ApiBundleDigest, r2AttestationIsFresh, r2BuildEvidenceMatches } from "../src/modules/management/audit-investigation/audit-investigation-u05-proof-attestation";
import { r2OwnedProofTarget } from "../src/modules/management/audit-investigation/audit-investigation-u05-proof-attestation";

const keys = [
  "NODE_ENV",
  "DATABASE_URL",
  "ISSUE300_U05_G2_PROOF_ENABLE",
  "ISSUE300_R2_PROOF_LEASE_ID",
  "ISSUE300_R2_CANDIDATE_SHA",
  "ISSUE300_R2_ATTESTATION_SHA256",
  "ISSUE300_R2_ATTESTATION_PATH",
  "ISSUE300_R2_RUNTIME_ROLE",
  "ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE",
] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const created: string[] = [];
const priorEntrypoint = process.argv[1];
afterEach(() => {
  process.argv[1] = priorEntrypoint ?? "";
  for (const dir of created.splice(0))
    rmSync(dir, { recursive: true, force: true });
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function r2Proof() {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    "postgresql://issue300_r2_w7_runtime_v2:example@127.0.0.1:58387/issue300_r2_w7_acceptance_v2";
  process.env.ISSUE300_U05_G2_PROOF_ENABLE = "1";
  process.env.ISSUE300_R2_PROOF_LEASE_ID = "issue300-r2-owned-proof-001";
  process.env.ISSUE300_R2_CANDIDATE_SHA = "a".repeat(40);
  process.env.ISSUE300_R2_ATTESTATION_SHA256 = "b".repeat(64);
  process.env.ISSUE300_R2_RUNTIME_ROLE = r2OwnedProofTarget.runtimeRole;
}

const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "LOCATION_MANAGER" as const,
};
const snapshot = { cutoff: "2026-10-18T12:00:00.000500Z", database: "1:2:" };

function createProof(overrides: Record<string, unknown> = {}) {
  r2Proof();
  const dir = mkdtempSync(join(tmpdir(), "issue300-r2-gate-"));
  created.push(dir);
  const path = join(dir, "attestation.json");
  const build = join(dir, "apps/api/dist");
  mkdirSync(build, { recursive: true });
  const main = join(build, "main.js");
  writeFileSync(main, "// synthetic test API entrypoint");
  writeFileSync(join(build, "indirect-guard.js"), "// compiled module v1");
  const contractsDir = join(dir, "packages/contracts/dist");
  mkdirSync(contractsDir, { recursive: true });
  writeFileSync(join(contractsDir, "index.js"), "// synthetic contracts");
  writeFileSync(join(contractsDir, "staff-auth.js"), "// imported contracts");
  process.argv[1] = main;
  const now = Date.now();
  const checksums = Object.fromEntries([
    ...Array.from({ length: 92 }, (_, i) =>
      [`2024010100${String(i).padStart(4, "0")}_synthetic_${i}`,
        createHash("sha256").update(String(i)).digest("hex")]),
    ["20260919004500_mgt_fix_02_pagination_snapshot_membership", "c".repeat(64)],
    ["20261018009400_issue_300_u05_birth_xid", "d".repeat(64)],
    ["20261018009500_issue_300_option_b_task_relation_provenance", "e".repeat(64)],
    ["20261018009600_issue_300_option_b_attribution_freeze", "f".repeat(64)],
  ]);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const provenance = {
    sourceSha256: "1".repeat(64),
    apiBuildReceiptSha256: "2".repeat(64),
    contractsBundleSha256: r2ApiBundleDigest(join(contractsDir, "index.js"), "index.js"),
  };
  const manifest = {
    ...r2OwnedProofTarget, containerId: "f".repeat(64),
    candidateSha: process.env.ISSUE300_R2_CANDIDATE_SHA,
    leaseId: process.env.ISSUE300_R2_PROOF_LEASE_ID,
    postgresStartedAt: new Date(now - 60_000).toISOString(),
    apiBundleSha256: r2ApiBundleDigest(main), migrationChecksums: checksums,
    ...provenance,
  };
  const manifestFile = join(dir, "tmp/issue300-r2-w7-acceptance-v2-owned/R2_OWNED_RESOURCE_MANIFEST.json");
  mkdirSync(dirname(manifestFile), { recursive: true });
  const manifestBytes = JSON.stringify(manifest);
  writeFileSync(manifestFile, manifestBytes);
  const migrationLedgerSha256 = hash(Object.entries(checksums)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([name, sum]) => `${name}:${sum}`).join("\n"));
  const proof = {
    project: "issue300",
    mode: "ISOLATED_PROOF_CANDIDATE",
    leaseId: process.env.ISSUE300_R2_PROOF_LEASE_ID,
    candidateSha: process.env.ISSUE300_R2_CANDIDATE_SHA,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 50_000).toISOString(),
    ...r2OwnedProofTarget,
    postgresStartedAt: manifest.postgresStartedAt,
    apiBundleSha256: r2ApiBundleDigest(main),
    ...provenance,
    containerId: "f".repeat(64),
    resourceManifestSha256: hash(manifestBytes), migrationLedgerSha256,
    actualRoleVerified: true,
    migrationsApplied: 96,
    birthTriggers: 12,
    immutableTriggers: 6,
    migrationChecksums: {
      "20260919004500_mgt_fix_02_pagination_snapshot_membership": "c".repeat(
        64,
      ),
      "20261018009400_issue_300_u05_birth_xid": "d".repeat(64),
      "20261018009500_issue_300_option_b_task_relation_provenance": "e".repeat(
        64,
      ),
      "20261018009600_issue_300_option_b_attribution_freeze": "f".repeat(64),
    },
    allowedCohorts: ["SIGNED_HTTP_SOURCE_PARENT_CANDIDATE"],
    allowedScopes: [
      {
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        timeline: true,
        approvedAuditEventIds: ["44444444-4444-4444-8444-444444444444"],
        searchWindows: [
          { from: "2026-10-18T10:00:00.000Z", to: "2026-10-18T11:00:00.000Z" },
        ],
      },
    ],
    ...overrides,
  };
  const bytes = JSON.stringify(proof);
  writeFileSync(path, bytes);
  process.env.ISSUE300_R2_ATTESTATION_PATH = path;
  process.env.ISSUE300_R2_ATTESTATION_SHA256 = createHash("sha256")
    .update(bytes)
    .digest("hex");
  return path;
}

function evidence(path: string) {
  const main = join(dirname(path), "apps/api/dist/main.js");
  const proof = JSON.parse(readFileSync(path, "utf8"));
  const manifest = JSON.parse(readFileSync(join(dirname(path),
    "tmp/issue300-r2-w7-acceptance-v2-owned/R2_OWNED_RESOURCE_MANIFEST.json"), "utf8"));
  return { main, proof, manifest };
}

describe("Issue300 R2 isolated HTTP cohort proof gate", () => {
  it("rejects stale, future-issued and over-15-minute attestation timestamps", () => {
    const now = Date.parse("2026-10-19T00:00:00.000Z");
    const iso = (delta: number) => new Date(now + delta).toISOString();
    expect(r2AttestationIsFresh(iso(-1000), iso(60_000), now)).toBe(true);
    expect(r2AttestationIsFresh(iso(-1000), iso(-1), now)).toBe(false);
    expect(r2AttestationIsFresh(iso(1000), iso(60_000), now)).toBe(false);
    expect(r2AttestationIsFresh(iso(-1000), iso(900_001), now)).toBe(false);
    expect(r2AttestationIsFresh("invalid", iso(60_000), now)).toBe(false);
    expect(r2AttestationIsFresh(iso(-1000), "invalid", now)).toBe(false);
  });

  it("requires complete matching SHA256 build provenance in both signed documents", () => {
    const { main, proof, manifest } = evidence(createProof());
    expect(r2BuildEvidenceMatches(main, proof, manifest)).toBe(true);
    for (const field of ["contractsBundleSha256", "sourceSha256",
      "apiBuildReceiptSha256"]) {
      const legacy = { ...proof };
      delete legacy[field];
      expect(r2BuildEvidenceMatches(main, legacy, manifest)).toBe(false);
      const oldManifest = { ...manifest };
      delete oldManifest[field];
      expect(r2BuildEvidenceMatches(main, proof, oldManifest)).toBe(false);
      expect(r2BuildEvidenceMatches(main,
        { ...proof, [field]: "a".repeat(64) }, manifest)).toBe(false);
      expect(r2BuildEvidenceMatches(main,
        proof, { ...manifest, [field]: "a".repeat(64) })).toBe(false);
      expect(r2BuildEvidenceMatches(main,
        { ...proof, [field]: "invalid" }, manifest)).toBe(false);
    }
  });

  it("rejects altered compiled contract modules even when API and source remain unchanged", () => {
    const { main, proof, manifest } = evidence(createProof());
    const contracts = join(dirname(main), "../../../packages/contracts/dist");
    expect(r2BuildEvidenceMatches(main, proof, manifest)).toBe(true);
    writeFileSync(join(contracts, "staff-auth.js"), "// tampered contracts");
    expect(r2BuildEvidenceMatches(main, proof, manifest)).toBe(false);
    expect(r2BuildEvidenceMatches(main, { ...proof,
      contractsBundleSha256: "f".repeat(64) }, { ...manifest,
      contractsBundleSha256: "f".repeat(64) })).toBe(false);
  });

  it("never admits even a matching legacy source/receipt pair without contracts proof", () => {
    const { main, proof, manifest } = evidence(createProof());
    delete proof.contractsBundleSha256;
    delete manifest.contractsBundleSha256;
    expect(r2BuildEvidenceMatches(main, proof, manifest)).toBe(false);
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it("is disabled without candidate attestation and explicit opt-in", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL =
      "postgresql://issue300_r2_w7_runtime_v2:pass@127.0.0.1:58387/issue300_r2_w7_acceptance_v2";
    process.env.ISSUE300_U05_G2_PROOF_ENABLE = "1";
    delete process.env.ISSUE300_R2_ATTESTATION_SHA256;
    expect(isU05LocalProofEnabled()).toBe(false);
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it.each(["production", "development"])("cannot run in %s", (nodeEnv) => {
    r2Proof();
    process.env.NODE_ENV = nodeEnv;
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05LocalProofEnabled()).toBe(false);
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it.each([
    "postgresql://issue300_r2_w7_runtime_v2:pass@127.0.0.1:57285/issue300_r2",
    "postgresql://issue300_r2_w7_runtime_v2:pass@127.0.0.1:5432/issue300_r2_w7_acceptance_v2",
    "postgresql://issue300_r2_w7_runtime_v2:pass@localhost:58387/issue300_r2_w7_acceptance_v2",
    "postgresql://issue300_r2_w7_runtime_v2:pass@127.0.0.1:58387/postgres",
    "postgresql://wrong:pass@127.0.0.1:58387/issue300_r2_w7_acceptance_v2",
    "postgresql://issue300_r2_w7_runtime_v2:pass@127.0.0.1:58387/issue300_r2_w7_acceptance_v2?sslmode=disable",
  ])("rejects an unowned or option-bearing URL", (url) => {
    r2Proof();
    process.env.DATABASE_URL = url;
    expect(isU05LocalProofEnabled()).toBe(false);
  });

  it("retains the legacy location-wide veto unless additionally opted into cohort proof", async () => {
    r2Proof();
    delete process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE;
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ unsafe: true }] });
    await expect(
      requireU05StableIndirectCohort(
        { query } as unknown as PostgresTransaction,
        scope,
        snapshot,
      ),
    ).rejects.toBeInstanceOf(U05IndirectCohortNotStable);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain("SELECT EXISTS (");
  });

  it("rejects a self-issued JSON/SHA certificate before R2 SQL", async () => {
    createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ unsafe: true }] });
    const tx = { query } as unknown as PostgresTransaction;
    await expect(
      requireU05StableIndirectCohort(tx, scope, snapshot),
    ).rejects.toBeInstanceOf(U05IndirectCohortNotStable);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("SELECT EXISTS (");
  });

  it("rejects a valid Ed25519 signature from any unpinned attacker key", () => {
    const path = createProof();
    const { privateKey } = generateKeyPairSync("ed25519");
    const signature = sign(null, readFileSync(path), privateKey);
    writeFileSync(`${path}.sig`, signature.toString("base64"));
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it("refuses unsigned, mismatch, stale or malformed certificates", () => {
    const path = createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    writeFileSync(path, "{}");
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({ expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({ containerName: "unowned_database" });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({ allowedScopes: [] });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({
      expiresAt: new Date(Date.now() + 15 * 60_000 + 2_000).toISOString(),
    });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it("invalidates imported compiled modules even if dist/main.js stays identical", () => {
    const path = createProof();
    const main = join(dirname(path), "apps/api/dist/main.js");
    const before = r2ApiBundleDigest(main);
    writeFileSync(
      join(dirname(path), "apps/api/dist", "indirect-guard.js"),
      "// changed module v2",
    );
    expect(r2ApiBundleDigest(main)).not.toBe(before);
  });

  it("denies altered 96-checksum resource manifest after attestation", () => {
    const path = createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    const manifestPath = join(dirname(path),
      "tmp/issue300-r2-w7-acceptance-v2-owned/R2_OWNED_RESOURCE_MANIFEST.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const firstMigration = Object.keys(manifest.migrationChecksums)[0];
    if (!firstMigration) throw new Error("Test fixture has no migration ledger");
    manifest.migrationChecksums[firstMigration] = "a".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it.each([{ bindPort: 57285 }, { migrationRole: "postgres" },
    { volume: "existing_human_data" }, { database: "issue300_r2" },
    { apiOrigin: "http://127.0.0.1:3165" },
    { defaultApiOrigin: "http://127.0.0.1:3167" },
    { dashboardOrigin: "http://127.0.0.1:3114" }])(
    "rejects unowned resource field %o", (override) => {
      createProof(override);
      process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
      expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    },
  );

  it("cannot bypass veto in an unlisted tenant, Location or Search window", async () => {
    createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ unsafe: true }] });
    const tx = { query } as unknown as PostgresTransaction;
    await expect(
      requireU05StableIndirectCohort(
        tx,
        { ...scope, locationId: "88888888-8888-4888-8888-888888888888" },
        snapshot,
      ),
    ).rejects.toBeInstanceOf(U05IndirectCohortNotStable);
    await expect(
      requireU05StableIndirectCohort(tx, scope, snapshot, {
        from: "2026-10-18T11:00:00.000Z",
        to: "2026-10-18T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(U05IndirectCohortNotStable);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
