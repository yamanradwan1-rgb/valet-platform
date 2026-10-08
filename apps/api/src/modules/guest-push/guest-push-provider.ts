export type GuestPushProviderResultClass =
  | "ACCEPTED"
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "INVALID_ENDPOINT"
  | "PERMANENT"
  | "CONFIGURATION"
  | "UNKNOWN";

export interface GuestPushProviderResult {
  readonly resultClass: GuestPushProviderResultClass;
  readonly retryAfterSeconds?: number;
}

export interface GuestPushProviderMessage {
  readonly auth: string;
  readonly endpoint: string;
  readonly intentId: string;
  readonly locale: "en" | "ar";
  readonly p256dh: string;
  readonly ttlSeconds: number;
}

export type GuestPushProviderSendResult =
  | { readonly kind: "EXPIRED_BEFORE_TRANSPORT" }
  | {
      readonly kind: "PROVIDER_RESULT";
      readonly result: GuestPushProviderResult;
    };

export interface GuestPushProvider {
  send(request: {
    messageForTransport(): GuestPushProviderMessage | undefined;
  }): Promise<GuestPushProviderSendResult>;
}
