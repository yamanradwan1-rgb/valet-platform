import type {
  PostgresPool,
  PostgresTransaction,
} from "../../../common/database/postgres";
import {
  StaffAuthenticationError,
  type UserAuthenticationRow,
} from "../staff-auth-types";
import { verifySubmittedStaffLoginPassword } from "../staff-auth-vap1-login-ceremony";
import { lockAndRecheckStaffLoginUser } from "../staff-user-security-lock";
import { Argon2StaffPasswordVerifier } from "../staff-password-verification";

const OPERATION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUDIENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

function exactMatch(pattern: RegExp, value: string): boolean {
  return pattern.exec(value)?.[0] === value;
}

/** This failure has no credential-specific detail and MUST NOT be mapped to success. */
export class Vap1StaffLoginAdmissionUnavailable extends Error {
  constructor() {
    super("VAP1 Staff Login authority is unavailable.");
    this.name = "Vap1StaffLoginAdmissionUnavailable";
  }
}

/**
 * DORMANT A01 witness preflight, not a signer, proof issuer or authentication
 * endpoint. A real Argon2id comparison of the SUBMITTED password occurs before
 * the ranked User lock; the same verified PHC is rechecked under that lock.
 *
 * Neither the caller-supplied operation/audience, a DB-visible hash, nor this
 * successful check can establish protected User ADMIT, A01 bound reservation,
 * SQL challenge, key epoch, backend/full XID or an authorized session. Because
 * these gates have no attested callable integration here, even a genuine
 * password always FAILS CLOSED. No result, callback or reusable witness escapes.
 *
 * Call only on an already-owned transaction AFTER a separate lookup lease;
 * never run Argon2 while holding a rank-01/domain lock. This unregistered
 * function performs SELECT/lock only and never logs or persists raw credentials.
 */
export async function denyUntilVap1StaffLoginAdmission(input: {
  readonly lookupPool: Pick<PostgresPool, "query">;
  readonly transaction: PostgresTransaction;
  readonly email: string;
  readonly submittedPassword: string;
  readonly operationId: string;
  readonly audience: string;
}): Promise<never> {
  try {
    if (
      typeof input.email !== "string" ||
      typeof input.submittedPassword !== "string" ||
      typeof input.operationId !== "string" ||
      !exactMatch(OPERATION_UUID, input.operationId) ||
      typeof input.audience !== "string" ||
      !exactMatch(AUDIENCE, input.audience)
    ) {
      throw new StaffAuthenticationError();
    }
    const lookup = await input.lookupPool.query<UserAuthenticationRow>(
      "SELECT id, password_hash, status FROM users WHERE email = $1",
      [input.email],
    );
    const user = lookup.rows[0];
    // The trusted concrete implementation is not a caller-provided verifier.
    const verifiedHash = await verifySubmittedStaffLoginPassword({
      user,
      submittedPassword: input.submittedPassword,
      verifier: new Argon2StaffPasswordVerifier(),
    });
    if (
      user === undefined ||
      !(await lockAndRecheckStaffLoginUser(
        input.transaction,
        user.id,
        verifiedHash,
      ))
    ) {
      throw new StaffAuthenticationError();
    }
  } catch {
    // Identical denial for absent User, bad password, stale PHC, unsafe input,
    // role/transaction failure and genuine password. No credential oracle.
  }
  throw new Vap1StaffLoginAdmissionUnavailable();
}
