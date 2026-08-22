import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

const fetchSessionDetailMock = vi.fn();

vi.mock("../../features/retrieval/retrieval-api", () => ({
  fetchSessionDetail: (...args: unknown[]) =>
    fetchSessionDetailMock(...(args as [])),
}));

const { hydrateIncidentContext } = await import("./incident-flow");

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
  it("issues the A1 request for the exact incident session and accepts HANDOFF_PENDING as reportable", async () => {
    fetchSessionDetailMock.mockResolvedValue(detail("HANDOFF_PENDING"));
    const client = {} as EmployeeApiClient;

    const result = await hydrateIncidentContext(client, sessionId);

    expect(fetchSessionDetailMock).toHaveBeenCalledTimes(1);
    expect(fetchSessionDetailMock).toHaveBeenCalledWith(client, sessionId);
    expect(result.state).toBe("ready");
    expect(result.detail?.state).toBe("HANDOFF_PENDING");
  });

  it("rejects COMPLETED sessions as non-reportable", async () => {
    fetchSessionDetailMock.mockResolvedValue(detail("COMPLETED"));
    const client = {} as EmployeeApiClient;

    const result = await hydrateIncidentContext(client, sessionId);

    expect(result.state).toBe("error");
    expect(result.detail).toBeNull();
  });

  it("maps transport failure to error without leaking details", async () => {
    fetchSessionDetailMock.mockRejectedValue(new Error("offline"));
    const client = {} as EmployeeApiClient;

    const result = await hydrateIncidentContext(client, sessionId);

    expect(result.state).toBe("error");
  });
});
