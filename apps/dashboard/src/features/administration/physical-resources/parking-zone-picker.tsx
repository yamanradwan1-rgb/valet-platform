"use client";

import type { ParkingZoneSelector } from "@valet/contracts";
import type { RefObject } from "react";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationErrorMessage } from "../administration-error";
import { styles } from "../administration-ui";
import { physicalResourcesCopy } from "./physical-resources-copy";
import presentation from "./physical-resources.module.css";
import type { useParkingZonePage } from "./use-parking-zone-page";

export function ParkingZonePicker({
  page,
  zones,
  zoneId,
  busy,
  onSelect,
  onAdd,
  addRef,
}: {
  readonly page: ReturnType<typeof useParkingZonePage>;
  readonly zones: readonly ParkingZoneSelector[];
  readonly zoneId: string;
  readonly busy: boolean;
  readonly onSelect: (zoneId: string) => void;
  readonly onAdd: () => void;
  readonly addRef: RefObject<HTMLButtonElement | null>;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  return (
    <>
      <label className={presentation.field}>
        <span>{t.parkingZone}</span>
        <select
          disabled={page.loading}
          required
          value={zoneId}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">{t.selectZone}</option>
          {zones.map((zone) => (
            <option key={zone.parkingZoneId} value={zone.parkingZoneId}>
              {zone.label} — {zone.code}
            </option>
          ))}
        </select>
      </label>
      {!page.loading && !page.error && zones.length === 0 ? (
        <p>{t.zonesEmpty}</p>
      ) : null}
      {page.error ? (
        <p className={presentation.error} role="alert">
          {administrationErrorMessage(page.error)}
        </p>
      ) : null}
      {page.hasPrevious || page.data?.nextCursor ? (
        <div className={presentation.pagination}>
          <button
            className={styles.secondary}
            type="button"
            disabled={page.loading || !page.hasPrevious}
            onClick={page.previous}
          >
            {t.previous}
          </button>
          <button
            className={styles.secondary}
            type="button"
            disabled={page.loading || !page.data?.nextCursor}
            onClick={page.next}
          >
            {t.next}
          </button>
        </div>
      ) : null}
      <button
        className={styles.secondary}
        ref={addRef}
        type="button"
        disabled={busy}
        onClick={onAdd}
      >
        {t.addParkingZone}
      </button>
    </>
  );
}
