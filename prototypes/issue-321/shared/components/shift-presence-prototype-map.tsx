import { useEffect, useRef, useState, type MouseEvent } from "react";
import { loadGoogleMapsSdk, onGoogleMapsFailure, type GoogleMapsSdk, type GoogleMap, type GoogleMapCircle, type GoogleAdvancedMarker }
  from "../../../../apps/dashboard/src/lib/maps/google-maps-sdk";
import type { PrototypeLocale, PrototypeTheme } from "../types/variant";
import { phrase, type Point, type Zone } from "./shift-presence-prototype-model";

const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";

/** Reuse the Dashboard's real Google Maps loader when a preview key is supplied.
 *  No VAYLET API calls; geographic map requests can disclose the viewed center
 *  to the map provider, as with the production map. */
function GooglePreview({ locale, theme, zones, point, radius, onPick }: {
  locale: PrototypeLocale; theme: PrototypeTheme; zones: readonly Zone[]; point?: Point | null; radius?: number; onPick?: (point: Point) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ sdk: GoogleMapsSdk; map: GoogleMap; overlays: (GoogleMapCircle | GoogleAdvancedMarker)[] } | null>(null);
  const pickRef = useRef(onPick);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  pickRef.current = onPick;
  useEffect(() => {
    if (!mapsKey || !container.current) return;
    let retired = false;
    const unsubscribe = onGoogleMapsFailure(() => setStatus("failed"));
    void loadGoogleMapsSdk(mapsKey, locale).then(sdk => {
      if (retired || !container.current) return;
      const map = new sdk.Map(container.current, {
        center: { lat: 0, lng: 0 }, zoom: 2,
        mapId: "DEMO_MAP_ID", mapTypeControl: false, streetViewControl: false,
        fullscreenControl: false, gestureHandling: "cooperative",
        colorScheme: theme === "dark" ? "DARK" : "LIGHT", clickableIcons: false,
      });
      map.addListener("click", event => {
        if (event.latLng && pickRef.current) pickRef.current({ lat: Number(event.latLng.lat().toFixed(6)), lng: Number(event.latLng.lng().toFixed(6)) });
      });
      runtime.current = { sdk, map, overlays: [] };
      setStatus("ready");
    }).catch(() => { if (!retired) setStatus("failed"); });
    return () => {
      retired = true; unsubscribe();
      const live = runtime.current;
      if (live) {
        live.overlays.forEach(overlay => { if ("setMap" in overlay) overlay.setMap(null); else overlay.map = null; });
        live.sdk.event.clearInstanceListeners(live.map);
        runtime.current = null;
      }
    };
  }, [locale, theme]);
  useEffect(() => {
    const live = runtime.current;
    if (!live || status !== "ready") return;
    live.overlays.forEach(overlay => { if ("setMap" in overlay) overlay.setMap(null); else overlay.map = null; });
    live.overlays = [];
    for (const zone of zones) {
      const p = { lat: zone.lat, lng: zone.lng };
      live.overlays.push(new live.sdk.Circle({ map: live.map, center: p, radius: zone.radiusMeters,
        strokeColor: zone.state === "ACTIVE" ? "#1677c8" : "#6b7280", strokeOpacity: .85,
        fillColor: zone.state === "ACTIVE" ? "#1677c8" : "#6b7280", fillOpacity: .14 }));
      live.overlays.push(new live.sdk.marker.AdvancedMarkerElement({ map: live.map, position: p, title: zone.label }));
    }
    if (point) {
      live.overlays.push(new live.sdk.Circle({ map: live.map, center: point, radius: radius ?? 100,
        strokeColor: "#1677c8", strokeOpacity: 1, fillColor: "#1677c8", fillOpacity: .2 }));
      live.overlays.push(new live.sdk.marker.AdvancedMarkerElement({ map: live.map, position: point, title: "Prototype draft center" }));
      live.map.panTo(point);
    } else if (zones.length) {
      const bounds = new live.sdk.LatLngBounds();
      zones.forEach(zone => bounds.extend({ lat: zone.lat, lng: zone.lng }));
      live.map.fitBounds(bounds, 56);
    }
  }, [zones, point?.lat, point?.lng, radius, status]);
  if (!mapsKey) return null;
  return <div className="p321-google-preview" data-status={status}>
    <div ref={container} className="p321-geo-live-map" role="region" aria-label={phrase(locale,
      "Google map preview; use the accessible coordinate inputs for precise selection.",
      "معاينة خرائط Google؛ استخدم حقول الإحداثيات للتحديد الدقيق.")} />
    {status === "loading" && <p role="status">{phrase(locale, "Loading geographic map…", "جارٍ تحميل الخريطة الجغرافية…")}</p>}
    {status === "failed" && <p role="status">{phrase(locale,
      "Google map unavailable; offline coordinate preview and manual fields are below.",
      "خريطة Google غير متاحة؛ تظهر شبكة الإحداثيات المحلية والحقول اليدوية أدناه.")}</p>}
  </div>;
}
/**
 * Offline geographic interaction fixture. A real Google map is used by the
 * production component; this schematic never requests tiles or submits GPS.
 */
