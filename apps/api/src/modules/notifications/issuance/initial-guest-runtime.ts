import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  issueInitialGuestAccessInTransaction,
  type InitialGuestScope,
} from "../../valet-sessions/initial-guest-issuance";
import {
  createInitialGuestEnvelopeSealer,
  createRecipientDigestFactory,
} from "./initial-guest-crypto";
import { createInitialGuestEligibilityResolver } from "./initial-guest-eligibility";
import { persistInitialGuestOutbox } from "./initial-guest-outbox";

export type InitialGuestIssuanceHook = (
  transaction: PostgresTransaction,
  scope: InitialGuestScope,
) => Promise<boolean>;

/** Optional at boot; unavailable keys/config disable issuance before any writes. */
export function createInitialGuestIssuanceFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
): InitialGuestIssuanceHook | null {
  if (environment.GUEST_ACCESS_AUTO_ISSUE_ENABLED !== "true") return null;
  const mode = environment.OUTBOUND_MESSAGING_MODE;
  if (mode !== "test" && mode !== "production") return null;
  if ((environment.NODE_ENV === "production") !== (mode === "production")) {
    return null;
  }
  const publicKey = environment.GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM;
  const keyVersion = environment.GUEST_ACCESS_TRANSPORT_KEY_VERSION;
  const hmacKey = environment.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64;
  const hmacVersion = environment.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION;
  if (!publicKey || !keyVersion || !hmacKey || !hmacVersion) return null;

  try {
    const sealer = createInitialGuestEnvelopeSealer(publicKey, keyVersion);
    const recipientDigest = createRecipientDigestFactory(hmacKey, hmacVersion);
    const findEligibleRecipient = createInitialGuestEligibilityResolver(recipientDigest, mode);
    return (transaction, scope) => issueInitialGuestAccessInTransaction(
      transaction,
      scope,
      { sealer, findEligibleRecipient, persist: persistInitialGuestOutbox },
    );
  } catch {
    // Config capability is unavailable: do not issue or persist a reversible token.
    return null;
  }
}
