import type { ReportKind } from "@valet/contracts";
import { BarChart3 } from "lucide-react";
import { ScopedContextHelp } from "../help/scoped-context-help";

import { reportsCopy } from "./reports-copy";
import {
  ReportsFileSpreadsheetIcon,
  ReportsFileTextIcon,
} from "./reports-reference-icons";
import styles from "./reports.module.css";

type ReportCopy = ReturnType<typeof reportsCopy>;

export function ReportsTable(props: {
  readonly onPreview: (kind: ReportKind) => void;
  readonly t: ReportCopy;
}) {
  return (
    <div className={styles.mainContainer}>
      <div className={styles.tabs}>
        <span>{props.t.standardReports}</span>
        <ScopedContextHelp helpKey="reports.catalog" />
      </div>
      <div
        aria-label={props.t.standardReports}
        className={styles.tableScroll}
        role="region"
        tabIndex={0}
      >
        <table className={styles.reportTable}>
          <thead>
            <tr>
              <th>{props.t.reportName}</th>
              <th>{props.t.category}</th>
              <th>{props.t.description}</th>
              <th>{props.t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {reportRows(props.t).map((row) => (
              <tr key={row.kind}>
                <td>
                  <div className={styles.reportName}>
                    <span className={`${styles.reportIcon} ${row.iconClass}`}>
                      {row.icon}
                    </span>
                    <strong>{row.name}</strong>
                  </div>
                </td>
                <td className={styles.categoryCell}>{row.category}</td>
                <td className={styles.descriptionCell}>{row.description}</td>
                <td className={styles.actionCell}>
                  <button
                    aria-label={row.accessibleName}
                    className={styles.rowAction}
                    onClick={() => props.onPreview(row.kind)}
                    type="button"
                  >
                    {props.t.preview}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function reportRows(t: ReportCopy) {
  return [
    {
      kind: "DAILY" as const,
      name: t.daily,
      category: t.dailyCategory,
      description: t.dailyDescription,
      accessibleName: t.previewDaily,
      icon: <ReportsFileTextIcon size={16} />,
      iconClass: styles.iconBlue,
    },
    {
      kind: "WEEKLY" as const,
      name: t.weekly,
      category: t.weeklyCategory,
      description: t.weeklyDescription,
      accessibleName: t.previewWeekly,
      icon: <BarChart3 size={16} />,
      iconClass: styles.iconEmerald,
    },
    {
      kind: "MONTHLY" as const,
      name: t.monthly,
      category: t.monthlyCategory,
      description: t.monthlyDescription,
      accessibleName: t.previewMonthly,
      icon: <ReportsFileSpreadsheetIcon size={16} />,
      iconClass: styles.iconSlate,
    },
  ];
}
