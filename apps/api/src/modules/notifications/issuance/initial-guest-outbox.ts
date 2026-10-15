import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../../common/database/postgres";
import type { SealedOutboundEnvelope } from "../contracts/outbound-envelope";
import type { OutboundMessageIntent } from "../contracts/outbound-intent";
import { canonicalOutboundEnvelopeLabel } from "./initial-guest-crypto";

/** Every write runs on the caller's existing SERIALIZABLE Intake transaction. */
export async function persistInitialGuestOutbox(
  transaction: PostgresTransaction,
  intent: OutboundMessageIntent,
  envelope: SealedOutboundEnvelope,
  policyId: string,
): Promise<void> {
  const scope = intent.scope;
  await transaction.query(
    `INSERT INTO outbound_message_intents
       (id, organization_id, location_id, valet_session_id, customer_id,
        purpose, credential_generation, recipient_digest, permission_id,
        permission_revision, policy_id, policy_revision, provider_binding_id,
        binding_revision, template_catalog_version, language, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'INITIAL_GUEST_ACCESS', $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [intent.id, scope.organizationId, scope.locationId, scope.sessionId,
      scope.customerId, intent.credentialGeneration, intent.recipientDigest,
      intent.permissionId, intent.permissionRevision, policyId,
      intent.policyRevision, intent.bindingId, intent.bindingRevision,
      intent.templateVersion, intent.locale, intent.createdAt, intent.expiresAt],
  );
  await transaction.query(
    `INSERT INTO outbound_message_deliveries
       (id, organization_id, intent_id, channel, provider, state,
        next_attempt_at, attempt_count, max_attempts, created_at, updated_at)
     VALUES ($1, $2, $3, 'WHATSAPP', 'META_CLOUD', 'PENDING',
             $4, 0, 4, $4, $4)`,
    [randomUUID(), scope.organizationId, intent.id, intent.createdAt],
  );
  await transaction.query(
    `INSERT INTO outbound_message_envelopes
       (intent_id, organization_id, ciphertext, aad_label, key_version,
        aad_version, algorithm, purge_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 1, 'RSA-OAEP-SHA256', $6, $7)`,
    [intent.id, scope.organizationId, Buffer.from(envelope.ciphertext),
      canonicalOutboundEnvelopeLabel(envelope.aad), envelope.keyVersion,
      envelope.purgeAt, intent.createdAt],
  );
}
