import type { FinancialOverviewCurrencyGroup } from "@valet/contracts";

/**
 * Pure display derivations for the Financial Overview surface.
 *
 * MONEY PRECISION CONTRACT: monetary values arrive as exact decimal strings
 * and stay exact decimal strings. `formatCurrencyAmount` only CONCATENATES
 * the group's own currency code with its own amount — there is no numeric
 * parsing, no arithmetic between amounts, no conversion, no cross-currency
 * aggregation anywhere in this feature. Currency groups render in backend
 * order, one card per currency.
 */

export function formatCurrencyAmount(
  currency: string,
  amount: string,
): string {
  return `${currency} ${amount}`;
}

export function formatPaymentCount(
  group: FinancialOverviewCurrencyGroup,
): string {
  return String(group.paymentCount);
}

/**
 * True when a backend currency group matches the location's configured
 * currency (a D1-reference presentation accent only — it never merges or
 * reorders groups).
 */
export function isCurrentLocationCurrency(
  group: FinancialOverviewCurrencyGroup,
  locationCurrency: string | null | undefined,
): boolean {
  return (
    typeof locationCurrency === "string" &&
    locationCurrency.length > 0 &&
    group.currency === locationCurrency
  );
}

export function hasCurrencyGroups(response: {
  readonly currencies: readonly unknown[];
}): boolean {
  return response.currencies.length > 0;
}
