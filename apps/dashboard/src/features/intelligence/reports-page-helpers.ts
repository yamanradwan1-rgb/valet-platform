import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  readCompanySubscription,
  readLocationSubscription,
} from "../administration/commercial/commercial-api";
import type { IntelligenceRequestDescriptor } from "./intelligence-query-identity";
import {
  readCompanyDailyReport,
  readCompanyMonthlyReport,
  readCompanyWeeklyReport,
  readLocationDailyReport,
  readLocationMonthlyReport,
  readLocationWeeklyReport,
} from "./intelligence-api";
import {
  intelligenceReportEndpointFamily,
  type IntelligenceScope,
} from "./intelligence-scope";
import type { ReportExportStatus } from "./reports-export-controls";
import { reportsCopy } from "./reports-copy";
import type { ReportResponse, ReportSelector } from "./reports-presentation";

export function reportDescriptor(
  scope: IntelligenceScope,
  selector: ReportSelector,
): IntelligenceRequestDescriptor {
  const endpointFamily = intelligenceReportEndpointFamily(scope);
  if (selector.kind === "DAILY") {
    return { endpointFamily, reportKind: "DAILY", date: selector.date };
  }
  if (selector.kind === "WEEKLY") {
    return { endpointFamily, reportKind: "WEEKLY", weekStart: selector.weekStart };
  }
  return { endpointFamily, reportKind: "MONTHLY", month: selector.month };
}

export async function readReport(
  api: DashboardApiClient,
  scope: IntelligenceScope,
  selector: ReportSelector | null,
  signal: AbortSignal,
): Promise<ReportResponse> {
  if (!selector) throw new Error("Report selector missing.");
  if (scope.kind === "COMPANY") {
    if (selector.kind === "DAILY") {
      return readCompanyDailyReport(api, scope.organizationId, { date: selector.date }, signal);
    }
    if (selector.kind === "WEEKLY") {
      return readCompanyWeeklyReport(api, scope.organizationId, { weekStart: selector.weekStart }, signal);
    }
    return readCompanyMonthlyReport(api, scope.organizationId, { month: selector.month }, signal);
  }
  if (selector.kind === "DAILY") {
    return readLocationDailyReport(api, scope.locationId, { date: selector.date }, signal);
  }
  if (selector.kind === "WEEKLY") {
    return readLocationWeeklyReport(api, scope.locationId, { weekStart: selector.weekStart }, signal);
  }
  return readLocationMonthlyReport(api, scope.locationId, { month: selector.month }, signal);
}

export function previewMessage(error: unknown, t: ReturnType<typeof reportsCopy>) {
  if (!(error instanceof DashboardApiError)) return t.errorGeneric;
  if (error.kind === "auth") return t.errorAuth;
  if (error.kind === "mfa") return t.errorMfa;
  if (error.kind === "authorization") return t.errorAuthorization;
  if (error.kind === "entitlement") return t.errorEntitlement;
  if (error.kind === "validation") return t.errorValidation;
  if (error.kind === "malformed") return t.errorMalformed;
  if (error.kind === "network") return t.errorNetwork;
  return t.errorGeneric;
}

export function exportFailure(error: unknown): ReportExportStatus {
  if (!(error instanceof DashboardApiError)) return "failed";
  if (error.code === "REPORT_EXPORT_TOO_LARGE") return "too-large";
  if (error.kind === "authorization" || error.kind === "mfa" || error.kind === "auth") {
    return "denied";
  }
  if (error.kind === "entitlement") return "entitlement";
  if (error.kind === "malformed") return "malformed";
  return "failed";
}

export async function finalExportFailure(
  error: unknown,
  api: DashboardApiClient,
  scope: IntelligenceScope,
): Promise<ReportExportStatus> {
  const base = exportFailure(error);
  if (!(error instanceof DashboardApiError) || error.kind !== "authorization") return base;
  try {
    const response = scope.kind === "COMPANY"
      ? await readCompanySubscription(api, scope.organizationId)
      : await readLocationSubscription(api, scope.locationId);
    return response.subscription?.entitlements.reportExports === true
      ? "denied"
      : "entitlement";
  } catch {
    return "denied";
  }
}

export function downloadArtifact(bytes: Uint8Array, contentType: string, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: contentType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function intelligenceScopeKey(scope: IntelligenceScope | null) {
  if (scope?.kind === "COMPANY") return `C:${scope.organizationId}`;
  if (scope) return `L:${scope.organizationId}:${scope.locationId}`;
  return "none";
}
