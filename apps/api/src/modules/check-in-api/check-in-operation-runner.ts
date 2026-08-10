import { Inject, Injectable } from "@nestjs/common";

import {
  CHECK_IN_MONOTONIC_CLOCK,
  CHECK_IN_OPERATION_OBSERVER,
  type CheckInApiRequest,
  type CheckInOperationObserver,
  type MonotonicClock,
} from "./check-in-api.boundaries";
import { apiHttpException, mapCheckInError } from "./check-in-api.errors";

@Injectable()
export class CheckInOperationRunner {
  constructor(
    @Inject(CHECK_IN_MONOTONIC_CLOCK)
    private readonly clock: MonotonicClock,
    @Inject(CHECK_IN_OPERATION_OBSERVER)
    private readonly observer: CheckInOperationObserver,
  ) {}

  async run<T>(
    operation: string,
    request: CheckInApiRequest,
    action: () => Promise<T>,
  ): Promise<T> {
    const requestId = request.checkInRequestId ?? "request-id-unavailable";
    const startedAt = this.clock.now();
    let outcome: "ERROR" | "SUCCESS" = "SUCCESS";
    let errorCode: string | undefined;
    try {
      return await action();
    } catch (error) {
      outcome = "ERROR";
      const mapped = mapCheckInError(error);
      errorCode = mapped.code;
      throw apiHttpException(mapped, requestId);
    } finally {
      const durationMs = Math.max(0, this.clock.now() - startedAt);
      request.checkInOperationMeasured = true;
      try {
        await this.observer.observe({
          ...(request.checkInElapsedMs === undefined
            ? {}
            : { checkInElapsedMs: request.checkInElapsedMs }),
          durationMs,
          ...(errorCode === undefined ? {} : { errorCode }),
          operation,
          outcome,
          requestId,
        });
      } catch {
        // Instrumentation must never change the business response.
      }
    }
  }
}
