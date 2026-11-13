// This module is inert unless an approved operator calls it with an already
// attested migration lease. It cannot declare L1 admission or enable VAP1.
import { retireLegacyVap1Grants } from "./vap1-security-privileges.mjs";
import { verifyVap1PrivateIsolation } from "./vap1-security-verification.mjs";

export async function provisionVap1RestrictedRuntime(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query("BEGIN");
  try {
    await retireLegacyVap1Grants(client, executeFormatted, runtimeRole);
    const evidence = await verifyVap1PrivateIsolation(client, runtimeRole);
    await client.query("COMMIT");
    return {
      ...evidence,
      result: "RESTRICTED_ACL_ONLY",
      proofWritersReady: false,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // An unknown connection/commit state must be reconciled on a fresh lease.
    }
    throw error;
  }
}
