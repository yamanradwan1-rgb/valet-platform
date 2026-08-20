import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { RefundError } from "./refund-errors";

const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const moneyPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const persistedMoneyPattern = /^\d+(?:\.\d{1,3})?$/;
const maximumMills = 99_999_999_999_999n;
const controlCharacterPattern = /\p{Cc}/u;

export function parseRefundMoney(value: string, persisted = false): bigint {
  if (!(persisted ? persistedMoneyPattern : moneyPattern).test(value)) {
    throw new RefundError("REFUND_AMOUNT_INVALID");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const mills = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
  if (mills > maximumMills) throw new RefundError("REFUND_AMOUNT_INVALID");
  return mills;
}

export function formatRefundMoney(mills: bigint): string {
  if (mills < 0n || mills > maximumMills) {
    throw new RefundError("REFUND_AMOUNT_INVALID");
  }
  return `${mills / 1000n}.${(mills % 1000n).toString().padStart(3, "0")}`;
}

export function normalizeRefundReason(value: string): string {
  const reason = value.trim();
  if (
    reason.length === 0 ||
    [...reason].length > 500 ||
    controlCharacterPattern.test(reason)
  ) {
    throw new RefundError("REFUND_NOT_ALLOWED");
  }
  return reason;
}

export function validateRefundRequest(input: {
  authenticatedUserId: unknown;
  amount: unknown;
  idempotencyKey: unknown;
  reason: unknown;
  valetSessionId: unknown;
}): void {
  if (
    typeof input.authenticatedUserId !== "string" ||
    typeof input.amount !== "string" ||
    typeof input.idempotencyKey !== "string" ||
    typeof input.reason !== "string" ||
    typeof input.valetSessionId !== "string" ||
    !canonicalUuid.test(input.authenticatedUserId) ||
    !canonicalUuid.test(input.valetSessionId) ||
    input.idempotencyKey.length === 0 ||
    input.idempotencyKey.length > 200 ||
    input.idempotencyKey.trim() === "" ||
    controlCharacterPattern.test(input.idempotencyKey)
  ) {
    throw new RefundError("REFUND_NOT_ALLOWED");
  }
}

export function requireRepresentableRefund(
  amount: string,
  currency: string,
): bigint {
  const mills = parseRefundMoney(amount);
  if (mills <= 0n || !isCurrencyAmountRepresentable(currency, mills)) {
    throw new RefundError("REFUND_AMOUNT_INVALID");
  }
  return mills;
}
