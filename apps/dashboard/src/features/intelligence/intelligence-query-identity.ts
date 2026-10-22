import type { ReportKind } from "@valet/contracts";

import type {
  IntelligenceScope,
  LocationAnalyticsEndpointFamily,
} from "./intelligence-scope";

export type IntelligenceCurrentEndpointFamily =
  | "LOCATION_STATE_COUNTS"
  | "LOCATION_FINANCIAL_OVERVIEW"
  | "LOCATION_QUEUE";

export type IntelligenceAnalyticsEndpointFamily =
  | LocationAnalyticsEndpointFamily
  | "COMPANY_ANALYTICS"
  | "COMPANY_RATINGS"
  | "LOCATION_RATINGS";

export type IntelligenceReportEndpointFamily =
  | "LOCATION_REPORT"
  | "COMPANY_REPORT";

export type IntelligenceRequestDescriptor =
  | { readonly endpointFamily: IntelligenceCurrentEndpointFamily }
  | {
      readonly endpointFamily: IntelligenceAnalyticsEndpointFamily;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly endpointFamily: IntelligenceReportEndpointFamily;
      readonly reportKind: "DAILY";
      readonly date: string;
    }
  | {
      readonly endpointFamily: IntelligenceReportEndpointFamily;
      readonly reportKind: "WEEKLY";
      readonly weekStart: string;
    }
  | {
      readonly endpointFamily: IntelligenceReportEndpointFamily;
      readonly reportKind: "MONTHLY";
      readonly month: string;
    };

export interface IntelligenceRequestIdentityInput {
  readonly descriptor: IntelligenceRequestDescriptor;
  readonly identityGeneration: number;
  readonly retryRevision: number;
  readonly scope: IntelligenceScope;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}

export function intelligenceRequestKey(
  input: IntelligenceRequestIdentityInput,
): string {
  assertDescriptorMatchesScope(input.scope, input.descriptor);
  return JSON.stringify([
    input.identityGeneration,
    input.sessionGeneration,
    input.selectionRevision,
    input.scope.kind,
    input.scope.organizationId,
    input.scope.kind === "LOCATION" ? input.scope.locationId : "no-location",
    input.descriptor.endpointFamily,
    ...descriptorIdentity(input.descriptor),
    input.retryRevision,
  ]);
}

function descriptorIdentity(
  descriptor: IntelligenceRequestDescriptor,
): readonly string[] {
  if ("from" in descriptor) return [descriptor.from, descriptor.to];
  if (!("reportKind" in descriptor)) return ["current"];
  return [
    descriptor.reportKind,
    reportSelector(descriptor.reportKind, descriptor),
  ];
}

function reportSelector(
  reportKind: ReportKind,
  descriptor: Extract<IntelligenceRequestDescriptor, { readonly reportKind: ReportKind }>,
): string {
  if (reportKind === "DAILY" && "date" in descriptor) return descriptor.date;
  if (reportKind === "WEEKLY" && "weekStart" in descriptor) return descriptor.weekStart;
  if (reportKind === "MONTHLY" && "month" in descriptor) return descriptor.month;
  throw new Error("Invalid intelligence report selector.");
}

function assertDescriptorMatchesScope(
  scope: IntelligenceScope,
  descriptor: IntelligenceRequestDescriptor,
): void {
  const companyFamily = descriptor.endpointFamily === "COMPANY_ANALYTICS" ||
    descriptor.endpointFamily === "COMPANY_RATINGS" ||
    descriptor.endpointFamily === "COMPANY_REPORT";
  const locationFamily = descriptor.endpointFamily.startsWith("LOCATION_");
  if (
    (scope.kind === "COMPANY" && !companyFamily) ||
    (scope.kind === "LOCATION" && !locationFamily)
  ) {
    throw new Error("Intelligence endpoint family does not match scope.");
  }
}
