import { describe, expect, it, vi } from "vitest";
import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const detail = {
  sessionId: "selected",
  locationId: "location",
  state: "CHECKING_IN",
  version: 9,
  checkIn: { conditionCompletedAt: "2026-10-03T00:00:00.000Z" },
  vehicle: {
    vehicleId: "vehicle",
    vehicleUpdatedAt: "2026-10-03T00:00:00.000Z",
    make: "Toyota",
    model: "Camry",
    color: "Black",
  },
};
function fixture() {
  const transport = {
    loadSession: vi.fn().mockResolvedValue(detail),
    loadDrafts: vi.fn(),
    loadContinuations: vi.fn(),
    createIntake: vi.fn(),
    correctDetails: vi.fn(),
    recognize: vi.fn(),
  } as unknown as EmployeeCheckInTransport;
  return {
    transport,
    session: new EmployeeCheckInSession({
      transport,
      createOperationId: vi.fn(),
    }),
  };
}
describe("exact-target Continue Check-In", () => {
  it("hydrates only the selected persisted session and bypasses discovery/intake even on route activation", async () => {
    const { session, transport } = fixture();
    expect(
      await session.openExistingCheckIn(4, "location", "owner", "selected"),
    ).toBe(true);
    await session.activate(4, "location", "owner");
    expect(transport.loadSession).toHaveBeenCalledExactlyOnceWith("selected");
    expect(transport.loadDrafts).not.toHaveBeenCalled();
    expect(transport.loadContinuations).not.toHaveBeenCalled();
    expect(transport.createIntake).not.toHaveBeenCalled();
    expect(session.current().active).toMatchObject({
      sessionId: "selected",
      version: 9,
      vehicle: detail.vehicle,
    });
  });
  it("denies changed state/location/target and never claims successful route entry", async () => {
    for (const changed of [
      { ...detail, state: "AWAITING_PARKING" },
      { ...detail, state: "CANCELLED" },
      { ...detail, locationId: "other" },
      { ...detail, sessionId: "other" },
    ]) {
      const { session, transport } = fixture();
      vi.mocked(transport.loadSession).mockResolvedValue(changed as never);
      expect(
        await session.openExistingCheckIn(4, "location", "owner", "selected"),
      ).toBe(false);
      expect(session.current().active).toBeNull();
    }
  });
  it("purges stale edits and fences late target hydration after retirement/background", async () => {
    for (const retire of [
      (session: EmployeeCheckInSession) => session.clear(),
      (session: EmployeeCheckInSession) => session.suspendForBackground(),
    ]) {
      const { session, transport } = fixture();
      let resolve!: (value: unknown) => void;
      vi.mocked(transport.loadSession).mockReturnValue(
        new Promise((done) => {
          resolve = done as never;
        }),
      );
      const opening = session.openExistingCheckIn(
        4,
        "location",
        "owner",
        "selected",
      );
      retire(session);
      resolve(detail);
      expect(await opening).toBe(false);
      expect(session.current().active).toBeNull();
    }
  });
});

it("returns Customer Contact to the recognized vehicle and consumes the correction", async () => {
  const { session, transport } = fixture();
  vi.mocked(transport.loadDrafts).mockResolvedValue({ drafts: [] });
  vi.mocked(transport.loadContinuations).mockResolvedValue({
    continuations: [],
  });
  vi.mocked(transport.recognize).mockResolvedValue({
    vehicle: {
      ...detail.vehicle,
      plateCountry: "JO",
      plateNumberNormalized: "1234567",
      plateNumberRaw: "12-34567",
      returningCustomer: null,
    },
  });
  await session.activate(4, "location", "owner");
  session.setVehicle({ plateCountry: "JO", plateNumberRaw: "12-34567" });
  session.reviewIdentity();
  await session.confirmIdentity();
  session.chooseDifferentCustomer();
  session.setCustomerPhone("07912");
  expect(session.backFromCustomer()).toBe(true);
  expect(session.backFromCustomer()).toBe(true);
  expect(session.current()).toMatchObject({
    phase: "returning",
    customerPhone: "07912",
    recognizedVehicle: detail.vehicle,
  });
  expect(transport.createIntake).not.toHaveBeenCalled();
});

