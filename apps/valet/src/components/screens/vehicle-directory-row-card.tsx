"use client";

import type { JSX } from "react";
import type { StaffVehicleDirectoryRow } from "@valet/contracts";

import type { BadgeVariant } from "../../types/employee-ui";
import {
  formatEmployeeDateTime,
} from "../../lib/i18n/live-presentation";
import { Badge, InfoRow } from "../ui/employee-primitives";
import { useEmployeeI18n } from "../shell/employee-i18n";

/**
 * Maps directory lifecycle states onto the existing employee badge
 * vocabulary (DEC-066 §6: COMPLETED rows never reach the directory).
 */
export function directoryStateBadge(
  state: StaffVehicleDirectoryRow["state"],
): BadgeVariant {
  switch (state) {
    case "CHECKING_IN":
      return "checkin";
    case "AWAITING_PARKING":
      return "queued";
    case "PARKING":
      return "parking";
    case "PARKED":
      return "parked";
    case "REQUESTED":
      return "requested";
    case "RETRIEVING":
      return "retrieval";
    case "READY":
      return "ready";
    case "HANDOFF_PENDING":
      return "handoff";
  }
}

/** Truthful vehicle headline: descriptors, then temporary descriptor. */
function vehicleTitle(row: StaffVehicleDirectoryRow, fallback: string): string {
  const described = [row.vehicle.make, row.vehicle.model]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(" ");
  if (described.length > 0) return described;
  if (
    row.vehicle.temporaryDescriptor !== null &&
    row.vehicle.temporaryDescriptor.trim().length > 0
  ) {
    return row.vehicle.temporaryDescriptor;
  }
  return fallback;
}

export interface VehicleDirectoryRowCardProps {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly row: StaffVehicleDirectoryRow;
}

/**
 * One truthful directory row (DEC-066 §8/§10/§12). Plates and resource codes
 * render LTR-isolated; a null Key Slot renders the localized safe placeholder
 * — never a fabricated value. Expanding reveals the read-only detail already
 * present in this row: no extra fetches, no actions, no workflow launches.
 */
export function VehicleDirectoryRowCard({
  expanded,
  onToggle,
  row,
}: VehicleDirectoryRowCardProps): JSX.Element {
  const { locale, t } = useEmployeeI18n();
  const title = vehicleTitle(row, t.vehiclesDescriptorMissing);
  const zoneSpot = [row.parkingZoneCode, row.parkingSpotCode].filter(
    (code): code is string => code !== null,
  );

  return (
    <div className="bg-white rounded-xl border border-vborder overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left p-4 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between mb-2 gap-2">
          <p className="font-heading font-bold text-navy text-[15px] leading-tight">
            {title}
          </p>
          <Badge variant={directoryStateBadge(row.state)} />
        </div>
        <p className="text-neutral text-xs mb-3">
          {row.vehicle.plateNumberRaw !== null &&
          row.vehicle.plateNumberRaw.trim().length > 0 ? (
            <bdi dir="ltr">{row.vehicle.plateNumberRaw}</bdi>
          ) : (
            t.noPlate
          )}
          {row.vehicle.color !== null && row.vehicle.color.trim().length > 0
            ? ` · ${row.vehicle.color}`
            : ""}
        </p>
        <div className="flex items-center gap-5 pt-3 border-t border-vborder">
          <div>
            <p className="text-muted text-[10px] uppercase tracking-wider">
              {t.keySlot}
            </p>
            <p className="text-navy font-semibold text-sm mt-0.5">
              {row.keySlotCode !== null ? (
                <bdi dir="ltr">{row.keySlotCode}</bdi>
              ) : (
                <span className="text-muted font-normal">{t.notAssigned}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted text-[10px] uppercase tracking-wider">
              {t.parkingArea}
            </p>
            <p className="text-navy font-semibold text-sm mt-0.5">
              {zoneSpot.length === 0 ? (
                <span className="text-muted font-normal">{t.notAssigned}</span>
              ) : (
                zoneSpot.map((code, index) => (
                  <span key={index}>
                    {index > 0 ? " · " : ""}
                    <bdi dir="ltr">{code}</bdi>
                  </span>
                ))
              )}
            </p>
          </div>
          <div>
            <p className="text-muted text-[10px] uppercase tracking-wider">
              {t.vehiclesUpdatedAtLabel}
            </p>
            <p className="text-navy font-semibold text-sm mt-0.5">
              {formatEmployeeDateTime(row.updatedAt, locale)}
            </p>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-warm border-t border-vborder">
          <InfoRow
            label={t.statusLabel}
            value={<Badge variant={directoryStateBadge(row.state)} />}
          />
          <InfoRow
            label={t.vehiclesCheckedInLabel}
            value={formatEmployeeDateTime(row.createdAt, locale)}
          />
          <InfoRow
            label={t.vehiclesUpdatedAtLabel}
            value={formatEmployeeDateTime(row.updatedAt, locale)}
          />
          <InfoRow
            label={t.keySlot}
            value={
              row.keySlotCode !== null ? (
                <bdi dir="ltr">{row.keySlotCode}</bdi>
              ) : (
                t.notAssigned
              )
            }
          />
          <InfoRow
            label={t.zone}
            value={
              row.parkingZoneCode !== null ? (
                <bdi dir="ltr">{row.parkingZoneCode}</bdi>
              ) : (
                t.notAssigned
              )
            }
          />
          <InfoRow
            label={t.spotCode}
            value={
              row.parkingSpotCode !== null ? (
                <bdi dir="ltr">{row.parkingSpotCode}</bdi>
              ) : (
                t.notAssigned
              )
            }
          />
          <p className="text-muted text-[11px] leading-relaxed pt-2">
            {t.vehiclesDetailReadOnly}
          </p>
        </div>
      )}
    </div>
  );
}
