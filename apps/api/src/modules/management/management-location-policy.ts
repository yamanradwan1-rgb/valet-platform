import { createHash } from "node:crypto";

import type { ManagementLocationCreateRequest } from "@valet/contracts";

import { currencyMinorUnitExponent } from "../../common/financial/currency-minor-units";

export function isSupportedLocationCurrency(currency: string): boolean {
  const exponent = currencyMinorUnitExponent(currency);
  return exponent !== undefined && exponent !== null && exponent <= 3;
}

export function isValidLocationTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function locationCreateFingerprint(
  request: ManagementLocationCreateRequest,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        addressText: request.addressText,
        code: request.code,
        currency: request.currency,
        name: request.name,
        timezone: request.timezone,
      }),
    )
    .digest("hex");
}
