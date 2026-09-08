import type {
  CompleteHandoffResponse,
  StaffPaymentProjectionResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import { EmployeeReleaseSession } from "./employee-release-flow-session";
import type { EmployeeReleaseTransport } from "./employee-release-flow-types";
import {
  handoffDetail,
  handoffScope,
  handoffTask,
} from "./employee-handoff-flow-test-fixture";
import { ids } from "./employee-operational-test-fixture";

export const verifiedAt = "2026-09-08T09:12:00.000Z";

export function releaseDetail(
  overrides: Partial<StaffValetSessionDetailResponse> = {},
): StaffValetSessionDetailResponse {
  return handoffDetail({
    handoff: {
      pendingAt: "2026-09-08T09:10:00.000Z",
      verification: {
        method: "PICKUP_CODE",
        status: "VERIFIED",
        verifiedAt,
      },
    },
    state: "HANDOFF_PENDING",
    version: 8,
    ...overrides,
  });
}

export function releaseTask(
  overrides: Partial<StaffTaskQueueItem> = {},
): StaffTaskQueueItem {
  return handoffTask({
    valetSessionState: "HANDOFF_PENDING",
    valetSessionVersion: 8,
    ...overrides,
  });
}

export function payment(
  releaseSatisfied = true,
): StaffPaymentProjectionResponse {
  return {
    payment: null,
    refunds: [],
    releaseRequiresPayment: !releaseSatisfied,
    releaseSatisfied,
  };
}

export const completion = (): CompleteHandoffResponse => ({
  retrievalRequestStatus: "COMPLETED",
  sessionId: ids.session,
  sessionVersion: 9,
  state: "COMPLETED",
  taskId: ids.task,
  taskStatus: "COMPLETED",
  taskVersion: 5,
});

export class StubReleaseTransport implements EmployeeReleaseTransport {
  completeResults: Promise<CompleteHandoffResponse>[] = [];
  paymentResults: Promise<StaffPaymentProjectionResponse>[] = [];
  queueResults: Promise<TaskQueueResponse>[] = [];
  sessionResults: Promise<StaffValetSessionDetailResponse>[] = [];
  calls: string[] = [];
  complete() {
    this.calls.push("complete");
    return this.next(this.completeResults);
  }
  loadPayment() {
    this.calls.push("payment");
    return this.next(this.paymentResults);
  }
  loadSession() {
    this.calls.push("session");
    return this.next(this.sessionResults);
  }
  loadTaskQueue() {
    this.calls.push("queue");
    return this.next(this.queueResults);
  }
  private next<T>(values: Promise<T>[]) {
    return values.shift() ?? Promise.reject(new Error("Unexpected call"));
  }
}

export function releaseHarness(
  task = releaseTask(),
  detail = releaseDetail(),
  financial = payment(),
) {
  const transport = new StubReleaseTransport();
  transport.sessionResults.push(Promise.resolve(detail));
  transport.queueResults.push(Promise.resolve({ tasks: [task] }));
  transport.paymentResults.push(Promise.resolve(financial));
  return { release: new EmployeeReleaseSession({ transport }), transport };
}

export function openRelease(
  release: EmployeeReleaseSession,
  scope = handoffScope,
) {
  return release.openTask(9, scope, ids.task, ids.session);
}
