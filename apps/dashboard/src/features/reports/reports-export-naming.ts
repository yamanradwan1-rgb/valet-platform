import type { ExportFormat } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  parseContentDispositionFilename,
  sanitizeArtifactFilename,
} from "../../lib/api/artifact-filename";
import type { TranslationKey } from "../../i18n/translations/types";

import { reportPeriodStartForFilename } from "./reports-period";
import type { ReportKind } from "@valet/contracts";

/**
 * Pure naming/error rules for report exports (D4-002).
 *
 * Framework-free and directly unit-testable. The backend names artifacts
 * `report-{kind}-{periodFrom}.{ext}`; when its Content-Disposition header
 * is missing or hostile we fall back to the SAME truthful formula built
 * from the request itself — never an invented name.
 */

export interface ReportExportSelection {
  readonly kind: ReportKind;
  readonly locationId: string;
  readonly periodValue: string;
}

/** Truthful fallback mirroring the backend artifact naming formula. */
export function fallbackExportFilename(
  selection: ReportExportSelection,
  format: ExportFormat,
): string {
  const periodFrom = reportPeriodStartForFilename(
    selection.kind,
    selection.periodValue,
  );
  return `report-${selection.kind.toLowerCase()}-${periodFrom}.${format.toLowerCase()}`;
}

/**
 * Header first (parsed + sanitized), truthful request-derived fallback
 * second. A hostile header can never produce a path or an empty name.
 */
/**
 * Header first — but ONLY when the sanitized name carries the requested
 * artifact family's extension; anything else falls back to the truthful
 * backend-style formula built from the request itself. A hostile header can
 * never produce a path, a wrong-family file, or an empty name.
 */
export function resolveReportExportFilename(
  selection: ReportExportSelection,
  format: ExportFormat,
  contentDisposition: string | null,
): string {
  const fallback = fallbackExportFilename(selection, format);
  const headerName = parseContentDispositionFilename(contentDisposition);
  if (headerName !== null) {
    const safe = sanitizeArtifactFilename(headerName);
    if (
      safe !== null &&
      safe.toLowerCase().endsWith(`.${format.toLowerCase()}`)
    ) {
      return safe;
    }
  }
  return fallback;
}

/** Selection-only prefix: pending lock scope for duplicate-click guarding. */
export function exportSelectionPrefix(
  selection: ReportExportSelection,
): string {
  return `${selection.locationId}|${selection.kind}|${selection.periodValue}|`;
}

const GENERIC_ERROR_KEY = "reports.export.errorGeneric" as const;

/** Maps export failures onto honest translation keys (no invented URLs). */
export function exportErrorMessageKey(
  error: DashboardApiError,
): TranslationKey {
  if (error.code === "REPORT_EXPORT_TOO_LARGE") {
    return "reports.export.errorTooLarge";
  }
  if (error.isNetworkError) return "reports.error.network";
  if (error.kind === "authorization-masked" || error.kind === "forbidden") {
    // Honest shared authorization failure wording — no fabricated
    // entitlement product logic and no upgrade links.
    return "errors.accessDenied";
  }
  if (error.kind === "session-expired") return "errors.sessionExpired";
  return GENERIC_ERROR_KEY;
}
