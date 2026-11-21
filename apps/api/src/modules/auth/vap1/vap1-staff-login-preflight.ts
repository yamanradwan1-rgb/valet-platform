/**
 * The source build has no trusted, request-owned VAP1 key custody, private SQL
 * verifier or typed STAFF_LOGIN_COMMIT command. Do not add a development flag,
 * a test verifier, caller-owned transaction, PHC or SQL-derived state to turn
 * this dormant boundary into an issuer.
 */
export class Vap1StaffLoginAdmissionUnavailable extends Error {
  constructor() {
    super("VAP1 Staff Login authority is unavailable.");
    this.name = "Vap1StaffLoginAdmissionUnavailable";
  }
}

/**
 * A01 issuer boundary: intentionally has NO input and NO I/O.
 *
 * Previously a public preflight accepted injected lookupPool/transaction
 * query methods and performed an extra User lock only after a valid submitted
 * password. An attacker controlling either query hook could distinguish true
 * passwords by call count despite the final uniform exception. The hooks
 * also let callers manufacture an apparently locked User/PHC result.
 *
 * Even a genuine Argon2/TOTP/recovery/refresh ceremony is NOT sufficient to
 * authorize signing. Issuance must be internal to its trusted request owner,
 * with a real leased protected transaction, purpose-specific admitted state,
 * independently authenticated key custody and a matching one-use SQL verifier.
 *
 * Keep this function unreachable from production auth routes. No parameters,
 * no injected callbacks, no signer output, no key/SQL/env access and no
 * caller-observable password-dependent work are allowed here. Any future
 * implementation must replace the boundary only after the independent
 * ownership, SQL and custody gates have been verified.
 */
export function denyUntilVap1StaffLoginAdmission(): never {
  throw new Vap1StaffLoginAdmissionUnavailable();
}
