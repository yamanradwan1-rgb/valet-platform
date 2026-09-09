import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import type { NativeAuthSnapshot } from "@valet/employee-client";
import type {
  ProductionDestination,
  ProductionShellState,
} from "./production-shell-controller";

type ActiveShell = Extract<ProductionShellState, { readonly kind: "active" }>;

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
