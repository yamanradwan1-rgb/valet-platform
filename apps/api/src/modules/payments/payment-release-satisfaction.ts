import type { PaymentCollectionMethod, PaymentStatus } from "./payment-types";

export interface ReleasePaymentState {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly paidAt: Date | null;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly status: PaymentStatus;
}

function exactMills(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,10})(?:\.(\d{1,3}))?$/.exec(value);
  if (match === null) return null;
  return BigInt(match[1]!) * 1000n + BigInt((match[2] ?? "").padEnd(3, "0"));
}

export function isPaymentReleaseSatisfied(
  releaseRequiresPayment: boolean,
  payment: ReleasePaymentState | null,
): boolean {
  if (!releaseRequiresPayment) return true;
  if (payment === null) return false;
  const amountDue = exactMills(payment.amountDue);
  const amountPaid = exactMills(payment.amountPaid);
  if (amountDue === null || amountPaid === null) return false;

  if (payment.status === "NOT_REQUIRED") {
    return (
      amountDue === 0n &&
      amountPaid === 0n &&
      payment.collectionMethod === "NONE" &&
      payment.paidAt === null &&
      payment.provider === null &&
      payment.providerReference === null
    );
  }

  if (
    payment.status !== "PAID" ||
    amountDue <= 0n ||
    amountPaid !== amountDue ||
    payment.paidAt === null
  ) {
    return false;
  }
  if (payment.collectionMethod === "CASH") {
    return payment.provider === null && payment.providerReference === null;
  }
  if (payment.collectionMethod === "DIGITAL") {
    return payment.provider !== null && payment.providerReference !== null;
  }
  return false;
}
