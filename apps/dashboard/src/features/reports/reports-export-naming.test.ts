import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  exportErrorMessageKey,
  fallbackExportFilename,
  resolveReportExportFilename,
} from "./reports-export-naming";

/**
 * Export naming + error wording truth (D4-002). Filenames come from the
 * Content-Disposition header only after sanitization; the fallback mirrors
 * the backend formula from request facts. Error keys stay honest —
 * authorization failures use the shared denial wording and no invented
 * upgrade/entitlement URLs exist anywhere.
 */

const SELECTION = {
  kind: "MONTHLY" as const,
  locationId: "11111111-1111-4111-8111-111111111111",
  periodValue: "2026-01",
};

describe("export filename resolution", () => {
  it("prefers a sanitized header name", () => {
    expect(
      resolveReportExportFilename(
        SELECTION,
        "PDF",
        'attachment; filename="report-monthly-2026-01-01.pdf"',
      ),
    ).toBe("report-monthly-2026-01-01.pdf");
  });

  it("falls back to the truthful backend-style name when the header is missing", () => {
    for (const disposition of [null, "", "inline"]) {
      expect(resolveReportExportFilename(SELECTION, "PDF", disposition)).toBe(
        "report-monthly-2026-01-01.pdf",
      );
    }
    expect(fallbackExportFilename(SELECTION, "CSV")).toBe(
      "report-monthly-2026-01-01.csv",
    );
  });

  it("never lets a hostile header through as a path or wrong-family file", () => {
    // Traversal segment survives sanitization but carries no .csv extension:
    // extension/format mismatch now falls back to the truthful name.
    expect(
      resolveReportExportFilename(
        SELECTION,
        "CSV",
        'attachment; filename="../../etc/passwd"',
      ),
    ).toBe("report-monthly-2026-01-01.csv");
    expect(
      resolveReportExportFilename(
        SELECTION,
        "CSV",
        'attachment; filename=".."',
      ),
    ).toBe("report-monthly-2026-01-01.csv");
    // A well-formed header name of the WRONG family also falls back.
    expect(
      resolveReportExportFilename(
        SELECTION,
        "CSV",
        'attachment; filename="report-monthly-2026-01-01.pdf"',
      ),
    ).toBe("report-monthly-2026-01-01.csv");
  });

  it("builds the truthful WEEKLY fallback from request facts", () => {
    expect(
      resolveReportExportFilename(
        {
          kind: "WEEKLY",
          locationId: SELECTION.locationId,
          periodValue: "2026-01-05",
        },
        "PDF",
        null,
      ),
    ).toBe("report-weekly-2026-01-05.pdf");
  });
});

describe("export error wording", () => {
  it("maps backend codes to honest keys", () => {
    expect(
      exportErrorMessageKey(
        new DashboardApiError({
          code: "REPORT_EXPORT_TOO_LARGE",
          kind: "validation",
          message: "",
          status: 422,
        }),
      ),
    ).toBe("reports.export.errorTooLarge");
    expect(
      exportErrorMessageKey(
        new DashboardApiError({
          code: "NETWORK_ERROR",
          isNetworkError: true,
          kind: "server",
          message: "",
          status: 0,
        }),
      ),
    ).toBe("reports.error.network");
    expect(
      exportErrorMessageKey(
        new DashboardApiError({
          code: "AUTHORIZATION_DENIED",
          kind: "authorization-masked",
          message: "",
          status: 404,
        }),
      ),
    ).toBe("errors.accessDenied");
    expect(
      exportErrorMessageKey(
        new DashboardApiError({
          code: "X",
          kind: "server",
          message: "",
          status: 0,
        }),
      ),
    ).toBe("reports.export.errorGeneric");
  });
});
