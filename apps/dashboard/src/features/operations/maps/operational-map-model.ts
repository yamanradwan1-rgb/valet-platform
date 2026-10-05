import type {
  LiveOperationsMapResponse,
  LocationMapArea,
  LocationMapPoint,
} from "@valet/contracts";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { operationsCopy } from "../operations-copy";
import {
  liveMapMarkerLabel,
  mapAreaDescription,
  mapPointDescription,
} from "./map-presentation";
import { mapPointKindLabel } from "./map-setup-presentation";

type LiveMapItem = LiveOperationsMapResponse["items"][number];

export const WORLD_ZOOM = 2;
export const SINGLE_POINT_ZOOM = 17;

export interface OperationalMapCoordinate {
  readonly lat: number;
  readonly lng: number;
}

export interface OperationalMapLiveMarker {
  readonly rendererKey: string;
  readonly position: OperationalMapCoordinate;
  readonly label: string;
  readonly state: "LIVE" | "STALE";
}

export interface OperationalMapPointMarker {
  readonly rendererKey: string;
  readonly position: OperationalMapCoordinate;
  readonly label: string;
  readonly active: boolean;
  readonly kind: LocationMapPoint["kind"];
  readonly levelLabel: string | null;
}

export interface OperationalMapPolygon {
  readonly rendererKey: string;
  readonly path: readonly OperationalMapCoordinate[];
  readonly label: string;
  readonly active: boolean;
  readonly purpose: LocationMapArea["purpose"];
  readonly levelLabel: string | null;
}

export type OperationalMapCamera =
  | {
      readonly kind: "WORLD";
      readonly center: OperationalMapCoordinate;
      readonly zoom: number;
    }
  | {
      readonly kind: "SINGLE";
      readonly center: OperationalMapCoordinate;
      readonly zoom: number;
    }
  | {
      readonly kind: "BOUNDS";
      readonly north: number;
      readonly south: number;
      readonly east: number;
      readonly west: number;
    };

export interface OperationalMapModel {
  readonly liveMarkers: readonly OperationalMapLiveMarker[];
  readonly pointMarkers: readonly OperationalMapPointMarker[];
  readonly polygons: readonly OperationalMapPolygon[];
  readonly camera: OperationalMapCamera;
}

export interface OperationalMapProjectionInput {
  readonly items: readonly LiveMapItem[];
  readonly points?: readonly LocationMapPoint[] | undefined;
  readonly areas?: readonly LocationMapArea[] | undefined;
  readonly locale: DashboardLocale;
  readonly timezone?: string | undefined;
}

function coordinate(latitude: number, longitude: number): OperationalMapCoordinate {
  return { lat: latitude, lng: longitude };
}

function setupStateLabel(active: boolean, locale: DashboardLocale): string {
  const copy = operationsCopy(locale);
  return active ? copy.active : copy.inactive;
}

function projectLiveMarkers(
  items: readonly LiveMapItem[],
  locale: DashboardLocale,
  timezone: string | undefined,
): readonly OperationalMapLiveMarker[] {
  return items.flatMap((item) => item.position === null ? [] : [{
    rendererKey: item.taskId,
    position: coordinate(item.position.latitude, item.position.longitude),
    label: liveMapMarkerLabel(item, locale, timezone),
    state: item.position.freshness,
  }]);
}

function projectPointMarkers(
  points: readonly LocationMapPoint[],
  locale: DashboardLocale,
): readonly OperationalMapPointMarker[] {
  return points.map((point) => ({
    rendererKey: point.id,
    position: coordinate(point.latitude, point.longitude),
    label: [
      mapPointDescription(point),
      mapPointKindLabel(point.kind, locale),
      setupStateLabel(point.active, locale),
    ].join(" · "),
    active: point.active,
    kind: point.kind,
    levelLabel: point.levelLabel,
  }));
}

function projectPolygons(
  areas: readonly LocationMapArea[],
  locale: DashboardLocale,
): readonly OperationalMapPolygon[] {
  return areas.map((area) => ({
    rendererKey: area.id,
    path: area.vertices.map((vertex) => coordinate(vertex.latitude, vertex.longitude)),
    label: `${mapAreaDescription(area, locale)} · ${setupStateLabel(area.active, locale)}`,
    active: area.active,
    purpose: area.purpose,
    levelLabel: area.levelLabel,
  }));
}

function coordinateKey(value: OperationalMapCoordinate): string {
  return `${value.lat},${value.lng}`;
}

export function decideOperationalMapCamera(
  coordinates: readonly OperationalMapCoordinate[],
): OperationalMapCamera {
  const unique = [...new Map(coordinates.map((value) => [coordinateKey(value), value])).values()];
  if (unique.length === 0) {
    return { kind: "WORLD", center: { lat: 0, lng: 0 }, zoom: WORLD_ZOOM };
  }
  if (unique.length === 1) {
    return { kind: "SINGLE", center: unique[0]!, zoom: SINGLE_POINT_ZOOM };
  }

  let north = unique[0]!.lat;
  let south = north;
  let east = unique[0]!.lng;
  let west = east;
  for (const value of unique.slice(1)) {
    north = Math.max(north, value.lat);
    south = Math.min(south, value.lat);
    east = Math.max(east, value.lng);
    west = Math.min(west, value.lng);
  }
  return { kind: "BOUNDS", north, south, east, west };
}

export function projectOperationalMap(input: OperationalMapProjectionInput): OperationalMapModel {
  const liveMarkers = projectLiveMarkers(input.items, input.locale, input.timezone);
  const pointMarkers = projectPointMarkers(input.points ?? [], input.locale);
  const polygons = projectPolygons(input.areas ?? [], input.locale);
  const cameraCoordinates = [
    ...liveMarkers.map((marker) => marker.position),
    ...pointMarkers.map((marker) => marker.position),
    ...polygons.flatMap((polygon) => polygon.path),
  ];

  return {
    liveMarkers,
    pointMarkers,
    polygons,
    camera: decideOperationalMapCamera(cameraCoordinates),
  };
}
