import { useEffect, useRef } from "react";
import { Button } from "../../../../components/presentation/button";
import { ContextHelp } from "../../../../features/help/context-help";
import type { StudioZone as Zone } from "./studio-types";
import { useStudio } from "./studio-context";
import { ui } from "./copy";
import { CurrentLocationButton } from "./CurrentLocationButton";
import type { useAttendanceZoneLocation } from "../../../../features/administration/settings/use-attendance-zone-location";

export function ZoneForm({
  draft,
  location,
  patch,
  save,
  changed,
  error,
  disabled,
  onCancel,
}: {
  draft: Zone;
  location: ReturnType<typeof useAttendanceZoneLocation>;
  patch: (value: Partial<Zone>) => void;
  save: () => void;
  changed: boolean;
  error: string;
  disabled: boolean;
  onCancel: () => void;
}) {
  const { locale, identity } = useStudio();
  const ar = locale === "ar";
  const copy = ui[locale];
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <form
      className="ps-zone-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="ps-related">
        <h3>{ar ? "مسودة منطقة الحضور" : "Attendance zone draft"}</h3>
        <ContextHelp
          helpKey="presence.zoneForm"
          locale={locale}
          scopeIdentity={identity}
        />
      </div>
      <p className="ps-inline-note">
        {ar
          ? "اختر موقعًا فعليًا على خريطة Google أو أدخل الإحداثيات، ثم اضبط نصف القطر وراجع القيم واضغط حفظ. الاختيار لا يحفظ المنطقة."
          : "Choose a real position on Google Maps or enter coordinates, adjust the radius, verify the values, then Save. Picking a point does not save the zone."}
      </p>
      <fieldset disabled={disabled} className="ps-zone-controls">
        <CurrentLocationButton locale={locale} location={location} />
        <div className="ps-zone-fields">
          <label>
            {ar ? "الرمز" : "Code"}
            <input
              ref={input}
              maxLength={64}
              value={draft.code}
              onChange={(event) => patch({ code: event.target.value })}
              required
            />
          </label>
          <label>
            {ar ? "اسم المنطقة" : "Zone label"}
            <input
              maxLength={200}
              value={draft.label}
              onChange={(event) => patch({ label: event.target.value })}
              required
            />
          </label>
          <label>
            {ar ? "خط العرض" : "Latitude"}
            <input
              dir="ltr"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={Number.isFinite(draft.latitude) ? draft.latitude : ""}
              onChange={(event) =>
                patch({
                  latitude:
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                })
              }
              required
            />
          </label>
          <label>
            {ar ? "خط الطول" : "Longitude"}
            <input
              dir="ltr"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={Number.isFinite(draft.longitude) ? draft.longitude : ""}
              onChange={(event) =>
                patch({
                  longitude:
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                })
              }
              required
            />
          </label>
          <label>
            {ar ? "نصف القطر (متر)" : "Radius (meters)"}
            <input
              type="number"
              min="5"
              max="1000"
              step="any"
              value={Number.isFinite(draft.radius) ? draft.radius : ""}
              onChange={(event) =>
                patch({
                  radius:
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                })
              }
              required
            />
          </label>
          <label>
            {ar ? "الحالة" : "Status"}
            <select
              aria-label={ar ? "الحالة" : "Status"}
              value={draft.status}
              onChange={(event) =>
                patch({ status: event.target.value as Zone["status"] })
              }
            >
              <option value="ACTIVE">{ar ? "نشطة" : "Active"}</option>
              <option value="DISABLED">{ar ? "معطّلة" : "Disabled"}</option>
            </select>
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="ps-error" role="alert">
          {error}
        </p>
      )}
      <div className="ps-actions">
        <Button type="submit" disabled={!changed || disabled}>
          {copy.save}
        </Button>
        <ContextHelp
          helpKey="presence.zoneForm"
          locale={locale}
          scopeIdentity={identity}
        />
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            if (changed && !window.confirm(copy.leave)) return;
            onCancel();
          }}
        >
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}
