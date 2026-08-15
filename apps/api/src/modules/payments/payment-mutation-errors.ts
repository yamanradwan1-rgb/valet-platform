export type FinancialMutationErrorCode =
  | "AUTHORIZATION_DENIED"
  | "COLLECTION_ALREADY_STARTED"
  | "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_NOT_AVAILABLE"
  | "PAYMENT_TIPS_DISABLED"
  | "PAYMENT_VALIDATION_DISABLED"
  | "PAYMENT_VALIDATION_INVALID"
  | "PAYMENT_VALIDATION_NOT_ALLOWED"
  | "PRECOLLECTION_CORRECTION_NOT_ALLOWED";

const messages: Readonly<Record<FinancialMutationErrorCode, string>> = {
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  COLLECTION_ALREADY_STARTED:
    "Financial terms are frozen after collection starts.",
  DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE:
    "Digital payment is unavailable for this financial policy.",
  PAYMENT_AMOUNT_INVALID: "The monetary amount is invalid.",
  PAYMENT_NOT_AVAILABLE: "The canonical payment is not available.",
  PAYMENT_TIPS_DISABLED: "Tips are not enabled for this location.",
  PAYMENT_VALIDATION_DISABLED: "Validation is not enabled for this location.",
  PAYMENT_VALIDATION_INVALID: "The validation request is invalid.",
  PAYMENT_VALIDATION_NOT_ALLOWED: "Validation is not allowed for this payment.",
  PRECOLLECTION_CORRECTION_NOT_ALLOWED:
    "The financial correction is not allowed.",
};

export class FinancialMutationError extends Error {
  constructor(readonly code: FinancialMutationErrorCode) {
    super(messages[code]);
    this.name = "FinancialMutationError";
  }
}
