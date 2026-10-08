import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import type {
  EmployeeHandoffSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { nativeHandoffGuestAccessRecoveryTarget } from "../handoff/native-handoff-guest-access-recovery";
import type {
  NativeContextualRoute,
  NativeWorkflowOrigin,
} from "./native-contextual-route";
import type {
  ProductionDestination,
  ProductionShellState,
} from "./production-shell-controller";

type ActiveShell = Extract<ProductionShellState, { readonly kind: "active" }>;

export const NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED = false;

export function openHandoffGuestAccessRecovery(
  snapshot: EmployeeHandoffSnapshot,
  open: (
    kind: NativeContextualRoute["kind"],
    origin: NativeWorkflowOrigin,
    sessionId: string,
  ) => void,
  enabled = NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED,
): boolean {
  if (!enabled) return false;
  const target = nativeHandoffGuestAccessRecoveryTarget(snapshot);
  if (target === null) return false;
  open("guest-access", target.origin, target.sessionId);
  return true;
}

export function closeRetrieval(
  runtime: NativeEmployeeRuntime,
  navigate: (destination: ProductionDestination) => void,
) {
  runtime.handoff.clear();
  runtime.release.clear();
  runtime.retrieval.clear();
  void runtime.operations.refreshQueue();
  navigate("tasks");
}

export function openHandoff(
  runtime: NativeEmployeeRuntime,
  authSnapshot: NativeAuthSnapshot,
  shell: ActiveShell,
  taskId: string,
  sessionId: string,
) {
  runtime.retrieval.clear();
  runtime.release.clear();
  void runtime.handoff.openTask(
    authSnapshot.authGeneration,
    shell.scope,
    taskId,
    sessionId,
  );
}