export function PrototypeMap({ locale, theme, zones, point, radius, onPick }: {
  locale: PrototypeLocale; theme: PrototypeTheme; zones: readonly Zone[]; point?: Point | null; radius?: number;
  onPick?: (point: Point) => void;
}) {
  const [focus, setFocus] = useState<Point>({ lat: 31.9539, lng: 35.9106 });
  const [zoom, setZoom] = useState(1);
  const base = point ?? (zones.length ? zones[0] : focus);
  const toMap = (p: Point) => ({
    x: 400 + (p.lng - base.lng) * 72000 * zoom,
    y: 220 - (p.lat - base.lat) * 72000 * zoom,
  });
  function choose(event: MouseEvent<SVGSVGElement>) {
    if (!onPick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 800;
    const y = ((event.clientY - rect.top) / rect.height) * 440;
    if (x < 0 || x > 800 || y < 0 || y > 440) return;
    onPick({ lat: Number((base.lat + (220 - y) / (72000 * zoom)).toFixed(6)),
      lng: Number((base.lng + (x - 400) / (72000 * zoom)).toFixed(6)) });
  }
  return <div className="p321-geo" dir="ltr">
    <GooglePreview locale={locale} theme={theme} zones={zones} point={point} radius={radius} onPick={onPick} />
    <div className="p321-geo-top">
      <span>{phrase(locale, "Interactive position preview · illustrative map", "معاينة تفاعلية للموقع · خريطة توضيحية")}</span>
      <div role="group" aria-label={phrase(locale, "Map zoom", "تكبير الخريطة")}>
        <button type="button" onClick={() => setZoom(v => Math.min(8, v * 1.5))} aria-label={phrase(locale, "Zoom in", "تكبير")}>+</button>
        <button type="button" onClick={() => setZoom(v => Math.max(.25, v / 1.5))} aria-label={phrase(locale, "Zoom out", "تصغير")}>−</button>
        <button type="button" onClick={() => { setFocus({ lat: 31.9539, lng: 35.9106 }); setZoom(1); }}
          aria-label={phrase(locale, "Reset map zoom", "إعادة ضبط الخريطة")}>↺</button>
      </div>
    </div>
    <svg className="p321-geo-canvas" viewBox="0 0 800 440" preserveAspectRatio="none"
      role="img" aria-label={phrase(locale,
        onPick ? "Illustrative coordinate grid. Click to propose attendance zone center; latitude and longitude fields are also editable." : "Illustrative saved attendance zones on an offline coordinate grid.",
        onPick ? "شبكة إحداثيات توضيحية. انقر لتحديد مركز منطقة الحضور أو استخدم حقلي الإحداثيات." : "مناطق الحضور المحفوظة تجريبيًا على شبكة إحداثيات توضيحية.")}
      onClick={choose} style={{ cursor: onPick ? "crosshair" : "default" }}>
      <rect width="800" height="440" fill="var(--surface-soft)" />
      <g fill="var(--surface)" opacity=".85"><rect x="58" y="40" width="170" height="122" rx="20" /><rect x="265" y="40" width="192" height="96" rx="18" />
        <rect x="499" y="36" width="235" height="138" rx="24" /><rect x="35" y="250" width="226" height="150" rx="20" />
        <rect x="310" y="290" width="177" height="112" rx="20" /><rect x="544" y="270" width="201" height="138" rx="24" /></g>
      <g stroke="var(--border)" fill="none" opacity=".8" strokeWidth="13" strokeLinecap="round">
        <path d="M 0 190 H 800 M 278 0 V 440 M 515 0 V 440 M 0 35 L 800 420" />
      </g>
      <g stroke="var(--surface)" fill="none" strokeWidth="5" opacity=".72"><path d="M0 190H800M278 0V440M515 0V440M0 35L800 420" /></g>
      {zones.map(zone => {
        const p = toMap(zone);
        const r = Math.max(8, Math.min(180, zone.radiusMeters * .27 * zoom));
        return <g key={zone.id}><circle cx={p.x} cy={p.y} r={r} fill={zone.state === "ACTIVE" ? "var(--accent)" : "var(--muted)"}
          fillOpacity=".17" stroke={zone.state === "ACTIVE" ? "var(--accent)" : "var(--muted)"} strokeDasharray={zone.state === "ACTIVE" ? undefined : "8 6"} strokeWidth="2" />
          <circle cx={p.x} cy={p.y} r="7" fill="var(--accent)" stroke="var(--surface)" strokeWidth="3" /></g>;
      })}
      {point && (() => { const p = toMap(point); return <g><circle cx={p.x} cy={p.y} r={Math.max(10, Math.min(180, (radius ?? 100) * .27 * zoom))}
        fill="var(--accent)" fillOpacity=".16" stroke="var(--accent)" strokeWidth="3" /><path d={`M ${p.x} ${p.y - 17} a 17 17 0 1 1 -0.1 0 Z`}
        fill="var(--accent)" stroke="var(--surface)" strokeWidth="3" /><circle cx={p.x} cy={p.y - 17} r="5" fill="white" /></g>; })()}
      <path d="M400 10v14M393 17h14M400 416v14M393 423h14" stroke="var(--muted)" strokeWidth="2" />
    </svg>
    <div className="p321-geo-foot"><span>{phrase(locale, "Simulation only · no live map tiles or tracking", "محاكاة فقط · دون خرائط فعلية أو تتبّع")}</span>
      <bdi>{base.lat.toFixed(4)}, {base.lng.toFixed(4)}</bdi></div>
  </div>;
}
