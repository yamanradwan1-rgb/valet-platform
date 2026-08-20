export type DigitalCollectionErrorCode =
  | "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE"
  | "DIGITAL_COLLECTION_IDEMPOTENCY_CONFLICT"
  | "DIGITAL_COLLECTION_OPERATION_IN_PROGRESS"
  | "DIGITAL_COLLECTION_STATE_CONFLICT";

const messages: Record<DigitalCollectionErrorCode, string> = {
  DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE:
    "A digital payment provider is not available.",
  DIGITAL_COLLECTION_IDEMPOTENCY_CONFLICT:
    "The digital collection submission conflicts with an existing operation.",
  DIGITAL_COLLECTION_OPERATION_IN_PROGRESS:
    "A digital collection operation is already in progress.",
  DIGITAL_COLLECTION_STATE_CONFLICT:
    "The digital collection operation cannot proceed from its current state.",
};

export class DigitalCollectionError extends Error {
  constructor(readonly code: DigitalCollectionErrorCode) {
    super(messages[code]);
    this.name = "DigitalCollectionError";
  }
}
