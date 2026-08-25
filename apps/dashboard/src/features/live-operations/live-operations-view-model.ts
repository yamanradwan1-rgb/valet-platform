import type { MapMarkerDescriptor } from "../../lib/maps/map-provider";

import type {
  LiveOperationsItem,
  LiveOperationsPosition,
  LiveOperationsVehicle,
} from "./live-operations-api";

/**
 * Pure Live Operations presentation logic.
 *
 * Every function here is honest-by-construction:
 * - items with `position === null` never produce marker descriptors;
 * - coordinates are passed through unchanged (no rounding, no inference);
 * - vehicle naming falls back through backend fields only and ends in a
 *   caller-supplied neutral label instead of an invented value;
 * - area labels are rendered only when the backend actually sent areas;
 *   nothing is derived from area presence alone.
 */

export interface LiveOperationsCounts {
  readonly trackedTasks: number;
  readonly positionedCount: number;
  readonly liveCount: number;
  readonly staleCount: number;
}

export function countLiveOperations(
  items: readonly LiveOperationsItem[],
): LiveOperationsCounts {
  let positionedCount = 0;
  let liveCount = 0;
  let staleCount = 0;
  for (const item of items) {
    if (item.position === null) continue;
    positionedCount += 1;
    if (item.position.freshness === "LIVE") liveCount += 1;
    else staleCount += 1;
  }
  return { trackedTasks: items.length, positionedCount, liveCount, staleCount };
}

export function positionedItems(
  items: readonly LiveOperationsItem[],
): LiveOperationsItem[] {
  return items.filter((item) => item.position !== null);
}

/**
 * Vehicle heading: plate number (+ country when present), else the temporary
 * descriptor, else make/model, else the caller's neutral fallback label.
 */
export function vehicleDisplayName(
  vehicle: LiveOperationsVehicle,
  fallbackLabel: string,
): string {
  if (vehicle.plateNumber !== null) {
    return vehicle.plateCountry === null
      ? vehicle.plateNumber
      : `${vehicle.plateNumber} · ${vehicle.plateCountry}`;
  }
  if (vehicle.temporaryDescriptor !== null) {
    return vehicle.temporaryDescriptor;
  }
  const makeModel = [vehicle.make, vehicle.model]
    .filter((part): part is string => part !== null)
    .join(" ")
    .trim();
  return makeModel.length > 0 ? makeModel : fallbackLabel;
}

/** Comma-joined backend area labels; null when the backend sent none. */
export function areaLabelText(
  position: LiveOperationsPosition,
): string | null {
  if (position.areas.length === 0) return null;
  return position.areas.map((area) => area.label).join(", ");
}

export type MarkerDraft = Omit<MapMarkerDescriptor, "ariaLabel">;

/**
 * Maps loaded items onto provider-neutral marker drafts. Items without a
 * backend position are structurally excluded — there is no code path that
 * could place them at a guessed coordinate.
 */
export function toMarkerDrafts(
  items: readonly LiveOperationsItem[],
  selectedMarkerId: string | null,
): MarkerDraft[] {
  const drafts: MarkerDraft[] = [];
  for (const item of items) {
    const position = item.position;
    if (position === null) continue;
    drafts.push({
      id: item.trackingSessionId,
      latitude: position.latitude,
      longitude: position.longitude,
      glyph: item.taskType === "PARKING" ? "P" : "R",
      tone: position.freshness === "LIVE" ? "positive" : "warning",
      selected: item.trackingSessionId === selectedMarkerId,
    });
  }
  return drafts;
}

/**
 * Time-of-day rendering for snapshot/captured timestamps (D1 shows times on
 * this surface). Localized; invalid input renders as an em dash.
 */
export function formatTimeOfDay(iso: string, locale: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}
