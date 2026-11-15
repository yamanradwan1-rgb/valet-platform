import {
  refreshTokenPattern,
  staffCredentialHash,
} from "./staff-auth-credential";

/**
 * Resolve a lookup digest only from a submitted canonical raw vsr1 credential.
 * A stored digest, session ID or caller assertion is never refresh possession.
 * This is NOT VAP1 signer authority: SQL must still authenticate and lock the
 * matching lineage, and future protected writers must verify their challenge.
 */
export function hashSubmittedStaffRefresh(
  submitted: string | undefined,
): string | undefined {
  if (typeof submitted !== "string" || !refreshTokenPattern.test(submitted)) {
    return undefined;
  }
  const encoded = submitted.slice("vsr1.".length);
  const raw = Buffer.from(encoded, "base64url");
  if (raw.length !== 32 || raw.toString("base64url") !== encoded) {
    return undefined;
  }
  return staffCredentialHash("refresh", submitted);
}
