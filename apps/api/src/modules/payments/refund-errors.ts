export type RefundErrorCode =
  | "REFUND_AMOUNT_INVALID"
  | "REFUND_IDEMPOTENCY_CONFLICT"
  | "REFUND_NOT_ALLOWED";

const messages: Readonly<Record<RefundErrorCode, string>> = {
  REFUND_AMOUNT_INVALID: "The refund amount is invalid.",
  REFUND_IDEMPOTENCY_CONFLICT:
    "The refund submission identity is already in use.",
  REFUND_NOT_ALLOWED: "The refund is not allowed.",
};

export class RefundError extends Error {
  constructor(readonly code: RefundErrorCode) {
    super(messages[code]);
    this.name = "RefundError";
  }
}
