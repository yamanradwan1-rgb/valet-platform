import { describe, expect, it } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { StartShiftController } from "./start-shift-controller";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_LOCATION_ID = "22222222-2222-4222-8222-222222222222";

const startedPayload = {
  endedAt: null,
  locationId: LOCATION_ID,
  shiftId: "33333333-3333-4333-8333-333333333333",
  startedAt: "2026-08-25T10:00:00.000Z",
  status: "ACTIVE" as const,
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function networkErrorImport() {
  return import("../../lib/api/employee-api-errors");
}

describe("VUI-011D StartShiftController", () => {
  it("sends the exact authoritative command path and strict body and reports confirmed success", async () => {
    const paths: string[] = [];
    const bodies: unknown[] = [];
    const apiClient = {
      request: async (path: string, init: { body: unknown }) => {
        paths.push(path);
        bodies.push(init.body);
        return startedPayload;
      },
    } as unknown as EmployeeApiClient;
    const onStarted: { result?: unknown } = {};
    const controller = new StartShiftController({
      apiClient,
      onStarted: (result) => {
        onStarted.result = result;
      },
    });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(LOCATION_ID);
    expect(phase.kind).toBe("submitting");
    await flush();

    expect(paths).toEqual(["/v1/staff/shifts/start"]);
    expect(bodies).toEqual([{ targetLocationId: LOCATION_ID }]);
    expect(phase.kind).toBe("started");
    if (phase.kind === "started") {
      expect(phase.result).toEqual(startedPayload);
    }
    expect(onStarted.result).toEqual(startedPayload);
  });

  it("blocks duplicate submission while a start is in flight", async () => {
    let attempts = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apiClient = {
      request: async () => {
        attempts += 1;
        await gate;
        return startedPayload;
      },
    } as unknown as EmployeeApiClient;
    const controller = new StartShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(LOCATION_ID);
    controller.submit(LOCATION_ID);
    release?.();
    await flush();

    expect(attempts).toBe(1);
    expect(phase.kind).toBe("started");
  });

  it("never claims success on an ambiguous transport outcome and retains same-command intent in memory only", async () => {
    const { EmployeeApiError } = await networkErrorImport();
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
        return startedPayload;
      },
    } as unknown as EmployeeApiClient;
    const controller = new StartShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(LOCATION_ID);
    await flush();

    expect(phase.kind).toBe("uncertain");
    if (phase.kind === "uncertain") {
      expect(phase.targetLocationId).toBe(LOCATION_ID);
    }

    // No automatic replay happens while the outcome stays unresolved.
    await flush();
    expect(attempts).toBe(1);

    // Explicit retry of the SAME retained command relies on the existing
    // server semantics for an already-started same-location shift.
    controller.retry();
    await flush();

    expect(attempts).toBe(2);
    expect(phase.kind).toBe("started");
  });

  it("refuses a divergent location while the original outcome is unknown instead of replacing intent", async () => {
    const { EmployeeApiError } = await networkErrorImport();
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
    const controller = new StartShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(LOCATION_ID);
    await flush();
    expect(phase.kind).toBe("uncertain");

    controller.submit(OTHER_LOCATION_ID);
    expect(phase.kind).toBe("uncertain");

    // retry() still re-sends the ORIGINAL command, not the divergent one.
    const paths: string[] = [];
    const retryingClient = {
      request: async (path: string) => {
        paths.push(path);
        return startedPayload;
      },
    } as unknown as EmployeeApiClient;
    controller.setApiClient(retryingClient);
    controller.retry();
    await flush();
    expect(paths).toEqual(["/v1/staff/shifts/start"]);
    expect(phase.kind).toBe("started");
  });

  it("surfaces ACTIVE_SHIFT_CONFLICT as a known truthful failure, not ambiguity", async () => {
    const { EmployeeApiError } = await networkErrorImport();
    const apiClient = {
      request: async () => {
        throw new EmployeeApiError({
          code: "ACTIVE_SHIFT_CONFLICT",
          message: "An active shift already exists at another location.",
          status: 409,
        });
      },
    } as unknown as EmployeeApiClient;
    const controller = new StartShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(OTHER_LOCATION_ID);
    await flush();

    expect(phase.kind).toBe("error");
    if (phase.kind === "error") {
      expect(phase.locationConflict).toBe(true);
      expect(phase.code).toBe("ACTIVE_SHIFT_CONFLICT");
    }
  });

  it("discards retained uncertain intent only through an explicit reset", async () => {
    const { EmployeeApiError } = await networkErrorImport();
    const apiClient = {
      request: async (): Promise<never> => {
        throw new EmployeeApiError({
          code: "NETWORK_ERROR",
          isNetworkError: true,
          message: "Network connection unavailable.",
          status: 0,
        });
      },
    } as unknown as EmployeeApiClient;
    const controller = new StartShiftController({ apiClient });
    let phase = controller.getPhase();
    controller.activate((next) => {
      phase = next;
    });

    controller.submit(LOCATION_ID);
    await flush();
    expect(phase.kind).toBe("uncertain");

    controller.reset();
    expect(phase.kind).toBe("idle");

    // After an explicit dismiss a fresh command at any location is allowed.
    controller.submit(OTHER_LOCATION_ID);
    expect(phase.kind).toBe("submitting");
  });
});
