import { Issue416ResetUnavailableError } from "./issue416-password-reset-errors";

/**
 * Issue416 R02/R03 signed SQL authority is NOT implemented or authorized.
 * Migration 130 intentionally rejects unproven redemption. Neither an env
 * flag nor an injectable mock boundary can activate these HTTP operations.
 *
 * This unconditional barrier must only be replaced after independent review
 * of a credential-bound, purpose-specific application signer, real private
 * SQL proof/ACLs, anti-abuse UPDATE privilege closure, atomic account audit
 * and PostgreSQL integration evidence. In particular, existing runtime
 * anti_abuse_events UPDATE privileges cannot attest R03 quota integrity.
 */
export function requireIssue416VerifiedSqlAuthority(
  _operation: "STATUS" | "ISSUE" | "REDEEM",
): void {
  void _operation;
  throw new Issue416ResetUnavailableError();
}
