import { MarkReadyError } from "./mark-ready-errors";
import type {
  LockedMarkReadyRequest,
  LockedMarkReadySession,
  LockedMarkReadyTask,
} from "./mark-ready-types";

export function assertMarkReadyTask(task: LockedMarkReadyTask): void {
  if (task.status !== "IN_PROGRESS") {
    throw new MarkReadyError("TASK_INVALID_STATE");
  }
}

export function assertMarkReadySession(session: LockedMarkReadySession): void {
  if (
    session.state !== "RETRIEVING" ||
    session.retrieval_requested_at === null ||
    session.retrieval_started_at === null ||
    session.ready_at !== null
  ) {
    throw new MarkReadyError("INVALID_STATE_TRANSITION");
  }
}

export function assertAcceptedRetrievalRequest(
  request: LockedMarkReadyRequest,
): void {
  if (request.status !== "ACCEPTED") {
    throw new MarkReadyError("RETRIEVAL_REQUEST_NOT_READY");
  }
}

export function assertMarkReadyVersion(
  session: LockedMarkReadySession,
  expectedSessionVersion: number,
): void {
  if (session.version !== expectedSessionVersion) {
    throw new MarkReadyError("VERSION_CONFLICT");
  }
}
