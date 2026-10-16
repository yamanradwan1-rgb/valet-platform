"use client";

import { useEffect, useRef, useState } from "react";
import type { ShiftPresenceZone } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import type { DashboardTheme } from "../../../lib/theme/theme";
import {
  loadGoogleMapsSdk,
  onGoogleMapsFailure,
  type GoogleMapsSdk,
  type GoogleMap,
  type GoogleMapCircle,
  type GoogleAdvancedMarker,
} from "../../../lib/maps/google-maps-sdk";
import zoneStyles from "./attendance-zones-overview-map.module.css";

interface Overlay {
  circle: GoogleMapCircle;
  marker: GoogleAdvancedMarker;
}
interface Runtime {
  sdk: GoogleMapsSdk;
  map: GoogleMap;
  overlays: Overlay[];
}

/** Server-saved zones only. No geolocation, draft mutation or readiness inference. */
export function AttendanceZonesOverviewMap(props: {
  readonly zones: readonly ShiftPresenceZone[];
  readonly locale: DashboardLocale;
  readonly theme: DashboardTheme;
}) {
  const node = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [readyGeneration, setReadyGeneration] = useState(0);
  const ar = props.locale === "ar";
  useEffect(() => {
    let disposed = false;
    const container = node.current;
    const unsubscribe = onGoogleMapsFailure(() => {
      if (!disposed) setStatus("failed");
    });
    void loadGoogleMapsSdk(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
      props.locale,
    ).then(
      (sdk) => {
        if (disposed || !container) return;
        try {
          const map = new sdk.Map(container, {
            center: { lat: 0, lng: 0 },
            zoom: 2,
            mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
            colorScheme: props.theme === "dark" ? "DARK" : "LIGHT",
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            gestureHandling: "cooperative",
            keyboardShortcuts: true,
          });
          runtime.current = { sdk, map, overlays: [] };
          setStatus("ready");
          setReadyGeneration((value) => value + 1);
        } catch {
          setStatus("failed");
        }
      },
      () => {
        if (!disposed) setStatus("failed");
      },
    );
    return () => {
      disposed = true;
      unsubscribe();
      const live = runtime.current;
      if (live) {
        live.overlays.forEach(({ circle, marker }) => {
          circle.setMap(null);
          marker.map = null;
        });
        live.sdk.event.clearInstanceListeners(live.map);
        runtime.current = null;
      }
      container?.replaceChildren();
    };
  }, [attempt, props.theme, props.locale]);

  useEffect(() => {
    const live = runtime.current;
    if (!live || status !== "ready") return;
    live.overlays.forEach(({ circle, marker }) => {
      circle.setMap(null);
      marker.map = null;
    });
    const bounds = new live.sdk.LatLngBounds();
    live.overlays = props.zones.map((zone) => {
      const center = { lat: zone.latitude, lng: zone.longitude };
      bounds.extend(center);
      const active = zone.state === "ACTIVE";
      const circle = new live.sdk.Circle({
        map: live.map,
        center,
        radius: zone.radiusMeters,
        clickable: false,
        strokeColor: active ? "#2563eb" : "#64748b",
        fillColor: active ? "#2563eb" : "#64748b",
        fillOpacity: active ? 0.12 : 0.04,
        strokeOpacity: active ? 0.9 : 0.5,
        strokeWeight: 2,
      });
      const marker = new live.sdk.marker.AdvancedMarkerElement({
        map: live.map,
        position: center,
        title: `${zone.label} (${zone.radiusMeters} m)`,
      });
      return { circle, marker };
    });
    const first = props.zones[0];
    if (props.zones.length === 1 && first) {
      live.map.setCenter({
        lat: first.latitude,
        lng: first.longitude,
      });
      live.map.setZoom(17);
    } else if (props.zones.length > 1 && !bounds.isEmpty()) {
      live.map.fitBounds(bounds, 64);
    } else {
      live.map.setCenter({ lat: 0, lng: 0 });
      live.map.setZoom(2);
    }
  }, [props.zones, status, readyGeneration]);

  return (
    <section className={zoneStyles.mapSection} aria-label={ar ? "خريطة المناطق المحفوظة" : "Saved attendance zone map"}>
      <div
        className={zoneStyles.map}
        ref={node}
        role="img"
        aria-label={ar ? "خريطة Google لمناطق الحضور المحفوظة. القائمة النصية متاحة أسفل الخريطة." : "Google map of saved attendance zones. Use the accessible zone list below for details and editing."}
      />
      {status === "loading" ? (
        <p role="status">{ar ? "جارٍ تحميل خريطة Google" : "Loading Google Maps"}</p>
      ) : null}
      {status === "failed" ? (
        <p role="status">
          {ar ? "الخريطة غير متاحة؛ استخدم قائمة المناطق والإحداثيات اليدوية." : "Map unavailable. The zone list and manual coordinates remain available."}{" "}
          <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>
            {ar ? "إعادة المحاولة" : "Retry"}
          </button>
        </p>
      ) : null}
      <p className={zoneStyles.note}>
        {ar ? "تُعرض المناطق المحفوظة في صفحة النتائج الحالية فقط. كل دائرة تمثل نصف القطر الفعلي، دون تعقّب موظفين أو استنتاج الجاهزية." : "Showing authoritative saved zones on this results page. Circles use their actual radii; no employee tracking or readiness inference."}
      </p>
    </section>
  );
}
