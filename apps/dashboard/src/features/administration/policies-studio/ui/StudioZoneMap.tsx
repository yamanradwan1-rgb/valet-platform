"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../../../components/presentation/button";
import {
  googleMapsLanguage,
  loadGoogleMapsSdk,
  onGoogleMapsFailure,
} from "../../../../lib/maps/google-maps-sdk";
import type { DashboardTheme } from "../../../../lib/theme/theme";
import { presenceCopy } from "../../settings/shift-presence-copy";
import { attendanceZoneBoundPoints } from "../../settings/attendance-zone-bounds";
import {
  createStudioZoneMapRuntime,
  type StudioZoneMapRuntime,
  type StudioZoneMapSnapshot,
} from "./studio-zone-map-runtime";

type Props = StudioZoneMapSnapshot & {
  readonly theme: DashboardTheme;
  readonly scopeIdentity: string;
};

export function StudioZoneMap(props: Props) {
  return <ZoneMap key={`${props.scopeIdentity}:${props.theme}`} {...props} />;
}

function ZoneMap(props: Props) {
  const node = useRef<HTMLDivElement>(null);
  const runtime = useRef<StudioZoneMapRuntime | null>(null);
  const current = useRef(props);
  const fail = useRef<() => void>(() => undefined);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [sdkLocale, setSdkLocale] = useState<"en" | "ar" | null>(null);
  const ar = props.locale === "ar";
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  useLayoutEffect(() => {
    current.current = props;
    try {
      runtime.current?.sync(props);
    } catch {
      fail.current();
    }
  }, [props]);
  useLayoutEffect(() => {
    let retired = false;
    let failed = false;
    let live: StudioZoneMapRuntime | null = null;
    const container = node.current;
    const timer = setTimeout(() => failure(), 20000);
    function failure() {
      if (retired || failed) return;
      failed = true;
      clearTimeout(timer);
      live?.destroy();
      runtime.current = null;
      container?.replaceChildren();
      setStatus("failed");
    }
    fail.current = failure;
    const unsubscribe = onGoogleMapsFailure(failure);
    void loadGoogleMapsSdk(key, current.current.locale).then((sdk) => {
      if (retired || failed || !container) return;
      try {
        live = createStudioZoneMapRuntime({
          sdk,
          node: container,
          theme: current.current.theme,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          onTilesLoaded: () => {
            if (retired || failed) return;
            clearTimeout(timer);
            setStatus("ready");
          },
        });
        runtime.current = live;
        live.sync(current.current);
        setSdkLocale(googleMapsLanguage());
      } catch {
        failure();
      }
    }, failure);
    return () => {
      retired = true;
      clearTimeout(timer);
      unsubscribe();
      live?.destroy();
      runtime.current = null;
      container?.replaceChildren();
    };
  }, [attempt, key, props.theme, props.scopeIdentity]);
  return (
    <section
      className="ps-zone-map"
      aria-label={ar ? "خريطة مناطق الحضور" : "Attendance zones map"}
    >
      <div className="ps-map-caption">
        <span>
          {ar
            ? "خريطة Google · دوائر بنصف القطر الفعلي"
            : "Google Maps · circles use actual meter radii"}
        </span>
        <span>
          {ar ? "المناطق المحفوظة" : "Saved zones"}: {props.zones.length}
        </span>
      </div>
      <div
        className="ps-map-canvas"
        dir="ltr"
        ref={node}
        hidden={status === "failed"}
        aria-busy={status === "loading"}
        aria-label={
          ar
            ? "خريطة Google التفاعلية. يمكن إدخال الإحداثيات من الحقول أدناه."
            : "Interactive Google map. Coordinates can also be entered in the fields below."
        }
      />
      {status === "loading" && (
        <p role="status">
          {ar ? "جارٍ تحميل خريطة Google" : "Loading Google Maps"}
        </p>
      )}
      {status === "failed" && (
        <div className="ps-map-feedback" role="alert">
          <p>
            {!key.trim()
              ? ar
                ? "خريطة Google غير مهيأة. تواصل مع المسؤول؛ تبقى الإحداثيات اليدوية متاحة."
                : "Google Maps is not configured. Contact your administrator; manual coordinates remain available."
              : ar
                ? "تعذّر تحميل خريطة Google. تحقق من الاتصال وإعدادات السماح بالخريطة. تبقى المسودة والإحداثيات اليدوية متاحة."
                : "Google Maps could not load. Check the connection and map access configuration. Your draft and manual coordinates remain available."}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      )}
      {!props.zones.length && !props.draft && (
        <p>
          {ar
            ? "لا توجد مناطق محفوظة. تبدأ الخريطة بعرض العالم عند تحميلها، دون افتراض مركز لهذا الموقع."
            : "No saved zones. The map will start with a world view; no Location center is assumed."}
        </p>
      )}
      {props.draft && (
        <p>
          {ar
            ? "اختر موقعًا فعليًا على الخريطة أو أدخل الإحداثيات، ثم اضبط نصف القطر وراجع القيم واضغط حفظ. الاختيار لا يحفظ."
            : "Choose a real position on the map or enter coordinates, adjust the radius, verify the values, then Save. Map selection does not save."}
        </p>
      )}
      {props.draft &&
        !attendanceZoneBoundPoints({
          ...props.draft,
          radiusMeters: props.draft.radius,
        }).length && (
          <p role="status">
            {ar
              ? "أدخل إحداثيات صالحة ونصف قطر من 5 إلى 1000 متر لإظهار المسودة."
              : "Enter valid coordinates and a radius from 5 to 1000 meters to display the draft."}
          </p>
        )}
      <div className="ps-map-legend">
        <span className="ps-map-legend-active">
          {ar ? "محفوظة · نشطة" : "Saved · Active"}
        </span>
        <span className="ps-map-legend-disabled">
          {ar ? "محفوظة · معطّلة" : "Saved · Disabled"}
        </span>
        {props.draft && (
          <span className="ps-map-legend-draft">
            {ar ? "مسودة غير محفوظة" : "Unsaved draft"}
          </span>
        )}
      </div>
      {status === "ready" && sdkLocale !== props.locale && (
        <p role="status">{presenceCopy(props.locale)("mapLanguageReload")}</p>
      )}
    </section>
  );
}
