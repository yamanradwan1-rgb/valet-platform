import { ConfirmParkedError } from "./confirm-parked-errors";
import type {
  LockedConfirmSession,
  LockedConfirmTask,
} from "./confirm-parked-types";

export function assertConfirmParkedGuards(
  session: LockedConfirmSession,
  task: LockedConfirmTask,
  input: {
    readonly expectedSessionVersion: number;
    readonly expectedTaskVersion: number;
  },
): void {
  if (
    session.version !== input.expectedSessionVersion ||
    task.version !== input.expectedTaskVersion
  ) {
    throw new ConfirmParkedError("VERSION_CONFLICT");
  }
  if (task.status !== "IN_PROGRESS") {
    throw new ConfirmParkedError("TASK_INVALID_STATE");
  }
  if (
    session.state !== "PARKING" ||
    session.parking_started_at === null ||
    session.parked_at !== null ||
    session.parking_spot_id !== null
  ) {
    throw new ConfirmParkedError("INVALID_STATE_TRANSITION");
  }
}
