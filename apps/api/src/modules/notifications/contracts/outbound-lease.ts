import type { OutboundSendResult } from "./outbound-provider";

export type OutboundDeliveryState =
  | "PENDING" | "LEASED" | "DISPATCHING" | "RETRY_WAIT"
  | "ACCEPTED" | "UNKNOWN" | "PERMANENT_FAILURE" | "SUPPRESSED" | "EXPIRED";

export interface OutboundClaim {
  readonly deliveryId: string;
  readonly leaseToken: string;
  readonly leaseExpiresAt: Date;
}

export type DispatchPreparation =
  | { readonly kind: "DISPATCH"; readonly attemptId: string; readonly attemptHandle: string; readonly remainingMs: number }
  | { readonly kind: "LOST_LEASE" | "SUPPRESSED" | "EXPIRED" | "RATE_LIMITED" };

export interface OutboundLeaseRepository {
  claimDue(limit: number): Promise<readonly OutboundClaim[]>;
  prepareDispatch(claim: OutboundClaim): Promise<DispatchPreparation>;
  finalizeAttempt(claim: OutboundClaim, attemptId: string, result: OutboundSendResult): Promise<void>;
  expireAndPurge(limit: number): Promise<number>;
}

/** Four irrevocable dispatch permits inside a 30-minute immutable intent lifetime. */
export const OUTBOUND_LIMITS = {
  intentLifetimeMs: 30 * 60_000,
  maxDispatchPermits: 4,
  leaseLifetimeMs: 30_000,
  providerDeadlineMs: 10_000,
  claimBatchSize: 10,
  maxConcurrencyPerReplica: 2,
  cleanupBatchSize: 100,
} as const;
