/**
 * Option C runtime-provision replay fence.
 *
 * The old provision-runtime-role script still contains required legacy grants
 * for pre-cutover application instances. After the protected writer cutover,
 * re-running it must fail BEFORE any CREATE ROLE/GRANT, even without any new
 * protected-writer environment variables. A separate, reviewed protected
 * provisioner remains responsible for idempotent exact ACLs after cutover.
 *
 * Caller must already hold one explicit migration transaction. The
 * NOLOGIN vap1_proof_owner SET-only membership originates in migration113;
 * ordinary DATABASE_URL may not assume it. FOR SHARE needs the table owner
 * because PostgreSQL requires UPDATE privilege for row-lock reads. The
 * transaction row lock survives RESET ROLE and lasts through COMMIT.
 */
export async function assertOptionCProvisioningIsLegacy(client) {
  const exists = await client.query(
    "SELECT pg_catalog.to_regclass('auth_proof_private.option_c_launch_boundary') AS boundary",
  );
  const boundary = exists.rows[0]?.boundary;
  if (exists.rowCount !== 1) {
    throw new Error("Option C provisioning state cannot be verified.");
  }
  if (boundary === null) return; // A pre-migration fresh install, still legacy.
  if (boundary === undefined) {
    throw new Error("Option C provisioning boundary cannot be verified.");
  }

  await client.query("SET LOCAL ROLE vap1_proof_owner");
  let result;
  try {
    result = await client.query(
      "SELECT phase FROM auth_proof_private.option_c_launch_boundary WHERE singleton FOR SHARE",
    );
  } finally {
    // Never grant public runtime privileges while SET ROLE is still active.
    await client.query("RESET ROLE");
  }
  if (result.rowCount !== 1 || result.rows[0]?.phase !== "LEGACY") {
    throw new Error(
      "Option C PROTECTED: ordinary runtime role provisioning cannot restore legacy Auth/MFA/Management SQL authority.",
    );
  }
}
