import type { StaffPasswordResetRedeemResponse } from "@valet/contracts";

export const ISSUE416_REDEEM_TRUSTED_BOUNDARY = Symbol(
  "ISSUE416_REDEEM_TRUSTED_BOUNDARY",
);

export interface Issue416RedeemTrustedBoundary {
  /**
   * NOT IMPLEMENTED OR REGISTERED. This is a purpose-specific IN-PROCESS
   * credential ceremony plus protected SQL writer, NOT a raw SQL caller.
   * The actual presented bearer must be proven in this trusted app ceremony
   * and bound to a one-use, transaction-scoped signed SQL challenge. It must
   * NEVER be passed as an SQL parameter, GUC, query/log/trace or audit field.
   * A DB-readable tokenHash is for lookup only; no caller can obtain
   * redemption authority by submitting a copied tokenHash.
   *
   * The private writer independently rechecks latest generation, expiry,
   * anonymous issuer/target/sole-company eligibility under locks and commits
   * password CAS, consume, all session/refresh/push revocations and anonymous
   * account-security audit in ONE transaction before returning success.
   */
  redeem(input: {
    readonly presentedBearerAppOnly: string;
    readonly tokenHash: string;
    readonly newPasswordHash: string;
    readonly trustedClientAddress: string;
  }): Promise<StaffPasswordResetRedeemResponse>;
}
