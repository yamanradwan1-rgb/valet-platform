"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DEV_MAP_CENTER, DEV_MAP_ZOOM } from "../../lib/app-config";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import {
  supportsMarkers,
  type MapInstance,
  type MapMarkerDescriptor,
} from "../../lib/maps/map-provider";
import { useTranslation } from "../../i18n/locale-provider";

type MapStatus = "loading" | "ready" | "failed" | "unsupported";

interface LiveOperationsMapProps {
  /** Provider-neutral drafts; aria labels are resolved here, localized. */
  markers: readonly Omit<MapMarkerDescriptor, "ariaLabel">[];
  /** Composes the localized accessible name for one marker draft. */
  describeMarker: (marker: Omit<MapMarkerDescriptor, "ariaLabel">) => string;
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
}

/**
 * Live Operations map panel.
 *
 * Feature-owned boundary over the MapProvider abstraction so the shared smoke
 * MapContainer stays untouched during parallel D3-002 work. The component
 * depends only on the provider interface; all MapLibre specifics live in the
 * adapter behind `createActiveMapProvider()`.
 *
 * Markers are rendered exclusively from backend-reported coordinates passed
 * via `markers`; when the list is empty no marker exists on the map.
 */
export function LiveOperationsMap({
  markers,
  describeMarker,
  selectedMarkerId,
  onSelectMarker,
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

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;
    setStatus("loading");
    const adapter = createActiveMapProvider();
    adapter
      .createMap(container, {
        center: DEV_MAP_CENTER,
        zoom: DEV_MAP_ZOOM,
        onSelectMarker: (id) => selectRef.current(id),
      })
      .then((instance) => {
        if (cancelled) {
          instance.destroy();
          return;
        }
        instanceRef.current = instance;
        setStatus(supportsMarkers(instance) ? "ready" : "unsupported");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
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
