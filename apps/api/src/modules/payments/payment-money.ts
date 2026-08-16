import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { FinancialMutationError } from "./payment-mutation-errors";

const inputPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const persistedPattern = /^\d+(?:\.\d{1,3})?$/;
const maximumMills = 99_999_999_999_999n;

export function parseMoney(value: string, persisted = false): bigint {
  if (!(persisted ? persistedPattern : inputPattern).test(value)) {
    throw new FinancialMutationError("PAYMENT_AMOUNT_INVALID");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const mills = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
  if (mills > maximumMills) {
    throw new FinancialMutationError("PAYMENT_AMOUNT_INVALID");
  }
  return mills;
}

export function parseCurrencyMoney(value: string, currency: string): bigint {
  const mills = parseMoney(value);
  if (!isCurrencyAmountRepresentable(currency, mills)) {
    throw new FinancialMutationError("PAYMENT_AMOUNT_INVALID");
  }
  return mills;
}

export function formatMoney(mills: bigint): string {
  if (mills < 0n || mills > maximumMills) {
    throw new FinancialMutationError("PAYMENT_AMOUNT_INVALID");
  }
  return `${mills / 1000n}.${(mills % 1000n).toString().padStart(3, "0")}`;
}

export function addMoney(...values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}
