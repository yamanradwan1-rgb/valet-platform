import { staffPasswordResetTokenSchema } from "@valet/contracts";

/**
 * Source contract for W17's unactivated private migrations 133/134.
 * The database owns the window, threshold, transaction clock and count.
 * No caller may supply a limit, window, state, timestamp or SQL statement.
 */
export const ISSUE416_R03_COUNTED_POLICY = {
  client: { scope: "v1:staff-password-reset-redeem-client-address", limit: 30 },
  credential: {
    scope: "v1:staff-password-reset-redeem-credential",
    limit: 5,
  },
  windowMinutes: 15,
} as const;

/** Generated internally, NEVER from an HTTP X-Request-Id header. */
export interface Issue416R03ClientAttemptIntent {
  readonly audience: string;
  readonly requestId: string;
  /** Purpose-specific HMAC digest only, never an IP or raw bearer. */
  readonly keyHash: string;
}

/** No plaintext token/IP, mutable discount marker, user or SQL supplied. */
export interface Issue416R03CredentialAttemptIntent extends Issue416R03ClientAttemptIntent {
  readonly clientAttemptId: string;
}

/**
 * Purpose-specific app key custody, never a generic HMAC or signing oracle.
 * Neither method is registered as an HTTP endpoint or a SQL function.
 */
export interface Issue416R03PurposeSpecificKeyCustody {
  clientDigestFromTrustedAddress(addressAppOnly: string): Promise<string>;
  credentialDigestFromCanonicalBearer(bearerAppOnly: string): Promise<string>;
}

/**
 * Source-only prospective writer ABI, NOT a callable DB capability or proof.
 * A future approved binder must independently prove request/IP possession,
 * purpose-specific HMAC key custody, role/ACL and a committed READ COMMITTED
 * SQL transaction for each attempt. Unknown COMMIT MUST fail closed/no retry.
 * The R03 tables currently have unconditional DENY triggers and no grants.
 */
export interface Issue416R03PrivateCountedWriter {
  commitClientAttempt(
    intent: Issue416R03ClientAttemptIntent,
  ): Promise<Issue416R03SqlClientCommit>;
  commitCredentialAttempt(
    intent: Issue416R03CredentialAttemptIntent,
  ): Promise<void>;
}

/** SQL must never return an address, password or bearer. */
export interface Issue416R03SqlClientCommit {
  readonly audience: string;
  readonly requestId: string;
  readonly clientAttemptId: string;
}

/**
 * A claimed receipt is NOT itself an authenticated capability. Only a future
 * independently attested in-process binder may construct/verify a lease.
 * Neither a SQL SELECT, mock, UUID nor a copied key hash proves COMMIT.
 */
export interface Issue416R03ClientAttemptReceipt extends Issue416R03SqlClientCommit {
  /** Application-only for future local policy; never a SQL input. */
  readonly trustedClientAddressAppOnly: string;
}

/**
 * Canonical tokens consume the separate five-attempt budget even if the
 * remaining body/password is invalid; malformed tokens do not become SQL
 * identifiers, and malformed JSON is counted at the earlier client stage.
 */
export function issue416CanonicalR03Credential(body: unknown): string | null {
  const token =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).resetToken
      : undefined;
  const canonical = staffPasswordResetTokenSchema.safeParse(token);
  return canonical.success ? canonical.data : null;
}
