"use client";

import type {
  LiveOperationsMapResponse,
  LocationMapArea,
  LocationMapPoint,
} from "@valet/contracts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import {
  googleMapsLanguage,
  loadGoogleMapsSdk,
  onGoogleMapsFailure,
} from "../../../lib/maps/google-maps-sdk";
import type { DashboardTheme } from "../../../lib/theme/theme";
import { operationsCopy } from "../operations-copy";
import { CoordinateCanvas } from "./coordinate-canvas";
import { hasOperationalGoogleMapConfig } from "./operational-google-map-config";
import {
  recordOperationalMapCameraFit,
  shouldRefitOperationalMapCamera,
} from "./operational-map-camera-fit";
import {
  createOperationalGoogleMapRuntime,
  type OperationalGoogleMapRuntime,
} from "./operational-google-map-runtime";
import { projectOperationalMap } from "./operational-map-model";
import reference from "./maps-reference.module.css";

type LiveMapItem = LiveOperationsMapResponse["items"][number];

const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const googleMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "";

export function OperationalGoogleMap(props: {
  readonly areas: readonly LocationMapArea[];
  readonly cameraKey: string;
  readonly items: readonly LiveMapItem[];
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly points: readonly LocationMapPoint[];
  readonly theme: DashboardTheme;
  readonly timezone?: string | undefined;
}) {
  const t = operationsCopy(props.locale);
  const configured = hasOperationalGoogleMapConfig(googleApiKey, googleMapId);
  const node = useRef<HTMLDivElement>(null);
  const runtime = useRef<OperationalGoogleMapRuntime | null>(null);
  const fallbackCameraKey = useRef<string | null>(null);
  const initializedCameraKey = useRef<string | null>(null);
  const preservedCamera = useRef<{
    readonly key: string;
    readonly value: ReturnType<OperationalGoogleMapRuntime["snapshotCamera"]>;
  } | null>(null);
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [sdkLocale, setSdkLocale] = useState<DashboardLocale | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const model = useMemo(
    () => projectOperationalMap({
      items: props.items,
      points: props.points,
      areas: props.areas,
      locale: props.locale,
      timezone: props.timezone,
    }),
    [props.areas, props.items, props.locale, props.points, props.timezone],
  );
  const current = useRef({
    cameraKey: props.cameraKey,
    loading: props.loading,
    model,
    locale: props.locale,
    theme: props.theme,
  });
  useLayoutEffect(() => {
    current.current = {
      cameraKey: props.cameraKey,
      loading: props.loading,
      model,
      locale: props.locale,
      theme: props.theme,
    };
  }, [model, props.cameraKey, props.loading, props.locale, props.theme]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let disposed = false;
    const destroy = (preserve: boolean) => {
      const active = runtime.current;
      if (!active) return;
      if (preserve) {
        preservedCamera.current = {
          key: current.current.cameraKey,
          value: active.snapshotCamera(),
        };
      }
      active.destroy();
      runtime.current = null;
    };
    if (!configured) return () => { generation.current += 1; };
    const detachFailure = onGoogleMapsFailure(() => {
      if (disposed || currentGeneration !== generation.current) return;
      destroy(false);
      setStatus("failed");
    });
    void loadGoogleMapsSdk(googleApiKey, current.current.locale).then(
      (sdk) => {
        if (disposed || currentGeneration !== generation.current || !node.current) return;
        try {
          const saved = preservedCamera.current;
          const camera = saved?.key === current.current.cameraKey ? saved.value : null;
          const next = createOperationalGoogleMapRuntime({
            sdk,
            node: node.current,
            mapId: googleMapId,
            theme: current.current.theme,
            camera,
          });
          runtime.current = next;
          const refit =
            !current.current.loading &&
            shouldRefitOperationalMapCamera(
              current.current.model.camera,
              current.current.cameraKey,
              {
                fallbackCameraKey: fallbackCameraKey.current,
                usableCameraKey: initializedCameraKey.current,
              },
            );
          next.sync(current.current.model, refit);
          if (!current.current.loading && refit) {
            const fit = recordOperationalMapCameraFit(
              current.current.model.camera,
              current.current.cameraKey,
              {
                fallbackCameraKey: fallbackCameraKey.current,
                usableCameraKey: initializedCameraKey.current,
              },
            );
            fallbackCameraKey.current = fit.fallbackCameraKey;
            initializedCameraKey.current = fit.usableCameraKey;
          }
          preservedCamera.current = null;
          setSdkLocale(googleMapsLanguage());
          setStatus("ready");
        } catch {
          destroy(false);
          node.current?.replaceChildren();
          setStatus("failed");
        }
      },
      () => {
        if (!disposed && currentGeneration === generation.current) setStatus("failed");
      },
    );
    return () => {
      disposed = true;
      detachFailure();
      destroy(true);
    };
  }, [attempt, configured, props.theme]);

  useEffect(() => {
    const active = runtime.current;
    if (!active || status !== "ready") return;
    const refit =
      !props.loading &&
      shouldRefitOperationalMapCamera(model.camera, props.cameraKey, {
        fallbackCameraKey: fallbackCameraKey.current,
        usableCameraKey: initializedCameraKey.current,
      });
    try {
      active.sync(model, refit);
    } catch {
      if (refit) {
        preservedCamera.current = null;
      } else {
        preservedCamera.current = {
          key: props.cameraKey,
          value: active.snapshotCamera(),
        };
      }
      active.destroy();
      if (runtime.current === active) runtime.current = null;
      node.current?.replaceChildren();
      const failedGeneration = generation.current;
      queueMicrotask(() => {
        if (failedGeneration === generation.current && runtime.current === null) {
          setStatus("failed");
        }
      });
      return;
    }
    if (!props.loading && refit) {
      const fit = recordOperationalMapCameraFit(model.camera, props.cameraKey, {
        fallbackCameraKey: fallbackCameraKey.current,
        usableCameraKey: initializedCameraKey.current,
      });
      fallbackCameraKey.current = fit.fallbackCameraKey;
      initializedCameraKey.current = fit.usableCameraKey;
    }
  }, [model, props.cameraKey, props.loading, status]);

  const effectiveStatus = configured ? status : "failed";
  return (
    <div className={reference.mapViewport} data-testid="operational-google-map" dir="ltr">
      <div aria-label={t.googleMapAria} className={reference.googleMapHost} ref={node} />
      {effectiveStatus === "failed" ? (
        <div className={reference.providerFallback}>
          <CoordinateCanvas
            areas={props.areas}
            items={props.items}
            points={props.points}
            timezone={props.timezone}
          />
        </div>
      ) : null}
      {effectiveStatus === "loading" ? (
        <div className={reference.providerStatus} dir={props.locale === "ar" ? "rtl" : "ltr"} role="status">
          <span>{t.googleMapLoading}</span>
        </div>
      ) : null}
      {effectiveStatus === "failed" ? (
        <div className={reference.providerStatus} dir={props.locale === "ar" ? "rtl" : "ltr"} role="status">
          <span>{t.googleMapProviderUnavailable}</span>
          <button onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }} type="button">{t.retry}</button>
        </div>
      ) : null}
      {effectiveStatus === "ready" && sdkLocale !== props.locale ? (
        <div className={reference.providerStatus} dir={props.locale === "ar" ? "rtl" : "ltr"} role="status">
          <span>{t.googleMapLanguageReload}</span>
        </div>
      ) : null}
    </div>
  );
}
