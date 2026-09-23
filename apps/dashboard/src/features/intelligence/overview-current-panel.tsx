import type { CompanyAnalyticsResponse } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import {
  readLocationQueueAnalytics,
  readLocationSessionStateCounts,
} from "./intelligence-api";
import { formatExactDecimal } from "./intelligence-format";
import {
  locationCurrentPresentation,
  type OverviewCurrentPresentation,
} from "./overview-presentation";
import { overviewCopy } from "./overview-copy";
import styles from "./overview.module.css";
import { useIntelligenceRead } from "./use-intelligence-read";

type Coverage = CompanyAnalyticsResponse["summary"]["coverage"];

function State(props: {
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel: string;
}) {
  return (
    <div className={styles.panelState} role={props.onRetry ? "alert" : "status"}>
      <span>{props.message}</span>
      {props.onRetry ? (
        <button className={styles.retryButton} onClick={props.onRetry} type="button">
          {props.retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function OverviewCurrentPanel(props: {
  readonly companyCoverage: Coverage | null;
  readonly current: OverviewCurrentPresentation | null;
  readonly errorMessage: string | null;
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly mode: "COMPANY" | "LOCATION";
  readonly onRetry: () => void;
  readonly periodSelected: boolean;
}) {
  const t = overviewCopy(props.locale);
  const title = props.mode === "COMPANY" ? t.coverage : t.current;
  return (
    <section className={`${styles.panel} ${styles.secondaryPanel}`}>
      <div className={styles.panelHeader}><h2>{title}</h2></div>
      {props.errorMessage ? (
        <State message={props.errorMessage} onRetry={props.onRetry} retryLabel={t.retry} />
      ) : props.loading ? (
        <State message={t.loading} retryLabel={t.retry} />
      ) : props.mode === "COMPANY" ? (
        props.companyCoverage ? (
          <div className={styles.currentScroll}>
            <Fact label={t.totalLocations} value={props.companyCoverage.totalLocationCount} />
            <Fact label={t.activeLocations} value={props.companyCoverage.activeLocationCount} />
            <Fact label={t.inactiveLocations} value={props.companyCoverage.inactiveLocationCount} />
            <div className={styles.currentSectionLabel}>{t.timezoneCoverage}</div>
            {props.companyCoverage.timezoneBoundaries.map((boundary) => (
              <div className={styles.currentRow} key={boundary.timezone}>
                <div>
                  <BidiText>{boundary.timezone}</BidiText>
                  <small>
                    <BidiText>{boundary.periodStartUtc}</BidiText>
                    {" – "}
                    <BidiText>{boundary.periodEndUtc}</BidiText>
                  </small>
                </div>
                <BidiText kind="number">{boundary.locationCount}</BidiText>
              </div>
            ))}
          </div>
        ) : (
          <State
            message={props.periodSelected ? t.unavailable : t.periodRequired}
            retryLabel={t.retry}
          />
        )
      ) : props.current ? (
        <div className={styles.currentScroll}>
          <Fact label={t.queueDepth} value={props.current.queue.depth} />
          <div className={styles.currentRow}>
            <span>{t.oldestAge}</span>
            <strong>
              {props.current.queue.oldestAgeSeconds === null ? t.unavailable : (
                <>
                  <BidiText kind="number">
                    {formatExactDecimal(props.current.queue.oldestAgeSeconds, props.locale)}
                  </BidiText>
                  {" "}{t.seconds}
                </>
              )}
            </strong>
          </div>
          <div className={styles.currentSectionLabel}>{t.state}</div>
          {props.current.counts.map((item) => (
            <div className={styles.currentRow} key={item.state}>
              <BidiText>{item.state}</BidiText>
              <BidiText kind="number">{item.count}</BidiText>
            </div>
          ))}
        </div>
      ) : (
        <State message={t.noCurrent} retryLabel={t.retry} />
      )}
    </section>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className={styles.currentRow}>
      <span>{label}</span>
      <strong><BidiText kind="number">{value}</BidiText></strong>
    </div>
  );
}

export function OverviewLocationCurrentRead(props: {
  readonly errorMessage: (error: unknown) => string;
  readonly locale: DashboardLocale;
}) {
  useProtectedDashboard();
  const stateCounts = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_STATE_COUNTS" },
    load: ({ api, scope, signal }) => {
      if (scope.kind !== "LOCATION") throw new Error("Location current read mismatch");
      return readLocationSessionStateCounts(api, scope.locationId, signal);
    },
  });
  const queue = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_QUEUE" },
    load: ({ api, scope, signal }) => {
      if (scope.kind !== "LOCATION") throw new Error("Location queue read mismatch");
      return readLocationQueueAnalytics(api, scope.locationId, signal);
    },
  });
  const current = stateCounts.data && queue.data
    ? locationCurrentPresentation(stateCounts.data, queue.data)
    : null;
  const error = stateCounts.error ?? queue.error;
  return (
    <OverviewCurrentPanel
      companyCoverage={null}
      current={current}
      errorMessage={error ? props.errorMessage(error) : null}
      loading={stateCounts.loading || queue.loading}
      locale={props.locale}
      mode="LOCATION"
      onRetry={() => {
        stateCounts.retry();
        queue.retry();
      }}
      periodSelected
    />
  );
}
