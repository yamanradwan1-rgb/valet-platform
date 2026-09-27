import type { ReportKind } from "@valet/contracts";
import type { FormEvent } from "react";
import { X } from "lucide-react";

import { FocusDialog } from "../../components/presentation/focus-dialog";
import { ReportPreviewRows } from "./report-preview-rows";
import type {
  ReportResponse,
  ReportSelectorValidation,
} from "./reports-presentation";
import { reportPresentation } from "./reports-presentation";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { reportsCopy } from "./reports-copy";
import {
  ReportsExportControls,
  type ReportExportStatus,
} from "./reports-export-controls";
import dialogStyles from "./report-preview-dialog.module.css";

type ReportCopy = ReturnType<typeof reportsCopy>;

export function ReportPreviewDialog(props: {
  readonly data: ReportResponse | null;
  readonly draftValue: string;
  readonly exportAdvisoryPending: boolean;
  readonly exportAvailable: boolean;
  readonly exportStatus: ReportExportStatus;
  readonly kind: ReportKind;
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly message: string | null;
  readonly onClose: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onExport: (format: "CSV" | "PDF") => void;
  readonly onRetry: () => void;
  readonly onSubmit: (event: FormEvent) => void;
  readonly selectorValidation: ReportSelectorValidation["kind"] | null;
  readonly t: ReportCopy;
}) {
  const sections = props.data
    ? reportPresentation(props.data, props.locale)
    : [];
  const title = reportTitle(props.kind, props.t);
  const input = selectorInput(props.kind, props.t);
  return (
    <div className={dialogStyles.dialogHost}>
      <FocusDialog label={title} onClose={props.onClose}>
        <header className={dialogStyles.dialogHeader}>
          <div>
            <h2>{title}</h2>
            <p>{props.t.selectorRequired}</p>
          </div>
          <button
            aria-label={props.t.close}
            className={dialogStyles.dialogClose}
            onClick={props.onClose}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className={dialogStyles.dialogBody}>
          <form className={dialogStyles.selectorForm} onSubmit={props.onSubmit}>
            <label className={dialogStyles.selectorField}>
              <span>{input.label}</span>
              <input
                aria-label={input.label}
                onChange={(event) => props.onDraftChange(event.target.value)}
                type={input.type}
                value={props.draftValue}
              />
            </label>
            {props.selectorValidation &&
            props.selectorValidation !== "valid" ? (
              <p className={dialogStyles.selectorError} role="alert">
                {selectorError(props.kind, props.selectorValidation, props.t)}
              </p>
            ) : null}
            <button className={dialogStyles.dialogPrimaryButton} type="submit">
              {props.t.loadPreview}
            </button>
          </form>

          {props.loading ? <PreviewSkeleton label={props.t.loading} /> : null}
          {!props.loading && props.message ? (
            <div className={dialogStyles.previewState} role="alert">
              <p>{props.message}</p>
              <button
                className={dialogStyles.dialogSecondaryButton}
                onClick={props.onRetry}
                type="button"
              >
                {props.t.retry}
              </button>
            </div>
          ) : null}
          {props.data ? (
            <div
              className={dialogStyles.previewSections}
              data-testid="report-preview-content"
            >
              {sections.map((section) => (
                <section
                  className={dialogStyles.previewSection}
                  key={section.title}
                >
                  <h3>{section.title}</h3>
                  <ReportPreviewRows
                    rows={section.rows}
                    locale={props.locale}
                    unavailable={props.t.unavailable}
                  />
                </section>
              ))}
            </div>
          ) : null}
        </div>
        {props.data ? (
          <ReportsExportControls
            advisoryPending={props.exportAdvisoryPending}
            available={props.exportAvailable}
            kind={props.kind}
            onExport={props.onExport}
            status={props.exportStatus}
            t={props.t}
          />
        ) : null}
      </FocusDialog>
    </div>
  );
}

function PreviewSkeleton({ label }: { readonly label: string }) {
  return (
    <div
      aria-label={label}
      className={dialogStyles.previewSkeleton}
      role="status"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} />
      ))}
    </div>
  );
}

function selectorInput(kind: ReportKind, t: ReportCopy) {
  if (kind === "MONTHLY")
    return { label: t.selectorMonth, type: "month" as const };
  return {
    label: kind === "WEEKLY" ? t.selectorWeek : t.selectorDate,
    type: "date" as const,
  };
}

function selectorError(
  kind: ReportKind,
  state: "required" | "invalid",
  t: ReportCopy,
) {
  if (state === "required") return t.selectorRequired;
  if (kind === "WEEKLY") return t.selectorInvalidWeek;
  if (kind === "MONTHLY") return t.selectorInvalidMonth;
  return t.selectorInvalidDate;
}

function reportTitle(kind: ReportKind, t: ReportCopy) {
  if (kind === "DAILY") return t.previewDaily;
  if (kind === "WEEKLY") return t.previewWeekly;
  return t.previewMonthly;
}
