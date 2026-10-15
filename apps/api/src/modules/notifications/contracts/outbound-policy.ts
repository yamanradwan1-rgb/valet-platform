export type OutboundLanguage = "ar" | "en";
export type OutboundEnvironment = "test" | "production";

export interface AuthorizedProviderBinding {
  readonly id: string;
  readonly organizationId: string;
  readonly environment: OutboundEnvironment;
  readonly provider: "META_CLOUD";
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly credentialAlias: string;
  readonly enabled: boolean;
  readonly revision: number;
}

export interface EffectiveOutboundPolicy {
  readonly organizationId: string;
  readonly locationId: string;
  readonly enabled: boolean;
  readonly language: OutboundLanguage;
  readonly templateVersion: string;
  readonly providerBindingId: string;
  readonly policyRevision: number;
}

export interface OutboundRecipientPermission {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientDigest: string;
  readonly purpose: "INITIAL_GUEST_ACCESS";
  readonly evidenceReference: string;
  readonly collectedAt: Date;
  readonly expiresAt: Date;
  readonly withdrawnAt: Date | null;
  readonly revision: number;
}

export interface OutboundMessagingControl {
  readonly sendEnabled: boolean;
  readonly issueEnabled: boolean;
  readonly revision: number;
}
