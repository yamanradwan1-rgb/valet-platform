import { describe, expect, it, vi } from "vitest";
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
