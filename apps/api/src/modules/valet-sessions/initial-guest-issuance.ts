import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import { OUTBOUND_LIMITS } from "../notifications/contracts/outbound-lease";
import type { OutboundEnvelopeSealer } from "../notifications/contracts/outbound-envelope";
import type { OutboundMessageIntent } from "../notifications/contracts/outbound-intent";
import {
  generateGuestAccessToken,
  guestAccessContract,
  GuestAccessError,
  hashGuestAccessToken,
} from "./guest-access-token";

export interface InitialGuestScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly actorMembershipId: string;
}

export interface EligibleInitialGuestRecipient {
  readonly recipientDigest: string;
  readonly policyId: string;
  readonly permissionExpiresAt: Date | null;
  readonly permissionId: string;
  readonly permissionRevision: number;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly policyRevision: number;
  readonly companyPolicyRevision: number;
  readonly templateVersion: string;
  readonly locale: "ar" | "en";
}

export interface InitialGuestIssuanceDependencies {
  readonly sealer: OutboundEnvelopeSealer;
  readonly findEligibleRecipient: (
    transaction: PostgresTransaction,
    scope: InitialGuestScope,
  ) => Promise<EligibleInitialGuestRecipient | null>;
  readonly persist: (
    transaction: PostgresTransaction,
    intent: OutboundMessageIntent,
    envelope: ReturnType<OutboundEnvelopeSealer["seal"]>,
    policyId: string,
  ) => Promise<void>;
  readonly tokenBytesFactory?: () => Buffer;
  readonly uuidFactory?: () => string;
}

/** Must be invoked only after creating a fresh disabled Intake session in its transaction. */
export async function issueInitialGuestAccessInTransaction(
  transaction: PostgresTransaction,
  scope: InitialGuestScope,
  dependencies: InitialGuestIssuanceDependencies,
): Promise<boolean> {
  const recipient = await dependencies.findEligibleRecipient(transaction, scope);
  if (recipient === null) return false;

  // Fetch wall time after all recipient/policy/permission locks, not BEGIN time.
  const now = await transaction.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  const issuedAt = now.rows[0]?.now;
  if (!(issuedAt instanceof Date) || !Number.isFinite(issuedAt.getTime())) {
    throw new Error("Database did not provide an issuance timestamp.");
  }
  if (recipient.permissionExpiresAt !== null && recipient.permissionExpiresAt <= issuedAt) {
    return false;
  }

  const createId = dependencies.uuidFactory ?? randomUUID;
  const intentId = createId();
  const guestToken = generateGuestAccessToken(dependencies.tokenBytesFactory);
  const guestHash = hashGuestAccessToken(guestToken);
  const bootstrapExpiresAt = new Date(
    issuedAt.getTime() + guestAccessContract.lifetimeMilliseconds,
  );
  const intentExpiresAt = new Date(
    issuedAt.getTime() + OUTBOUND_LIMITS.intentLifetimeMs,
  );
  const intent: OutboundMessageIntent = {
    id: intentId,
    scope: {
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      sessionId: scope.sessionId,
      customerId: scope.customerId,
      actorMembershipId: scope.actorMembershipId,
    },
    purpose: "INITIAL_GUEST_ACCESS",
    credentialGeneration: 1,
    recipientDigest: recipient.recipientDigest,
    permissionId: recipient.permissionId,
    permissionRevision: recipient.permissionRevision,
    bindingId: recipient.bindingId,
    bindingRevision: recipient.bindingRevision,
    policyRevision: recipient.policyRevision,
    companyPolicyRevision: recipient.companyPolicyRevision,
    templateVersion: recipient.templateVersion,
    locale: recipient.locale,
    createdAt: issuedAt,
    expiresAt: intentExpiresAt,
  };
  const envelope = dependencies.sealer.seal(guestToken, {
    version: 1,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    sessionId: scope.sessionId,
    customerId: scope.customerId,
    intentId,
    credentialGeneration: 1,
    recipientDigest: recipient.recipientDigest,
    expiresAt: intentExpiresAt.toISOString(),
  });
  if (
    envelope.algorithm !== "RSA-OAEP-SHA256" ||
    envelope.purgeAt.getTime() > intentExpiresAt.getTime() ||
    envelope.ciphertext.byteLength === 0
  ) {
    throw new Error("Invalid sealed initial guest payload.");
  }

  const mutation = await transaction.query<{ customer_access_generation: number }>(
    `UPDATE valet_sessions
     SET customer_access_token_hash = $4,
         customer_access_expires_at = $5,
         customer_access_revoked_at = NULL,
         customer_access_generation = 1,
         customer_access_consumed_at = NULL,
         updated_at = $6
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
       AND customer_id = $7 AND state = 'CHECKING_IN'
       AND customer_access_generation = 0
       AND customer_access_token_hash LIKE 'disabled:intake:%'
       AND customer_access_revoked_at IS NOT NULL
     RETURNING customer_access_generation`,
    [scope.sessionId, scope.organizationId, scope.locationId, guestHash,
      bootstrapExpiresAt, issuedAt, scope.customerId],
  );
  if (mutation.rows[0]?.customer_access_generation !== 1) {
    throw new GuestAccessError("GUEST_ACCESS_GENERATION_FAILED");
  }

  await dependencies.persist(transaction, intent, envelope, recipient.policyId);
  await appendCustodyAuditEvent(transaction, {
    definition: {
      eventType: "GUEST_ACCESS_ISSUED",
      metadata: { accessContractVersion: "V1", mutationKind: "ISSUED" },
    },
    occurredAt: issuedAt,
    scope: {
      actorMembershipId: scope.actorMembershipId,
      locationId: scope.locationId,
      organizationId: scope.organizationId,
      valetSessionId: scope.sessionId,
    },
  }, createId);
  return true;
}
