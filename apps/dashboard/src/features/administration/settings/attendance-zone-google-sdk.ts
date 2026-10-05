import type { DashboardLocale } from "../../../lib/i18n/locale";

export interface GeoCenter {
  readonly lat: number;
  readonly lng: number;
}
interface Listener {
  remove(): void;
}
interface GeographicMap {
  panTo(center: GeoCenter): void;
  addListener(
    name: "click",
    callback: (event: { latLng?: { lat(): number; lng(): number } }) => void,
  ): Listener;
}
interface MapCircle {
  setCenter(center: GeoCenter): void;
  setRadius(radius: number): void;
  setMap(map: GeographicMap | null): void;
}
interface CenterPin {
  position: GeoCenter | null;
  map: GeographicMap | null;
}
export interface AttendanceGoogleSdk {
  Map: new (
    node: HTMLElement,
    options: Record<string, unknown>,
  ) => GeographicMap;
  Circle: new (options: Record<string, unknown>) => MapCircle;
  marker: {
    AdvancedMarkerElement: new (options: Record<string, unknown>) => CenterPin;
  };
  event: { clearInstanceListeners(instance: object): void };
}
type GoogleWindow = Window & {
  google?: { maps: AttendanceGoogleSdk };
  vayletAttendanceCallbacks?: Record<string, (() => void) | undefined>;
  gm_authFailure?: () => void;
};
let loading: Promise<AttendanceGoogleSdk> | null = null;
let authFailed = false;
let generation = 0;
let language: DashboardLocale | null = null;
export function attendanceMapLanguage() {
  return language;
}
const failures = new Set<() => void>();
export function onAttendanceMapFailure(callback: () => void) {
  failures.add(callback);
  return () => {
    failures.delete(callback);
  };
}

/** Official direct async loading, once and only when a zone editor needs it. */
export function loadAttendanceGoogleSdk(
  key: string,
  locale?: DashboardLocale,
): Promise<AttendanceGoogleSdk> {
  if (!key.trim()) return Promise.reject(new Error("Map unavailable"));
  if (authFailed) return Promise.reject(new Error("Map unavailable"));
  const host = window as GoogleWindow;
  if (host.google?.maps.marker) return Promise.resolve(host.google.maps);
  if (loading) return loading;
  const requestedLanguage =
    locale ?? (document.documentElement?.lang === "ar" ? "ar" : "en");
  loading = new Promise((resolve, reject) => {
    const callbackName = `ready${++generation}`;
    const callback = `vayletAttendanceCallbacks.${callbackName}`;
    const callbacks = (host.vayletAttendanceCallbacks ??= {});
    let settled = false;
    const script = document.createElement("script");
    const priorAuthFailure = host.gm_authFailure;
    const timer = setTimeout(fail, 15000);
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      delete callbacks[callbackName];
      loading = null;
      reject(new Error("Map unavailable"));
    }
    host.gm_authFailure = () => {
      authFailed = true;
      fail();
      for (const callback of failures) callback();
      priorAuthFailure?.();
    };
    callbacks[callbackName] = () => {
      if (settled) return;
      clearTimeout(timer);
      if (authFailed || !host.google?.maps.marker) {
        fail();
        return;
      }
      settled = true;
      delete callbacks[callbackName];
      language = requestedLanguage;
      resolve(host.google.maps);
    };
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback,
      v: "quarterly",
      libraries: "marker",
      language: requestedLanguage,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = fail;
    script.nonce =
      document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
    document.head.append(script);
  });
  return loading;
}
