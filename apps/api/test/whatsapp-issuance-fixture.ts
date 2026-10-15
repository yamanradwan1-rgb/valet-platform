import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { createRecipientDigestFactory } from "../src/modules/notifications/issuance/initial-guest-crypto";
import { createInitialGuestIssuanceFromEnv } from "../src/modules/notifications/issuance/initial-guest-runtime";
import type { IntakeFixture } from "./intake-session-command-test-harness";

const hmacKey = randomBytes(32).toString("base64");
const rsa = generateKeyPairSync("rsa", { modulusLength: 3072 });
const digest = createRecipientDigestFactory(hmacKey, "v1");

export const verifiedIssuanceHook = createInitialGuestIssuanceFromEnv({
  NODE_ENV: "test",
  GUEST_ACCESS_AUTO_ISSUE_ENABLED: "true",
  OUTBOUND_MESSAGING_MODE: "test",
  GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM: rsa.publicKey.export({
    type: "spki", format: "pem",
  }).toString(),
  GUEST_ACCESS_TRANSPORT_KEY_VERSION: "test-k1",
  OUTBOUND_RECIPIENT_HMAC_KEY_BASE64: hmacKey,
  OUTBOUND_RECIPIENT_HMAC_KEY_VERSION: "v1",
});

export async function configureVerifiedIssuance(
  admin: Pool,
  fixture: IntakeFixture,
  phone: string | null,
): Promise<void> {
  const bindingId = randomUUID();
  await admin.query(
    `INSERT INTO outbound_provider_bindings
       (id, organization_id, purpose, provider, environment,
        waba_id, phone_number_id, config_alias, enabled,
        provider_verified_at, provider_evidence_reference)
     VALUES ($1, $2, 'INITIAL_GUEST_ACCESS', 'META_CLOUD', 'test',
             $3, $4, 'mock-connector', TRUE,
             clock_timestamp() - interval '1 minute', 'synthetic-provider-verification')`,
    [bindingId, fixture.organizationId, `synthetic-${randomUUID()}`,
      `synthetic-${randomUUID()}`],
  );
  await admin.query(
    `INSERT INTO outbound_messaging_policies
       (organization_id, purpose, enabled, language,
        provider_binding_id, template_catalog_version)
     VALUES ($1, 'INITIAL_GUEST_ACCESS', TRUE, 'ar', $2, 'approved-fixture-v1')`,
    [fixture.organizationId, bindingId],
  );
  await admin.query(
    `UPDATE outbound_messaging_control SET issue_enabled = TRUE,
       updated_at = clock_timestamp() WHERE environment = 'test'`,
  );
  if (phone !== null) {
    await admin.query(
      `SELECT outbound_permission_change($1, $2, $3, $4, $5, 0, 'GRANT')`,
      [fixture.organizationId, digest(phone), `verified-fixture:${randomUUID()}`,
        new Date(Date.now() - 60_000), new Date(Date.now() + 86_400_000)],
    );
  }
}

export async function readIssuedRows(admin: Pool, sessionId: string) {
  const [session, intents, deliveries, envelopes, audit] = await Promise.all([
    admin.query<{
      customer_access_token_hash: string;
      customer_access_generation: number;
      customer_access_revoked_at: Date | null;
    }>(`SELECT customer_access_token_hash, customer_access_generation,
       customer_access_revoked_at FROM valet_sessions WHERE id = $1`, [sessionId]),
    admin.query<{ id: string; credential_generation: number }>(
      `SELECT id::text, credential_generation FROM outbound_message_intents
       WHERE valet_session_id = $1`, [sessionId],
    ),
    admin.query<{ state: string }>(
      `SELECT d.state FROM outbound_message_deliveries d
       JOIN outbound_message_intents i ON i.id = d.intent_id
       WHERE i.valet_session_id = $1`, [sessionId],
    ),
    admin.query<{ ciphertext: Buffer; aad_label: Buffer }>(
      `SELECT e.ciphertext, e.aad_label FROM outbound_message_envelopes e
       JOIN outbound_message_intents i ON i.id = e.intent_id
       WHERE i.valet_session_id = $1`, [sessionId],
    ),
    admin.query<{ event_type: string; metadata_json: unknown }>(
      `SELECT event_type, metadata_json FROM audit_events
       WHERE valet_session_id = $1 ORDER BY occurred_at, id`, [sessionId],
    ),
  ]);
  return {
    session: session.rows[0],
    intents: intents.rows,
    deliveries: deliveries.rows,
    envelopes: envelopes.rows,
    audit: audit.rows,
  };
}
