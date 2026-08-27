"use client";

import { useEffect, useRef, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import {
  asInteractiveMapInstance,
  type InteractiveMapInstance,
  type MapClickHandler,
  type MapInitOptions,
  type MapMarkerDefinition,
  type MapPolygonDefinition,
} from "../../lib/maps/map-provider";
import {
  computeMapViewport,
  type MapViewport,
} from "../../lib/maps/map-viewport";

type MapStatus = "loading" | "ready" | "failed";

interface SetupMapProps {
  readonly markers: readonly MapMarkerDefinition[];
  readonly polygons: readonly MapPolygonDefinition[];
  readonly onMapClick?: MapClickHandler | undefined;
  readonly ariaLabel: string;
}

/**
 * Provider-neutral, world-only fallback used when the selected Location
 * has no persisted geometry yet. This is NOT a Location center; it is
 * MapLibre's natural "no bias" view so the operator can still click the
 * map to establish the first point.
 */
const NO_GEOMETRY_CENTER = { latitude: 0, longitude: 0 } as const;
const NO_GEOMETRY_ZOOM = 1;

/**
 * Feature-local interactive map surface for Map Setup.
 *
 * The initial viewport is derived exclusively from the selected Location's
 * own authoritative geometry (D6-004). Fixed development coordinates are
 * not a production initial viewport. When no persisted geometry exists the
 * surface renders at a world-only default and the existing click handler
 * still establishes the first point.
 *
 * Depends only on the provider abstraction: markers/polygons are
 * provider-neutral definitions and clicks arrive as neutral MapClick
 * values. When the active adapter cannot render setup content the surface
 * still mounts honestly with its base tiles.
 */
export function SetupMap({
  markers,
  polygons,
  onMapClick,
  ariaLabel,
}: SetupMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<InteractiveMapInstance | null>(null);
  const clickRef = useRef<MapClickHandler | null>(onMapClick ?? null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const { t } = useTranslation();

  // Viewport is derived from the current markers and polygon vertices. It
  // is recomputed on every render, but the useEffect below keys the map
  // (re)initialization to the EXACT viewport object, so identical geometry
  // never churns the instance and a Location switch always rebuilds it.
  const viewport: MapViewport =
    computeMapViewport({ points: markers, polygons }) ?? {
      center: NO_GEOMETRY_CENTER,
      zoom: NO_GEOMETRY_ZOOM,
    };
  const hasGeometry =
    markers.length > 0 || polygons.some((p) => p.vertices.length > 0);

  useEffect(() => {
    clickRef.current = onMapClick ?? null;
  }, [onMapClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;
    setStatus("loading");
    instanceRef.current = null;
    const adapter = createActiveMapProvider();
    const initOptions: MapInitOptions = {
      center: viewport.center,
      zoom: viewport.zoom,
    };
    adapter.createMap(container, initOptions).then((instance) => {
      if (cancelled) {
        instance.destroy();
        return;
      }
      const interactive = asInteractiveMapInstance(instance);
      if (interactive === null) {
        instanceRef.current = null;
        setStatus("ready");
        return;
      }
      instanceRef.current = interactive;
      interactive.setMarkers([...markers]);
      interactive.setPolygons([...polygons]);
      interactive.setClickHandler((click) => {
        clickRef.current?.(click);
      });
      setStatus("ready");
    }).catch(() => {
      if (!cancelled) setStatus("failed");
    });
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // Marker/polygon pushes are handled by dedicated effects; viewport
    // identity is the only re-mount trigger so identical geometry never
    // rebuilds the underlying map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  useEffect(() => {
    instanceRef.current?.setMarkers([...markers]);
  }, [markers]);

  useEffect(() => {
    instanceRef.current?.setPolygons([...polygons]);
  }, [polygons]);

  return (
    <div
      className="map-container map-setup-map"
      role="region"
      aria-label={ariaLabel}
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
      {status === "ready" && !hasGeometry && (
        <div className="map-overlay" role="status">
          {t("mapSetup.noGeometryHint")}
        </div>
      )}
    </div>
  );
}
