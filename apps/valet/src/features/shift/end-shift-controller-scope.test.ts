import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { EndShiftController } from "./end-shift-controller";

const SHIFT_A = "11111111-1111-4111-8111-111111111111";
const SHIFT_B = "22222222-2222-4222-8222-222222222222";

const result = (shiftId: string) => ({
  cashReconciliation: {
    cashExpected: "0.000",
    cashReported: "0.000",
    cashVariance: "0.000",
    currency: "JOD",
    reportedAt: "2026-10-29T08:00:00.000Z",
  },
  endedAt: "2026-10-29T08:00:00.000Z",
  locationId: "33333333-3333-4333-8333-333333333333",
  shiftId,
  startedAt: "2026-10-29T07:00:00.000Z",
  status: "ENDED" as const,
});

function deferredApi() {
  const pending: Array<{
    resolve: (value: ReturnType<typeof result>) => void;
    reject: (reason: unknown) => void;
  }> = [];
  const apiClient = {
    request: () =>
      new Promise<ReturnType<typeof result>>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  } as unknown as EmployeeApiClient;
  return { apiClient, pending };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("End Shift scope retirement", () => {
  it("ignores A success after reset and preserves only B confirmed result", async () => {
    const { apiClient, pending } = deferredApi();
    const onEnded = vi.fn();
    const controller = new EndShiftController({ apiClient, onEnded });

    controller.submit(SHIFT_A, "0.000");
    controller.reset();
    controller.submit(SHIFT_B, "0.000");
    expect(pending).toHaveLength(2);

    pending[0]!.resolve(result(SHIFT_A));
    await settle();
    expect(controller.getPhase().kind).toBe("submitting");
    expect(onEnded).not.toHaveBeenCalled();

    pending[1]!.resolve(result(SHIFT_B));
    await settle();
    expect(controller.getPhase()).toEqual({
      kind: "ended",
      result: result(SHIFT_B),
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(result(SHIFT_B));
  });

  it("does not resurrect uncertain A after identity or authority reset", async () => {
    const { apiClient, pending } = deferredApi();
    const controller = new EndShiftController({ apiClient });
    controller.submit(SHIFT_A, "0.000");
    controller.reset();

    pending[0]!.reject(
      new EmployeeApiError({
        code: "NETWORK_ERROR",
        isNetworkError: true,
        message: "Disconnected",
        status: 0,
      }),
    );
    await settle();
    expect(controller.getPhase()).toEqual({ kind: "idle" });
    controller.retry();
    expect(pending).toHaveLength(1);
  });
});
