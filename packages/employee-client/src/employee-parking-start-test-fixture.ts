import type {
  ParkingTaskQueueResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  StartParkingResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import { EmployeeParkingStartSession } from "./employee-parking-start-session";
import type { EmployeeParkingStartTransport } from "./employee-parking-start-types";
import {
  ids,
  operationalContext,
  parkingTask,
} from "./employee-operational-test-fixture";
import { resolveEmployeeOperationalScope } from "./employee-operational-scope";

const scopeResolution = resolveEmployeeOperationalScope(operationalContext());
if (scopeResolution.phase !== "ready") throw new Error("Expected ready scope.");
export const parkingStartScope = scopeResolution.scope;

export function parkingStartTask(overrides: Partial<StaffTaskQueueItem> = {}) {
  return parkingTask({
    status: "ACCEPTED",
    valetSessionVersion: 2,
    version: 3,
    ...overrides,
  });
}

export function parkingStartDetail(
  overrides: Partial<StaffValetSessionDetailResponse> = {},
) {
  return {
    checkIn: { conditionCompletedAt: "2026-09-07T08:00:00.000Z" },
    guestAccess: {
      expiresAt: null,
      revokedAt: null,
      status: "NOT_ISSUED" as const,
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: null,
    locationId: ids.location,
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: null,
      parkingZoneCode: null,
    },
    sessionId: ids.session,
    state: "AWAITING_PARKING" as const,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "77777777-7777-4777-8777-777777777777",
      vehicleUpdatedAt: "2026-09-07T08:00:00.000Z",
    },
    version: 2,
    ...overrides,
  } satisfies StaffValetSessionDetailResponse;
}

export function parkingStartedResult(
  overrides: Partial<StartParkingResponse> = {},
) {
  return {
    parkingStartedAt: "2026-09-07T08:05:00.000Z",
    sessionId: ids.session,
    sessionVersion: 3,
    state: "PARKING" as const,
    taskId: ids.task,
    taskStatus: "IN_PROGRESS" as const,
    taskVersion: 4,
    ...overrides,
  };
}

export class StubParkingStartTransport implements EmployeeParkingStartTransport {
  readonly loadQueueCalls: string[] = [];
  readonly loadSessionCalls: string[] = [];
  readonly queueTaskCalls: string[] = [];
  readonly startCalls: Array<{
    sessionId: string;
    sessionVersion: number;
    taskVersion: number;
  }> = [];
  queueResults: Array<Promise<TaskQueueResponse>> = [];
  sessionResults: Array<Promise<StaffValetSessionDetailResponse>> = [];
  startResults: Array<Promise<StartParkingResponse>> = [];
  queuedResults: Array<Promise<ParkingTaskQueueResponse>> = [];

  loadSession(sessionId: string) {
    this.loadSessionCalls.push(sessionId);
    return this.next(this.sessionResults);
  }
  loadTaskQueue(locationId: string) {
    this.loadQueueCalls.push(locationId);
    return this.next(this.queueResults);
  }
  queueParkingTask(sessionId: string) {
    this.queueTaskCalls.push(sessionId);
    return this.next(this.queuedResults);
  }
  startParking(sessionId: string, sessionVersion: number, taskVersion: number) {
    this.startCalls.push({ sessionId, sessionVersion, taskVersion });
    return this.next(this.startResults);
  }
  private next<T>(values: Array<Promise<T>>) {
    return (
      values.shift() ?? Promise.reject(new Error("Unexpected transport call."))
    );
  }
}

export function parkingStartHarness(
  currentTask = parkingStartTask(),
  currentDetail = parkingStartDetail(),
) {
  const transport = new StubParkingStartTransport();
  transport.queueResults.push(Promise.resolve({ tasks: [currentTask] }));
  transport.sessionResults.push(Promise.resolve(currentDetail));
  const session = new EmployeeParkingStartSession({ transport });
  return { session, transport };
}

export async function openParkingStart(session: EmployeeParkingStartSession) {
  await session.openQueueTask(7, parkingStartScope, ids.task, ids.session);
}
