import { LocateFixed } from "lucide-react";
import { Button } from "../../../../components/presentation/button";
import { presenceCopy } from "../../../../features/administration/settings/shift-presence-copy";
import type { useAttendanceZoneLocation } from "../../../../features/administration/settings/use-attendance-zone-location";
import type { Locale } from "./catalog";

export function CurrentLocationButton({
  locale,
  location,
}: {
  locale: Locale;
  location: ReturnType<typeof useAttendanceZoneLocation>;
}) {
  const t = presenceCopy(locale);
  return (
    <div className="ps-current-location">
      <Button
        type="button"
        variant="secondary"
        disabled={location.locating}
        onClick={location.locate}
      >
        <LocateFixed size={16} aria-hidden="true" />
        {t("currentLocation")}
      </Button>
      {location.locating ? (
        <p role="status" className="ps-inline-note">
          {t("locating")}
        </p>
      ) : null}
      {location.accuracy !== null ? (
        <p role="status" className="ps-inline-note">
          {t("locationAccuracy")}: <bdi>±{location.accuracy} m</bdi>
        </p>
      ) : null}
      {location.message ? (
        <p role="alert" className="ps-error">
          {t(location.message)}
        </p>
      ) : null}
      <p className="ps-inline-note">
        {locale === "ar"
          ? "يُطلب إذن الموقع عند الضغط فقط. تُملأ إحداثيات المسودة دون حفظ تلقائي."
          : "Requests location permission only when clicked. Fills draft coordinates without saving."}
      </p>
    </div>
  );
}
