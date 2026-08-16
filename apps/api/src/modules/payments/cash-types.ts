import type { CashAdjustmentRequest } from "@valet/contracts";

export type CashEntryType =
  "RECEIPT" | "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE";

export interface CashActor {
  readonly membershipId: string;
  readonly role: "LOCATION_MANAGER" | "VALET_EMPLOYEE" | "VALET_SUPERVISOR";
}

export interface CashScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly valetSessionId: string;
}

export interface CashAuthorization {
  readonly actor: CashActor;
  readonly scope: CashScope;
}

export interface CashEntryProjection {
  readonly amount: string;
  readonly id: string;
  readonly occurredAt: Date;
  readonly type: CashEntryType;
}

export interface CashMutationProjection {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly cashEntry: CashEntryProjection;
  readonly currency: string;
  readonly status: "PAID" | "UNPAID";
  readonly valetSessionId: string;
}

export interface CashReceiptCommandRequest {
  readonly authenticatedUserId: string;
  readonly submissionIdempotencyKey: string;
  readonly valetSessionId: string;
}

export type CashAdjustmentCommandRequest = CashReceiptCommandRequest &
  CashAdjustmentRequest;
