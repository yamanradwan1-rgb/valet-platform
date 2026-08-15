import type {
  PaymentCollectionMethod,
  PaymentMethodsPolicy,
  PaymentServicePayer,
  PaymentStatus,
} from "./payment-types";

export type ValidationMode = "NONE" | "FULL" | "PARTIAL";

export interface FinancialActor {
  readonly actorClass: "GUEST" | "LOCATION_MANAGER";
  readonly membershipId: string | null;
}

export interface PaymentScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly valetSessionId: string;
}

export interface MutablePayment extends PaymentScope {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly currency: string;
  readonly id: string;
  readonly paidAt: Date | null;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly serviceAmount: string;
  readonly servicePayer: PaymentServicePayer;
  readonly status: PaymentStatus;
  readonly tipAmount: string;
  readonly updatedAt: Date;
}

export interface ValidationProjection {
  readonly amount: string;
  readonly id: string;
  readonly isCurrent: boolean;
  readonly mode: ValidationMode;
  readonly supersedesValidationId: string | null;
}

export interface PaymentMutationProjection {
  readonly amountDue: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly currency: string;
  readonly currentValidation: Omit<
    ValidationProjection,
    "isCurrent" | "supersedesValidationId"
  > | null;
  readonly serviceAmount: string;
  readonly servicePayer: PaymentServicePayer;
  readonly status: PaymentStatus;
  readonly tipAmount: string;
  readonly updatedAt: Date;
  readonly valetSessionId: string;
}

export interface RecomputedPayment {
  readonly amountDue: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly status: PaymentStatus;
}

export interface MutationPolicy {
  readonly paymentMethodsPolicy: PaymentMethodsPolicy;
  readonly tipsEnabled: boolean;
  readonly validationEnabled: boolean;
}
