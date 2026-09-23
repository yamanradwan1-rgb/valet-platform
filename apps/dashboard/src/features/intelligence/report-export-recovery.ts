import type { ReportKind } from "@valet/contracts";

import type { ReportSelector } from "./reports-presentation";

export interface ReportExportAuthRecovery {
  readonly identityGeneration: number;
  readonly reportKind: ReportKind;
  readonly scopeKey: string;
  readonly selectionRevision: number;
  readonly selector: ReportSelector;
}

let pendingRecovery: ReportExportAuthRecovery | null = null;

export function rememberReportExportAuthRecovery(recovery: ReportExportAuthRecovery): void {
  pendingRecovery = recovery;
}

export function takeReportExportAuthRecovery(
  identityGeneration: number,
  scopeKey: string,
  selectionRevision: number,
): ReportExportAuthRecovery | null {
  const recovery = pendingRecovery;
  pendingRecovery = null;
  if (
    recovery === null ||
    recovery.identityGeneration !== identityGeneration ||
    recovery.scopeKey !== scopeKey ||
    recovery.selectionRevision !== selectionRevision
  ) {
    return null;
  }
  return recovery;
}