describe("reopening an interrupted persisted Check-In", () => {
  it("does not advance a replacement Check-In when the old returning correction settles", async () => {
    const { session, transport } = fixture();
    vi.mocked(transport.loadDrafts).mockResolvedValue({ drafts: [] });
    vi.mocked(transport.loadContinuations).mockResolvedValue({
      continuations: [],
    });
    vi.mocked(transport.recognize).mockResolvedValue({
      vehicle: {
        ...detail.vehicle,
        plateCountry: "JO",
        plateNumberNormalized: "1234567",
        plateNumberRaw: "12-34567",
        returningCustomer: {
          customerId: "customer",
          displayName: null,
          phoneSuffix: "1234",
        },
      },
    });
    vi.mocked(transport.createIntake).mockResolvedValue({
      ...detail.vehicle,
      createdAt: detail.vehicle.vehicleUpdatedAt,
      customerId: "customer",
      state: "CHECKING_IN",
      valetSessionId: "old-session",
      version: 1,
    });
    let complete!: () => void;
    vi.mocked(transport.correctDetails).mockReturnValue(
      new Promise((resolve) => {
        complete = () => resolve({} as never);
      }),
    );
    await session.activate(4, "location", "owner");
    session.setVehicle({ plateCountry: "JO", plateNumberRaw: "12-34567" });
    session.reviewIdentity();
    await session.confirmIdentity();
    session.setReturningVehicleCorrection({
      make: "Toyota",
      model: "Camry",
      color: "Silver",
    });
    const oldIntake = session.useSavedCustomer();
    await vi.waitFor(() =>
      expect(transport.correctDetails).toHaveBeenCalledOnce(),
    );
    await session.openExistingCheckIn(4, "location", "new-shift", "selected");
    session.cancelVehicleEdit();
    complete();
    await oldIntake;
    expect(session.current()).toMatchObject({
      active: { sessionId: "selected" },
      continuation: { mode: "view" },
    });
  });

  it("reads the same session and preserves compatible local edits", async () => {
    const { session, transport } = fixture();
    await session.openExistingCheckIn(4, "location", "owner", "selected");
    session.editVehicleDetails();
    session.setVehicleDetails({ color: "Silver" });
    session.detachRoute();
    await session.activate(4, "location", "owner");

    expect(transport.loadSession).toHaveBeenNthCalledWith(2, "selected");
    expect(session.current()).toMatchObject({
      phase: "created",
      active: { sessionId: "selected", vehicle: { color: "Black" } },
      continuation: { mode: "edit-details", detailsDraft: { color: "Silver" } },
    });
    expect(transport.createIntake).not.toHaveBeenCalled();
  });

  it("retries the exact read after an outage and converges to newer server truth", async () => {
    const { session, transport } = fixture();
    await session.openExistingCheckIn(4, "location", "owner", "selected");
    session.editVehicleDetails();
    session.setVehicleDetails({ color: "Silver" });
    session.detachRoute();
    vi.mocked(transport.loadSession).mockRejectedValueOnce(
      employeeNetworkError(),
    );
    await session.activate(4, "location", "owner");
    expect(session.current().phase).toBe("discovery-error");
    vi.mocked(transport.loadSession).mockResolvedValueOnce({
      ...detail,
      state: "AWAITING_PARKING",
      version: 10,
      vehicle: {
        ...detail.vehicle,
        color: "Blue",
        vehicleUpdatedAt: "2026-10-03T00:01:00.000Z",
      },
    } as never);
    await session.retryDiscovery();

    expect(transport.loadSession).toHaveBeenNthCalledWith(3, "selected");
    expect(session.current()).toMatchObject({
      phase: "continuation",
      active: {
        sessionId: "selected",
        version: 10,
        vehicle: { color: "Blue" },
      },
      continuation: { mode: "view", detailsDraft: { color: "Blue" } },
    });
    expect(transport.loadDrafts).not.toHaveBeenCalled();
    expect(transport.createIntake).not.toHaveBeenCalled();
  });

  it.each([
    "AUTHORIZATION_DENIED",
    "LOCATION_ACCESS_DENIED",
    "TENANT_ACCESS_DENIED",
  ])("drops cached protected data on %s", async (code) => {
    const { session, transport } = fixture();
    await session.openExistingCheckIn(4, "location", "owner", "selected");
    session.editVehicleDetails();
    session.setVehicleDetails({ color: "Silver" });
    session.detachRoute();
    vi.mocked(transport.loadSession).mockRejectedValueOnce(
      new EmployeeApiError({
        code,
        message: "Access unavailable",
        status: 404,
      }),
    );
    await session.activate(4, "location", "owner");
    expect(session.current()).toMatchObject({
      phase: "discovery-error",
      active: null,
      continuation: { detailsDraft: { color: "" } },
    });
  });
});
