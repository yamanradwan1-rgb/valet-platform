import type { StaffTaskQueueItem } from "@valet/employee-client";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { executeNativeTaskAction } from "../tasks/native-task-action-sequence";
import type { NativeProductionWorkspaceProps } from "./native-production-workspace-types";
import { openHandoff } from "./native-production-workflow-navigation";

type EntryInput = {
  readonly authSnapshot: NativeProductionWorkspaceProps["authSnapshot"];
  readonly navigate: NativeProductionWorkspaceProps["navigate"];
  readonly revision: { current: number };
  readonly runtime: NativeEmployeeRuntime;
  readonly shell: NativeProductionWorkspaceProps["shell"];
  readonly task: StaffTaskQueueItem;
};

// Leaving Tasks while a re-entry read is pending must invalidate both the
// navigation decision and its canonical session callbacks.
export function cancelNativeTaskReentry(
  revision: { current: number },
  runtime: Pick<NativeEmployeeRuntime, "retrieval" | "handoff" | "release">,
): void {
  revision.current += 1;
  runtime.retrieval.clear();
  runtime.handoff.clear();
  runtime.release.clear();
}

export async function executeNativeTaskReentry(input: EntryInput): Promise<boolean> {
  const revision = ++input.revision.current;
  const isEntryCurrent = () => input.revision.current === revision;

  // Retire the previous target before canonical Retrieval can publish READY:
  // that publication starts the *new* Handoff via the runtime callback.
  input.runtime.handoff.clear();
  input.runtime.release.clear();
  input.runtime.retrieval.clear();

  const result = await executeNativeTaskAction({
    identityGeneration: input.authSnapshot.authGeneration,
    isEntryCurrent,
    operations: input.runtime.operations,
    parking: input.runtime.parking,
    retrieval: input.runtime.retrieval,
    scope: input.shell.scope,
    task: input.task,
  });
  if (!isEntryCurrent() || result.kind !== "navigate") return false;

  // HANDOFF_PENDING skips Retrieval reconstruction (which remains inactive).
  // READY already opened Handoff from onStateChange. Do not trust the clicked
  // card's possibly stale state here or open the same Handoff twice.
  if (
    result.destination === "retrieval" &&
    input.runtime.retrieval.current().phase === "inactive"
  ) {
    openHandoff(
      input.runtime,
      input.authSnapshot,
      input.shell,
      input.task.taskId,
      input.task.sessionId,
    );
  }
  input.navigate(result.destination);
  return true;
}
