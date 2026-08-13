import { CompleteHandoffError } from "./complete-handoff-errors";
import type {
  LockedCompleteHandoffRequest,
  LockedCompleteHandoffSession,
  LockedCompleteHandoffTask,
  LockedReleaseCustody,
} from "./complete-handoff-types";

export function assertCompleteHandoffLifecycle(
  session: LockedCompleteHandoffSession,
  task: LockedCompleteHandoffTask,
  request: LockedCompleteHandoffRequest,
  expectedSessionVersion: number,
): void {
  if (session.version !== expectedSessionVersion) {
    throw new CompleteHandoffError("VERSION_CONFLICT");
  }
  if (task.status !== "IN_PROGRESS") {
    throw new CompleteHandoffError("TASK_INVALID_STATE");
  }
  if (request.status !== "ACCEPTED") {
    throw new CompleteHandoffError("RETRIEVAL_REQUEST_NOT_READY");
  }
  if (
    session.state !== "HANDOFF_PENDING" ||
    session.retrieval_requested_at === null ||
    session.retrieval_started_at === null ||
    session.ready_at === null ||
    session.handoff_pending_at === null
  ) {
    throw new CompleteHandoffError("INVALID_STATE_TRANSITION");
  }
}

export function assertReleaseCustody(
  custody: LockedReleaseCustody | undefined,
  keySlotId: string,
): void {
  if (
    custody?.event_type !== "CHECKED_OUT" ||
    custody.key_slot_id !== keySlotId
  ) {
    throw new CompleteHandoffError("KEY_CUSTODY_NOT_READY");
  }
}
