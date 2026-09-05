import { describe, expect, it, vi } from "vitest";

import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";

function transport(): EmployeeCheckInTransport {
  return {
    createIntake: vi.fn(),
    loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
    loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
    loadSession: vi.fn(),
    recognize: vi.fn(),
  };
}

describe("Employee Check-In shell revalidation boundary", () => {
  it("preserves an in-progress snapshot on same-authority reactivation", async () => {
    const client = transport();
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport: client,
    });
    await session.activate(1, locationId);
    session.setVehicle({ plateNumberRaw: "12-34567" });
    session.reviewIdentity();
    const before = session.current();

    await session.activate(1, locationId);

    expect(session.current()).toBe(before);
    expect(session.current()).toMatchObject({
      identityGeneration: 1,
      locationId,
      phase: "confirm",
      vehicle: { plateNumberRaw: "12-34567" },
    });
    expect(client.loadDrafts).toHaveBeenCalledOnce();
    expect(client.loadContinuations).toHaveBeenCalledOnce();
  });

  it("ignores late discovery after an authoritative purge", async () => {
    let resolveDrafts!: (value: { drafts: [] }) => void;
    const client = transport();
    vi.mocked(client.loadDrafts).mockReturnValue(
      new Promise((resolve) => {
        resolveDrafts = resolve;
      }),
    );
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport: client,
    });

    const activation = session.activate(1, locationId);
    session.clear();
    resolveDrafts({ drafts: [] });
    await activation;

    expect(session.current()).toMatchObject({
      identityGeneration: null,
      locationId: null,
      phase: "inactive",
      vehicle: { plateNumberRaw: "" },
    });
  });
});
