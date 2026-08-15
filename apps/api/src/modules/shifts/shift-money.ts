import { ShiftOperationError } from "./shift-errors";

const moneyPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const maximumMills = 99_999_999_999_999n;

export function parseShiftMoney(value: string): bigint {
  if (!moneyPattern.test(value)) {
    throw new ShiftOperationError("SHIFT_CASH_REPORT_INVALID");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const mills = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
  if (mills > maximumMills) {
    throw new ShiftOperationError("SHIFT_CASH_REPORT_INVALID");
  }
  return mills;
}

export function formatShiftMoney(mills: bigint): string {
  const sign = mills < 0n ? "-" : "";
  const absolute = mills < 0n ? -mills : mills;
  if (absolute > maximumMills) {
    throw new ShiftOperationError("SHIFT_CASH_REPORT_INVALID");
  }
  return `${sign}${absolute / 1000n}.${(absolute % 1000n)
    .toString()
    .padStart(3, "0")}`;
}
