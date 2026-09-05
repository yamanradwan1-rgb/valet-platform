import { describe, expect, it, vi } from "vitest";

import { EmployeeShiftStartSession } from "./employee-shift-start-session";
import {
  activeShiftResponse,
  shiftStartContext,
  shiftStartIds,
  shiftStartLocation,
  StubShiftStartTransport,
} from "./employee-shift-start-test-fixture";

function createSession(transport = new StubShiftStartTransport()) {
  const refreshOperationalContext = vi.fn(async () => undefined);
  const session = new EmployeeShiftStartSession({
    refreshOperationalContext,
    transport,
  });
  session.activate(1);
  return { refreshOperationalContext, session, transport };
}

describe("Employee Shift start authoritative Location selection", () => {
  it("blocks Start when the authoritative context has zero eligible Locations", async () => {
    const { session, transport } = createSession();
    session.observeOperationalContext(1, shiftStartContext({ locations: [] }));

    expect(session.current()).toMatchObject({
      phase: "ready",
      selectedLocationId: null,
      startableLocations: [],
    });
    await session.start();
    expect(transport.calls).toEqual([]);
  });

  it("preselects one server Location without sending until explicit Start", async () => {
    const transport = new StubShiftStartTransport();
    transport.results.push(Promise.resolve(activeShiftResponse()));
    const { session } = createSession(transport);
    session.observeOperationalContext(1, shiftStartContext());

    expect(session.current().selectedLocationId).toBe(shiftStartIds.locationA);
    expect(transport.calls).toEqual([]);
    await session.start();
    expect(transport.calls).toEqual([shiftStartIds.locationA]);
  });

  it("requires an explicit choice when several Locations are eligible", async () => {
    const second = shiftStartLocation(shiftStartIds.locationB, "AQJ-1");
    const transport = new StubShiftStartTransport();
    transport.results.push(
      Promise.resolve(activeShiftResponse(shiftStartIds.locationB)),
    );
    const { session } = createSession(transport);
    session.observeOperationalContext(
      1,
      shiftStartContext({ locations: [shiftStartLocation(), second] }),
    );

    expect(session.current().selectedLocationId).toBeNull();
    await session.start();
    expect(transport.calls).toEqual([]);
    session.selectLocation(shiftStartIds.locationB);
    await session.start();
    expect(transport.calls).toEqual([shiftStartIds.locationB]);
  });

  it.each(["membership", "organization", "eligibility"] as const)(
    "invalidates a stale selection after %s authority changes",
    (change) => {
      const { session } = createSession();
      const locations = [
        shiftStartLocation(),
        shiftStartLocation(shiftStartIds.locationB, "AQJ-1"),
      ];
      session.observeOperationalContext(1, shiftStartContext({ locations }));
      session.selectLocation(shiftStartIds.locationB);

      session.observeOperationalContext(
        1,
        shiftStartContext({
          locations:
            change === "eligibility" ? [shiftStartLocation()] : locations,
          ...(change === "membership"
            ? { membershipId: "66666666-6666-4666-8666-666666666666" }
            : {}),
          ...(change === "organization"
            ? { organizationId: "77777777-7777-4777-8777-777777777777" }
            : {}),
        }),
      );

      expect(session.current().selectedLocationId).not.toBe(
        shiftStartIds.locationB,
      );
    },
  );
});
