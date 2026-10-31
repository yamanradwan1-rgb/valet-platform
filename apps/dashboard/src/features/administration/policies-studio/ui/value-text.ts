import type { Field, Scalar, Locale } from "./catalog";
import { settingDisplayValue } from "../../../../features/administration/settings/settings-copy";
import { presenceCopy } from "../../../../features/administration/settings/shift-presence-copy";
import { ui } from "./copy";

export function displayValue(
  value: Scalar | undefined,
  field: Field,
  locale: Locale,
) {
  if (value === null || value === undefined || value === "") {
    if (field.key === "waTemplate")
      return locale === "ar" ? "لم يتم اعتماد قالب" : "No approved template";
    if (field.key === "waBinding")
      return locale === "ar"
        ? "لم يربط رقم معتمد"
        : "No verified sender connection";
    return ui[locale].none;
  }
  if (
    ["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"].includes(
      String(value),
    )
  ) {
    return presenceCopy(locale)(String(value) as "OFF");
  }
  if (field.key === "waLanguage")
    return value === "ar"
      ? locale === "ar"
        ? "العربية"
        : "Arabic"
      : locale === "ar"
        ? "الإنجليزية"
        : "English";
  if (field.kind === "money") return `${value} JOD`;
  const text = settingDisplayValue(value, locale);
  if (field.key === "shiftPresenceMaxAccuracyMeters")
    return `${text} ${locale === "ar" ? "متر" : "m"}`;
  if (
    field.key === "shiftPresenceMaxFixAgeSeconds" ||
    field.key === "slaTargetSeconds"
  )
    return `${text} ${locale === "ar" ? "ثانية" : "sec"}`;
  if (field.key === "rawGpsRetentionDays")
    return `${text} ${locale === "ar" ? "يومًا" : "days"}`;
  return text;
}
