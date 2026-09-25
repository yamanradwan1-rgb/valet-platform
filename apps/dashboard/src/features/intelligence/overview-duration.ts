import type { DashboardLocale } from "../../lib/i18n/locale";
import { intelligenceUnavailable } from "./intelligence-format";

const units = [
  { milliseconds: 86_400_000n, en: "d", ar: "ي" },
  { milliseconds: 3_600_000n, en: "h", ar: "س" },
  { milliseconds: 60_000n, en: "m", ar: "د" },
  { milliseconds: 1_000n, en: "s", ar: "ث" },
] as const;

function numeral(value: bigint | number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}

/** The analytics contract supplies exact nonnegative seconds with millisecond precision. */
export function formatOverviewDuration(
  seconds: string | null,
  locale: DashboardLocale,
  style: "full" | "compact" = "full",
): string {
  if (seconds === null) return intelligenceUnavailable(locale);
  const match = /^(\d+)\.(\d{3})$/u.exec(seconds);
  if (!match) return intelligenceUnavailable(locale);

  const milliseconds = BigInt(match[1]!) * 1_000n + BigInt(match[2]!);
  if (milliseconds < 60_000n) {
    const text = numeral(Number(milliseconds) / 1_000, locale);
    if (style === "compact" || (milliseconds % 1_000n !== 0n && locale === "en")) {
      return `${text}${locale === "ar" ? " ث" : "s"}`;
    }
    return `${text} ${locale === "ar" ? "ثانية" : "seconds"}`;
  }

  let remainder = milliseconds;
  const parts: string[] = [];
  for (const unit of units) {
    if (parts.length === 2) break;
    const whole = remainder / unit.milliseconds;
    if (whole === 0n) continue;
    const value = unit.milliseconds === 1_000n
      ? numeral(Number(remainder) / 1_000, locale)
      : numeral(whole, locale);
    parts.push(`${value}${locale === "ar" ? ` ${unit.ar}` : unit.en}`);
    remainder %= unit.milliseconds;
  }
  return parts.join(" ");
}
