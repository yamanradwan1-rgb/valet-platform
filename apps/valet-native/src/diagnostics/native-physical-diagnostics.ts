import type {
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import {
  NativePhysicalDiagnosticsStore,
  type PhysicalDiagnosticsPersistence,
} from "./native-physical-diagnostics-store";
import type {
  PhysicalFailureClass,
  PhysicalMetric,
} from "./native-physical-diagnostics-model";

const memoryPersistence: PhysicalDiagnosticsPersistence = {
  clear: async () => undefined,
  read: async () => null,
  write: async () => undefined,
};
let store = new NativePhysicalDiagnosticsStore(memoryPersistence);

const enabled = typeof __DEV__ === "boolean" && __DEV__;
const starts = new Map<
  PhysicalMetric,
  { at: number; classification: string }
>();
let bootstrapAt = Date.now();
let bootstrapRecorded = false;
let bootstrapClass = "restored-authenticated-session";
let cameraCount = 0;

if (enabled) void store.load();

export function installPhysicalDiagnosticsPersistence(
  persistence: PhysicalDiagnosticsPersistence,
): void {
  if (!enabled) return;
  store = new NativePhysicalDiagnosticsStore(persistence);
  void store.load();
}

export function getPhysicalDiagnostics(): NativePhysicalDiagnosticsStore {
  return store;
}

export function classifyPhysicalBootstrap(auth: NativeAuthSnapshot): void {
  if (enabled && !bootstrapRecorded) {
    bootstrapClass =
      auth.phase === "authenticated" || auth.phase === "restoring"
        ? "restored-authenticated-session"
        : "auth-required";
  }
}

export function beginPhysicalMetric(
  metric: PhysicalMetric,
  classification: string,
): void {
  if (enabled) starts.set(metric, { at: Date.now(), classification });
}

export function finishPhysicalMetric(
  metric: PhysicalMetric,
  outcome: "success" | "failure",
  failureClass?: PhysicalFailureClass,
): void {
  if (!enabled) return;
  const start = starts.get(metric);
  if (!start) return;
  starts.delete(metric);
  store.record({
    metric,
    startedAt: start.at,
    outcome,
    warmColdClass: start.classification,
    ...(failureClass ? { failureClass } : {}),
  });
}

export function beginCameraReady(): void {
  beginPhysicalMetric(
    "camera_ready_ms",
    cameraCount++ === 0 ? "first" : "warm",
  );
}

export function observeOperationalReady(
  auth: NativeAuthSnapshot,
  operations: EmployeeOperationalSnapshot,
): void {
  if (!enabled) return;
  if (auth.phase === "unauthenticated") bootstrapClass = "auth-required";
  const authoritative =
    operations.phase === "ready" &&
    operations.scope !== null &&
    operations.queueFailure === null &&
    !operations.queueLoading;
  if (!bootstrapRecorded && auth.phase === "fatal") {
    bootstrapRecorded = true;
    store.record({
      metric: "js_bootstrap_to_operational_ready_ms",
      startedAt: bootstrapAt,
      outcome: "failure",
      warmColdClass: bootstrapClass,
      failureClass: "unknown",
    });
  } else if (!bootstrapRecorded && operations.contextFailure !== null) {
    bootstrapRecorded = true;
    store.record({
      metric: "js_bootstrap_to_operational_ready_ms",
      startedAt: bootstrapAt,
      outcome: "failure",
      warmColdClass: bootstrapClass,
      failureClass: "network",
    });
  }
  if (authoritative && !bootstrapRecorded) {
    bootstrapRecorded = true;
    store.record({
      metric: "js_bootstrap_to_operational_ready_ms",
      startedAt: bootstrapAt,
      outcome: "success",
      warmColdClass: bootstrapClass,
    });
  }
  if (authoritative) finishPhysicalMetric("task_list_ready_ms", "success");
  if (operations.queueFailure !== null)
    finishPhysicalMetric("task_list_ready_ms", "failure", "network");
  else if (operations.contextFailure !== null)
    finishPhysicalMetric("task_list_ready_ms", "failure", "network");
}

export function resetPhysicalBootstrapForTest(at: number): void {
  bootstrapAt = at;
  bootstrapRecorded = false;
  bootstrapClass = "restored-authenticated-session";
}
