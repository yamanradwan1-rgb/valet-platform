import { describe, expect, it } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EndShiftController } from "./end-shift-controller";

const SHIFT_ID = "11111111-1111-4111-8111-111111111111";

const endedPayload = {
  cashReconciliation: {
    cashExpected: "10.000",
    cashReported: "10.000",
    cashVariance: "0.000",
    currency: "JOD",
    reportedAt: "2026-08-25T18:00:00.000Z",
  },
  endedAt: "2026-08-25T18:00:00.000Z",
  locationId: "22222222-2222-4222-8222-222222222222",
  shiftId: SHIFT_ID,
  startedAt: "2026-08-25T10:00:00.000Z",
  status: "ENDED" as const,
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("DEC-066 §4 EndShiftController", () => {
  it("sends the exact strict body to the authoritative command and reports confirmed success", async () => {
    const requests: { body: unknown; path: string }[] = [];
    const apiClient = {
      request: async (path: string, init: { body: unknown }) => {
        requests.push({ body: init.body, path });
        return endedPayload;
      },
    } as unknown as EmployeeApiClient;
    const onEnded: { result?: unknown } = {};
    const controller = new EndShiftController({
      apiClient,
      onEnded: (result) => {
        onEnded.result = result;
      },
    });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(SHIFT_ID, "10.500");
    expect(phase.kind).toBe("submitting");
    await flush();

    expect(requests).toEqual([
      {
        body: { cashReported: "10.500" },
        path: `/v1/staff/shifts/${SHIFT_ID}/end`,
      },
    ]);
    expect(phase.kind).toBe("ended");
    expect(onEnded.result).toEqual(endedPayload);
  });

  it("never claims success on a network failure and retains same-command retry intent in memory only", async () => {
    const { EmployeeApiError } = await import("../../lib/api/employee-api-errors");
    let attempts = 0;
    const apiClient = {
      request: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new EmployeeApiError({
            code: "NETWORK_ERROR",
            isNetworkError: true,
            message: "Network connection unavailable.",
            status: 0,
          });
        }
        return endedPayload;
      },
    } as unknown as EmployeeApiClient;
    const controller = new EndShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(SHIFT_ID, "12.000");
    await flush();

    expect(phase.kind).toBe("uncertain");
    if (phase.kind === "uncertain") {
      expect(phase.shiftId).toBe(SHIFT_ID);
      expect(phase.cashReported).toBe("12.000");
    }

    // Explicit retry of the SAME command relies on server idempotency.
    controller.retry();
    await flush();

    expect(attempts).toBe(2);
    expect(phase.kind).toBe("ended");
  });

  it("rejects a divergent retry payload instead of replaying a different mutation", async () => {
    const apiClient = {
      request: async () => {
        throw new ((
          await import("../../lib/api/employee-api-errors")
        ).EmployeeApiError)({
          code: "NETWORK_ERROR",
          isNetworkError: true,
          message: "Network connection unavailable.",
          status: 0,
        });
      },
    } as unknown as EmployeeApiClient;
    const controller = new EndShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(SHIFT_ID, "12.000");
    await flush();
    expect(phase.kind).toBe("uncertain");

    controller.submit(SHIFT_ID, "99.999");
    expect(phase.kind).toBe("uncertain");

    // A different shift reference is also refused while intent is retained.
    controller.submit("33333333-3333-4333-8333-333333333333", "12.000");
    expect(phase.kind).toBe("uncertain");
  });

  it("surfaces OPEN_TASK_HANDOFF_REQUIRED as a known truthful failure, not ambiguity", async () => {
    const apiClient = {
      request: async () => {
        throw new ((
          await import("../../lib/api/employee-api-errors")
        ).EmployeeApiError)({
          code: "OPEN_TASK_HANDOFF_REQUIRED",
          message: "Open work must be handed over first.",
          status: 409,
        });
      },
    } as unknown as EmployeeApiClient;
    const controller = new EndShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(SHIFT_ID, "5.000");
    await flush();

    expect(phase.kind).toBe("error");
    if (phase.kind === "error") {
      expect(phase.openWorkBlocked).toBe(true);
      expect(phase.code).toBe("OPEN_TASK_HANDOFF_REQUIRED");
    }
  });
});
