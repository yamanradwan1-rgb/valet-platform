"use client";

import { useEffect, useRef, useState } from "react";

import { DEV_MAP_CENTER, DEV_MAP_ZOOM } from "../../lib/app-config";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import type { MapInitOptions, MapInstance } from "../../lib/maps/map-provider";
import { useTranslation } from "../../i18n/locale-provider";

type MapStatus = "loading" | "ready" | "failed";

interface MapContainerProps {
  center?: MapInitOptions["center"];
  zoom?: number;
  ariaLabel?: string;
}

/**
 * React boundary over the MapProvider abstraction. Domain components render
 * this container and never touch a provider SDK directly.
 */
export function MapContainer({
  center = DEV_MAP_CENTER,
  zoom = DEV_MAP_ZOOM,
  ariaLabel,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const { t } = useTranslation();
  const latitude = center.latitude;
  const longitude = center.longitude;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;
    setStatus("loading");
    const adapter = createActiveMapProvider();
    adapter
      .createMap(container, {
        center: { latitude, longitude },
        zoom,
      })
      .then((instance) => {
        if (cancelled) {
          instance.destroy();
          return;
        }
        instanceRef.current = instance;
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
    // Provider re-initialization is intentionally tied to explicit inputs.
  }, [latitude, longitude, zoom]);

  return (
    <div
      className="map-container"
      aria-label={ariaLabel ?? t("map.smokeTitle")}
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
