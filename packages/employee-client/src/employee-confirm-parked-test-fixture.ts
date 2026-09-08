import type {
  ConfirmParkedResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import { EmployeeConfirmParkedSession } from "./employee-confirm-parked-session";
import type { EmployeeConfirmParkedTransport } from "./employee-confirm-parked-types";
import {
  parkingStartDetail,
  parkingStartScope,
  parkingStartTask,
} from "./employee-parking-start-test-fixture";
import { ids } from "./employee-operational-test-fixture";

export const activeParkingTask = (
  overrides: Partial<StaffTaskQueueItem> = {},
) =>
  parkingStartTask({
    status: "IN_PROGRESS",
    valetSessionState: "PARKING",
    valetSessionVersion: 3,
    version: 4,
    ...overrides,
  });

export const activeParkingDetail = (
  overrides: Partial<StaffValetSessionDetailResponse> = {},
) =>
  parkingStartDetail({
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: "2026-09-07T08:05:00.000Z",
      parkingZoneCode: "A",
    },
    state: "PARKING",
    version: 3,
    ...overrides,
  });

export const parkedResponse = (
  overrides: Partial<ConfirmParkedResponse> = {},
): ConfirmParkedResponse => ({
  parkedAt: "2026-09-07T08:15:00.000Z",
  parkingSpotCode: "P-101",
  parkingSpotId: "88888888-8888-4888-8888-888888888888",
  parkingZoneId: "99999999-9999-4999-8999-999999999999",
  sessionId: ids.session,
  sessionVersion: 4,
  state: "PARKED",
  taskId: ids.task,
  taskStatus: "COMPLETED",
  taskVersion: 5,
  ...overrides,
});

export const parkedDetail = () =>
  activeParkingDetail({
    keySlot: { code: "K-03" },
    parking: {
      parkedAt: "2026-09-07T08:15:00.000Z",
      parkingSpotCode: "P-101",
      parkingStartedAt: "2026-09-07T08:05:00.000Z",
      parkingZoneCode: "A",
    },
    state: "PARKED",
    version: 4,
  });

export class StubConfirmParkedTransport implements EmployeeConfirmParkedTransport {
  readonly confirmCalls: Array<{ sessionId: string; input: object }> = [];
  confirmResults: Array<Promise<ConfirmParkedResponse>> = [];
  queueResults: Array<Promise<TaskQueueResponse>> = [];
  sessionResults: Array<Promise<StaffValetSessionDetailResponse>> = [];

  confirmParked(sessionId: string, input: object) {
    this.confirmCalls.push({ sessionId, input });
    return this.next(this.confirmResults);
  }
  loadSession() {
    return this.next(this.sessionResults);
  }
  loadTaskQueue() {
    return this.next(this.queueResults);
  }
  private next<T>(results: Array<Promise<T>>): Promise<T> {
    return (
      results.shift() ?? Promise.reject(new Error("Unexpected transport call."))
    );
  }
}

export function confirmParkedHarness() {
  const transport = new StubConfirmParkedTransport();
  const session = new EmployeeConfirmParkedSession({ transport });
  return { session, transport };
}

export async function openConfirmParked(
  session: EmployeeConfirmParkedSession,
  transport: StubConfirmParkedTransport,
) {
  transport.queueResults.push(
    Promise.resolve({ tasks: [activeParkingTask()] }),
  );
  transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
  await session.open(7, parkingStartScope, ids.task, ids.session);
}

export function readyToConfirm(session: EmployeeConfirmParkedSession) {
  session.enterParkingSpot(" P-101 ");
  session.continueToKeySlot();
  session.enterKeySlot(" K-03 ");
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}
