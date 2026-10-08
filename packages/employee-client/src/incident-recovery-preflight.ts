/** Closed, content-free incident-preflight stage vocabulary. Never emit IDs. */
export type IncidentPreflightStage =
  | "session-detail-transport"
  | "session-detail-response"
  | "context"
  | "input-validation"
  | "storage-read"
  | "marker-parse"
  | "secure-uuid"
  | "storage-write"
  | "storage-readback"
  | "marker-verify"
  | "reserve-transport"
  | "reserve-response"
  | "reserve-binding"
  | "report-transport"
  | "report-response";

export interface IncidentPreflightEvent {
  readonly outcome: "start" | "success" | "error";
  readonly stage: IncidentPreflightStage;
}

export type IncidentPreflightObserver = (event: IncidentPreflightEvent) => void;

function notify(
  observer: IncidentPreflightObserver | undefined,
  stage: IncidentPreflightStage,
  outcome: IncidentPreflightEvent["outcome"],
): void {
  try {
    observer?.({ stage, outcome });
  } catch {
    // Diagnostics are always fail-open and must never change a transaction.
  }
}

export function observeIncidentPreflight<T>(
  observer: IncidentPreflightObserver | undefined,
  stage: IncidentPreflightStage,
  operation: () => T,
): T {
  notify(observer, stage, "start");
  try {
    const result = operation();
    notify(observer, stage, "success");
    return result;
  } catch (error) {
    notify(observer, stage, "error");
    throw error;
  }
}

export async function observeIncidentPreflightAsync<T>(
  observer: IncidentPreflightObserver | undefined,
  stage: IncidentPreflightStage,
  operation: () => Promise<T>,
): Promise<T> {
  notify(observer, stage, "start");
  try {
    const result = await operation();
    notify(observer, stage, "success");
    return result;
  } catch (error) {
    notify(observer, stage, "error");
    throw error;
  }
}
