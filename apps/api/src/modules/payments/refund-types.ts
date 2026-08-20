import type { RefundRequest } from "@valet/contracts";

export type RefundStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface RefundProjection {
  readonly amount: string;
  readonly completedAt: Date | null;
  readonly currency: string;
  readonly id: string;
  readonly requestedAt: Date;
  readonly status: RefundStatus;
}

export interface PersistedRefund extends RefundProjection {
  readonly authorizedByMembershipId: string;
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly paymentId: string;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly reason: string;
}

export interface RefundCommandRequest extends RefundRequest {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}
