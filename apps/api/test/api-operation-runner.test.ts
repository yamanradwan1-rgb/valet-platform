import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import type {
  MonotonicClock,
  OperationMeasurement,
  OperationObserver,
} from "../src/common/observability/operation-observability";

function request(): ApiRequest {
  return { headers: {}, requestId: "request-123" };
}

function runner(
  observer: OperationObserver,
  values = [10, 17],
): ApiOperationRunner {
  let index = 0;
  const clock: MonotonicClock = {
    now: () => values[index++] ?? values.at(-1) ?? 0,
  };
  return new ApiOperationRunner(clock, observer);
}

describe("ApiOperationRunner", () => {
  it("observes one successful operation and marks it measured before observation", async () => {
    const apiRequest = request();
    const measurements: OperationMeasurement[] = [];
    const operationRunner = runner({
      observe(measurement) {
        expect(apiRequest.operationMeasured).toBe(true);
        measurements.push(measurement);
      },
    });

    await expect(
      operationRunner.run("TEST_SUCCESS", apiRequest, async () => "ok"),
    ).resolves.toBe("ok");
    expect(measurements).toEqual([
      {
        durationMs: 7,
        operation: "TEST_SUCCESS",
        outcome: "SUCCESS",
        requestId: "request-123",
      },
    ]);
  });

  it("preserves mapped errors and their stable measurement code", async () => {
    const measurements: OperationMeasurement[] = [];
    const operationRunner = runner({
      observe(measurement) {
        measurements.push(measurement);
      },
    });
    const error = Object.assign(new Error("Guest access is invalid."), {
      code: "GUEST_ACCESS_INVALID",
    });

    const thrown = await operationRunner
      .run("TEST_ERROR", request(), async () => {
        throw error;
      })
      .catch((caught: unknown) => caught);

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(401);
    expect((thrown as HttpException).getResponse()).toEqual({
      code: "GUEST_ACCESS_INVALID",
      message: "Guest access is invalid.",
      requestId: "request-123",
    });
    expect(measurements).toEqual([
      {
        durationMs: 7,
        errorCode: "GUEST_ACCESS_INVALID",
        operation: "TEST_ERROR",
        outcome: "ERROR",
        requestId: "request-123",
      },
    ]);
  });

  it("allows narrow enrichment without permitting core-field replacement", async () => {
    const observe = vi.fn();
    const operationRunner = runner({ observe });

    await operationRunner.run(
      "TEST_ENRICHED",
      request(),
      async () => true,
      () => ({
        checkInElapsedMs: 2_000,
        durationMs: 999,
        operation: "OVERRIDE_ATTEMPT",
      }),
    );

    expect(observe).toHaveBeenCalledWith({
      checkInElapsedMs: 2_000,
      durationMs: 7,
      operation: "TEST_ENRICHED",
      outcome: "SUCCESS",
      requestId: "request-123",
    });
  });

  it("does not change a successful result when observation fails", async () => {
    const operationRunner = runner({
      observe() {
        throw new Error("instrumentation unavailable");
      },
    });

    await expect(
      operationRunner.run("TEST_OBSERVER_FAILURE", request(), async () => 42),
    ).resolves.toBe(42);
  });
});
