import type {
  EmployeeOperationalTransport,
  StaffOperationalContextResponse,
  StaffTaskQueueItem,
  TaskQueueResponse,
} from "@valet/employee-client";

import { scope } from "./production-shell-test-fixture";

export function operationalContext(): StaffOperationalContextResponse {
  const location = {
    code: scope.locationCode,
    currency: "JOD",
    locationId: scope.locationId,
    name: scope.locationName,
    timezone: "Asia/Amman",
  };
  return {
    contexts: [{
      activeShift: {
        locationId: scope.locationId,
        shiftId: scope.shiftId,
        startedAt: scope.shiftStartedAt,
        status: "ACTIVE",
      },
      currentLocation: location,
      eligibleLocations: [location],
      membershipId: scope.membershipId,
      organization: {
        name: scope.organizationName,
        organizationId: scope.organizationId,
      },
      role: scope.role,
    }],
  };
}

export function parkingTask(
  overrides: Partial<StaffTaskQueueItem> = {},
): StaffTaskQueueItem {
  return {
    createdAt: "2026-10-08T10:00:00.000Z",
    currentAssigneeMembershipId: scope.membershipId,
    parkingSpot: null,
    parkingZone: null,
    retrievalRequestedAt: null,
    sessionId: "44444444-4444-4444-8444-444444444444",
    status: "ASSIGNED",
    taskId: "66666666-6666-4666-8666-666666666666",
    taskType: "PARKING",
    valetSessionState: "AWAITING_PARKING",
    valetSessionVersion: 2,
    vehicle: {
      color: null,
      make: null,
      model: null,
      plateNumberRaw: null,
      temporaryDescriptor: "QA vehicle",
    },
    version: 2,
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

export class StubOperationalTransport implements EmployeeOperationalTransport {
  readonly acceptCalls: string[] = [];
  readonly assignCalls: string[] = [];
  readonly queueCalls: string[] = [];
  contextResults: Array<Promise<StaffOperationalContextResponse>> = [];
  queueResults: Array<Promise<TaskQueueResponse>> = [];

  acceptTask(taskId: string) {
    this.acceptCalls.push(taskId);
    return Promise.reject(new Error("Unexpected Accept POST"));
  }
  assignTask(taskId: string) {
    this.assignCalls.push(taskId);
    return Promise.reject(new Error("Unexpected Assign POST"));
  }
  loadOperationalContext() {
    return this.next(this.contextResults, "context");
  }
  loadTaskQueue(locationId: string) {
    this.queueCalls.push(locationId);
    return this.next(this.queueResults, "queue");
  }
  private next<T>(values: Array<Promise<T>>, operation: string): Promise<T> {
    return values.shift() ?? Promise.reject(new Error(`Unexpected ${operation}`));
  }
}
