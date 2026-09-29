import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";
import { EmployeeRetrievalSession } from "./employee-retrieval-flow-session";
import type {
  EmployeeRetrievalReadyResult,
  EmployeeRetrievalStartResult,
  EmployeeRetrievalTransport,
} from "./employee-retrieval-flow-types";
import { ids, operationalContext } from "./employee-operational-test-fixture";
import { resolveEmployeeOperationalScope } from "./employee-operational-scope";

export type MarkReadyResponseFixture = EmployeeRetrievalReadyResult;
export type StartRetrievalResponseFixture = EmployeeRetrievalStartResult;

const scopeResolution = resolveEmployeeOperationalScope(operationalContext());
if (scopeResolution.phase !== "ready") throw new Error("Expected ready scope.");
export const retrievalScope = scopeResolution.scope;

export function retrievalTask(
  overrides: Partial<StaffTaskQueueItem> = {},
): StaffTaskQueueItem {
  return {
    createdAt: "2026-09-07T09:00:00.000Z",
    currentAssigneeMembershipId: ids.membership,
    parkingSpot: "SP-1",
    parkingZone: "Z-1",
    retrievalRequestedAt: "2026-09-07T09:05:00.000Z",
    sessionId: ids.session,
    status: "ACCEPTED",
    taskId: ids.task,
    taskType: "RETRIEVAL",
    valetSessionState: "REQUESTED",
    valetSessionVersion: 5,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    version: 3,
    ...overrides,
  };
}

export function retrievalDetail(
  overrides: Partial<StaffValetSessionDetailResponse> = {},
): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: "2026-09-07T07:59:00.000Z" },
    guestAccess: {
      expiresAt: null,
      revokedAt: null,
      status: "NOT_ISSUED",
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: { code: "K-9" },
    locationId: ids.location,
    parking: {
      parkedAt: "2026-09-07T08:10:00.000Z",
      parkingSpotCode: "SP-1",
      parkingStartedAt: "2026-09-07T08:00:00.000Z",
      parkingZoneCode: "Z-1",
    },
    sessionId: ids.session,
    state: "REQUESTED",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "77777777-7777-4777-8777-777777777777",
      vehicleUpdatedAt: "2026-09-07T07:55:00.000Z",
    },
    version: 5,
    ...overrides,
  };
}

export function startRetrievalResult(
  overrides: Partial<StartRetrievalResponseFixture> = {},
): StartRetrievalResponseFixture {
  return {
    retrievalStartedAt: "2026-09-07T09:10:00.000Z",
    sessionId: ids.session,
    sessionVersion: 6,
    state: "RETRIEVING",
    taskId: ids.task,
    taskStatus: "IN_PROGRESS",
    taskVersion: 4,
    ...overrides,
  };
}

export function markReadyResult(
  overrides: Partial<MarkReadyResponseFixture> = {},
): MarkReadyResponseFixture {
  return {
    readyAt: "2026-09-07T09:20:00.000Z",
    sessionId: ids.session,
    sessionVersion: 7,
    state: "READY",
    taskId: ids.task,
    taskStatus: "IN_PROGRESS",
    taskVersion: 4,
    ...overrides,
  };
}

export class StubRetrievalTransport implements EmployeeRetrievalTransport {
  readonly markReadyCalls: Array<{ sessionId: string; version: number }> = [];
  readonly startCalls: Array<{
    readonly scannedKeySlot?:
      | { readonly keySlotCode: string; readonly keySlotId: string }
      | undefined;
    readonly sessionId: string;
    readonly sessionVersion: number;
    readonly taskVersion: number;
  }> = [];
  markReadyResults: Array<Promise<MarkReadyResponseFixture>> = [];
  queueResults: Array<Promise<TaskQueueResponse>> = [];
  sessionResults: Array<Promise<StaffValetSessionDetailResponse>> = [];
  startResults: Array<Promise<StartRetrievalResponseFixture>> = [];

  loadSession(): Promise<StaffValetSessionDetailResponse> {
    return this.next(this.sessionResults);
  }
  loadTaskQueue(): Promise<TaskQueueResponse> {
    return this.next(this.queueResults);
  }
  markReady(sessionId: string, expectedSessionVersion: number) {
    this.markReadyCalls.push({ sessionId, version: expectedSessionVersion });
    return this.next(this.markReadyResults);
  }
  startRetrieval(
    sessionId: string,
    expectedSessionVersion: number,
    expectedTaskVersion: number,
    scannedKeySlot?:
      | { readonly keySlotCode: string; readonly keySlotId: string }
      | undefined,
  ) {
    this.startCalls.push({
      scannedKeySlot,
      sessionId,
      sessionVersion: expectedSessionVersion,
      taskVersion: expectedTaskVersion,
    });
    return this.next(this.startResults);
  }
  private next<T>(values: Array<Promise<T>>): Promise<T> {
    return (
      values.shift() ?? Promise.reject(new Error("Unexpected transport call."))
    );
  }
}

export function retrievalHarness(
  currentTask = retrievalTask(),
  currentDetail = retrievalDetail(),
) {
  const transport = new StubRetrievalTransport();
  transport.queueResults.push(Promise.resolve({ tasks: [currentTask] }));
  transport.sessionResults.push(Promise.resolve(currentDetail));
  const session = new EmployeeRetrievalSession({ transport });
  return { session, transport };
}

export async function openRetrieval(session: EmployeeRetrievalSession) {
  await session.openQueueTask(9, retrievalScope, ids.task, ids.session);
}
