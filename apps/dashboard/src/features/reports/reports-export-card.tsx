"use client";

import type { ExportFormat } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { useTranslation } from "../../i18n/locale-provider";

import { exportErrorMessageKey } from "./reports-export-naming";
import type { ReportExportState } from "./reports-export-controller";

/**
 * Export controls for the loaded report selection.
 *
 * Two always-labeled actions (Download CSV / Download PDF — icon-only is
 * forbidden). While an export for the CURRENT selection is pending, both
 * actions disable (duplicate-click storm guard) and the busy label swaps
 * on the active one; report reads are never blocked by this state.
 *
 * One persistent polite status region carries exporting/success, and a
 * separate role="alert" region carries failures so screen readers get
 * exactly one coherent announcement per transition. Failure wording maps
 * through the shared honest keys (access denied / too large / network) —
 * no invented upgrade URLs or fabricated entitlement logic.
 */

export function ReportsExportCard({
  identityReady,
  state,
  onStart,
}: {
  identityReady: boolean;
  state: ReportExportState;
  onStart: (format: ExportFormat) => void;
}) {
  const { t } = useTranslation();
  const pending = state.phase === "exporting";
  const activeFormat: ExportFormat | null = state.format;
  const showStatus = state.phase === "exporting" || state.phase === "success";

  return (
    <Card className="rep-export-card">
      <div className="card-section-header">
        <h2>{t("reports.export.groupLabel")}</h2>
      </div>
      <div className="rep-export-actions">
        {(["CSV", "PDF"] as const).map((format) => (
          <button
            aria-busy={pending && activeFormat === format}
            className="btn-secondary rep-export-button"
            disabled={!identityReady || pending}
            key={format}
            onClick={() => onStart(format)}
            type="button"
          >
            {pending && activeFormat === format
              ? t("reports.export.busy")
              : format === "CSV"
                ? t("reports.export.csv")
                : t("reports.export.pdf")}
          </button>
        ))}
      </div>

      {showStatus ? (
        <p aria-live="polite" className="rep-export-status" role="status">
          {state.phase === "success"
            ? t("reports.export.started")
            : t("reports.export.busy")}
        </p>
      ) : null}
      {state.phase === "error" && state.error !== null ? (
        <p
          className="rep-error rep-export-error"
          role="alert"
        >
          {t(exportErrorMessageKey(state.error))}
        </p>
      ) : null}
    </Card>
  );
}
