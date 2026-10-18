import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
afterEach(() => {
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
    "postgresql://example:example@127.0.0.1:57285/issue300_r2";
  process.env.ISSUE300_U05_G2_PROOF_ENABLE = "1";
  process.env.ISSUE300_R2_PROOF_LEASE_ID = "issue300-r2-owned-proof-001";
  process.env.ISSUE300_R2_CANDIDATE_SHA = "a".repeat(40);
  process.env.ISSUE300_R2_ATTESTATION_SHA256 = "b".repeat(64);
  process.env.ISSUE300_R2_RUNTIME_ROLE = "issue300_r2_w6_runtime";
}

const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "LOCATION_MANAGER" as const,
};
const snapshot = { now: new Date("2026-10-18T12:00:00Z"), database: "1:2:" };

function createProof(overrides: Record<string, unknown> = {}) {
  r2Proof();
  const dir = mkdtempSync(join(tmpdir(), "issue300-r2-gate-"));
  created.push(dir);
  const path = join(dir, "attestation.json");
  const now = Date.now();
  const proof = {
    project: "issue300",
    mode: "ISOLATED_PROOF_CANDIDATE",
    leaseId: process.env.ISSUE300_R2_PROOF_LEASE_ID,
    candidateSha: process.env.ISSUE300_R2_CANDIDATE_SHA,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 50_000).toISOString(),
    database: "issue300_r2",
    host: "127.0.0.1",
    port: 57285,
    serverVersionNum: 170010,
    postgresStartedAt: new Date(Date.now() - 60_000).toISOString(),
    apiEntrypointSha256: createHash("sha256")
      .update(readFileSync(process.argv[1]!))
      .digest("hex"),
    containerName: "issue300_r2_pg17",
    containerId: "f".repeat(64),
    containerLabel: "issue300-r2",
    volume: "issue300_r2_pgdata",
    runtimeRole: "issue300_r2_w6_runtime",
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

describe("Issue300 R2 isolated HTTP cohort proof gate", () => {
  it("is disabled without candidate attestation and explicit opt-in", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL =
      "postgresql://user:pass@127.0.0.1:57285/issue300_r2";
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
    "postgresql://user:pass@127.0.0.1:5432/issue300_r2",
    "postgresql://user:pass@localhost:57285/issue300_r2",
    "postgresql://user:pass@127.0.0.1:57285/postgres",
    "postgresql://user:pass@127.0.0.1:57285/issue300_r2?sslmode=disable",
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

  it("requires a live real-role/catalog/privilege check before test-only cohort proof", async () => {
    createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(true);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ valid: false }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ valid: true }] });
    const tx = { query } as unknown as PostgresTransaction;
    await expect(
      requireU05StableIndirectCohort(tx, scope, snapshot),
    ).rejects.toBeInstanceOf(U05IndirectCohortNotStable);
    await expect(
      requireU05StableIndirectCohort(tx, scope, snapshot),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("current_database() = 'issue300_r2'");
    expect(sql).toContain("current_user = 'issue300_r2_w6_runtime'");
    expect(sql).toContain("NOT has_table_privilege");
    expect(sql).toContain("pg_trigger");
  });

  it("refuses mismatch, stale or malformed certificate without querying SQL", async () => {
    const path = createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    expect(isU05R2IndirectHttpProofCandidate()).toBe(true);
    writeFileSync(path, "{}");
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({ expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({ containerName: "unowned_database" });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
    createProof({ allowedScopes: [] });
    expect(isU05R2IndirectHttpProofCandidate()).toBe(false);
  });

  it("cannot bypass veto in an unlisted tenant, Location or Search window", async () => {
    createProof();
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE = "1";
    const query = vi.fn();
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
    expect(query).not.toHaveBeenCalled();
  });
});
