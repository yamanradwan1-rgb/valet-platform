"use client";

import { useEffect, useRef, useState } from "react";

import { DEV_MAP_CENTER, DEV_MAP_ZOOM } from "../../lib/app-config";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import {
  asInteractiveMapInstance,
  type InteractiveMapInstance,
  type MapCenter,
  type MapClickHandler,
  type MapInitOptions,
  type MapMarkerDefinition,
  type MapPolygonDefinition,
} from "../../lib/maps/map-provider";
import { useTranslation } from "../../i18n/locale-provider";

type MapStatus = "loading" | "ready" | "failed";

interface SetupMapProps {
  readonly markers: readonly MapMarkerDefinition[];
  readonly polygons: readonly MapPolygonDefinition[];
  readonly onMapClick?: MapClickHandler | undefined;
  readonly ariaLabel: string;
}

/**
 * Feature-local interactive map surface for Map Setup.
 *
 * Depends only on the provider abstraction: markers/polygons are
 * provider-neutral definitions and clicks arrive as neutral MapClick values.
 * When the active adapter cannot render setup content the surface still mounts
 * honestly with its base tiles.
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
  const latitude = DEV_MAP_CENTER.latitude;
  const longitude = DEV_MAP_CENTER.longitude;
  const zoom = DEV_MAP_ZOOM;

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
    const center: MapCenter = { latitude, longitude };
    adapter
      .createMap(container, { center, zoom } satisfies MapInitOptions)
      .then((instance) => {
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
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // Definitions are pushed through dedicated effects; re-mounting is tied
    // to explicit viewport inputs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, zoom]);

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
    </div>
  );
}
