import { StartRetrievalError } from "./start-retrieval-errors";
import type {
  LockedRetrievalRequest,
  LockedStartRetrievalSession,
  LockedStartRetrievalTask,
} from "./start-retrieval-types";

export function assertStartRetrievalGuards(
  session: LockedStartRetrievalSession,
  task: LockedStartRetrievalTask,
  input: {
    readonly expectedSessionVersion: number;
    readonly expectedTaskVersion: number;
  },
): void {
  if (
    session.version !== input.expectedSessionVersion ||
    task.version !== input.expectedTaskVersion
  ) {
    throw new StartRetrievalError("VERSION_CONFLICT");
  }
  if (task.status !== "ACCEPTED") {
    throw new StartRetrievalError("TASK_INVALID_STATE");
  }
  if (
    session.state !== "REQUESTED" ||
    session.retrieval_requested_at === null ||
    session.retrieval_started_at !== null ||
    session.parking_spot_id === null
  ) {
    throw new StartRetrievalError("INVALID_STATE_TRANSITION");
  }
}

export function assertOpenRetrievalRequest(
  request: LockedRetrievalRequest,
): void {
  if (request.status !== "OPEN") {
    throw new StartRetrievalError("RETRIEVAL_REQUEST_NOT_READY");
  }
}
