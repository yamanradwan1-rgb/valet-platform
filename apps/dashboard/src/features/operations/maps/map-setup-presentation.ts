import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import type { DashboardLocale } from "../../../lib/i18n/locale";

const pointLabels = {
  ENTRANCE: { en: "Entrance", ar: "مدخل" },
  PICKUP: { en: "Pickup", ar: "استلام" },
  DROP_OFF: { en: "Drop-off", ar: "تسليم" },
} as const;

const areaLabels = {
  PARKING: { en: "Parking", ar: "اصطفاف" },
  OVERFLOW: { en: "Overflow", ar: "منطقة إضافية" },
  STAGING: { en: "Staging", ar: "تجهيز" },
  RESTRICTED: { en: "Restricted", ar: "مقيّدة" },
} as const;

export function mapPointKindLabel(
  kind: LocationMapPoint["kind"],
  locale: DashboardLocale,
) {
  return pointLabels[kind][locale];
}

export function mapAreaPurposeLabel(
  purpose: LocationMapArea["purpose"],
  locale: DashboardLocale,
) {
  return areaLabels[purpose][locale];
}
