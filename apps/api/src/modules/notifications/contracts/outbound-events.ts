export type OutboundDeliveryFact = "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface NormalizedDeliveryEvent {
  readonly providerBindingId: string;
  readonly providerMessageId?: string;
  readonly attemptHandle?: string;
  readonly recipientDigest?: string;
  readonly status: OutboundDeliveryFact;
  readonly providerTime: Date;
  readonly safeErrorClass?: "RECIPIENT" | "TEMPLATE" | "POLICY" | "PROVIDER";
}

/** Facts are monotone independent timestamps; FAILED never removes READ/DELIVERED. */
export interface OutboundDeliveryFacts {
  readonly sentAt?: Date;
  readonly deliveredAt?: Date;
  readonly readAt?: Date;
  readonly failedAt?: Date;
}
