import type { DashboardLocale } from "../i18n/locale";

export interface GeoCenter {
  readonly lat: number;
  readonly lng: number;
}

export interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

export interface GoogleMapsListener {
  remove(): void;
}

export interface GoogleMap {
  panTo(center: GeoCenter): void;
  setCenter(center: GeoCenter): void;
  getCenter(): GoogleLatLng | undefined;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  fitBounds(
    bounds: GoogleLatLngBounds,
    padding?: number | { top: number; right: number; bottom: number; left: number },
  ): void;
  addListener(
    name: string,
    callback: (event: { latLng?: GoogleLatLng }) => void,
  ): GoogleMapsListener;
}

export interface GoogleMapCircle {
  setCenter(center: GeoCenter): void;
  setRadius(radius: number): void;
  setMap(map: GoogleMap | null): void;
}

export interface GoogleMapPolygon {
  setMap(map: GoogleMap | null): void;
  setOptions(options: Record<string, unknown>): void;
}

export interface GoogleLatLngBounds {
  extend(center: GeoCenter): GoogleLatLngBounds;
  isEmpty(): boolean;
}

export interface GoogleAdvancedMarker {
  position: GeoCenter | null;
  map: GoogleMap | null;
  content?: Node | null;
  title?: string;
}

export interface GoogleAdvancedMarkerOptions {
  map?: GoogleMap | null;
  position?: GeoCenter | null;
  content?: Node | null;
  title?: string;
}

export interface GoogleMapsSdk {
  Map: new (node: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Circle: new (options: Record<string, unknown>) => GoogleMapCircle;
  Polygon: new (options: Record<string, unknown>) => GoogleMapPolygon;
  LatLngBounds: new () => GoogleLatLngBounds;
  marker: {
    AdvancedMarkerElement: new (
      options: GoogleAdvancedMarkerOptions,
    ) => GoogleAdvancedMarker;
  };
  event: { clearInstanceListeners(instance: object): void };
}

type GoogleWindow = Window & {
  google?: { maps: GoogleMapsSdk };
  vayletGoogleMapsCallbacks?: Record<string, (() => void) | undefined>;
  gm_authFailure?: () => void;
};

let loading: Promise<GoogleMapsSdk> | null = null;
let authFailed = false;
let generation = 0;
let language: DashboardLocale | null = null;
let currentLoadFailure: (() => void) | null = null;
let authBridgeInstalled = false;
const failures = new Set<() => void>();

export function googleMapsLanguage() {
  return language;
}

export function onGoogleMapsFailure(callback: () => void) {
  failures.add(callback);
  return () => {
    failures.delete(callback);
  };
}

function ensureAuthFailureBridge(host: GoogleWindow) {
  if (authBridgeInstalled) return;
  const priorAuthFailure = host.gm_authFailure;
  host.gm_authFailure = () => {
    authFailed = true;
    currentLoadFailure?.();
    for (const callback of failures) callback();
    priorAuthFailure?.();
  };
  authBridgeInstalled = true;
}

/** Official direct async loading shared by Dashboard Google map surfaces. */
export function loadGoogleMapsSdk(
  key: string,
  locale?: DashboardLocale,
): Promise<GoogleMapsSdk> {
  if (!key.trim()) return Promise.reject(new Error("Map unavailable"));
  const host = window as GoogleWindow;
  ensureAuthFailureBridge(host);
  if (authFailed) return Promise.reject(new Error("Map unavailable"));
  if (loading) return loading;
  if (host.google?.maps.marker) return Promise.resolve(host.google.maps);
  const requestedLanguage =
    locale ?? (document.documentElement?.lang === "ar" ? "ar" : "en");
  loading = new Promise((resolve, reject) => {
    const callbackName = `ready${++generation}`;
    const callback = `vayletGoogleMapsCallbacks.${callbackName}`;
    const callbacks = (host.vayletGoogleMapsCallbacks ??= {});
    let settled = false;
    const script = document.createElement("script");
    const timer = setTimeout(fail, 15000);
    function retireLoad() {
      if (currentLoadFailure === fail) currentLoadFailure = null;
    }
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      delete callbacks[callbackName];
      retireLoad();
      loading = null;
      reject(new Error("Map unavailable"));
    }
    currentLoadFailure = fail;
    callbacks[callbackName] = () => {
      if (settled) return;
      clearTimeout(timer);
      if (authFailed || !host.google?.maps.marker) {
        fail();
        return;
      }
      settled = true;
      delete callbacks[callbackName];
      retireLoad();
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
