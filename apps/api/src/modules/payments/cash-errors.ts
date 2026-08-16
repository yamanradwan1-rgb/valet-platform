export type CashMutationErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CASH_ADJUSTMENT_NOT_ALLOWED"
  | "CASH_COLLECTION_NOT_ALLOWED"
  | "CASH_IDEMPOTENCY_CONFLICT"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_NOT_AVAILABLE";

const messages: Readonly<Record<CashMutationErrorCode, string>> = {
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  CASH_ADJUSTMENT_NOT_ALLOWED: "The cash adjustment is not allowed.",
  CASH_COLLECTION_NOT_ALLOWED: "The cash receipt is not allowed.",
  CASH_IDEMPOTENCY_CONFLICT: "The cash submission identity is already in use.",
  PAYMENT_AMOUNT_INVALID: "The monetary amount is invalid.",
  PAYMENT_NOT_AVAILABLE: "The canonical payment is not available.",
};

export class CashMutationError extends Error {
  constructor(readonly code: CashMutationErrorCode) {
    super(messages[code]);
    this.name = "CashMutationError";
  }
}
