import {
  StaffAuthenticationError,
  type StaffPasswordVerifier,
  type UserAuthenticationRow,
} from "./staff-auth-types";
import {
  isAcceptedStaffPasswordHash,
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
} from "./staff-password-verification";

/**
 * A01 credential ceremony, not VAP1 signer authority. Returns only the exact
 * Argon2id PHC actually checked against the submitted raw password. A caller
 * still needs the same User/PHC recheck under the transaction's User lock.
 * Neither a User ID, a PHC string nor a successful SQL lookup is possession.
 */
export async function verifySubmittedStaffLoginPassword(input: {
  readonly user: UserAuthenticationRow | undefined;
  readonly submittedPassword: string;
  readonly verifier: StaffPasswordVerifier;
}): Promise<string> {
  const acceptedHash =
    input.user?.password_hash !== null &&
    input.user?.password_hash !== undefined &&
    isAcceptedStaffPasswordHash(input.user.password_hash)
      ? input.user.password_hash
      : undefined;
  // Every negative lookup still performs exactly one expensive verification.
  const comparedHash = acceptedHash ?? STAFF_AUTH_DUMMY_PASSWORD_HASH;
  const matches = await input.verifier.verify(
    comparedHash,
    input.submittedPassword,
  );
  if (
    acceptedHash === undefined ||
    !matches ||
    input.user?.status !== "ACTIVE"
  ) {
    throw new StaffAuthenticationError();
  }
  return acceptedHash;
}
