import { Inject, Injectable } from "@nestjs/common";

import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
  type MonotonicClock,
  type OperationMeasurement,
  type OperationObserver,
} from "../observability/operation-observability";
import { withDatabaseOperationDeadline } from "../database/runtime-database-deadline";
import { apiHttpException, mapApiError } from "./api-errors";
import type { ApiRequest } from "./api-request";

export type OperationMeasurementEnricher = () => Readonly<
  Record<string, unknown>
>;

export type GuestOperationName =
  | "GUEST_SESSION_READ"
  | "GUEST_BROWSER_SESSION_ENROLL"
  | "GUEST_BROWSER_SESSION_EXCHANGE"
  | "GUEST_BROWSER_SESSION_END"
  | "GUEST_BROWSER_SESSION_PREPARE_CONTEXT"
  | "GUEST_BROWSER_SESSION_SWITCH_CONTEXT"
  | "GUEST_BROWSER_SESSION_RECONCILE_SWITCH"
  | "GUEST_RATING_SUBMIT"
  | "PAYMENT_GUEST_TIP_UPDATE"
  | "PAYMENT_GUEST_PROJECTION_READ"
  | "GUEST_RETRIEVAL_REQUEST"
  | "GUEST_RETRIEVAL_CANCEL"
  | "ISSUE_HANDOFF_VERIFICATION"
  | "ROTATE_HANDOFF_VERIFICATION";

export type ApiOperationPolicy =
  | string
  | {
      readonly name: GuestOperationName;
      readonly databaseDeadline: "GUEST_T3";
    };

export function guestOperation(name: GuestOperationName): ApiOperationPolicy {
  return { name, databaseDeadline: "GUEST_T3" };
}

@Injectable()
export class ApiOperationRunner {
  constructor(
    @Inject(MONOTONIC_CLOCK)
    private readonly clock: MonotonicClock,
    @Inject(OPERATION_OBSERVER)
    private readonly observer: OperationObserver,
  ) {}

  async run<T>(
    policy: ApiOperationPolicy,
    request: ApiRequest,
    action: () => Promise<T>,
    enrichMeasurement?: OperationMeasurementEnricher,
  ): Promise<T> {
    const operation = typeof policy === "string" ? policy : policy.name;
    const guest = typeof policy !== "string";
    const requestId = request.requestId ?? "request-id-unavailable";
    const startedAt = this.clock.now();
    let outcome: "ERROR" | "SUCCESS" = "SUCCESS";
    let errorCode: string | undefined;
    try {
      return await (guest ? withDatabaseOperationDeadline(action) : action());
    } catch (error) {
      outcome = "ERROR";
      const mapped = mapApiError(error, guest);
      errorCode = mapped.code;
      throw apiHttpException(mapped, requestId);
    } finally {
      const durationMs = Math.max(0, this.clock.now() - startedAt);
      request.operationMeasured = true;
      try {
        const measurement: OperationMeasurement = {
          ...(enrichMeasurement?.() ?? {}),
          durationMs,
          ...(errorCode === undefined ? {} : { errorCode }),
          operation,
          outcome,
          requestId,
        };
        await this.observer.observe(measurement);
      } catch {
        // Instrumentation must never change the business response.
      }
    }
  }
}
