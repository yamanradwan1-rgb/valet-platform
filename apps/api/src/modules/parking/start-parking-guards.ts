import { StartParkingError } from "./start-parking-errors";
import type {
  LockedStartParkingSession,
  LockedStartParkingTask,
} from "./start-parking-types";

export function assertStartParkingGuards(
  session: LockedStartParkingSession,
  task: LockedStartParkingTask,
  input: {
    readonly expectedSessionVersion: number;
    readonly expectedTaskVersion: number;
  },
): void {
  if (
    session.version !== input.expectedSessionVersion ||
    task.version !== input.expectedTaskVersion
  ) {
    throw new StartParkingError("VERSION_CONFLICT");
  }
  if (task.status !== "ACCEPTED") {
    throw new StartParkingError("TASK_INVALID_STATE");
  }
  if (
    session.state !== "AWAITING_PARKING" ||
    session.parking_started_at !== null
  ) {
    throw new StartParkingError("INVALID_STATE_TRANSITION");
  }
}
