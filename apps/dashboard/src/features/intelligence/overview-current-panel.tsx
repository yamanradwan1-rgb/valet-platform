import type { CompanyAnalyticsResponse } from "@valet/contracts";
import { Building2, Car, CircleCheck, CirclePause, Clock3, Globe2, ListTodo } from "lucide-react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { ScopedContextHelp } from "../help/scoped-context-help";
import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import {
  readLocationQueueAnalytics,
  readLocationSessionStateCounts,
} from "./intelligence-api";
import { formatOverviewDuration } from "./overview-duration";
import {
  locationCurrentPresentation,
  type OverviewCurrentPresentation,
} from "./overview-presentation";
import { overviewCopy } from "./overview-copy";
import { OverviewCurrentRow } from "./overview-current-row";
import { overviewSessionStateLabel } from "./overview-session-state";
import currentStyles from "./overview-current.module.css";
import styles from "./overview.module.css";
import { useIntelligenceRead } from "./use-intelligence-read";

type Coverage = CompanyAnalyticsResponse["summary"]["coverage"];

function formatCount(value: number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-US").format(value);
}

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
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        <ScopedContextHelp helpKey="overview.current" />
      </div>
      {props.errorMessage ? (
        <State message={props.errorMessage} onRetry={props.onRetry} retryLabel={t.retry} />
      ) : props.loading ? (
        <State message={t.loading} retryLabel={t.retry} />
      ) : props.mode === "COMPANY" ? (
        props.companyCoverage ? (
          <div aria-label={title} className={currentStyles.currentScroll} tabIndex={0}>
            <OverviewCurrentRow
              icon={<Building2 size={16} />}
              label={t.totalLocations}
              value={<BidiText kind="number">{formatCount(props.companyCoverage.totalLocationCount, props.locale)}</BidiText>}
            />
            <OverviewCurrentRow
              icon={<CircleCheck size={16} />}
              label={t.activeLocations}
              tone="positive"
              value={<BidiText kind="number">{formatCount(props.companyCoverage.activeLocationCount, props.locale)}</BidiText>}
            />
            <OverviewCurrentRow
              icon={<CirclePause size={16} />}
              label={t.inactiveLocations}
              tone="danger"
              value={<BidiText kind="number">{formatCount(props.companyCoverage.inactiveLocationCount, props.locale)}</BidiText>}
            />
            <div className={currentStyles.currentSectionLabel}>{t.timezoneCoverage}</div>
            {props.companyCoverage.timezoneBoundaries.map((boundary) => (
              <OverviewCurrentRow
                detail={`${formatCount(boundary.activeLocationCount, props.locale)} ${t.activeShort} · ${formatCount(boundary.inactiveLocationCount, props.locale)} ${t.inactiveShort}`}
                icon={<Globe2 size={16} />}
                key={boundary.timezone}
                label={<BidiText>{boundary.timezone}</BidiText>}
                value={<BidiText kind="number">{formatCount(boundary.locationCount, props.locale)}</BidiText>}
              />
            ))}
          </div>
        ) : (
          <State
            message={props.periodSelected ? t.unavailable : t.periodRequired}
            retryLabel={t.retry}
          />
        )
      ) : props.current ? (
        <div aria-label={title} className={currentStyles.currentScroll} tabIndex={0}>
          <OverviewCurrentRow
            icon={<ListTodo size={16} />}
            label={t.queueDepth}
            value={<BidiText kind="number">{formatCount(props.current.queue.depth, props.locale)}</BidiText>}
          />
          <OverviewCurrentRow
            icon={<Clock3 size={16} />}
            label={t.oldestAge}
            value={props.current.queue.oldestAgeSeconds === null ? t.unavailable : (
              <bdi className="bidi-number" dir={props.locale === "ar" ? "rtl" : "ltr"}>
                {formatOverviewDuration(props.current.queue.oldestAgeSeconds, props.locale)}
              </bdi>
            )}
          />
          <div className={currentStyles.currentSectionLabel}>{t.state}</div>
          {props.current.counts.map((item) => (
            <OverviewCurrentRow
              icon={<Car size={16} />}
              key={item.state}
              label={overviewSessionStateLabel(item.state, props.locale)}
              value={<BidiText kind="number">{formatCount(item.count, props.locale)}</BidiText>}
            />
          ))}
        </div>
      ) : (
        <State message={t.noCurrent} retryLabel={t.retry} />
      )}
    </section>
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
