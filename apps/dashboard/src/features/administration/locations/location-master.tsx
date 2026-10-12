"use client";

import type { ManagementLocation } from "@valet/contracts";
import { Building, MapPin } from "lucide-react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import reference from "./locations-reference.module.css";

export function LocationMaster(props: {
  readonly items: readonly ManagementLocation[];
  readonly selectedId: string | null;
  readonly onSelect?: (id: string) => void;
  readonly pagination?: {
    previous: () => void;
    next: () => void;
    hasPrevious: boolean;
    hasNext: boolean;
  };
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  return (
    <section
      className={`${styles.card} ${reference.master}`}
      data-testid="location-master"
      aria-label={t.locationsTitle}
    >
      <div
        className={reference.listHeader}
        style={{ position: "relative", paddingInlineEnd: "3rem" }}
      >
        <Building aria-hidden="true" size={16} />
        {t.allLocations}
        <span
          style={{
            position: "absolute",
            insetBlockStart: "50%",
            insetInlineEnd: ".5rem",
            transform: "translateY(-50%)",
          }}
        >
          <ScopedContextHelp helpKey="locations.list" />
        </span>
      </div>
      <div className={reference.list}>
        {props.items.map((location) => {
          const selected = props.selectedId === location.locationId;
          const content = (
            <>
              <span
                className={`${reference.icon} ${selected ? reference.iconSelected : ""}`}
              >
                <MapPin aria-hidden="true" size={16} />
              </span>
              <span className={reference.rowText}>
                <span className={reference.name}>{location.name}</span>
                <span className={reference.meta}>
                  <bdi dir="ltr">{location.code}</bdi> ·{" "}
                  {location.status === "ACTIVE" ? t.active : t.inactive}
                </span>
              </span>
            </>
          );
          const className = `${reference.row} ${selected ? reference.selected : ""}`;
          return props.onSelect ? (
            <button
              aria-pressed={selected}
              className={className}
              key={location.locationId}
              onClick={() => props.onSelect?.(location.locationId)}
              type="button"
            >
              {content}
            </button>
          ) : (
            <div
              aria-current="true"
              className={className}
              key={location.locationId}
            >
              {content}
            </div>
          );
        })}
        {props.items.length === 0 ? (
          <div className={styles.empty}>{t.noData}</div>
        ) : null}
      </div>
      {props.pagination ? (
        <div className={styles.pagination}>
          <button
            className={styles.secondary}
            disabled={!props.pagination.hasPrevious}
            onClick={props.pagination.previous}
            type="button"
          >
            {t.previous}
          </button>
          <button
            className={styles.secondary}
            disabled={!props.pagination.hasNext}
            onClick={props.pagination.next}
            type="button"
          >
            {t.next}
          </button>
        </div>
      ) : null}
    </section>
  );
}
