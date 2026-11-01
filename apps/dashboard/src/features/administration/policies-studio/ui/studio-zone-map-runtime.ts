import type {
  GeoCenter,
  GoogleAdvancedMarker,
  GoogleMapCircle,
  GoogleMapsSdk,
  GoogleMapsListener,
} from "../../../../lib/maps/google-maps-sdk";
import type { DashboardTheme } from "../../../../lib/theme/theme";
import { attendanceZoneBoundPoints } from "../../settings/attendance-zone-bounds";
import type { StudioZone } from "./studio-types";

export interface StudioZoneMapSnapshot {
  readonly zones: readonly StudioZone[];
  readonly selectedId: string | null;
  readonly draft: StudioZone | null;
  readonly editable: boolean;
  readonly onPick: (latitude: number, longitude: number) => void;
  readonly locale: "en" | "ar";
}

interface Overlay {
  circle: GoogleMapCircle;
  marker: GoogleAdvancedMarker;
}

function points(zone: StudioZone) {
  return attendanceZoneBoundPoints({ ...zone, radiusMeters: zone.radius });
}

/** One geographic map; saved configuration and unsaved input stay separate. */
export function createStudioZoneMapRuntime(input: {
  readonly sdk: GoogleMapsSdk;
  readonly node: HTMLElement;
  readonly mapId: string;
  readonly theme: DashboardTheme;
  readonly onTilesLoaded: () => void;
}) {
  const { sdk, node } = input;
  const map = new sdk.Map(node, {
    // Neutral world viewport, never a proposed or authoritative Location center.
    center: { lat: 0, lng: 0 },
    zoom: 2,
    mapId: input.mapId,
    colorScheme: input.theme === "dark" ? "DARK" : "LIGHT",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: "cooperative",
    keyboardShortcuts: true,
  });
  let disposed = false;
  let generation = 0;
  let click: GoogleMapsListener | undefined;
  const tiles = map.addListener("tilesloaded", () => {
    if (!disposed) input.onTilesLoaded();
  });
  let saved: Overlay[] = [];
  let draft: Overlay | null = null;
  let savedKey = "";
  let geometryKey = "";
  let draftKey = "";

  function detach(overlay: Overlay) {
    overlay.circle.setMap(null);
    overlay.marker.map = null;
    sdk.event.clearInstanceListeners(overlay.circle);
    sdk.event.clearInstanceListeners(overlay.marker);
  }

  function overlay(zone: StudioZone, kind: string, title: string): Overlay {
    const center = { lat: zone.latitude, lng: zone.longitude };
    const color =
      kind === "draft"
        ? "#c2410c"
        : zone.status === "ACTIVE"
          ? "#2563eb"
          : "#64748b";
    const circle = new sdk.Circle({
      map,
      center,
      radius: zone.radius,
      clickable: false,
      strokeColor: color,
      fillColor: color,
      fillOpacity:
        kind === "draft" ? 0.2 : zone.status === "ACTIVE" ? 0.1 : 0.04,
      strokeOpacity: zone.status === "DISABLED" && kind !== "draft" ? 0.5 : 1,
      strokeWeight: kind === "selected" || kind === "draft" ? 3 : 2,
    });
    try {
      const content = document.createElement("div");
      content.className = `ps-map-pin ps-map-pin-${kind}`;
      content.style.backgroundColor = color;
      content.setAttribute("aria-hidden", "true");
      const marker = new sdk.marker.AdvancedMarkerElement({
        map,
        position: center,
        title,
        content,
      });
      return { circle, marker };
    } catch (error) {
      circle.setMap(null);
      sdk.event.clearInstanceListeners(circle);
      throw error;
    }
  }

  function fit(zones: readonly StudioZone[]) {
    const bounds = new sdk.LatLngBounds();
    zones.flatMap(points).forEach((point) => bounds.extend(point));
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
    else {
      map.setCenter({ lat: 0, lng: 0 });
      map.setZoom(2);
    }
  }

  return {
    sync(snapshot: StudioZoneMapSnapshot) {
      if (disposed) return;
      // Replaced snapshots invalidate even callbacks already queued by Maps.
      const ticket = ++generation;
      click?.remove();
      click = undefined;
      if (snapshot.editable && snapshot.draft) {
        click = map.addListener("click", (event) => {
          if (disposed || ticket !== generation || !event.latLng) return;
          const center: GeoCenter = {
            lat: event.latLng.lat(),
            lng: event.latLng.lng(),
          };
          if (
            !Number.isFinite(center.lat) ||
            Math.abs(center.lat) > 90 ||
            !Number.isFinite(center.lng) ||
            Math.abs(center.lng) > 180
          )
            return;
          snapshot.onPick(center.lat, center.lng);
        });
      }
      const valid = snapshot.zones.filter((zone) => points(zone).length > 0);
      const nextSavedKey = JSON.stringify([
        valid,
        snapshot.selectedId,
        snapshot.locale,
      ]);
      if (savedKey !== nextSavedKey) {
        saved.forEach(detach);
        saved = [];
        for (const zone of valid) {
          const state =
            zone.status === "ACTIVE"
              ? snapshot.locale === "ar"
                ? "نشطة"
                : "Active"
              : snapshot.locale === "ar"
                ? "معطّلة"
                : "Disabled";
          saved.push(
            overlay(
              zone,
              zone.id === snapshot.selectedId ? "selected" : "saved",
              `${zone.label} · ${state} · ${zone.radius} m`,
            ),
          );
        }
        savedKey = nextSavedKey;
      }
      const nextGeometry = JSON.stringify(
        valid.map((zone) => [
          zone.id,
          zone.latitude,
          zone.longitude,
          zone.radius,
        ]),
      );
      if (geometryKey !== nextGeometry) {
        fit(valid);
        geometryKey = nextGeometry;
      }
      const candidate = snapshot.draft;
      const nextDraftKey =
        candidate && points(candidate).length
          ? JSON.stringify([
              candidate.id,
              candidate.latitude,
              candidate.longitude,
              candidate.radius,
            ])
          : "";
      if (nextDraftKey !== draftKey) {
        if (candidate && nextDraftKey) {
          const center = { lat: candidate.latitude, lng: candidate.longitude };
          if (!draft) {
            draft = overlay(
              candidate,
              "draft",
              snapshot.locale === "ar" ? "مسودة غير محفوظة" : "Unsaved draft",
            );
            fit([candidate]);
          } else {
            draft.marker.position = center;
            draft.circle.setCenter(center);
            draft.circle.setRadius(candidate.radius);
            map.panTo(center);
          }
        } else if (draft) {
          detach(draft);
          draft = null;
          fit(valid);
        }
        draftKey = nextDraftKey;
      }
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      generation++;
      click?.remove();
      tiles.remove();
      saved.forEach(detach);
      if (draft) detach(draft);
      saved = [];
      draft = null;
      sdk.event.clearInstanceListeners(map);
      node.replaceChildren();
    },
  };
}

export type StudioZoneMapRuntime = ReturnType<
  typeof createStudioZoneMapRuntime
>;
