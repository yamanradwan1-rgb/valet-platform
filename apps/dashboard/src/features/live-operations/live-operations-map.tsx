"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import {
  supportsMarkers,
  type MapInitOptions,
  type MapInstance,
  type MapMarkerDescriptor,
} from "../../lib/maps/map-provider";
import {
  computeMapViewport,
  type MapViewport,
} from "../../lib/maps/map-viewport";

type MapStatus = "loading" | "ready" | "failed" | "unsupported";

interface LiveOperationsMapProps {
  /** Provider-neutral drafts; aria labels are resolved here, localized. */
  markers: readonly Omit<MapMarkerDescriptor, "ariaLabel">[];
  /** Composes the localized accessible name for one marker draft. */
  describeMarker: (marker: Omit<MapMarkerDescriptor, "ariaLabel">) => string;
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  /**
   * Authority-scope key. When this value changes the map is destroyed
   * and a fresh instance is initialized from the next marker snapshot.
   * Server authorization remains authoritative; this is purely a
   * client-side viewport-reset signal.
   */
  locationId: string;
}

/**
 * World-only fallback used when the snapshot is empty at mount time. NOT
 * a Location center — it is the natural no-bias view so subsequent
 * snapshots can establish the viewport from real coordinates when they
 * arrive. The empty-state overlay above the canvas is the honest UX.
 */
const NO_GEOMETRY_CENTER = { latitude: 0, longitude: 0 } as const;
const NO_GEOMETRY_ZOOM = 1;

/**
 * Live Operations map panel.
 *
 * The initial viewport is derived from the first non-empty marker snapshot
 * (D6-004). After that, marker updates render in place WITHOUT re-panning
 * the manager's manual viewport. Location changes force a fresh
 * initialization through the `locationId` key.
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
  const instanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const { t } = useTranslation();

  // Stable select callback identity keeps map init effects free of churn.
  const selectRef = useRef(onSelectMarker);
  useEffect(() => {
    selectRef.current = onSelectMarker;
  }, [onSelectMarker]);

  // Frozen initial viewport for the current location. We compute it once
  // from the FIRST non-empty snapshot, or fall back to a world-only
  // default. The view is then owned by the manager's panning/zooming; we
  // never re-derive it on later marker updates.
  const initialViewport = useMemo<MapViewport>(() => {
    const fromGeometry = computeMapViewport({ points: markers, polygons: [] });
    if (fromGeometry !== null) return fromGeometry;
    return { center: NO_GEOMETRY_CENTER, zoom: NO_GEOMETRY_ZOOM };
    // The viewport is bound to the location, not to later snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;
    setStatus("loading");
    const adapter = createActiveMapProvider();
    const initOptions: MapInitOptions = {
      center: initialViewport.center,
      onSelectMarker: (id) => selectRef.current(id),
      zoom: initialViewport.zoom,
    };
    adapter.createMap(container, initOptions).then((instance) => {
      if (cancelled) {
        instance.destroy();
        return;
      }
      instanceRef.current = instance;
      setStatus(supportsMarkers(instance) ? "ready" : "unsupported");
    }).catch(() => {
      if (!cancelled) setStatus("failed");
    });
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [initialViewport, locationId]);

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
