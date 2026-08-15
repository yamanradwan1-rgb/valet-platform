import { CashMutationError } from "./cash-errors";

const moneyPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const persistedPattern = /^\d+(?:\.\d{1,3})?$/;
const maximumMills = 99_999_999_999_999n;

export function parseCashMoney(value: string, persisted = false): bigint {
  if (!(persisted ? persistedPattern : moneyPattern).test(value)) {
    throw new CashMutationError("PAYMENT_AMOUNT_INVALID");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const mills = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
  if (mills > maximumMills) {
    throw new CashMutationError("PAYMENT_AMOUNT_INVALID");
  }
  return mills;
}

export function formatCashMoney(mills: bigint): string {
  if (mills < 0n || mills > maximumMills) {
    throw new CashMutationError("PAYMENT_AMOUNT_INVALID");
  }
  return `${mills / 1000n}.${(mills % 1000n).toString().padStart(3, "0")}`;
}
