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

@Injectable()
export class ApiOperationRunner {
  constructor(
    @Inject(MONOTONIC_CLOCK)
    private readonly clock: MonotonicClock,
    @Inject(OPERATION_OBSERVER)
    private readonly observer: OperationObserver,
  ) {}

  async run<T>(
    operation: string,
    request: ApiRequest,
    action: () => Promise<T>,
    enrichMeasurement?: OperationMeasurementEnricher,
  ): Promise<T> {
    const requestId = request.requestId ?? "request-id-unavailable";
    const startedAt = this.clock.now();
    let outcome: "ERROR" | "SUCCESS" = "SUCCESS";
    let errorCode: string | undefined;
    try {
      return await withDatabaseOperationDeadline(action);
    } catch (error) {
      outcome = "ERROR";
      const mapped = mapApiError(error);
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
