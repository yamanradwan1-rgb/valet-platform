import type { ExportFormat, ReportKind } from "@valet/contracts";
import { ScopedContextHelp } from "../help/scoped-context-help";

import { reportsCopy } from "./reports-copy";
import dialogStyles from "./report-preview-dialog.module.css";

type ReportCopy = ReturnType<typeof reportsCopy>;

export type ReportExportStatus =
  | "idle"
  | "exporting"
  | "unknown"
  | "auth-retry"
  | "denied"
  | "entitlement"
  | "too-large"
  | "malformed"
  | "failed"
  | "stale";

export function ReportsExportControls(props: {
  readonly advisoryPending: boolean;
  readonly available: boolean;
  readonly kind: ReportKind;
  readonly onExport: (format: ExportFormat) => void;
  readonly status: ReportExportStatus;
  readonly t: ReportCopy;
}) {
  const message = exportMessage(props.status, props.t);
  const disabled = !props.available || props.status === "exporting";
  return (
    <div className={dialogStyles.exportRegion} data-testid="report-export-region">
      <div className={dialogStyles.exportCopy}>
        <p>
          {props.t.pdfNeutral}
        </p>
        {!props.advisoryPending && !props.available ? (
          <p role="status">{props.t.exportUnavailable}</p>
        ) : null}
        {message ? (
          <p role={props.status === "exporting" ? "status" : "alert"}>{message}</p>
        ) : null}
      </div>
      <div className={dialogStyles.exportActions}>
        {props.available ? <ScopedContextHelp helpKey="reports.export" /> : null}
        <button
          aria-label={`${props.t.exportCsv}: ${reportName(props.kind, props.t)}`}
          className={dialogStyles.dialogSecondaryButton}
          disabled={disabled}
          onClick={() => props.onExport("CSV")}
          type="button"
        >
          {props.t.exportCsv}
        </button>
        <button
          aria-label={`${props.t.exportPdf}: ${reportName(props.kind, props.t)}`}
          className={dialogStyles.dialogPrimaryButton}
          disabled={disabled}
          onClick={() => props.onExport("PDF")}
          type="button"
        >
          {props.t.exportPdf}
        </button>
      </div>
    </div>
  );
}

function exportMessage(status: ReportExportStatus, t: ReportCopy): string | null {
  if (status === "exporting") return t.exporting;
  if (status === "unknown") return t.exportUnknown;
  if (status === "auth-retry") return t.exportRetryAuth;
  if (status === "denied") return t.exportDenied;
  if (status === "entitlement") return t.exportEntitlement;
  if (status === "too-large") return t.exportTooLarge;
  if (status === "malformed") return t.exportMalformed;
  if (status === "failed") return t.exportGeneric;
  if (status === "stale") return t.exportStale;
  return null;
}

function reportName(kind: ReportKind, t: ReportCopy) {
  if (kind === "DAILY") return t.daily;
  if (kind === "WEEKLY") return t.weekly;
  return t.monthly;
}
