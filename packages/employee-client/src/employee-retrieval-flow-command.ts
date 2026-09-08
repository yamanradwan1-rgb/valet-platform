import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type {
  EmployeeRetrievalReadyResult,
  EmployeeRetrievalSnapshot,
  EmployeeRetrievalStartResult,
} from "./employee-retrieval-flow-types";

function responseMismatch(): EmployeeApiError {
  return new EmployeeApiError({
    code: "RETRIEVAL_RESPONSE_MISMATCH",
    message: "The Retrieval command result did not match the current work.",
    status: 502,
  });
}

export function applyStartRetrievalResult(
  snapshot: EmployeeRetrievalSnapshot,
  session: StaffValetSessionDetailResponse,
  task: StaffTaskQueueItem,
  result: EmployeeRetrievalStartResult,
): EmployeeRetrievalSnapshot {
  if (
    result.sessionId !== session.sessionId ||
    result.taskId !== task.taskId ||
    result.sessionVersion !== session.version + 1 ||
    result.taskVersion !== task.version + 1
  ) {
    throw responseMismatch();
  }
  return {
    ...snapshot,
    failure: null,
    phase: "retrieving",
    retrievalStartedAt: result.retrievalStartedAt,
    session: {
      ...session,
      parking: {
        ...session.parking,
        parkingSpotCode: null,
        parkingZoneCode: null,
      },
      state: result.state,
      version: result.sessionVersion,
    },
    task: {
      ...task,
      parkingSpot: null,
      parkingZone: null,
      status: result.taskStatus,
      valetSessionState: result.state,
      valetSessionVersion: result.sessionVersion,
      version: result.taskVersion,
    },
  };
}

export function applyMarkReadyResult(
  snapshot: EmployeeRetrievalSnapshot,
  session: StaffValetSessionDetailResponse,
  task: StaffTaskQueueItem,
  result: EmployeeRetrievalReadyResult,
): EmployeeRetrievalSnapshot {
  if (
    result.sessionId !== session.sessionId ||
    result.taskId !== task.taskId ||
    result.sessionVersion !== session.version + 1 ||
    result.taskVersion !== task.version
  ) {
    throw responseMismatch();
  }
  return {
    ...snapshot,
    failure: null,
    phase: "ready",
    readyAt: result.readyAt,
    session: {
      ...session,
      state: result.state,
      version: result.sessionVersion,
    },
    task: {
      ...task,
      status: result.taskStatus,
      valetSessionState: result.state,
      valetSessionVersion: result.sessionVersion,
      version: result.taskVersion,
    },
  };
}
