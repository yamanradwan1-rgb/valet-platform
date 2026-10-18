import { r2OwnedProofTarget, readR2ProofAttestation } from "./audit-investigation-u05-proof-attestation";

/** The approved R2 test lane is neither a production feature flag nor an
 * attestation on its own. W6 must first attest the exact disposable cluster,
 * migrated schema and provisioned runtime role. The source/parent HTTP proof
 * then uses only these exact loopback targets and an explicit owned lease.
 * All other targets and unproven cohorts remain fail-closed.
 */
function proofTarget(): "G2" | "R2" | null {
  try {
    const target = new URL(process.env.DATABASE_URL ?? "");
    if (
      target.hostname !== "127.0.0.1" ||
      target.search ||
      target.hash ||
      (target.protocol !== "postgresql:" && target.protocol !== "postgres:")
    )
      return null;
    if (target.port === "55480" && target.pathname === "/issue300_g2")
      return "G2";
    if (target.port === String(r2OwnedProofTarget.port) &&
        target.pathname === `/${r2OwnedProofTarget.database}` &&
        decodeURIComponent(target.username) === r2OwnedProofTarget.runtimeRole &&
        target.password.length > 0)
      return "R2";
    return null;
  } catch {
    return null;
  }
}

export function isU05LocalProofEnabled(): boolean {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.ISSUE300_U05_G2_PROOF_ENABLE !== "1"
  )
    return false;
  const target = proofTarget();
  return (
    target === "G2" || (target === "R2" && readR2ProofAttestation() !== null)
  );
}

/** Only a specifically attested local API test candidate may evaluate a
 * previously guarded indirect cohort. It still must pass the database-owned
 * identity, strict runtime role, trigger and append-only privilege recheck.
 * This flag never changes the ordinary/default HTTP 503 path.
 */
export function isU05R2IndirectHttpProofCandidate(): boolean {
  return (
    isU05LocalProofEnabled() &&
    proofTarget() === "R2" &&
    process.env.ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE === "1"
  );
}
