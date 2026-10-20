import type { NativePinnedSnapshot, NativeDiagnosticCategory,
  NativeDiagnosticResult } from "./native-pinned-diagnostics";
import { isNativeDiagnosticStage } from "./native-pinned-diagnostics";

export interface NativeSupportPinnedSection {
  readonly category: NativeDiagnosticCategory;
  readonly running: boolean;
  readonly status: "not-run" | "success" | "failed" | "unknown";
  readonly firstFailedStage: string;
  readonly lastSucceededStage: string;
  readonly transport: string;
  readonly classification: string;
  readonly localCapture: string;
  readonly stages: readonly Readonly<{ stage: string; outcome: string }>[];
}

function safeValue(category: NativeDiagnosticCategory, value: unknown): string {
  return isNativeDiagnosticStage(category, value) ? value : "none";
}

function safeResult(
  category: NativeDiagnosticCategory,
  result: NativeDiagnosticResult | null,
) {
  if (result === null) return {
    status: "not-run" as const,
    firstFailedStage: "none", lastSucceededStage: "none",
    transport: "not-attempted", stages: [], localCapture: "not-run",
  };
  const status = ["success", "failed", "unknown"].includes(result.status)
    ? result.status : "unknown";
  const transport = ["not-attempted", "attempted-unknown", "server-responded", "verified"]
    .includes(result.transport) ? result.transport : "not-attempted";
  const stages = Array.isArray(result.stages) ? result.stages.filter((item) =>
    isNativeDiagnosticStage(category, item.stage) &&
    ["success", "error", "missing"].includes(item.outcome)).slice(0, 24) : [];
  return {
    status, transport, stages,
    localCapture: result.localCapture === "success" ||
      result.localCapture === "failed" ? result.localCapture : "not-run",
    firstFailedStage: safeValue(category, result.firstFailedStage),
    lastSucceededStage: safeValue(category, result.lastSucceededStage),
  };
}

function incidentClassification(first: string, status: string): string {
  if (status === "success") return "incident-confirmed";
  if (first === "report-transport") return "incident-post-attempted-outcome-unknown";
  if (first === "report-response") return "incident-post-attempted-result-unverified";
  if (first === "reserve-transport") return "reservation-attempted-outcome-unknown";
  if (first === "reserve-response" || first === "reserve-binding")
    return "reservation-attempted-report-not-attempted";
  return "incident-mutation-not-attempted";
}

export function nativeSupportPinnedView(
  snapshot: NativePinnedSnapshot | undefined,
): readonly NativeSupportPinnedSection[] {
  return (["incident", "photo", "crypto"] as const).map((category) => {
    const current = snapshot?.[category];
    const safe = safeResult(category, current?.lastCompleted ?? null);
    return {
      category, running: current?.running === true, ...safe,
      classification: category === "incident"
        ? incidentClassification(safe.firstFailedStage, safe.status) : "not-applicable",
    };
  });
}
