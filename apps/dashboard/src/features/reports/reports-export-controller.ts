import type { ExportFormat } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";

import { buildReportExportRequest, exportReport } from "./reports-api";
import type { ReportsClient } from "./reports-api";
import {
  exportSelectionPrefix,
  resolveReportExportFilename,
} from "./reports-export-naming";
import type { ReportExportSelection } from "./reports-export-naming";
import { saveExportArtifact } from "./save-export-blob";

/**
 * Framework-free controller for the report export actions (D4-002).
 *
 * Mirrors the latest-request-gate philosophy: the subtle identity rules
 * live here, unit-testable without React.
 *
 * - One coherent state machine: idle → exporting → success | error. A
 *   pending attempt for the CURRENT selection locks further export starts
 *   (duplicate-click storm guard); reads are never blocked by this state.
 * - Request identity = (locationId, kind, periodValue, format). An
 *   attempt's outcome applies ONLY while its selection is still current —
 *   a late A / DAILY / P1 / CSV completion never attaches to B / WEEKLY /
 *   P2 / PDF.
 * - HONEST DOWNLOAD SEMANTICS: attempts are deliberately not aborted on
 *   identity change or dispose. If the browser download legitimately
 *   started (or completes afterwards), the artifact still saves under its
 *   truthful filename; it is simply never presented as another
 *   selection's status.
 * - A failed export never destroys a loaded report: this state lives
 *   beside the report snapshot, and a successful read never erases it.
 */

export type ReportExportPhase = "idle" | "exporting" | "success" | "error";

export interface ReportExportState {
  readonly phase: ReportExportPhase;
  /** Format of the action this status describes (null while idle). */
  readonly format: ExportFormat | null;
  readonly error: DashboardApiError | null;
}

export const IDLE_EXPORT_STATE: ReportExportState = {
  error: null,
  format: null,
  phase: "idle",
};

export interface ReportExportController {
  setIdentity: (selection: ReportExportSelection) => void;
  startExport: (format: ExportFormat) => void;
  dispose: () => void;
}

export function createReportExportController(options: {
  client: ReportsClient;
  onState: (state: ReportExportState) => void;
  /** Injectable saver (tests record instead of touching the DOM). */
  save?: (artifact: {
    bytes: Uint8Array;
    contentType: string;
    filename: string;
  }) => void;
}): ReportExportController {
  let disposed = false;
  let identity: ReportExportSelection = {
    kind: "DAILY",
    locationId: "",
    periodValue: "",
  };
  let pendingPrefix: string | null = null;

  const setState = (state: ReportExportState): void => {
    if (!disposed) options.onState(state);
  };

  return {
    setIdentity: (next): void => {
      identity = next;
      // Deliberate reset: a status describing the previous identity is
      // meaningless under a new one and drops synchronously.
      pendingPrefix = null;
      setState(IDLE_EXPORT_STATE);
    },

    startExport: (format): void => {
      const prefix = exportSelectionPrefix(identity);
      if (pendingPrefix === prefix) return; // duplicate-click storm guard
      pendingPrefix = prefix;

      const captured = identity;
      setState({ error: null, format, phase: "exporting" });

      void (async () => {
        try {
          const request = buildReportExportRequest(
            captured.kind,
            format,
            captured.periodValue,
          );
          const artifact = await exportReport(
            options.client,
            captured.locationId,
            request,
          );
          const artifactToSave = {
            bytes: artifact.bytes,
            contentType: artifact.contentType,
            filename: resolveReportExportFilename(
              captured,
              format,
              artifact.contentDisposition,
            ),
          };
          if (options.save === undefined) {
            saveExportArtifact(artifactToSave);
          } else {
            options.save(artifactToSave);
          }
          if (
            disposed ||
            exportSelectionPrefix(identity) !== exportSelectionPrefix(captured)
          ) {
            return; // stale outcome never attaches to another selection
          }
          setState({ error: null, format, phase: "success" });
        } catch (error) {
          const apiError =
            error instanceof DashboardApiError
              ? error
              : new DashboardApiError({
                  code: "REPORTS_EXPORT_UNEXPECTED_ERROR",
                  kind: "server",
                  message: "The export failed for an unexpected reason.",
                  status: 0,
                });
          if (
            disposed ||
            exportSelectionPrefix(identity) !== exportSelectionPrefix(captured)
          ) {
            return;
          }
          setState({ error: apiError, format, phase: "error" });
        } finally {
          if (pendingPrefix === exportSelectionPrefix(captured)) {
            pendingPrefix = null;
          }
        }
      })();
    },

    dispose: (): void => {
      disposed = true;
    },
  };
}
