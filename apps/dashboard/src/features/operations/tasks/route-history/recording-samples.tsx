import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { styles } from "../../operations-ui";
import { useCursorPage } from "../../use-cursor-page";
import { useOperationsRead } from "../../use-operations-read";
import { readRouteWindow } from "./route-history-api";
import { routeCopy } from "./route-copy";
import { RouteStatePanel } from "./route-state";
import { SampleInspector } from "./sample-inspector";
import { HistoricalRouteMap } from "./historical-route-map";
import s from "./route-history.module.css";

export function RecordingSamples(props: {
  readonly onDenied: () => void;
  readonly api: DashboardApiClient;
  readonly trackingSessionId: string;
  readonly scopeKey: string;
  readonly timezone: string;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const page = useCursorPage();
  const [selected, setSelected] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) =>
      readRouteWindow(props.api, props.trackingSessionId, page.cursor, signal),
    [props.api, props.trackingSessionId, page.cursor],
  );
  const read = useOperationsRead(
    `${props.scopeKey}:${props.trackingSessionId}:${page.cursor}`,
    load,
  );
  const denied =
    read.error instanceof DashboardApiError &&
    ["auth", "authorization"].includes(read.error.kind);
  const { onDenied } = props;
  useEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  const select = useCallback((index: number) => setSelected(index), []);
  if (read.loading) return <RouteStatePanel state="loading" />;
  if (read.error) {
    const denied =
      read.error instanceof DashboardApiError &&
      ["auth", "authorization"].includes(read.error.kind);
    return (
      <RouteStatePanel
        state={denied ? "denied" : "failed"}
        onRetry={read.refresh}
      />
    );
  }
  const samples = read.data?.samples ?? [];
  if (!samples.length) return <RouteStatePanel state="empty" />;
  const partial = page.canPrevious || read.data?.nextCursor !== null;
  const index = Math.min(selected, samples.length - 1);
  return (
    <>
      <div className={s.routeLayout}>
        <div className={s.mapColumn}>
          <HistoricalRouteMap
            samples={samples}
            selected={index}
            onSelect={select}
            timezone={props.timezone}
          />
          <div className={s.legend}>
            {samples.length > 1 ? (
              <>
                <span>
                  <i className={s.legendStart}>A</i>
                  {partial ? t.start : t.startPin}
                </span>
                <ArrowRight size={14} aria-hidden="true" />
                <span>
                  <i className={s.legendEnd}>B</i>
                  {partial ? t.end : t.endPin}
                </span>
              </>
            ) : (
              <span>{t.onePoint}</span>
            )}
          </div>
          <p className={s.observationNote}>
            <Info size={14} aria-hidden="true" />
            {partial
              ? t.partialWindow
              : samples.length === 1
                ? t.onePoint
                : t.straight}
          </p>
        </div>
        <SampleInspector
          samples={samples}
          selected={index}
          onSelect={select}
          timezone={props.timezone}
        />
      </div>
      {partial ? (
        <div className={s.inline}>
          <button
            className={styles.secondary}
            disabled={!page.canPrevious}
            type="button"
            onClick={() => {
              setSelected(0);
              page.previous();
            }}
          >
            {t.previousPage}
          </button>
          <button
            className={styles.secondary}
            disabled={!read.data?.nextCursor}
            type="button"
            onClick={() => {
              setSelected(0);
              page.next(read.data!.nextCursor!);
            }}
          >
            {t.nextPage}
          </button>
        </div>
      ) : null}
    </>
  );
}
