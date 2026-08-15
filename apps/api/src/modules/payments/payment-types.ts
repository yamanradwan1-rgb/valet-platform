export type PaymentServicePayer = "CUSTOMER" | "VENUE";
export type PaymentMethodsPolicy =
  "CASH_ONLY" | "DIGITAL_ONLY" | "CASH_OR_DIGITAL";
export type PaymentCollectionMethod = "NONE" | "CASH" | "DIGITAL";
export type PaymentStatus =
  "NOT_REQUIRED" | "UNPAID" | "PENDING" | "PAID" | "FAILED";

export interface EffectiveFinancialPolicy {
  readonly paymentMethodsPolicy: PaymentMethodsPolicy;
  readonly releaseRequiresPayment: boolean;
  readonly servicePayer: PaymentServicePayer;
  readonly tipsEnabled: boolean;
  readonly validationEnabled: boolean;
  readonly valetServiceFee: string;
}

export interface AuthoritativeFinancialContext {
  readonly currency: string;
  readonly policy: EffectiveFinancialPolicy;
}

export interface PaymentProjection {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly createdAt: Date;
  readonly creationIdempotencyKey: string;
  readonly currency: string;
  readonly id: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly paidAt: Date | null;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly serviceAmount: string;
  readonly servicePayer: PaymentServicePayer;
  readonly status: PaymentStatus;
  readonly tipAmount: string;
  readonly updatedAt: Date;
  readonly valetSessionId: string;
}

export interface InitializePaymentRequest {
  readonly creationIdempotencyKey: string;
  readonly valetSessionId: string;
}
