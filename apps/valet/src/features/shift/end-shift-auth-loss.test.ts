import { describe, expect, it, vi } from "vitest";

import type { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  EmployeeApiError,
} from "../../lib/api/employee-api-errors";
import {
  StaffAuthRefreshError,
} from "../../lib/auth/staff-auth-recovery";
import { EndShiftController } from "./end-shift-controller";

const SHIFT_ID = "55555555-5555-4555-8555-555555555555";

function permanentRefreshFailure(): StaffAuthRefreshError {
  return new StaffAuthRefreshError(
    "definitive",
    new EmployeeApiError({
      code: "STAFF_AUTHENTICATION_FAILED",
      message: "Staff refresh credentials are invalid.",
      status: 401,
    }),
  );
}

function authLossClient(onAuthorizationLoss: () => void): EmployeeApiClient {
  const authClient = {
    getAccessToken: () => null,
    isTokenFresh: () => false,
    refresh: async () => {
      throw permanentRefreshFailure();
    },
  };
  return new EmployeeApiClient({
    authClient: authClient as unknown as StaffAuthClient,
    onAuthorizationLoss,
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("DEC-066 §4 End Shift authorization-loss wiring", () => {
  it("routes a missing-token End Shift through the existing auth-loss recovery callback", async () => {
    const onAuthorizationLoss = vi.fn();
    const apiClient = authLossClient(onAuthorizationLoss);
    const controller = new EndShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(SHIFT_ID, "10.000");
    await flush();

    // The production API client invoked the recovery boundary...
    expect(onAuthorizationLoss).toHaveBeenCalledTimes(1);
    // ...and the outcome is a known auth failure, not silent ambiguity.
    expect(phase.kind).toBe("error");
    if (phase.kind === "error") {
      expect(phase.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
      expect(phase.openWorkBlocked).toBe(false);
    }
  });

  it("keeps NETWORK_ERROR uncertain without triggering auth-loss recovery", async () => {
    const onAuthorizationLoss = vi.fn();
    const apiClient = {
      request: async () => {
        throw new EmployeeApiError({
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

    controller.submit(SHIFT_ID, "10.000");
    await flush();

    expect(phase.kind).toBe("uncertain");
    if (phase.kind === "uncertain") {
      expect(phase.shiftId).toBe(SHIFT_ID);
      expect(phase.cashReported).toBe("10.000");
    }
    expect(onAuthorizationLoss).not.toHaveBeenCalled();

    // Ambiguous same-command retry behavior remains unchanged.
    controller.retry();
    await flush();
    expect(phase.kind).toBe("uncertain");
  });

  it("does not classify an authoritative 409 conflict as auth loss", async () => {
    const onAuthorizationLoss = vi.fn();
    const apiClient = {
      request: async () => {
        throw new EmployeeApiError({
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

    controller.submit(SHIFT_ID, "10.000");
    await flush();

    expect(phase.kind).toBe("error");
    expect(onAuthorizationLoss).not.toHaveBeenCalled();
  });
});
