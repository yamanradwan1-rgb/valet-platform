import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import type { AnalyticsDurationPresentation } from "./analytics-presentation";
import { analyticsCopy } from "./analytics-copy";
import { durationLabel } from "./analytics-text-summary";
import { formatOverviewDuration } from "./overview-duration";
import styles from "./analytics-evidence.module.css";

export function ActivityTextSummary(props: {
  readonly data: readonly {
    readonly date: string;
    readonly handledCount: number;
  }[];
  readonly locale: DashboardLocale;
}) {
  const t = analyticsCopy(props.locale);
  return (
    <details className={styles.chartData}>
      <summary>{t.chartData}</summary>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label={t.vehicleActivity}
        tabIndex={0}
      >
        <table data-testid="analytics-activity-text">
          <caption>{t.vehicleActivity}</caption>
          <thead>
            <tr>
              <th>{t.chartDate}</th>
              <th>{t.chartCars}</th>
            </tr>
          </thead>
          <tbody>
            {props.data.map((point) => (
              <tr key={point.date}>
                <td>
                  <BidiText>{point.date}</BidiText>
                </td>
                <td>
                  <BidiText kind="number">{point.handledCount}</BidiText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function DurationTextSummary(props: {
  readonly data: readonly AnalyticsDurationPresentation[];
  readonly locale: DashboardLocale;
}) {
  const t = analyticsCopy(props.locale);
  return (
    <details className={styles.chartData}>
      <summary>{t.chartData}</summary>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label={t.durationComparison}
        tabIndex={0}
      >
        <table data-testid="analytics-duration-text">
          <caption>{t.durationComparison}</caption>
          <thead>
            <tr>
              <th>{t.chartMetric}</th>
              <th>{t.displayDuration}</th>
              <th>{t.chartAverage}</th>
              <th>{t.chartSamples}</th>
              <th>{t.contributingLocations}</th>
            </tr>
          </thead>
          <tbody>
            {props.data.map((point) => (
              <tr key={point.key}>
                <td>{durationLabel(point.key, props.locale)}</td>
                <td>
                  {formatOverviewDuration(
                    point.averageSeconds,
                    props.locale,
                    "compact",
                  )}
                </td>
                <td>
                  {point.averageSeconds === null ? (
                    t.unavailable
                  ) : (
                    <BidiText kind="number">{point.averageSeconds}</BidiText>
                  )}
                </td>
                <td>
                  <BidiText kind="number">{point.sampleCount}</BidiText>
                </td>
                <td>
                  {point.contributingLocationCount === null ? (
                    t.unavailable
                  ) : (
                    <BidiText kind="number">
                      {point.contributingLocationCount}
                    </BidiText>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
