import type {
  GeoCenter,
  GoogleAdvancedMarker,
  GoogleMapPolygon,
  GoogleMapsSdk,
} from "../../../lib/maps/google-maps-sdk";
import type {
  OperationalMapLiveMarker,
  OperationalMapModel,
  OperationalMapPointMarker,
  OperationalMapPolygon,
} from "./operational-map-model";

interface MarkerEntry<T> {
  readonly marker: GoogleAdvancedMarker;
  readonly content: HTMLElement;
  descriptor: T;
}

interface PolygonEntry {
  readonly polygon: GoogleMapPolygon;
  descriptor: OperationalMapPolygon;
}

export interface OperationalMapCameraSnapshot {
  readonly center: GeoCenter;
  readonly zoom: number;
}

export interface OperationalGoogleMapRuntime {
  readonly sync: (model: OperationalMapModel, refit: boolean) => void;
  readonly snapshotCamera: () => OperationalMapCameraSnapshot | null;
  readonly destroy: () => void;
}

function ignoreProviderFailure(action: () => void) {
  try {
    action();
  } catch {
    // Teardown is best-effort after a provider/runtime failure.
  }
}

function liveContent(value: OperationalMapLiveMarker, existing?: HTMLElement) {
  const node = existing ?? document.createElement("span");
  node.className = "vaylet-operational-live-marker";
  node.dataset.freshness = value.state;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", value.label);
  node.title = value.label;
  return node;
}

function pointContent(value: OperationalMapPointMarker, existing?: HTMLElement) {
  const node = existing ?? document.createElement("span");
  node.className = "vaylet-operational-point-marker";
  node.dataset.active = String(value.active);
  node.dataset.kind = value.kind;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", value.label);
  node.title = value.label;
  return node;
}

function polygonOptions(value: OperationalMapPolygon) {
  const restricted = value.purpose === "RESTRICTED";
  const activeStroke = restricted ? "#dc2626" : "#1e60f0";
  const activeFill = restricted ? "#dc2626" : "#1e60f0";
  const purposeOpacity = value.purpose === "OVERFLOW"
    ? 0.06
    : value.purpose === "STAGING"
      ? 0.08
      : 0.1;
  return {
    paths: value.path,
    clickable: false,
    strokeColor: value.active ? activeStroke : "#94a3b8",
    strokeOpacity: value.active ? 0.9 : 0.7,
    strokeWeight: value.active ? 2 : 1.5,
    fillColor: value.active ? activeFill : "#94a3b8",
    fillOpacity: value.active ? purposeOpacity : 0.035,
  };
}

function reconcileMarkers<T extends { readonly rendererKey: string; readonly position: GeoCenter; readonly label: string }>(
  sdk: GoogleMapsSdk,
  map: InstanceType<GoogleMapsSdk["Map"]>,
  current: Map<string, MarkerEntry<T>>,
  next: readonly T[],
  content: (value: T, existing?: HTMLElement) => HTMLElement,
) {
  const keep = new Set(next.map((value) => value.rendererKey));
  for (const [key, entry] of current) {
    if (keep.has(key)) continue;
    entry.marker.map = null;
    sdk.event.clearInstanceListeners(entry.marker);
    current.delete(key);
  }
  for (const value of next) {
    const existing = current.get(value.rendererKey);
    if (existing) {
      content(value, existing.content);
      existing.marker.position = value.position;
      existing.marker.title = value.label;
      existing.descriptor = value;
      continue;
    }
    const markerContent = content(value);
    const marker = new sdk.marker.AdvancedMarkerElement({
      map,
      position: value.position,
      content: markerContent,
      title: value.label,
    });
    current.set(value.rendererKey, { marker, content: markerContent, descriptor: value });
  }
}

function reconcilePolygons(
  sdk: GoogleMapsSdk,
  map: InstanceType<GoogleMapsSdk["Map"]>,
  current: Map<string, PolygonEntry>,
  next: readonly OperationalMapPolygon[],
) {
  const keep = new Set(next.map((value) => value.rendererKey));
  for (const [key, entry] of current) {
    if (keep.has(key)) continue;
    entry.polygon.setMap(null);
    sdk.event.clearInstanceListeners(entry.polygon);
    current.delete(key);
  }
  for (const value of next) {
    const existing = current.get(value.rendererKey);
    if (existing) {
      existing.polygon.setOptions(polygonOptions(value));
      existing.descriptor = value;
      continue;
    }
    const polygon = new sdk.Polygon({ map, ...polygonOptions(value) });
    current.set(value.rendererKey, { polygon, descriptor: value });
  }
}

export function createOperationalGoogleMapRuntime(input: {
  readonly sdk: GoogleMapsSdk;
  readonly node: HTMLElement;
  readonly mapId: string;
  readonly theme: "light" | "dark";
  readonly camera?: OperationalMapCameraSnapshot | null;
}): OperationalGoogleMapRuntime {
  const { sdk, node } = input;
  const map = new sdk.Map(node, {
    center: input.camera?.center ?? { lat: 0, lng: 0 },
    zoom: input.camera?.zoom ?? 2,
    mapId: input.mapId,
    colorScheme: input.theme === "dark" ? "DARK" : "LIGHT",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: "cooperative",
    keyboardShortcuts: true,
    zoomControl: true,
  });
  const live = new Map<string, MarkerEntry<OperationalMapLiveMarker>>();
  const points = new Map<string, MarkerEntry<OperationalMapPointMarker>>();
  const polygons = new Map<string, PolygonEntry>();
  let destroyed = false;

  function fit(model: OperationalMapModel) {
    if (model.camera.kind === "BOUNDS") {
      const bounds = new sdk.LatLngBounds();
      bounds.extend({ lat: model.camera.south, lng: model.camera.west });
      bounds.extend({ lat: model.camera.north, lng: model.camera.east });
      map.fitBounds(bounds, node.clientWidth <= 640 ? 28 : 40);
      const zoom = map.getZoom();
      if (zoom !== undefined && zoom > 19) map.setZoom(19);
      return;
    }
    map.setCenter(model.camera.center);
    map.setZoom(model.camera.zoom);
  }

  function sync(model: OperationalMapModel, refit: boolean) {
    if (destroyed) return;
    reconcileMarkers(sdk, map, live, model.liveMarkers, liveContent);
    reconcileMarkers(sdk, map, points, model.pointMarkers, pointContent);
    reconcilePolygons(sdk, map, polygons, model.polygons);
    if (refit) fit(model);
  }

  function snapshotCamera(): OperationalMapCameraSnapshot | null {
    if (destroyed) return null;
    try {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (!center || zoom === undefined) return null;
      return { center: { lat: center.lat(), lng: center.lng() }, zoom };
    } catch {
      return null;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const entry of [...live.values(), ...points.values()]) {
      ignoreProviderFailure(() => { entry.marker.map = null; });
      ignoreProviderFailure(() => sdk.event.clearInstanceListeners(entry.marker));
    }
    for (const entry of polygons.values()) {
      ignoreProviderFailure(() => entry.polygon.setMap(null));
      ignoreProviderFailure(() => sdk.event.clearInstanceListeners(entry.polygon));
    }
    ignoreProviderFailure(() => sdk.event.clearInstanceListeners(map));
    live.clear();
    points.clear();
    polygons.clear();
    node.replaceChildren();
  }

  return { sync, snapshotCamera, destroy };
}
