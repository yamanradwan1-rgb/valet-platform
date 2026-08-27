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
import { createMapController } from "../../lib/maps/map-lifecycle";
import { computeMapViewport } from "../../lib/maps/map-viewport";

type MapStatus = "loading" | "ready" | "failed";

interface SetupMapProps {
  readonly locationId: string;
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
 * Quantize a coordinate to 6 decimal places (~11cm) so two semantically
 * equivalent geometries produce an identical viewport key string without
 * floating-point noise. The visible viewport is unaffected; this is purely
 * a stable-effect-dependency boundary.
 */
function quantize(value: number): string {
  return value.toFixed(6);
}

/**
 * Feature-local interactive map surface for Map Setup.
 *
 * The map instance is owned by a `MapController` keyed on a STABLE
 * viewport string (locationId + center + zoom + hasGeometry). Identical
 * geometry never recreates the map; an actual viewport change or a
 * Location switch does.
 *
 * The controller is testable in isolation; this component is a thin
 * React wrapper that wires the controller to the local container ref.
 *
 * Fixed development coordinates are not a production initial viewport.
 * When no persisted geometry exists the surface renders at a world-only
 * default and the existing click handler still establishes the first
 * point.
 */
export function SetupMap({
  locationId,
  markers,
  polygons,
  onMapClick,
  ariaLabel,
}: SetupMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createMapController> | null>(
    null,
  );
  const instanceRef = useRef<InteractiveMapInstance | null>(null);
  const clickRef = useRef<MapClickHandler | null>(onMapClick ?? null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const { t } = useTranslation();

  const hasGeometry =
    markers.length > 0 || polygons.some((p) => p.vertices.length > 0);

  const derivedViewport =
    computeMapViewport({ points: markers, polygons }) ?? null;
  const effectiveCenter = derivedViewport?.center ?? NO_GEOMETRY_CENTER;
  const effectiveZoom = derivedViewport?.zoom ?? NO_GEOMETRY_ZOOM;
  const viewportKey =
    `${locationId}|` +
    `${quantize(effectiveCenter.latitude)}|` +
    `${quantize(effectiveCenter.longitude)}|` +
    `${String(effectiveZoom)}|` +
    (hasGeometry ? "geom" : "empty");

  useEffect(() => {
    clickRef.current = onMapClick ?? null;
  }, [onMapClick]);

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
      center: effectiveCenter,
      zoom: effectiveZoom,
    };
    controller
      .ensure(viewportKey, initOptions)
      .then((decision) => {
        if (cancelled) return;
        if (decision.kind === "noop-disposed") {
          setStatus("failed");
          return;
        }
        const interactive = asInteractiveMapInstance(decision.instance);
        if (interactive === null) {
          instanceRef.current = null;
          setStatus("ready");
          return;
        }
        instanceRef.current = interactive;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
    // viewportKey is a stable string built from primitives + the
    // explicit locationId. Marker/polygon data is pushed through a
    // dedicated effect so a re-render with unchanged geometry never
    // recreates the underlying map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportKey]);

  // The controller is created once and disposed exactly on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (instanceRef.current === null) return;
    instanceRef.current.setMarkers([...markers]);
  }, [markers]);

  useEffect(() => {
    if (instanceRef.current === null) return;
    instanceRef.current.setPolygons([...polygons]);
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
