"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import type { DashboardTheme } from "../../../lib/theme/theme";
import { presenceCopy } from "./shift-presence-copy";
import { styles } from "../administration-ui";
import feature from "./shift-presence.module.css";
import {
  loadAttendanceGoogleSdk,
  attendanceMapLanguage,
  onAttendanceMapFailure,
  type AttendanceGoogleSdk,
  type GeoCenter,
} from "./attendance-zone-google-sdk";

interface MapRuntime {
  sdk: AttendanceGoogleSdk;
  map: InstanceType<AttendanceGoogleSdk["Map"]>;
  circle: InstanceType<AttendanceGoogleSdk["Circle"]>;
  pin: InstanceType<AttendanceGoogleSdk["marker"]["AdvancedMarkerElement"]>;
}
export function AttendanceZoneMap(props: {
  readonly center: GeoCenter | null;
  readonly radius: number | null;
  readonly disabled: boolean;
  readonly locale: DashboardLocale;
  readonly theme: DashboardTheme;
  readonly onCenter: (center: GeoCenter) => void;
}) {
  const t = presenceCopy(props.locale);
  const node = useRef<HTMLDivElement>(null);
  const runtime = useRef<MapRuntime | null>(null);
  const current = useRef(props);
  useLayoutEffect(() => {
    current.current = props;
  }, [props]);
  const [attempt, setAttempt] = useState(0);
  const [sdkLocale, setSdkLocale] = useState<DashboardLocale | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  useEffect(() => {
    let disposed = false;
    let teardown: (() => void) | undefined;
    const detachFailure = onAttendanceMapFailure(() => {
      if (!disposed) {
        teardown?.();
        setStatus("failed");
      }
    });
    void loadAttendanceGoogleSdk(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
      current.current.locale,
    ).then(
      (sdk) => {
        if (disposed || !node.current) return;
        try {
          const center = current.current.center;
          const map = new sdk.Map(node.current, {
            // World view is presentation only; no draft center is fabricated.
            center: center ?? { lat: 0, lng: 0 },
            zoom: center ? 17 : 2,
            mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
            colorScheme: current.current.theme === "dark" ? "DARK" : "LIGHT",
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            gestureHandling: "cooperative",
            keyboardShortcuts: true,
          });
          let pin: MapRuntime["pin"] | null = null;
          let circle: MapRuntime["circle"] | null = null;
          let click: ReturnType<MapRuntime["map"]["addListener"]> | null = null;
          teardown = () => {
            click?.remove();
            circle?.setMap(null);
            if (pin) pin.map = null;
            sdk.event.clearInstanceListeners(map);
            if (circle) sdk.event.clearInstanceListeners(circle);
            if (pin) sdk.event.clearInstanceListeners(pin);
            runtime.current = null;
            node.current?.replaceChildren();
          };
          pin = new sdk.marker.AdvancedMarkerElement({
            map: center ? map : null,
            position: center,
          });
          circle = new sdk.Circle({
            map: center && current.current.radius ? map : null,
            center: center ?? { lat: 0, lng: 0 },
            radius: current.current.radius ?? 0,
            clickable: false,
            strokeColor: "#1e60f0",
            strokeWeight: 2,
            fillColor: "#1e60f0",
            fillOpacity: 0.12,
          });
          click = map.addListener("click", (event) => {
            if (disposed || current.current.disabled || !event.latLng) return;
            current.current.onCenter({
              lat: event.latLng.lat(),
              lng: event.latLng.lng(),
            });
          });
          runtime.current = { sdk, map, circle, pin };
          setSdkLocale(attendanceMapLanguage());
          setStatus("ready");
        } catch {
          teardown?.();
          setStatus("failed");
        }
      },
      () => {
        if (!disposed) setStatus("failed");
      },
    );
    return () => {
      disposed = true;
      detachFailure();
      teardown?.();
    };
  }, [attempt, props.theme]);
  const latitude = props.center?.lat;
  const longitude = props.center?.lng;
  const radius = props.radius;
  useEffect(() => {
    const r = runtime.current;
    if (!r || status !== "ready") return;
    const center =
      latitude !== undefined && longitude !== undefined
        ? { lat: latitude, lng: longitude }
        : null;
    r.pin.position = center;
    r.pin.map = center ? r.map : null;
    if (center) {
      r.map.panTo(center);
      r.circle.setCenter(center);
    }
  }, [latitude, longitude, status]);
  useEffect(() => {
    const r = runtime.current;
    if (!r || status !== "ready") return;
    r.circle.setMap(
      latitude !== undefined && longitude !== undefined && radius
        ? r.map
        : null,
    );
    if (radius) r.circle.setRadius(radius);
  }, [latitude, longitude, radius, status]);
  return (
    <div dir="ltr" className={feature.mapRegion}>
      <div aria-label={t("map")} className={feature.map} ref={node} />
      {status === "loading" ? (
        <p className={styles.muted} role="status">
          {t("mapLoading")}
        </p>
      ) : null}
      {status === "failed" ? (
        <div className={styles.muted} role="status">
          {t("mapUnavailable")}{" "}
          <button
            className={styles.secondary}
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
            type="button"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}
      <p className={styles.muted} dir={props.locale === "ar" ? "rtl" : "ltr"}>
        {t("mapHelp")}
      </p>
      {status === "ready" && sdkLocale !== props.locale ? (
        <p
          role="status"
          className={styles.muted}
          dir={props.locale === "ar" ? "rtl" : "ltr"}
        >
          {t("mapLanguageReload")}
        </p>
      ) : null}
    </div>
  );
}
