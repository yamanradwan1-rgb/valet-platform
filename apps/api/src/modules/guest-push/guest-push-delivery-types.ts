export interface ClaimedGuestPushDelivery {
  readonly attemptCount: number;
  readonly deliveryId: string;
  readonly leaseToken: string;
  readonly maxAttempts: number;
  readonly reclaimed: boolean;
}

export interface EligibleGuestPushDelivery extends ClaimedGuestPushDelivery {
  readonly auth: string;
  readonly endpoint: string;
  readonly intentId: string;
  readonly locale: "en" | "ar";
  readonly p256dh: string;
  readonly registrationId: string;
  readonly remainingLifetimeMilliseconds: number;
  readonly remainingLeaseMilliseconds: number;
}

export interface GuestPushCleanupResult {
  readonly deliveries: number;
  readonly intents: number;
  readonly registrations: number;
}
