import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
  };
});

vi.mock("../../features/incidents/use-incident", () => ({
  useIncident: () => ({}),
}));

const { IncidentFlow, hydrateIncidentContext } = await import("./incident-flow");

const sessionId = "11111111-1111-4111-8111-111111111111";

function detail(state: string): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: "2026-08-22T09:00:00.000Z" },
    handoff:
      state === "HANDOFF_PENDING"
        ? { pendingAt: "2026-08-22T10:00:00.000Z", verification: null }
        : { pendingAt: null, verification: null },
    keySlot: { code: "K-1" },
    locationId: "33333333-3333-4333-8333-333333333333",
    parking: {
      parkedAt: "2026-08-22T09:05:00.000Z",
      parkingSpotCode: null,
      parkingStartedAt: "2026-08-22T09:02:00.000Z",
      parkingZoneCode: null,
    },
    sessionId,
    state: state as StaffValetSessionDetailResponse["state"],
    vehicle: {
      color: "Black",
      make: "Audi",
      model: "A6",
      plateCountry: "JO",
      plateNumberRaw: "77-99999",
      temporaryDescriptor: null,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-22T09:00:00.000Z",
    },
    version: 9,
  };
}

describe("hydrateIncidentContext — A1 request boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issues the A1 request for the exact incident session and accepts HANDOFF_PENDING as reportable", async () => {
    const request = vi.fn().mockResolvedValue(detail("HANDOFF_PENDING"));
    const client = { request } as unknown as EmployeeApiClient;

    const result = await hydrateIncidentContext(client, sessionId);

    expect(request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}`,
      { method: "GET", requireAuth: true, signal: undefined },
    );
    expect(result.state).toBe("ready");
    expect(result.detail?.state).toBe("HANDOFF_PENDING");
  });

  it("uses the default authenticated client and reaches A1 when live IncidentFlow has no apiClient prop", async () => {
    const request = vi
      .spyOn(EmployeeApiClient.prototype, "request")
      .mockResolvedValue(detail("READY"));

    IncidentFlow({ mode: "live", nav: vi.fn(), sessionId });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    expect(request.mock.instances[0]).toBeInstanceOf(EmployeeApiClient);
    expect(request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}`,
      { method: "GET", requireAuth: true, signal: undefined },
    );
  });

  it("rejects COMPLETED sessions as non-reportable", async () => {
    const client = {
      request: vi.fn().mockResolvedValue(detail("COMPLETED")),
    } as unknown as EmployeeApiClient;

    const result = await hydrateIncidentContext(client, sessionId);

    expect(result.state).toBe("error");
    expect(result.detail).toBeNull();
  });

  it("maps transport failure to error without leaking details", async () => {
    const client = {
      request: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as EmployeeApiClient;

    const result = await hydrateIncidentContext(client, sessionId);

    expect(result.state).toBe("error");
  });
});
