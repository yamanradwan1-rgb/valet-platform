import { BidiIsolate, BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { formatOverviewDuration } from "./overview-duration";
import { reportRowLabel } from "./report-row-label";
import type { ReportPresentationRow } from "./reports-presentation";
import styles from "./report-preview-rows.module.css";

export function ReportPreviewRows(props: {
  readonly rows: readonly ReportPresentationRow[];
  readonly locale: DashboardLocale;
  readonly unavailable: string;
}) {
  return (
    <dl className={styles.rows}>
      {props.rows.map((row, index) => {
        const label =
          row.labelBidi === "code"
            ? reportRowLabel(row.label, props.locale)
            : row.label;
        const duration =
          row.label.endsWith(".averageSeconds") && row.value !== null;
        return (
          <div className={styles.row} key={`${row.label}:${index}`}>
            <dt>
              <span>
                {row.labelBidi === "number" ? (
                  <BidiIsolate>{label}</BidiIsolate>
                ) : (
                  label
                )}
              </span>
              {label !== row.label ? (
                <small>
                  <BidiIsolate>{row.label}</BidiIsolate>
                </small>
              ) : null}
            </dt>
            <dd>
              {duration ? (
                <span>{formatOverviewDuration(row.value, props.locale)}</span>
              ) : null}
              <span className={duration ? styles.source : undefined}>
                {row.value === null ? (
                  props.unavailable
                ) : row.bidi ? (
                  <BidiText kind={row.bidi}>{row.value}</BidiText>
                ) : (
                  row.value
                )}
                {duration
                  ? props.locale === "ar"
                    ? " ثانية"
                    : " seconds"
                  : null}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
