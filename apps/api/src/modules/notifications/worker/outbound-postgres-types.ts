import type { ApprovedMetaTemplate } from "../config/meta-cloud-policy";

export interface OutboundPgClaimRow {
  readonly delivery_id: string;
  readonly lease_token: string;
  readonly lease_expires_at: Date;
}

export interface OutboundPgRecipientRow {
  readonly phone_normalized: string;
  readonly recipient_digest: string;
}

/** Expected immutable AAD must come from server-trusted intent columns. */
export interface OutboundPgPermitRow {
  readonly attempt_id: string;
  readonly callback_handle: string;
  /** W1 server clock returns a PG NUMERIC of remaining lifetime in seconds. */
  readonly remaining_seconds: string;
  readonly phone_normalized: string;
  readonly recipient_digest: string;
  readonly ciphertext: Buffer;
  readonly aad_label: Buffer;
  readonly aad_version: number;
  readonly key_version: string;
  readonly organization_id: string;
  readonly location_id: string;
  readonly valet_session_id: string;
  readonly customer_id: string;
  readonly intent_id: string;
  readonly credential_generation: number;
  readonly expires_at: Date;
  readonly binding_id: string;
  readonly phone_number_id: string;
  readonly waba_id: string;
  readonly provider_environment: "test" | "production";
  readonly template_catalog_version: string;
  readonly language: "ar" | "en";
  readonly config_alias: string;
}

export interface OutboundVerifiedSenderConfig {
  readonly bindingId: string;
  readonly phoneNumberId: string;
  readonly wabaId: string;
  readonly environment: "test" | "production";
  readonly accessToken: string;
  readonly graphVersion: string;
  readonly templateName: string;
  readonly templateVersion: string;
  readonly language: "ar" | "en";
  /** Only the explicitly approved sandbox resolver supplies transport authority. */
  readonly sandbox?: {
    readonly customerOrigin: string;
    readonly template: ApprovedMetaTemplate;
    readonly allowedRecipient: string;
    readonly credentialExpiresAt: number;
  };
}

export type ResolveOutboundSenderConfig = (input: {
  readonly organizationId: string;
  readonly locationId: string;
  readonly bindingId: string;
  readonly phoneNumberId: string;
  readonly wabaId: string;
  readonly configAlias: string;
  readonly environment: "test" | "production";
  readonly templateVersion: string;
  readonly language: "ar" | "en";
}) => Promise<OutboundVerifiedSenderConfig | undefined>;
