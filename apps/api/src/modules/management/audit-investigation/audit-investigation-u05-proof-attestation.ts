import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

interface AllowedScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly timeline: boolean;
  readonly approvedAuditEventIds: readonly string[];
  readonly searchWindows: readonly {
    readonly from: string;
    readonly to: string;
  }[];
}

interface R2ProofAttestation {
  readonly project: "issue300";
  readonly mode: "ISOLATED_PROOF_CANDIDATE";
  readonly leaseId: string;
  readonly candidateSha: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly database: "issue300_r2";
  readonly host: "127.0.0.1";
  readonly port: 57285;
  readonly serverVersionNum: 170010;
  readonly postgresStartedAt: string;
  readonly apiBundleSha256: string;
  readonly containerName: "issue300_r2_pg17";
  readonly containerId: string;
  readonly containerLabel: "issue300-r2";
  readonly volume: "issue300_r2_pgdata";
  readonly runtimeRole: "issue300_r2_w6_runtime";
  readonly actualRoleVerified: true;
  readonly migrationsApplied: 96;
  readonly birthTriggers: 12;
  readonly immutableTriggers: 6;
  readonly migrationChecksums: Record<string, string>;
  readonly allowedCohorts: readonly ["SIGNED_HTTP_SOURCE_PARENT_CANDIDATE"];
  readonly allowedScopes: readonly AllowedScope[];
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha256 = /^[a-f0-9]{64}$/;
const names = [
  "20260919004500_mgt_fix_02_pagination_snapshot_membership",
  "20261018009400_issue_300_u05_birth_xid",
  "20261018009500_issue_300_option_b_task_relation_provenance",
  "20261018009600_issue_300_option_b_attribution_freeze",
] as const;

/** An imported compiled Nest module can change while dist/main.js does not.
 * Attest the complete compiled output, not only the entrypoint. */
export function r2ApiBundleDigest(entrypoint: string): string | null {
  try {
    const main = resolve(entrypoint);
    if (!main.endsWith(join("dist", "main.js"))) return null;
    const base = dirname(main);
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (files.length > 12000 || entry.isSymbolicLink())
          throw new Error("Unexpected compiled API artifact");
        const file = join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) files.push(file);
      }
    };
    walk(base);
    if (!files.includes(main)) return null;
    const hash = createHash("sha256");
    for (const file of files.sort((a, b) => a.localeCompare(b, "en"))) {
      hash
        .update(relative(base, file).replaceAll("\\", "/"))
        .update("\0")
        .update(readFileSync(file))
        .update("\0");
    }
    return hash.digest("hex");
  } catch {
    return null;
  }
}

/** Runtime never trusts a self-asserted env flag as an attestation. The owned
 * Prime preflight checks Docker, schema, role and all 96 migration checksums
 * BEFORE issuing this short-lived non-secret, digest-pinned local certificate.
 */
export function readR2ProofAttestation(): R2ProofAttestation | null {
  const path = process.env.ISSUE300_R2_ATTESTATION_PATH;
  const expected = process.env.ISSUE300_R2_ATTESTATION_SHA256;
  const candidate = process.env.ISSUE300_R2_CANDIDATE_SHA;
  const lease = process.env.ISSUE300_R2_PROOF_LEASE_ID;
  if (
    !path ||
    !isAbsolute(path) ||
    !sha256.test(expected ?? "") ||
    !/^[a-f0-9]{40}$/.test(candidate ?? "") ||
    !/^issue300-r2-[a-z0-9-]{8,}$/.test(lease ?? "") ||
    process.env.ISSUE300_R2_RUNTIME_ROLE !== "issue300_r2_w6_runtime"
  )
    return null;
  try {
    const bytes = readFileSync(path);
    if (
      !bytes.length ||
      bytes.length > 8192 ||
      createHash("sha256").update(bytes).digest("hex") !== expected
    )
      return null;
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const proof = parsed as R2ProofAttestation;
    const issued = Date.parse(proof.issuedAt);
    const expires = Date.parse(proof.expiresAt);
    const now = Date.now();
    if (
      proof.project !== "issue300" ||
      proof.mode !== "ISOLATED_PROOF_CANDIDATE" ||
      proof.leaseId !== lease ||
      proof.candidateSha !== candidate ||
      !Number.isFinite(issued) ||
      issued > now ||
      !Number.isFinite(expires) ||
      expires <= now ||
      expires - issued > 15 * 60_000 ||
      proof.database !== "issue300_r2" ||
      proof.host !== "127.0.0.1" ||
      proof.port !== 57285 ||
      proof.serverVersionNum !== 170010 ||
      !Number.isFinite(Date.parse(proof.postgresStartedAt)) ||
      !sha256.test(proof.apiBundleSha256) ||
      !process.argv[1] ||
      r2ApiBundleDigest(process.argv[1]) !== proof.apiBundleSha256 ||
      proof.containerName !== "issue300_r2_pg17" ||
      !sha256.test(proof.containerId) ||
      proof.containerLabel !== "issue300-r2" ||
      proof.volume !== "issue300_r2_pgdata" ||
      proof.runtimeRole !== "issue300_r2_w6_runtime" ||
      proof.actualRoleVerified !== true ||
      proof.migrationsApplied !== 96 ||
      proof.birthTriggers !== 12 ||
      proof.immutableTriggers !== 6 ||
      !proof.migrationChecksums ||
      typeof proof.migrationChecksums !== "object" ||
      names.some(
        (name) => !sha256.test(proof.migrationChecksums[name] ?? ""),
      ) ||
      !Array.isArray(proof.allowedCohorts) ||
      proof.allowedCohorts.length !== 1 ||
      proof.allowedCohorts[0] !== "SIGNED_HTTP_SOURCE_PARENT_CANDIDATE" ||
      !Array.isArray(proof.allowedScopes) ||
      proof.allowedScopes.length === 0 ||
      proof.allowedScopes.length > 12
    )
      return null;
    for (const scope of proof.allowedScopes) {
      if (
        !scope ||
        !uuid.test(scope.organizationId) ||
        !uuid.test(scope.locationId) ||
        typeof scope.timeline !== "boolean" ||
        !Array.isArray(scope.searchWindows) ||
        scope.searchWindows.length > 12 ||
        !Array.isArray(scope.approvedAuditEventIds) ||
        scope.approvedAuditEventIds.length > 200 ||
        scope.approvedAuditEventIds.some((id: string) => !uuid.test(id)) ||
        new Set(scope.approvedAuditEventIds).size !==
          scope.approvedAuditEventIds.length ||
        scope.searchWindows.some(
          (range: { from: string; to: string }) =>
            !range ||
            typeof range.from !== "string" ||
            typeof range.to !== "string" ||
            !Number.isFinite(Date.parse(range.from)) ||
            !Number.isFinite(Date.parse(range.to)) ||
            Date.parse(range.from) >= Date.parse(range.to),
        )
      )
        return null;
    }
    return proof;
  } catch {
    return null;
  }
}

/** Exact authorized Location and exact signed discovery window, or an
 * explicitly allowlisted whole-Location Timeline proof. No broad wildcard.
 */
export function r2ProofApprovedAuditIds(
  organizationId: string,
  locationId: string,
  window?: { readonly from: string; readonly to: string },
): readonly string[] | null {
  const proof = readR2ProofAttestation();
  const scope = proof?.allowedScopes.find(
    (item) =>
      item.organizationId === organizationId &&
      item.locationId === locationId &&
      (window
        ? item.searchWindows.some(
            (range) => range.from === window.from && range.to === window.to,
          )
        : item.timeline),
  );
  return scope?.approvedAuditEventIds ?? null;
}
