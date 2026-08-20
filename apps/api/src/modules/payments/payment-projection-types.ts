import type {
  PaymentCollectionMethod,
  PaymentServicePayer,
  PaymentStatus,
} from "./payment-types";
import type { RefundStatus } from "./refund-types";

export interface SafeProjectionPayment {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly currency: string;
  readonly currentValidation: {
    readonly amount: string;
    readonly mode: "NONE" | "FULL" | "PARTIAL";
  } | null;
  readonly paidAt: Date | null;
  readonly paymentId: string;
  readonly serviceAmount: string;
  readonly servicePayer: PaymentServicePayer;
  readonly status: PaymentStatus;
  readonly tipAmount: string;
  readonly updatedAt: Date;
}

export interface SafeProjectionRefund {
  readonly amount: string;
  readonly completedAt: Date | null;
  readonly refundId: string;
  readonly requestedAt: Date;
  readonly status: RefundStatus;
}

export interface SafePaymentProjection {
  readonly payment: SafeProjectionPayment | null;
  readonly refunds: readonly SafeProjectionRefund[];
  readonly releaseRequiresPayment: boolean;
  readonly releaseSatisfied: boolean;
}

export interface ProjectionScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly valetSessionId: string;
}
