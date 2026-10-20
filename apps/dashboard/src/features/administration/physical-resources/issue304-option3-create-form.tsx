"use client";

import type { ParkingZoneSelector } from "@valet/contracts";
import type { FormEvent } from "react";

import { administrationErrorMessage } from "../administration-error";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { physicalResourcesCopy } from "./physical-resources-copy";
import type { useParkingZonePage } from "./use-parking-zone-page";

/** Approved Option 3 draft geometry; submit remains the real authenticated POST. */
export function Issue304Option3CreateForm(props: {
  readonly kind: "key-slot" | "parking-spot";
  readonly locale: DashboardLocale;
  readonly code: string;
  readonly label: string;
  readonly zoneId: string;
  readonly zones: readonly ParkingZoneSelector[];
  readonly zonePage: ReturnType<typeof useParkingZonePage>;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCode: (value: string) => void;
  readonly onLabel: (value: string) => void;
  readonly onZone: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  const t = physicalResourcesCopy(props.locale);
  const isSpot = props.kind === "parking-spot";
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <>
      <p className="issue304-modal-disclaimer">
        {props.locale === "ar"
          ? "سيُحفظ المورد في الموقع المحدد بعد التحقق من الصلاحيات."
          : isSpot ? "Create this resource in the selected Location." : "This creates a persisted resource in the selected Location after authorization."}
      </p>
      <form className="issue304-modal-form" onSubmit={onSubmit}>
        <label>
          <span>{isSpot ? (props.locale === "ar" ? "رمز المورد" : "Resource code") : t.code}</span>
          <input autoComplete="off" dir="ltr" maxLength={100} required
            placeholder={isSpot ? "P-08" : "K-08"}
            value={props.code} onChange={(event) => props.onCode(event.target.value)} />
        </label>
        <label>
          <span>{isSpot ? (props.locale === "ar" ? "اسم العرض" : "Display label") : t.label + (props.locale === "ar" ? " (اختياري)" : " (optional)")}</span>
          <input autoComplete="off" maxLength={160} required={isSpot}
            placeholder={props.locale === "ar" ? "المكتب الأمامي" : "Front desk C"}
            value={props.label} onChange={(event) => props.onLabel(event.target.value)} />
        </label>
        {isSpot ? (
          <label>
            <span>{t.parkingZone}</span>
            <select required disabled={props.zonePage.loading} value={props.zoneId}
              onChange={(event) => props.onZone(event.target.value)}>
              <option value="">{props.locale === "ar" ? "اختر منطقة وقوف" : "Choose a parking zone"}</option>
              {props.zones.map((zone) => (
                <option value={zone.parkingZoneId} key={zone.parkingZoneId}>
                  {zone.label} — {zone.code}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isSpot && !props.zonePage.loading && !props.zonePage.error && props.zones.length === 0
          ? <p className="issue304-modal-disclaimer">{t.zonesEmpty}</p> : null}
        {isSpot && props.zonePage.error
          ? <p role="alert" className="issue304-modal-error">{administrationErrorMessage(props.zonePage.error)}</p>
          : null}
        {isSpot && (props.zonePage.hasPrevious || props.zonePage.data?.nextCursor) ? (
          <div className="issue304-modal-pagination">
            <button type="button" disabled={props.zonePage.loading || !props.zonePage.hasPrevious}
              onClick={props.zonePage.previous}>{t.previous}</button>
            <button type="button" disabled={props.zonePage.loading || !props.zonePage.data?.nextCursor}
              onClick={props.zonePage.next}>{t.next}</button>
          </div>
        ) : null}
        {props.error ? <p role="alert" className="issue304-modal-error">{props.error}</p> : null}
        <div className="issue304-modal-actions">
          <button className="issue304-modal-quiet" type="button" disabled={props.busy}
            onClick={props.onCancel}>{t.cancel}</button>
          <button className="issue304-modal-primary" type="submit"
            disabled={props.busy || !props.code.trim() || (isSpot && (!props.label.trim() || !props.zoneId))}>
            {props.busy ? t.creating : t.create}
          </button>
        </div>
      </form>
    </>
  );
}
