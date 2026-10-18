import type { IncidentPreflightStage } from "@valet/employee-client";

export const PHOTO_DIAGNOSTIC_STAGES = [
  "camera-readiness", "camera-capture", "camera-result", "cache-uri",
  "source-file", "manipulator-init", "image-resize", "image-render", "jpeg-save",
  "jpeg-size", "photo-handle-uuid", "owned-copy", "copy-verify",
  "cleanup", "preview", "upload-uuid", "upload-transport", "upload-response",
  "upload-body",
] as const;
export const CRYPTO_DIAGNOSTIC_STAGES = [
  "crypto-object", "get-random-values", "uuid-v8-validation", "random-uuid",
] as const;
const INCIDENT_DIAGNOSTIC_STAGES = [
  "session-detail-transport", "session-detail-response", "context",
  "input-validation", "storage-read", "marker-parse", "secure-uuid",
  "storage-write", "storage-readback", "marker-verify",
  "reserve-transport", "reserve-response", "reserve-binding",
  "report-transport", "report-response",
] as const satisfies readonly IncidentPreflightStage[];

export type NativeDiagnosticCategory = "incident" | "photo" | "crypto";
export type NativeDiagnosticStage =
  | IncidentPreflightStage
  | (typeof PHOTO_DIAGNOSTIC_STAGES)[number]
  | (typeof CRYPTO_DIAGNOSTIC_STAGES)[number];
export type NativeDiagnosticOutcome = "start" | "success" | "error" | "missing";
export type NativeDiagnosticStatus = "success" | "failed" | "unknown";
export type NativeDiagnosticTransport =
  "not-attempted" | "attempted-unknown" | "server-responded" | "verified";

export interface NativeDiagnosticResult {
  readonly status: NativeDiagnosticStatus;
  readonly firstFailedStage: NativeDiagnosticStage | null;
  readonly lastSucceededStage: NativeDiagnosticStage | null;
  readonly transport: NativeDiagnosticTransport;
  readonly localCapture?: "success" | "failed" | "not-run";
  readonly stages: readonly Readonly<{
    stage: NativeDiagnosticStage;
    outcome: Exclude<NativeDiagnosticOutcome, "start">;
  }>[];
}
export interface NativeDiagnosticCategorySnapshot {
  readonly running: boolean;
  readonly lastCompleted: NativeDiagnosticResult | null;
}
export type NativePinnedSnapshot =
  Readonly<Record<NativeDiagnosticCategory, NativeDiagnosticCategorySnapshot>>;

interface MutableAttempt {
  readonly token: number;
  readonly results: Map<NativeDiagnosticStage, Exclude<NativeDiagnosticOutcome, "start">>;
  firstFailedStage: NativeDiagnosticStage | null;
  lastSucceededStage: NativeDiagnosticStage | null;
}
interface CategoryState {
  active: MutableAttempt | null;
  lastCompleted: NativeDiagnosticResult | null;
}

const STAGES: Record<NativeDiagnosticCategory, readonly string[]> = {
  incident: INCIDENT_DIAGNOSTIC_STAGES,
  photo: PHOTO_DIAGNOSTIC_STAGES,
  crypto: CRYPTO_DIAGNOSTIC_STAGES,
};

export function isNativeDiagnosticStage(
  category: NativeDiagnosticCategory,
  stage: unknown,
): stage is NativeDiagnosticStage {
  return typeof stage === "string" && STAGES[category].includes(stage);
}

/** Process-local, content-free diagnostics. Never stores any business identity. */
export class NativePinnedDiagnostics {
  private sequence = 0;
  private readonly states: Record<NativeDiagnosticCategory, CategoryState> = {
    incident: { active: null, lastCompleted: null },
    photo: { active: null, lastCompleted: null },
    crypto: { active: null, lastCompleted: null },
  };

  begin(category: NativeDiagnosticCategory): number {
    const token = ++this.sequence;
    this.states[category].active = {
      token, results: new Map(), firstFailedStage: null, lastSucceededStage: null,
    };
    return token;
  }

  stage(
    category: NativeDiagnosticCategory,
    token: number,
    stage: NativeDiagnosticStage,
    outcome: NativeDiagnosticOutcome,
  ): void {
    if (!isNativeDiagnosticStage(category, stage) ||
      !["start", "success", "error", "missing"].includes(outcome)) return;
    const active = this.states[category].active;
    if (active?.token !== token || outcome === "start") return;
    active.results.set(stage, outcome);
    if ((outcome === "error" || outcome === "missing") &&
      active.firstFailedStage === null) active.firstFailedStage = stage;
    if (outcome === "success") active.lastSucceededStage = stage;
  }

  complete(
    category: NativeDiagnosticCategory,
    token: number,
    status: NativeDiagnosticStatus,
    transport: NativeDiagnosticTransport,
  ): void {
    if (!["success", "failed", "unknown"].includes(status) ||
      !["not-attempted", "attempted-unknown", "server-responded", "verified"].includes(transport))
      return;
    const state = this.states[category];
    const active = state.active;
    if (active?.token !== token) return;
    const isPhotoUpload = category === "photo" &&
      Array.from(active.results.keys()).some((stage) => stage.startsWith("upload-"));
    state.lastCompleted = Object.freeze({
      status: active.firstFailedStage !== null ? "failed" : status,
      firstFailedStage: active.firstFailedStage,
      lastSucceededStage: active.lastSucceededStage,
      transport,
      ...(category === "photo" ? {
        localCapture: isPhotoUpload
          ? (state.lastCompleted?.localCapture ?? "not-run")
          : active.firstFailedStage === null ? "success" : "failed",
      } : {}),
      stages: Object.freeze(Array.from(active.results, ([stage, outcome]) =>
        Object.freeze({ stage, outcome }))),
    });
    state.active = null;
  }

  cancel(category: NativeDiagnosticCategory, token: number): void {
    if (this.states[category].active?.token === token)
      this.states[category].active = null;
  }

  snapshot(): NativePinnedSnapshot {
    const extract = (category: NativeDiagnosticCategory) =>
      Object.freeze({
        running: this.states[category].active !== null,
        lastCompleted: this.states[category].lastCompleted,
      });
    return Object.freeze({
      incident: extract("incident"),
      photo: extract("photo"),
      crypto: extract("crypto"),
    });
  }
}
