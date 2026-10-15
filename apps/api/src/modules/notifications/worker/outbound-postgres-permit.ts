import { timingSafeEqual } from "node:crypto";
import type { OutboundEnvelopeAAD, SealedOutboundEnvelope } from "../contracts/outbound-envelope";
import type { OutboundTransportMaterial } from "./outbound-transport-source";
import { canonicalOutboundSenderLabel } from "./outbound-worker-envelope-opener";
import type {
  OutboundPgPermitRow,
  OutboundVerifiedSenderConfig,
} from "./outbound-postgres-types";

export function equalRecipientDigest(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Reject incomplete SQL projections; never trust mutable envelope AAD. */
export function permittedSenderMaterial(
  row: OutboundPgPermitRow,
  verified: OutboundVerifiedSenderConfig,
): OutboundTransportMaterial {
  if (
    !row.attempt_id || !row.callback_handle ||
    !Number.isInteger(row.credential_generation) || row.credential_generation < 1 ||
    !(row.ciphertext instanceof Uint8Array) || row.ciphertext.length < 384 ||
    !(row.expires_at instanceof Date) || !Number.isFinite(row.expires_at.valueOf()) ||
    row.aad_version !== 1 || !(row.aad_label instanceof Uint8Array) ||
    !row.organization_id || !row.location_id || !row.valet_session_id ||
    !row.customer_id || !row.intent_id || !row.recipient_digest || !row.key_version ||
    verified.bindingId !== row.binding_id ||
    verified.phoneNumberId !== row.phone_number_id ||
    verified.wabaId !== row.waba_id ||
    verified.environment !== row.provider_environment ||
    verified.templateVersion !== row.template_catalog_version ||
    verified.language !== row.language
  ) {
    throw new Error("OUTBOUND_PERMIT_PROJECTION_INVALID");
  }
  const expectedAAD: OutboundEnvelopeAAD = {
    version: 1,
    organizationId: row.organization_id,
    locationId: row.location_id,
    sessionId: row.valet_session_id,
    customerId: row.customer_id,
    intentId: row.intent_id,
    credentialGeneration: row.credential_generation,
    recipientDigest: row.recipient_digest,
    expiresAt: row.expires_at.toISOString(),
  };
  if (!Buffer.from(row.aad_label).equals(canonicalOutboundSenderLabel(expectedAAD))) {
    throw new Error("OUTBOUND_PERMIT_AAD_LABEL_MISMATCH");
  }
  const sealed: SealedOutboundEnvelope = {
    algorithm: "RSA-OAEP-SHA256",
    keyVersion: row.key_version,
    ciphertext: row.ciphertext,
    aad: expectedAAD,
    purgeAt: row.expires_at,
  };
  return {
    expectedAAD,
    sealed,
    recipientE164: row.phone_normalized,
    templateName: verified.templateName,
    templateLanguage: row.language,
    phoneNumberId: verified.phoneNumberId,
    accessToken: verified.accessToken,
    graphVersion: verified.graphVersion,
  };
}
