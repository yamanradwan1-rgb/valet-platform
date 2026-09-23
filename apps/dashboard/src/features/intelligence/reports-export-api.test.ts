import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { reportExportBaseKey, reportExportIntentIsCurrent } from "./report-export-intent";
import { exportReportArtifact, reportExportRequest } from "./reports-export-api";
import { validateReportSelector } from "./reports-presentation";

const company = { kind: "COMPANY" as const, organizationId: "org / one" };
const location = {
  kind: "LOCATION" as const,
  organizationId: "org / one",
  locationId: "loc / one",
};

describe("MD-05D report export API", () => {
  it.each([
    ["DAILY" as const, "2026-09-21", { kind: "DAILY", date: "2026-09-21" }],
    ["WEEKLY" as const, "2026-09-21", { kind: "WEEKLY", weekStart: "2026-09-21" }],
    ["MONTHLY" as const, "2026-09", { kind: "MONTHLY", month: "2026-09" }],
  ])("validates the %s selector used by preview and export", (kind, value, selector) => {
    expect(validateReportSelector(kind, value)).toEqual({ kind: "valid", selector });
  });

  it("rejects a non-Monday weekly selector before an export body can be built", () => {
    expect(validateReportSelector("WEEKLY", "2026-09-22")).toEqual({ kind: "invalid" });
  });

  it.each([
    [{ kind: "DAILY", date: "2026-09-21" } as const, "CSV" as const, { kind: "DAILY", format: "CSV", date: "2026-09-21" }],
    [{ kind: "WEEKLY", weekStart: "2026-09-21" } as const, "PDF" as const, { kind: "WEEKLY", format: "PDF", weekStart: "2026-09-21" }],
    [{ kind: "MONTHLY", month: "2026-09" } as const, "CSV" as const, { kind: "MONTHLY", format: "CSV", month: "2026-09" }],
  ])("builds the exact export body", (selector, format, expected) => {
    expect(reportExportRequest(selector, format)).toEqual(expected);
  });

  it.each([
    [company, { kind: "DAILY", format: "CSV", date: "2026-09-21" } as const, "/v1/staff/management/organizations/org%20%2F%20one/reports/exports", "text/csv; charset=utf-8"],
    [company, { kind: "WEEKLY", format: "PDF", weekStart: "2026-09-21" } as const, "/v1/staff/management/organizations/org%20%2F%20one/reports/exports", "application/pdf"],
    [company, { kind: "MONTHLY", format: "CSV", month: "2026-09" } as const, "/v1/staff/management/organizations/org%20%2F%20one/reports/exports", "text/csv; charset=utf-8"],
    [location, { kind: "DAILY", format: "PDF", date: "2026-09-21" } as const, "/v1/staff/dashboard/locations/loc%20%2F%20one/reports/exports", "application/pdf"],
    [location, { kind: "WEEKLY", format: "CSV", weekStart: "2026-09-21" } as const, "/v1/staff/dashboard/locations/loc%20%2F%20one/reports/exports", "text/csv; charset=utf-8"],
    [location, { kind: "MONTHLY", format: "PDF", month: "2026-09" } as const, "/v1/staff/dashboard/locations/loc%20%2F%20one/reports/exports", "application/pdf"],
  ] as const)("sends the exact %s export request", async (scope, request, expectedPath, expectedContentType) => {
    const requestBinary = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1]),
      contentType: expectedContentType,
      filename: "report.csv",
    });
    const api = { requestBinary } as unknown as DashboardApiClient;
    await exportReportArtifact(api, scope, request);
    expect(requestBinary).toHaveBeenCalledWith(expectedPath, {
      body: request,
      expectedContentType,
      signal: undefined,
    });
  });

  it("rejects a request outside the strict export body schema before dispatch", () => {
    const requestBinary = vi.fn();
    const api = { requestBinary } as unknown as DashboardApiClient;
    const request = {
      kind: "DAILY",
      format: "CSV",
      date: "2026-09-21",
      locationId: "caller-must-not-send-this",
    } as never;

    expect(() => exportReportArtifact(api, company, request)).toThrow();
    expect(requestBinary).not.toHaveBeenCalled();
  });

  it("binds export freshness to scope, selector, generations and local revision", () => {
    const selector = { kind: "DAILY" as const, date: "2026-09-21" };
    const base = {
      identityGeneration: 2,
      reportKind: "DAILY" as const,
      scope: location,
      selectionRevision: 4,
      selector,
      sessionGeneration: 7,
    };
    const current = reportExportBaseKey(base);
    const intent = { ...base, exportIntentRevision: 9, format: "CSV" as const };
    expect(reportExportIntentIsCurrent(intent, current, 9)).toBe(true);
    expect(reportExportIntentIsCurrent(intent, current, 10)).toBe(false);
    expect(reportExportIntentIsCurrent(intent, reportExportBaseKey({
      ...base,
      selector: { kind: "DAILY", date: "2026-09-22" },
    }), 9)).toBe(false);
  });
});
