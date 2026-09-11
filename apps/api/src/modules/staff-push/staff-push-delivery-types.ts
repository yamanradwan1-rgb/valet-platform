export interface ClaimedStaffPushDelivery {
  readonly attemptCount: number;
  readonly deliveryId: string;
  readonly leaseToken: string;
  readonly maxAttempts: number;
  readonly reclaimed: boolean;
}

export interface EligibleStaffPushDelivery extends ClaimedStaffPushDelivery {
  readonly expiresAt: Date;
  readonly intentId: string;
  readonly locale: "en" | "ar";
  readonly providerToken: string;
  readonly registrationId: string;
  readonly tokenHash: string;
}

export interface StaffPushCleanupResult {
  readonly deliveries: number;
  readonly intents: number;
  readonly registrations: number;
}
