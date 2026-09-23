import type { ExportFormat, ReportKind } from "@valet/contracts";

import type { IntelligenceScope } from "./intelligence-scope";
import type { ReportSelector } from "./reports-presentation";

export interface ReportExportIntent {
  readonly exportIntentRevision: number;
  readonly format: ExportFormat;
  readonly identityGeneration: number;
  readonly reportKind: ReportKind;
  readonly scope: IntelligenceScope;
  readonly selectionRevision: number;
  readonly selector: ReportSelector;
  readonly sessionGeneration: number;
}

export function reportExportBaseKey(input: Omit<ReportExportIntent, "exportIntentRevision" | "format">): string {
  return JSON.stringify([
    input.identityGeneration,
    input.sessionGeneration,
    reportExportSelectionKey(input),
  ]);
}

export function reportExportSelectionKey(
  input: Pick<ReportExportIntent, "reportKind" | "scope" | "selectionRevision" | "selector">,
): string {
  return JSON.stringify([
    input.selectionRevision,
    input.scope.kind,
    input.scope.organizationId,
    input.scope.kind === "LOCATION" ? input.scope.locationId : "no-location",
    input.reportKind,
    selectorValue(input.selector),
  ]);
}

export function reportExportIntentKey(intent: ReportExportIntent): string {
  return JSON.stringify([
    reportExportBaseKey(intent),
    intent.format,
    intent.exportIntentRevision,
  ]);
}

export function reportExportIntentIsCurrent(
  intent: ReportExportIntent,
  currentBaseKey: string,
  currentRevision: number,
): boolean {
  return reportExportBaseKey(intent) === currentBaseKey &&
    intent.exportIntentRevision === currentRevision;
}

function selectorValue(selector: ReportSelector): string {
  if (selector.kind === "DAILY") return selector.date;
  if (selector.kind === "WEEKLY") return selector.weekStart;
  return selector.month;
}
