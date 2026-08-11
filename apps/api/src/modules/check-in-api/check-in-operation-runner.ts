import { Inject, Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../common/http/api-request";
import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
  type MonotonicClock,
  type OperationMeasurement,
  type OperationObserver,
} from "../../common/observability/operation-observability";

import { apiHttpException, mapApiError } from "../../common/http/api-errors";

export interface CheckInRequestMeasurementState {
  checkInElapsedMs?: number;
}

export type CheckInApiRequest = ApiRequest & CheckInRequestMeasurementState;

interface CheckInOperationMeasurement extends OperationMeasurement {
  readonly checkInElapsedMs?: number;
}

@Injectable()
export class CheckInOperationRunner {
  constructor(
    @Inject(MONOTONIC_CLOCK)
    private readonly clock: MonotonicClock,
    @Inject(OPERATION_OBSERVER)
    private readonly observer: OperationObserver,
  ) {}

  async run<T>(
    operation: string,
    request: CheckInApiRequest,
    action: () => Promise<T>,
  ): Promise<T> {
    const requestId = request.requestId ?? "request-id-unavailable";
    const startedAt = this.clock.now();
    let outcome: "ERROR" | "SUCCESS" = "SUCCESS";
    let errorCode: string | undefined;
    try {
      return await action();
    } catch (error) {
      outcome = "ERROR";
      const mapped = mapApiError(error);
      errorCode = mapped.code;
      throw apiHttpException(mapped, requestId);
    } finally {
      const durationMs = Math.max(0, this.clock.now() - startedAt);
      request.operationMeasured = true;
      try {
        const measurement: CheckInOperationMeasurement = {
          ...(request.checkInElapsedMs === undefined
            ? {}
            : { checkInElapsedMs: request.checkInElapsedMs }),
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
