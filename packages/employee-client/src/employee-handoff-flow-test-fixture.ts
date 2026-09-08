import type {
  AbortHandoffResponse,
  InitiateHandoffResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
  VerifiedHandoffResponse,
} from "@valet/contracts";

import { EmployeeHandoffSession } from "./employee-handoff-flow-session";
import type { EmployeeHandoffTransport } from "./employee-handoff-flow-types";
import { ids, operationalContext } from "./employee-operational-test-fixture";
import { resolveEmployeeOperationalScope } from "./employee-operational-scope";

const resolution = resolveEmployeeOperationalScope(operationalContext());
if (resolution.phase !== "ready") throw new Error("Expected scope.");
export const handoffScope = resolution.scope;

export function handoffTask(
  overrides: Partial<StaffTaskQueueItem> = {},
): StaffTaskQueueItem {
  return {
    createdAt: "2026-09-08T09:00:00.000Z",
    currentAssigneeMembershipId: ids.membership,
    parkingSpot: null,
    parkingZone: null,
    retrievalRequestedAt: "2026-09-08T08:30:00.000Z",
    sessionId: ids.session,
    status: "IN_PROGRESS",
    taskId: ids.task,
    taskType: "RETRIEVAL",
    valetSessionState: "READY",
    valetSessionVersion: 7,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    version: 4,
    ...overrides,
  };
}

export function handoffDetail(
  overrides: Partial<StaffValetSessionDetailResponse> = {},
): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: "2026-09-08T07:00:00.000Z" },
    guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
    handoff: { pendingAt: null, verification: null },
    keySlot: { code: "K-9" },
    locationId: ids.location,
    parking: {
      parkedAt: "2026-09-08T08:00:00.000Z",
      parkingSpotCode: null,
      parkingStartedAt: "2026-09-08T07:30:00.000Z",
      parkingZoneCode: null,
    },
    sessionId: ids.session,
    state: "READY",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "77777777-7777-4777-8777-777777777777",
      vehicleUpdatedAt: "2026-09-08T07:00:00.000Z",
    },
    version: 7,
    ...overrides,
  };
}

const pendingAt = "2026-09-08T09:10:00.000Z";
export const pendingDetail = () =>
  handoffDetail({
    handoff: { pendingAt, verification: null },
    state: "HANDOFF_PENDING",
    version: 8,
  });
export const pendingTask = () =>
  handoffTask({
    valetSessionState: "HANDOFF_PENDING",
    valetSessionVersion: 8,
  });

export class StubHandoffTransport implements EmployeeHandoffTransport {
  abortResults: Promise<AbortHandoffResponse>[] = [];
  initiateResults: Promise<InitiateHandoffResponse>[] = [];
  overrideResults: Promise<VerifiedHandoffResponse>[] = [];
  pickupResults: Promise<VerifiedHandoffResponse>[] = [];
  qrResults: Promise<VerifiedHandoffResponse>[] = [];
  queueResults: Promise<TaskQueueResponse>[] = [];
  sessionResults: Promise<StaffValetSessionDetailResponse>[] = [];
  calls: Array<{ name: string; value?: string }> = [];
  abort(_id: string, _version: number, value: string) {
    this.calls.push({ name: "abort", value });
    return this.next(this.abortResults);
  }
  initiate() {
    this.calls.push({ name: "initiate" });
    return this.next(this.initiateResults);
  }
  loadSession() {
    return this.next(this.sessionResults);
  }
  loadTaskQueue() {
    return this.next(this.queueResults);
  }
  override(_id: string, _version: number, value: string) {
    this.calls.push({ name: "override", value });
    return this.next(this.overrideResults);
  }
  verifyDynamicQr(_id: string, _version: number, value: string) {
    this.calls.push({ name: "qr", value });
    return this.next(this.qrResults);
  }
  verifyPickupCode(_id: string, _version: number, value: string) {
    this.calls.push({ name: "pickup", value });
    return this.next(this.pickupResults);
  }
  private next<T>(values: Promise<T>[]) {
    return values.shift() ?? Promise.reject(new Error("Unexpected call"));
  }
}

export function handoffHarness(task = handoffTask(), detail = handoffDetail()) {
  const transport = new StubHandoffTransport();
  transport.queueResults.push(Promise.resolve({ tasks: [task] }));
  transport.sessionResults.push(Promise.resolve(detail));
  return { session: new EmployeeHandoffSession({ transport }), transport };
}

export async function openHandoff(
  session: EmployeeHandoffSession,
  scope = handoffScope,
) {
  await session.openTask(9, scope, ids.task, ids.session);
}
