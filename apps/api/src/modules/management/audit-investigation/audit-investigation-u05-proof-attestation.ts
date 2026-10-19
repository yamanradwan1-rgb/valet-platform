import { createHash, verify } from "node:crypto";
import { r2ApiBundleDigest } from "./audit-investigation-u05-build-digest";
import { r2ReadSignedCertificateFile, r2ReadVersionedManifest } from
  "./audit-investigation-u05-proof-files";
export { r2ApiBundleDigest } from "./audit-investigation-u05-build-digest";

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
  readonly database: "issue300_r2_w7_acceptance_v2";
  readonly host: "127.0.0.1";
  readonly port: 58387;
  readonly bindHost: "127.0.0.1";
  readonly bindPort: 58387;
  readonly apiOrigin: "http://127.0.0.1:3167";
  readonly defaultApiOrigin: "http://127.0.0.1:3168";
  readonly dashboardOrigin: "http://127.0.0.1:3117";
  readonly serverVersionNum: 170010;
  readonly postgresStartedAt: string;
  readonly apiBundleSha256: string;
  readonly contractsBundleSha256: string;
  readonly sourceSha256: string;
  readonly apiBuildReceiptSha256: string;
  readonly artifactVersion: 1;
  readonly resourceManifestFilename: string;
  readonly resourceManifestSha256: string;
  readonly migrationLedgerSha256: string;
  readonly ledgerHelperFunctionSha256: string;
  readonly guardFunctionsSha256: string;
  readonly containerName: "issue300_r2_w7_acceptance_v2_pg17";
  readonly containerId: string;
  readonly containerLabel: "issue300-r2-w7-acceptance-v2";
  readonly volume: "issue300_r2_w7_acceptance_v2_pgdata";
  readonly migrationRole: "issue300_r2_w7_owner_v2";
  readonly runtimeRole: "issue300_r2_w7_runtime_v2";
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
// Owner Ed25519 SPKI is source-pinned, never read from environment or manifest.
const ownerSigningKeySpki = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----`;
/** Closed local allowlist; never promote an arbitrary manifest-supplied target. */
export const r2OwnedProofTarget = {
  database: "issue300_r2_w7_acceptance_v2", host: "127.0.0.1", port: 58387,
  bindHost: "127.0.0.1", bindPort: 58387,
  apiOrigin: "http://127.0.0.1:3167",
  defaultApiOrigin: "http://127.0.0.1:3168",
  dashboardOrigin: "http://127.0.0.1:3117",
  serverVersionNum: 170010, containerName: "issue300_r2_w7_acceptance_v2_pg17",
  containerLabel: "issue300-r2-w7-acceptance-v2", volume: "issue300_r2_w7_acceptance_v2_pgdata",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
} as const;
const names = [
  "20260919004500_mgt_fix_02_pagination_snapshot_membership",
  "20261018009400_issue_300_u05_birth_xid",
  "20261018009500_issue_300_option_b_task_relation_provenance",
  "20261018009600_issue_300_option_b_attribution_freeze",
] as const;

/** Signed cert and SHA-bound manifest must agree on built source/receipt/contracts. */
export function r2BuildEvidenceMatches(
  entrypoint: string,
  proof: R2ProofAttestation,
  manifest: R2ProofAttestation,
): boolean {
  for (const field of [
    "contractsBundleSha256", "sourceSha256", "apiBuildReceiptSha256",
  ] as const) {
    if (!sha256.test(proof[field]) || !sha256.test(manifest[field]) ||
        proof[field] !== manifest[field]) return false;
  }
  const contracts = resolve(dirname(entrypoint), "../../../packages/contracts/dist/index.js");
  return r2ApiBundleDigest(contracts, "index.js") === proof.contractsBundleSha256;
}
export function r2AttestationIsFresh(issuedAt: string, expiresAt: string,
  now = Date.now()): boolean {
  const issued = Date.parse(issuedAt), expires = Date.parse(expiresAt);
  return Number.isFinite(issued) && issued <= now && Number.isFinite(expires) &&
    expires > now && expires - issued <= 15 * 60_000;
}
/** Source-pinned target and SHA-bound owned manifest must agree. */
function matchingOwnedManifest(entrypoint: string, proof: R2ProofAttestation): boolean {
  try {
    const bytes = r2ReadVersionedManifest(entrypoint, proof);
    if (!bytes ||
        createHash("sha256").update(bytes).digest("hex") !== proof.resourceManifestSha256)
      return false;
    const manifest = JSON.parse(bytes.toString("utf8")) as R2ProofAttestation;
    for (const [field, value] of Object.entries(r2OwnedProofTarget)) {
      if (manifest[field as keyof R2ProofAttestation] !== value) return false;
    }
    if (!r2BuildEvidenceMatches(entrypoint, proof, manifest) ||
        manifest.containerId !== proof.containerId ||
        manifest.leaseId !== proof.leaseId ||
        manifest.candidateSha !== proof.candidateSha ||
        manifest.postgresStartedAt !== proof.postgresStartedAt ||
        manifest.apiBundleSha256 !== proof.apiBundleSha256 ||
        !manifest.migrationChecksums ||
        Object.keys(manifest.migrationChecksums).length !== 96 ||
        Object.entries(manifest.migrationChecksums).some(([name, sum]) =>
          !/^\d{14}_[a-z0-9_]+$/.test(name) || !sha256.test(sum))) return false;
    const ledger = Object.entries(manifest.migrationChecksums)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([name, sum]) => `${name}:${sum}`).join("\n");
    return createHash("sha256").update(ledger).digest("hex") === proof.migrationLedgerSha256 &&
      names.every((name) => proof.migrationChecksums[name] === manifest.migrationChecksums[name]);
  } catch { return false; }
}

/** Runtime requires Owner-signed short-lived proof, never a self-asserted env flag. */
export function readR2ProofAttestation(): R2ProofAttestation | null {
  const path = process.env.ISSUE300_R2_ATTESTATION_PATH;
  const expected = process.env.ISSUE300_R2_ATTESTATION_SHA256;
  const candidate = process.env.ISSUE300_R2_CANDIDATE_SHA;
  const lease = process.env.ISSUE300_R2_PROOF_LEASE_ID;
  if (
    !path ||
    !sha256.test(expected ?? "") ||
    !/^[a-f0-9]{40}$/.test(candidate ?? "") ||
    !/^issue300-r2-[a-z0-9-]{8,}$/.test(lease ?? "") ||
    process.env.ISSUE300_R2_RUNTIME_ROLE !== r2OwnedProofTarget.runtimeRole
  )
    return null;
  try {
    const bytes = r2ReadSignedCertificateFile(process.argv[1] ?? "",
      path, candidate, lease);
    if (
      !bytes ||
      createHash("sha256").update(bytes).digest("hex") !== expected
    )
      return null;
    const signatureBytes = r2ReadSignedCertificateFile(process.argv[1] ?? "",
      `${path}.sig`, candidate, lease, true);
    if (!signatureBytes) return null;
    const signature = signatureBytes.toString("utf8").trim();
    if (!/^[A-Za-z0-9+/]{86}==$/.test(signature) ||
        !verify(null, bytes, ownerSigningKeySpki, Buffer.from(signature, "base64")))
      return null;
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const proof = parsed as R2ProofAttestation;
    if (
      proof.project !== "issue300" ||
      proof.mode !== "ISOLATED_PROOF_CANDIDATE" ||
      proof.leaseId !== lease ||
      proof.candidateSha !== candidate ||
      !r2AttestationIsFresh(proof.issuedAt, proof.expiresAt) ||
      proof.database !== r2OwnedProofTarget.database ||
      proof.host !== r2OwnedProofTarget.host ||
      proof.port !== r2OwnedProofTarget.port ||
      proof.bindHost !== r2OwnedProofTarget.bindHost ||
      proof.bindPort !== r2OwnedProofTarget.bindPort ||
      proof.apiOrigin !== r2OwnedProofTarget.apiOrigin ||
      proof.defaultApiOrigin !== r2OwnedProofTarget.defaultApiOrigin ||
      proof.dashboardOrigin !== r2OwnedProofTarget.dashboardOrigin ||
      proof.serverVersionNum !== r2OwnedProofTarget.serverVersionNum ||
      !Number.isFinite(Date.parse(proof.postgresStartedAt)) ||
      !sha256.test(proof.apiBundleSha256) ||
      proof.artifactVersion !== 1 ||
      typeof proof.resourceManifestFilename !== "string" ||
      !sha256.test(proof.resourceManifestSha256) ||
      !sha256.test(proof.migrationLedgerSha256) ||
      !sha256.test(proof.ledgerHelperFunctionSha256) ||
      !sha256.test(proof.guardFunctionsSha256) ||
      !process.argv[1] ||
      r2ApiBundleDigest(process.argv[1]) !== proof.apiBundleSha256 ||
      proof.containerName !== r2OwnedProofTarget.containerName ||
      !sha256.test(proof.containerId) ||
      proof.containerLabel !== r2OwnedProofTarget.containerLabel ||
      proof.volume !== r2OwnedProofTarget.volume ||
      proof.migrationRole !== r2OwnedProofTarget.migrationRole ||
      proof.runtimeRole !== r2OwnedProofTarget.runtimeRole ||
      proof.actualRoleVerified !== true ||
      proof.migrationsApplied !== 96 ||
      proof.birthTriggers !== 12 ||
      proof.immutableTriggers !== 6 ||
      !proof.migrationChecksums ||
      typeof proof.migrationChecksums !== "object" ||
      names.some(
        (name) => !sha256.test(proof.migrationChecksums[name] ?? ""),
      ) ||
      !matchingOwnedManifest(process.argv[1], proof) ||
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
  signedProof: R2ProofAttestation | null = readR2ProofAttestation(),
): readonly string[] | null {
  const scope = signedProof?.allowedScopes.find(
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
