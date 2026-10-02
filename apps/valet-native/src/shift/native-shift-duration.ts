import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export function formatNativeShiftDuration(
  startedAt: string,
  locale: FoundationLocale,
  now = Date.now(),
): string {
  const started = new Date(startedAt).getTime();
  const seconds = Number.isNaN(started)
    ? 0
    : Math.max(0, Math.floor((now - started) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const dictionary = getNativeEmployeeDictionary(locale);
  const units = {
    day: dictionary.durationDayShort,
    hour: dictionary.durationHourShort,
    minute: dictionary.durationMinuteShort,
  };
  const part = (value: number, unit: string) =>
    locale === "ar" ? `${value} ${unit}` : `${value}${unit}`;
  return [
    days > 0 ? part(days, units.day) : null,
    part(hours, units.hour),
    part(minutes, units.minute),
  ]
    .filter(Boolean)
    .join(" ");
}
