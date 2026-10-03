import type { NativePlateCameraSnapshot } from "./native-plate-camera-controller";

export const PLATE_CAMERA_TRACE_CAPACITY = 512;
export const PLATE_CAMERA_TRACE_EVENTS = [
  "workflow-created",
  "workflow-retired",
  "eligibility",
  "app-state",
  "background-invalidation",
  "foreground-eligible",
  "open-request",
  "permission-read",
  "permission-request",
  "permission-result",
  "permission-failure",
  "controller-state",
  "mount-request",
  "ref-attach",
  "ref-detach",
  "roi-state",
  "ready-callback",
  "size-query-start",
  "size-query-complete",
  "size-query-failure",
  "size-query-discard",
  "size-selection",
  "remount-request",
  "remount-transition",
  "roi-layout",
  "metadata-start",
  "metadata-success",
  "metadata-failure",
  "metadata-discard",
  "preview-validated",
  "ocr-started",
  "ocr-start-blocked",
  "ocr-stopped",
  "ocr-finished",
  "capture-start",
  "capture-success",
  "capture-failure",
  "capture-discard",
  "native-capture-start",
  "native-capture-success",
  "native-capture-failure",
  "capture-cleanup",
  "capture-cleanup-failure",
  "fallback-request",
  "fallback-wait",
  "fallback-ready",
  "fallback-aborted",
  "native-error",
  "controller-close",
  "lifecycle-cleanup",
  "torch-request",
  "torch-cleanup",
] as const;
export type PlateCameraTraceEvent = (typeof PLATE_CAMERA_TRACE_EVENTS)[number];

const numericKeys = [
  "workflowGeneration",
  "identityGeneration",
  "generation",
  "mountId",
  "currentGeneration",
  "currentMountId",
  "refId",
  "cameraMount",
  "readyMount",
  "width",
  "height",
  "geometryRevision",
  "bindingRevision",
  "reading",
  "count",
  "attempt",
  "operationId",
] as const;
const booleanKeys = [
  "current",
  "eligible",
  "attached",
  "validated",
  "aborted",
  "deferred",
  "granted",
  "canAskAgain",
  "torchEnabled",
  "captureFallbackUsed",
  "operationActive",
] as const;
const phases = [
  "idle",
  "requesting",
  "starting",
  "preview",
  "denied",
  "error",
  "no-match",
  "unavailable",
];
const enumValues = {
  phase: phases,
  currentPhase: phases,
  appState: ["active", "inactive", "background", "unknown", "extension"],
  reason: [
    "native",
    "mapping",
    "stale",
    "cleanup",
    "permission",
    "preferred",
    "fallback",
    "cancelled",
  ],
} as const;

export type PlateCameraTraceDetails = Partial<
  Record<(typeof numericKeys)[number], number>
> &
  Partial<Record<(typeof booleanKeys)[number], boolean>> & {
    phase?: NativePlateCameraSnapshot["phase"];
    currentPhase?: NativePlateCameraSnapshot["phase"];
    appState?: string;
    reason?: (typeof enumValues.reason)[number];
    pictureSize?: string | undefined;
    preferredPictureSize?: string | undefined;
    fallbackPictureSize?: string | undefined;
  };

export interface PlateCameraTraceRecord {
  readonly sequence: number;
  readonly elapsedMs: number;
  readonly event: PlateCameraTraceEvent;
  readonly details: Readonly<PlateCameraTraceDetails>;
}

let sequence = 0;
let workflowSequence = 0;
let lastTime = 0;
const records: PlateCameraTraceRecord[] = [];

function enabled(): boolean {
  // Explicit investigation opt-in; normal development/release builds remain quiet.
  return process.env.EXPO_PUBLIC_PLATE_CAMERA_TRACE === "1";
}

