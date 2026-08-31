import type {
  WebPushAudience,
  WebPushLocale,
  WebPushPresentationType,
} from "@valet/contracts";

export interface ClaimedWebPushDelivery {
  readonly attemptCount: number;
  readonly deliveryId: string;
  readonly leaseToken: string;
}

export interface PreparedWebPushDelivery {
  readonly audience: WebPushAudience;
  readonly attemptCount: number;
  readonly auth: string;
  readonly deliveryId: string;
  readonly endpoint: string;
  readonly expiresAt: Date;
  readonly intentId: string;
  readonly locale: WebPushLocale;
  readonly p256dh: string;
  readonly presentationType: WebPushPresentationType;
  readonly readyAt: Date | null;
  readonly subscriptionId: string;
  readonly subscriptionSnapshot: SubscriptionSnapshot;
  readonly taskId: string | null;
  readonly valetSessionId: string | null;
}

export interface SubscriptionSnapshot {
  readonly authCiphertext: string;
  readonly endpointCiphertext: string;
  readonly endpointFingerprint: string;
  readonly encryptionKeyVersion: string;
  readonly p256dhCiphertext: string;
}

export type WebPushFailureClass =
  | "AUTHORITY"
  | "CONFIGURATION"
  | "DECRYPTION"
  | "ENDPOINT_GONE"
  | "NETWORK"
  | "PAYLOAD"
  | "PUSH_SERVICE"
  | "RATE_LIMITED";
