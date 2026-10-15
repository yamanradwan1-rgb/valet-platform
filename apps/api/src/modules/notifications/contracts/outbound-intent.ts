export const INITIAL_GUEST_PURPOSE = "INITIAL_GUEST_ACCESS" as const;
export const OUTBOUND_CHANNEL = "WHATSAPP" as const;
export const OUTBOUND_PROVIDER = "META_CLOUD" as const;

export interface InitialGuestDeliveryScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly actorMembershipId: string;
}

export interface OutboundMessageIntent {
  readonly id: string;
  readonly scope: InitialGuestDeliveryScope;
  readonly purpose: typeof INITIAL_GUEST_PURPOSE;
  readonly credentialGeneration: number;
  readonly recipientDigest: string;
  readonly permissionId: string;
  readonly permissionRevision: number;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly policyRevision: number;
  readonly templateVersion: string;
  readonly locale: "ar" | "en";
  readonly createdAt: Date;
  readonly expiresAt: Date;
}