function append(
  event: PlateCameraTraceEvent,
  input: PlateCameraTraceDetails,
): void {
  if (!enabled() || !PLATE_CAMERA_TRACE_EVENTS.includes(event)) return;
  const details: Record<string, number | boolean | string> = {};
  for (const key of numericKeys) {
    const value = input[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= -1 &&
      value <= Number.MAX_SAFE_INTEGER &&
      (key === "width" || key === "height" || Number.isSafeInteger(value))
    )
      details[key] = value;
  }
  for (const key of booleanKeys) {
    if (typeof input[key] === "boolean") details[key] = input[key];
  }
  for (const key of ["phase", "currentPhase", "appState", "reason"] as const) {
    const value = input[key];
    if (
      typeof value === "string" &&
      (enumValues[key] as readonly string[]).includes(value)
    )
      details[key] = value;
  }
  for (const key of [
    "pictureSize",
    "preferredPictureSize",
    "fallbackPictureSize",
  ] as const) {
    const value = input[key];
    if (typeof value === "string" && /^\d{1,5}x\d{1,5}$/.test(value))
      details[key] = value;
  }
  lastTime = Math.max(lastTime, Math.round(performance.now()));
  const record = Object.freeze({
    sequence: ++sequence,
    elapsedMs: lastTime,
    event,
    details: Object.freeze(details) as PlateCameraTraceDetails,
  });
  if (records.length === PLATE_CAMERA_TRACE_CAPACITY) records.shift();
  records.push(record);
  try {
    console.info(`PLATE_CAMERA_TRACE ${JSON.stringify(record)}`);
  } catch {
    // Diagnostic transport must never change acquisition or state publication.
  }
}

/** Debugger-only read; no UI, persistence, timer, network or business-state writer. */
export function readNativePlateCameraTrace(): readonly PlateCameraTraceRecord[] {
  return records.slice();
}

/** One locally numbered camera workflow owner, independent of domain identifiers. */
export class NativePlateCameraTrace {
  readonly workflowGeneration = ++workflowSequence;
  private currentSnapshot: (() => NativePlateCameraSnapshot) | undefined;
  private readonly refs = new WeakMap<object, number>();
  private refSequence = 0;
  private appState = "unknown";

  constructor(private readonly identityGeneration = 0) {}

  bind(current: () => NativePlateCameraSnapshot): void {
    this.currentSnapshot = current;
    this.record("workflow-created");
  }

  owner(): PlateCameraTraceDetails {
    const current = this.currentSnapshot?.();
    return current
      ? {
          generation: current.generation,
          mountId: current.mountId,
        }
      : {};
  }

  refId(ref: object | null): number {
    if (!ref) return -1;
    let id = this.refs.get(ref);
    if (id === undefined) {
      id = ++this.refSequence;
      this.refs.set(ref, id);
    }
    return id;
  }

  state(appState: string, deferred: boolean): void {
    this.appState = appState;
    this.record("app-state", { deferred });
  }

  record(
    event: PlateCameraTraceEvent,
    details: PlateCameraTraceDetails = {},
  ): void {
    if (!enabled()) return;
    const current = this.currentSnapshot?.();
    append(event, {
      workflowGeneration: this.workflowGeneration,
      identityGeneration: this.identityGeneration,
      appState: this.appState,
      generation: current?.generation,
      mountId: current?.mountId,
      phase: current?.phase,
      currentGeneration: current?.generation,
      currentMountId: current?.mountId,
      currentPhase: current?.phase,
      ...details,
    } as PlateCameraTraceDetails);
  }

  transition(
    previous: NativePlateCameraSnapshot,
    next: NativePlateCameraSnapshot,
  ): void {
    this.record("controller-state", next);
    if (previous.mountId !== next.mountId)
      this.record(
        previous.phase !== "requesting" &&
          previous.generation === next.generation
          ? "remount-transition"
          : "mount-request",
        next,
      );
    if (previous.torchEnabled && !next.torchEnabled)
      this.record("torch-cleanup");
    if (previous.phase !== "preview" && next.phase === "preview")
      this.record("preview-validated");
  }
}
