import type {
  AcceptTaskResponse,
  AssignTaskResponse,
  StaffTaskQueueItem,
  TaskQueueResponse,
} from "@valet/contracts";
import type { StaffOperationalContextResponse } from "@valet/contracts/staff-context";

import type { EmployeeOperationalTransport } from "./employee-operational-types";

export const ids = {
  location: "11111111-1111-4111-8111-111111111111",
  membership: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  session: "44444444-4444-4444-8444-444444444444",
  shift: "55555555-5555-4555-8555-555555555555",
  task: "66666666-6666-4666-8666-666666666666",
};

export function operationalContext(
  active = true,
): StaffOperationalContextResponse {
  const location = {
    code: "AMM-1",
    currency: "JOD",
    locationId: ids.location,
    name: "Amman Hotel",
    timezone: "Asia/Amman",
  };
  return {
    contexts: [
      {
        activeShift: active
          ? {
              locationId: ids.location,
              shiftId: ids.shift,
              startedAt: "2026-09-03T08:00:00.000Z",
              status: "ACTIVE",
            }
          : null,
        currentLocation: active ? location : null,
        eligibleLocations: [location],
        membershipId: ids.membership,
        organization: {
          name: "VAYLET Operator",
          organizationId: ids.organization,
        },
        role: "VALET_EMPLOYEE",
      },
    ],
  };
}

export function parkingTask(
  overrides: Partial<StaffTaskQueueItem> = {},
): StaffTaskQueueItem {
  return {
    createdAt: "2026-09-03T08:05:00.000Z",
    currentAssigneeMembershipId: ids.membership,
    parkingSpot: null,
    parkingZone: null,
    retrievalRequestedAt: null,
    sessionId: ids.session,
    status: "ASSIGNED",
    taskId: ids.task,
    taskType: "PARKING",
    valetSessionState: "AWAITING_PARKING",
    valetSessionVersion: 1,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    version: 2,
    ...overrides,
  };
}

export function acceptedProjection(): AcceptTaskResponse {
  return {
    createdAt: "2026-09-03T08:05:00.000Z",
    currentAssigneeMembershipId: ids.membership,
    sessionId: ids.session,
    status: "ACCEPTED",
    taskId: ids.task,
    taskType: "PARKING",
    version: 3,
  };
}

export function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

export class StubOperationalTransport implements EmployeeOperationalTransport {
  readonly acceptCalls: Array<{ expectedVersion: number; taskId: string }> = [];
  acceptResults: Array<Promise<AcceptTaskResponse>> = [];
  readonly assignCalls: Array<{ expectedVersion: number; taskId: string }> = [];
  assignResults: Array<Promise<AssignTaskResponse>> = [];
  contextResults: Array<Promise<StaffOperationalContextResponse>> = [];
  readonly queueCalls: string[] = [];
  queueResults: Array<Promise<TaskQueueResponse>> = [];

  acceptTask(taskId: string, expectedVersion: number) {
    this.acceptCalls.push({ expectedVersion, taskId });
    return this.next(this.acceptResults, "accept");
  }

  assignTask(taskId: string, expectedVersion: number) {
    this.assignCalls.push({ expectedVersion, taskId });
    return this.next(this.assignResults, "assign");
  }

  loadOperationalContext() {
    return this.next(this.contextResults, "context");
  }

  loadTaskQueue(locationId: string) {
    this.queueCalls.push(locationId);
    return this.next(this.queueResults, "queue");
  }

  private next<T>(values: Array<Promise<T>>, kind: string): Promise<T> {
    const value = values.shift();
    if (value === undefined)
      return Promise.reject(new Error(`Unexpected ${kind} call`));
    return value;
  }
}
