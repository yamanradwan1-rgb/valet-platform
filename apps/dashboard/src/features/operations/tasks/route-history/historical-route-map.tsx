import { useEffect, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, Route } from "lucide-react";
import {
  googleMapsLanguage,
  loadGoogleMapsSdk,
  onGoogleMapsFailure,
} from "../../../../lib/maps/google-maps-sdk";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { useDashboardTheme } from "../../../../lib/theme/theme-provider";
import { operationsCopy } from "../../operations-copy";
import { styles } from "../../operations-ui";
import { createHistoricalGoogleRuntime } from "./historical-google-runtime";
import { routeCopy, sampleTime } from "./route-copy";
import type { Sample } from "./route-history-api";
import CoordinateRouteMap from "./route-map";
import s from "./route-history.module.css";

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "";
type Runtime = ReturnType<typeof createHistoricalGoogleRuntime>;

export function HistoricalRouteMap(props: {
  readonly samples: Sample[];
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly timezone: string;
}) {
  const { locale } = useDashboardLocale();
  const { theme } = useDashboardTheme();
  const t = routeCopy(locale);
  const node = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const selected = useRef(props.selected);
  useEffect(() => {
    selected.current = props.selected;
  }, [props.selected]);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const configured = Boolean(apiKey.trim() && mapId.trim());
  const effectiveStatus = configured ? status : "failed";
  useEffect(() => {
    let disposed = false;
    const destroy = () => {
      runtime.current?.destroy();
      runtime.current = null;
    };
    const fail = () => {
      if (!disposed) {
        destroy();
        setStatus("failed");
      }
    };
    if (!configured) return;
    const detach = onGoogleMapsFailure(fail);
    void loadGoogleMapsSdk(apiKey, locale).then((sdk) => {
      if (disposed || !node.current) return;
      try {
        const next = createHistoricalGoogleRuntime({
          sdk,
          node: node.current,
          mapId,
          theme,
          samples: props.samples,
          markerClass: s.googlePoint!,
          onSelect: props.onSelect,
          label: (i) =>
            `${t.point} ${i + 1}, ${sampleTime(props.samples[i]!.capturedAt, locale, props.timezone)}`,
        });
        runtime.current = next;
        next.select(selected.current);
        setStatus("ready");
      } catch {
        fail();
      }
    }, fail);
    return () => {
      disposed = true;
      detach();
      destroy();
    };
  }, [
    attempt,
    configured,
    locale,
    props.onSelect,
    props.samples,
    props.timezone,
    t.point,
    theme,
  ]);
  useEffect(() => {
    try {
      runtime.current?.select(props.selected);
    } catch {
      runtime.current?.destroy();
      runtime.current = null;
      queueMicrotask(() => setStatus("failed"));
    }
  }, [props.selected]);
  const mapAction = (action: (active: Runtime) => void) => {
    try {
      if (runtime.current) action(runtime.current);
    } catch {
      runtime.current?.destroy();
      runtime.current = null;
      setStatus("failed");
    }
  };
  return (
    <>
      <div className={s.mapBar}>
        <span>
          <Route size={14} aria-hidden="true" />
          {t.historical}
        </span>
        <span role="status">
          {effectiveStatus === "ready"
            ? googleMapsLanguage() !== null && googleMapsLanguage() !== locale
              ? operationsCopy(locale).googleMapLanguageReload
              : t.providerReady
            : effectiveStatus === "loading"
              ? t.loading
              : t.fallback}
        </span>
        {effectiveStatus === "failed" && configured ? (
          <button
            className={styles.quiet}
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {t.retry}
          </button>
        ) : null}
      </div>
      <div className={s.map} data-testid="historical-route-map">
        <div className={s.googleHost} ref={node} aria-label={t.mapLabel} />
        {effectiveStatus === "failed" ? (
          <div className={s.coordinateFallback}>
            <CoordinateRouteMap {...props} />
          </div>
        ) : null}
        {effectiveStatus === "loading" ? (
          <p className={s.providerLoading} role="status">
            {t.loading}
          </p>
        ) : null}
        {effectiveStatus === "ready" ? (
          <div className={s.mapTools}>
            <button
              className={styles.secondary}
              type="button"
              aria-label={t.zoomIn}
              onClick={() => mapAction((active) => active.zoom(1))}
            >
              <Plus size={17} />
            </button>
            <button
              className={styles.secondary}
              type="button"
              aria-label={t.zoomOut}
              onClick={() => mapAction((active) => active.zoom(-1))}
            >
              <Minus size={17} />
            </button>
            <button
              className={styles.secondary}
              type="button"
              aria-label={t.fit}
              onClick={() => mapAction((active) => active.fit())}
            >
              <LocateFixed size={17} />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
