"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import {
  supportsMarkers,
  type MapInstance,
  type MapInitOptions,
  type MapMarkerDescriptor,
} from "../../lib/maps/map-provider";
import { createMapController } from "../../lib/maps/map-lifecycle";
import { computeMapViewport } from "../../lib/maps/map-viewport";

type MapStatus = "loading" | "ready" | "failed" | "unsupported";

interface LiveOperationsMapProps {
  /** Provider-neutral drafts; aria labels are resolved here, localized. */
  markers: readonly Omit<MapMarkerDescriptor, "ariaLabel">[];
  /** Composes the localized accessible name for one marker draft. */
  describeMarker: (marker: Omit<MapMarkerDescriptor, "ariaLabel">) => string;
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  /**
   * Authority-scope key. When this value changes the established
   * viewport is cleared and a fresh instance is initialized from the
   * next non-empty marker snapshot. Server authorization remains
   * authoritative; this is purely a client-side viewport-reset signal.
   */
  locationId: string;
}

/**
 * World-only fallback used when the snapshot is empty. NOT a Location
 * center — it is the natural no-bias view so subsequent snapshots can
 * establish the viewport from real coordinates when they arrive. The
 * empty-state overlay above the canvas is the honest UX.
 */
const NO_GEOMETRY_CENTER = { latitude: 0, longitude: 0 } as const;
const NO_GEOMETRY_ZOOM = 1;

/** See setup-map.tsx for the rationale behind quantization. */
function quantize(value: number): string {
  return value.toFixed(6);
}

function hasPositionedMarker(
  markers: readonly Omit<MapMarkerDescriptor, "ariaLabel">[],
): boolean {
  for (const marker of markers) {
    if (
      Number.isFinite(marker.latitude) &&
      Number.isFinite(marker.longitude) &&
      marker.latitude >= -90 &&
      marker.latitude <= 90 &&
      marker.longitude >= -180 &&
      marker.longitude <= 180
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Live Operations map panel.
 *
 * The authoritative viewport is established ONCE per Location, from the
 * first non-empty valid marker snapshot. Before the first snapshot
 * arrives the map mounts at a world-only fallback; after establishment
 * the viewport is frozen and later marker updates render in place WITHOUT
 * re-panning the manager's manual viewport. Location changes clear the
 * established viewport and force a fresh instance.
 *
 * Markers are rendered exclusively from backend-reported coordinates
 * passed via `markers`; when the list is empty no marker exists on the
 * map and the existing empty-state overlay is shown.
 */
export function LiveOperationsMap({
  markers,
  describeMarker,
  selectedMarkerId,
  onSelectMarker,
  locationId,
}: LiveOperationsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createMapController> | null>(
    null,
  );
  const instanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const { t } = useTranslation();

  // Stable select callback identity keeps map init effects free of churn.
  const selectRef = useRef(onSelectMarker);
  useEffect(() => {
    selectRef.current = onSelectMarker;
  }, [onSelectMarker]);

  // The authoritative viewport is keyed by `locationId`. A Location
  // switch naturally resolves a fresh viewport because the state entry
  // for the new id is independent. We track which locationIds have
  // already established their viewport, and use a paired Map to remember
  // the established viewport per Location.
  type ViewportSnapshot = {
    readonly center: { readonly latitude: number; readonly longitude: number };
    readonly zoom: number;
  };
  const [establishedViewports, setEstablishedViewports] = useState<
    ReadonlyMap<string, ViewportSnapshot>
  >(() => new Map());

  // The current Location's authoritative viewport, derived from state.
  // `undefined` means "not yet established for this Location" — either
  // the snapshot is still empty/loading, or we just switched to it.
  const currentEstablished = establishedViewports.get(locationId);

  // On a Location change, when a non-empty valid marker snapshot is
  // present, derive the viewport and remember it for this Location.
  // Markers are read here in render (not in an effect) so the first
  // snapshot taken AFTER the Location change immediately establishes
  // the viewport without an intermediate effect cycle.
  if (
    currentEstablished === undefined &&
    hasPositionedMarker(markers)
  ) {
    const derived = computeMapViewport({ points: markers, polygons: [] });
    if (derived !== null) {
      const next = new Map(establishedViewports);
      next.set(locationId, { center: derived.center, zoom: derived.zoom });
      // Schedule the state update; React's "adjust state during render"
      // pattern is the documented way to derive state from props.
      setEstablishedViewports(next);
    }
  }

  const activeCenter = currentEstablished?.center ?? NO_GEOMETRY_CENTER;
  const activeZoom = currentEstablished?.zoom ?? NO_GEOMETRY_ZOOM;
  const establishedFor = currentEstablished === undefined ? "pending" : "set";
  const viewportKey =
    `${locationId}|${establishedFor}|` +
    `${quantize(activeCenter.latitude)}|` +
    `${quantize(activeCenter.longitude)}|` +
    `${String(activeZoom)}`;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    if (controllerRef.current === null) {
      const adapter = createActiveMapProvider();
      controllerRef.current = createMapController({
        adapter,
        getContainer: () => containerRef.current,
      });
    }
    const controller = controllerRef.current;
    let cancelled = false;
    setStatus("loading");
    const initOptions: MapInitOptions = {
      center: activeCenter,
      onSelectMarker: (id) => selectRef.current(id),
      zoom: activeZoom,
    };
    controller
      .ensure(viewportKey, initOptions)
      .then((decision) => {
        if (cancelled) return;
        if (decision.kind === "noop-disposed") {
          setStatus("failed");
          return;
        }
        instanceRef.current = decision.instance;
        setStatus(supportsMarkers(decision.instance) ? "ready" : "unsupported");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportKey]);

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      instanceRef.current = null;
    };
  }, []);

  const descriptors = useMemo<readonly MapMarkerDescriptor[]>(
    () =>
      markers.map((marker) => ({ ...marker, ariaLabel: describeMarker(marker) })),
    [markers, describeMarker],
  );

  useEffect(() => {
    const instance = instanceRef.current;
    if (instance === null || !supportsMarkers(instance)) return;
    instance.replaceMarkers(descriptors);
  }, [descriptors, status]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (selectedMarkerId === null || instance === null) return;
    if (!supportsMarkers(instance)) return;
    instance.focusMarker(selectedMarkerId);
  }, [selectedMarkerId, status]);

  return (
    <div
      className="map-container"
      role="region"
      aria-label={t("liveOperations.map.title")}
    >
      <div ref={containerRef} className="map-canvas" />
      {status === "loading" && (
        <div className="map-overlay" role="status">
          {t("map.loading")}
        </div>
      )}
      {status === "failed" && (
        <div className="map-overlay is-error" role="alert">
          {t("map.failed")}
        </div>
      )}
      {status === "ready" && descriptors.length === 0 && (
        <div className="map-overlay" role="status">
          {t("liveOperations.map.emptyNoPositions")}
        </div>
      )}
      <div className="live-map-legend">
        <span className="live-map-legend-item">
          <span className="legend-dot is-live" aria-hidden="true" />
          {t("enum.freshness.LIVE")}
        </span>
        <span className="live-map-legend-item">
          <span className="legend-dot is-stale" aria-hidden="true" />
          {t("enum.freshness.STALE")}
        </span>
        <span className="live-map-legend-item">
          <span className="legend-glyph" aria-hidden="true">P</span>
          {t("enum.taskType.PARKING")}
        </span>
        <span className="live-map-legend-item">
          <span className="legend-glyph" aria-hidden="true">R</span>
          {t("enum.taskType.RETRIEVAL")}
        </span>
      </div>
    </div>
  );
}
