export type DigitalCollectionOperationState =
  | "PREPARED"
  | "OUTCOME_UNKNOWN"
  | "REFERENCE_ATTACHED"
  | "REJECTED"
  | "RESOLVED";

export interface DigitalCollectionOperation {
  readonly amount: string;
  readonly createdAt: Date;
  readonly currency: string;
  readonly dispatchGuardedAt: Date | null;
  readonly id: string;
  readonly organizationId: string;
  readonly paymentId: string;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly resolvedAt: Date | null;
  readonly safeResultCode: string | null;
  readonly state: DigitalCollectionOperationState;
  readonly submissionIdempotencyKey: string;
  readonly updatedAt: Date;
}

export interface InitiateDigitalCollectionRequest {
  readonly submissionIdempotencyKey: string;
  readonly valetSessionId: string;
}

export interface DigitalCollectionPayment {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly collectionMethod: "NONE" | "CASH" | "DIGITAL";
  readonly currency: string;
  readonly id: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly status: "NOT_REQUIRED" | "UNPAID" | "PENDING" | "PAID" | "FAILED";
  readonly valetSessionId: string;
}
