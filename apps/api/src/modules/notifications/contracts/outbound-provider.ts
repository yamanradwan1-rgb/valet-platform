/** Server-only WhatsApp provider boundary; never log or persist the input. */
export type OutboundSendResult =
  | { readonly kind: "ACCEPTED"; readonly providerMessageId: string }
  | { readonly kind: "NOT_ACCEPTED"; readonly reason: "RATE_LIMIT" | "TRANSIENT"; readonly retryAfterSeconds?: number }
  | { readonly kind: "PERMANENT"; readonly reason: "RECIPIENT" | "TEMPLATE" | "AUTH" | "POLICY" }
  | { readonly kind: "UNKNOWN"; readonly reason: "TIMEOUT" | "TRANSPORT" | "MALFORMED_RESPONSE" };

export interface OutboundSendInput {
  readonly attemptHandle: string;
  readonly recipientE164: string;
  readonly templateName: string;
  readonly templateLanguage: string;
  readonly guestUrl: string;
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly graphVersion: string;
  readonly signal: AbortSignal;
}

export interface OutboundProvider {
  send(input: OutboundSendInput): Promise<OutboundSendResult>;
}
