import type { LiveOperationsMapResponse } from "@valet/contracts";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import {
  formatOperationsTime,
  operationsSessionStateLabel,
  operationsTaskTypeLabel,
} from "../operations-presentation";
import { operationsCopy } from "../operations-copy";
import { mapAreaPurposeLabel } from "./map-setup-presentation";

type LiveMapItem = LiveOperationsMapResponse["items"][number];
type LiveMapArea = NonNullable<LiveMapItem["position"]>["areas"][number];

type AreaDescriptor = Pick<LiveMapArea, "code" | "label" | "levelLabel" | "purpose">;
type PointDescriptor = {
  readonly code: string;
  readonly label: string;
  readonly levelLabel: string | null;
};

function mapCopy(locale: DashboardLocale) {
  const t = operationsCopy(locale);
  return {
    area: locale === "ar" ? "المنطقة" : "Area",
    captured: locale === "ar" ? "وقت الموقع" : "Position time",
    lastKnown: t.lastKnown,
    live: locale === "ar" ? "مباشر" : "Live",
    noPosition: t.noPosition,
    timeUnavailable: t.timeUnavailable,
    vehicleUnavailable: t.vehicleIdentityUnavailable,
  };
}

function trimmed(value: string | null): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function ltrIsolate(value: string): string {
  return `\u2066${value}\u2069`;
}

export function mapVehicleLabel(item: LiveMapItem, locale: DashboardLocale): string {
  const plate = trimmed(item.vehicle.plateNumber);
  if (plate) return plate;
  const descriptor = trimmed(item.vehicle.temporaryDescriptor);
  if (descriptor) return descriptor;
  const makeModel = [trimmed(item.vehicle.make), trimmed(item.vehicle.model)]
    .filter((value): value is string => value !== null)
    .join(" ");
  return makeModel || mapCopy(locale).vehicleUnavailable;
}

export function mapVehicleDirection(item: LiveMapItem): "ltr" | "auto" {
  return trimmed(item.vehicle.plateNumber) ? "ltr" : "auto";
}

export function mapFreshnessLabel(
  position: LiveMapItem["position"],
  locale: DashboardLocale,
): string {
  const copy = mapCopy(locale);
  if (position === null) return copy.noPosition;
  return position.freshness === "LIVE" ? copy.live : copy.lastKnown;
}

export function mapAreaDescription(
  area: AreaDescriptor,
  locale: DashboardLocale,
): string {
  return [
    `${area.label} (${ltrIsolate(area.code)})`,
    mapAreaPurposeLabel(area.purpose, locale),
    trimmed(area.levelLabel),
  ].filter((value): value is string => value !== null).join(" · ");
}

export function mapPointDescription(point: PointDescriptor): string {
  return [point.label, ltrIsolate(point.code), trimmed(point.levelLabel)]
    .filter((value): value is string => value !== null)
    .join(" · ");
}

export function mapCapturedTime(
  item: LiveMapItem,
  timezone: string | undefined,
  locale: DashboardLocale,
): string {
  if (item.position === null || !timezone?.trim()) return mapCopy(locale).timeUnavailable;
  return formatOperationsTime(item.position.capturedAt, timezone, locale);
}

export function liveMapItemPresentation(
  item: LiveMapItem,
  locale: DashboardLocale,
  timezone?: string,
) {
  const copy = mapCopy(locale);
  return {
    areas: item.position?.areas.map((area) =>
      `${copy.area}: ${mapAreaDescription(area, locale)}`,
    ) ?? [],
    captured: item.position === null
      ? null
      : `${copy.captured}: ${mapCapturedTime(item, timezone, locale)}`,
    freshness: mapFreshnessLabel(item.position, locale),
    sessionState: operationsSessionStateLabel(item.sessionState, locale),
    taskType: operationsTaskTypeLabel(item.taskType, locale),
    vehicle: mapVehicleLabel(item, locale),
    vehicleDirection: mapVehicleDirection(item),
  } as const;
}

export function liveMapMarkerLabel(
  item: LiveMapItem,
  locale: DashboardLocale,
  timezone?: string,
): string {
  const presentation = liveMapItemPresentation(item, locale, timezone);
  return [
    presentation.vehicle,
    presentation.taskType,
    presentation.sessionState,
    presentation.freshness,
    ...presentation.areas,
    presentation.captured,
  ].filter((value): value is string => value !== null).join(" · ");
}
