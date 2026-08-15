export type PaymentInitializationErrorCode =
  | "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_CREATION_IDEMPOTENCY_CONFLICT"
  | "PAYMENT_INITIALIZATION_INVALID"
  | "PAYMENT_SCOPE_NOT_FOUND";

const messages: Readonly<Record<PaymentInitializationErrorCode, string>> = {
  DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE:
    "Digital payment is unavailable for this financial policy.",
  PAYMENT_CREATION_IDEMPOTENCY_CONFLICT:
    "The payment initialization identity is already in use.",
  PAYMENT_INITIALIZATION_INVALID: "Payment initialization is invalid.",
  PAYMENT_SCOPE_NOT_FOUND: "The payment scope was not found.",
};

export class PaymentInitializationError extends Error {
  constructor(readonly code: PaymentInitializationErrorCode) {
    super(messages[code]);
    this.name = "PaymentInitializationError";
  }
}
