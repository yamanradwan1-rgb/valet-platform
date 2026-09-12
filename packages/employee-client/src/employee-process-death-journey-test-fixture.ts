import type {
  StaffOperationalContextResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import { EmployeeOperationalSession } from "./employee-operational-session";
import { operationalContext } from "./employee-operational-test-fixture";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import { ProtectedCommandServer } from "./protected-command-process-death-test-fixture";

export interface JourneyAuthority {
  context: StaffOperationalContextResponse;
  session: StaffValetSessionDetailResponse;
  task: StaffTaskQueueItem | null;
}

export function journeyServer(
  session: StaffValetSessionDetailResponse,
  task: StaffTaskQueueItem | null,
) {
  return new ProtectedCommandServer<JourneyAuthority>({
    context: operationalContext(),
    session,
    task,
  });
}

export function canonicalJourneyReads(
  server: ProtectedCommandServer<JourneyAuthority>,
) {
  return {
    loadSession: async () => server.canonicalRead("session").session,
    loadTaskQueue: async () => {
      const task = server.canonicalRead("task-queue").task;
      return { tasks: task === null ? [] : [task] };
    },
  };
}

export interface ColdStartAuthority {
  readonly operations: EmployeeOperationalSession;
  readonly scope: EmployeeOperationalScope;
  readonly tasks: readonly StaffTaskQueueItem[];
}

export async function restoreColdStartAuthority(
  server: ProtectedCommandServer<JourneyAuthority>,
  generation: number,
): Promise<ColdStartAuthority> {
  const operations = new EmployeeOperationalSession({
    pollingIntervalMs: 60_000,
    transport: {
      acceptTask: async () => {
        throw new Error("Cold start must not accept a Task.");
      },
      assignTask: async () => {
        throw new Error("Cold start must not assign a Task.");
      },
      loadOperationalContext: async () =>
        server.canonicalRead("operational-context").context,
      loadTaskQueue: canonicalJourneyReads(server).loadTaskQueue,
    },
  });
  await operations.activate(generation);
  const snapshot = operations.current();
  if (snapshot.phase !== "ready" || snapshot.scope === null) {
    operations.dispose();
    throw new Error("Expected restored operational authority.");
  }
  return { operations, scope: snapshot.scope, tasks: snapshot.tasks };
}
