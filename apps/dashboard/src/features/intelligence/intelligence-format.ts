import type { DashboardLocale } from "../../lib/i18n/locale";

export interface ExactCurrencyValue {
  readonly currency: string;
  readonly value: string | null;
}

export interface FormattedCurrencyValue {
  readonly currency: string;
  readonly text: string;
}

export function intelligenceUnavailable(locale: DashboardLocale): string {
  return locale === "ar" ? "غير متاح" : "Unavailable";
}

export function formatExactDecimal(
  value: string | null,
  locale: DashboardLocale,
): string {
  return value ?? intelligenceUnavailable(locale);
}

export function formatExactCurrency(
  value: string | null,
  currency: string,
  locale: DashboardLocale,
): string {
  if (value === null) return intelligenceUnavailable(locale);
  return `${value} ${currency}`;
}

/** Preserve one presentation row per authoritative currency group. */
export function formatExactCurrencyValues(
  values: readonly ExactCurrencyValue[],
  locale: DashboardLocale,
): readonly FormattedCurrencyValue[] {
  return values.map(({ currency, value }) => ({
    currency,
    text: formatExactCurrency(value, currency, locale),
  }));
}
