import { describe, expect, it, vi } from "vitest";

import { employeeNetworkError } from "./api-error";
import { EmployeeShiftStartSession } from "./employee-shift-start-session";
import {
  activeShiftResponse,
  deferredShiftStart,
  shiftStartContext,
  shiftStartIds,
  shiftStartLocation,
  StubShiftStartTransport,
} from "./employee-shift-start-test-fixture";

async function uncertainSession() {
  const transport = new StubShiftStartTransport();
  transport.results.push(Promise.reject(employeeNetworkError()));
  const session = new EmployeeShiftStartSession({
    refreshOperationalContext: vi.fn(async () => undefined),
    transport,
  });
  session.activate(1);
  session.observeOperationalContext(1, shiftStartContext());
  await session.start();
  return { session, transport };
}

describe("Employee Shift start canonical reconciliation", () => {
  it("reconciles uncertainty only from the same-authority active Shift", async () => {
    const { session } = await uncertainSession();

    session.observeOperationalContext(
      1,
      shiftStartContext({ activeLocationId: shiftStartIds.locationA }),
    );

    expect(session.current()).toMatchObject({
      phase: "active",
      targetLocationId: null,
    });
  });

  it("does not resolve uncertainty from NO_ACTIVE_SHIFT", async () => {
    const { session, transport } = await uncertainSession();

    session.observeOperationalContext(1, shiftStartContext());

    expect(session.current().phase).toBe("uncertain");
    expect(transport.calls).toHaveLength(1);
  });

  it("does not resolve uncertainty from an active Shift elsewhere", async () => {
    const { session } = await uncertainSession();
    const other = shiftStartLocation(shiftStartIds.locationB, "AQJ-1");

    session.observeOperationalContext(
      1,
      shiftStartContext({
        activeLocationId: shiftStartIds.locationB,
        locations: [shiftStartLocation(), other],
      }),
    );

    expect(session.current().phase).toBe("uncertain");
  });

  it("reveals the latest unrelated active context after dismissing uncertainty", async () => {
    const { session } = await uncertainSession();
    const other = shiftStartLocation(shiftStartIds.locationB, "AQJ-1");
    session.observeOperationalContext(
      1,
      shiftStartContext({
        activeLocationId: shiftStartIds.locationB,
        locations: [shiftStartLocation(), other],
      }),
    );

    session.dismissUncertain();

    expect(session.current()).toMatchObject({
      phase: "active",
      targetLocationId: null,
    });
  });

  it("does not resolve uncertainty from ambiguous active Shifts", async () => {
    const { session } = await uncertainSession();
    const second = shiftStartContext({
      activeLocationId: shiftStartIds.locationB,
      locations: [shiftStartLocation(shiftStartIds.locationB, "AQJ-1")],
      membershipId: "66666666-6666-4666-8666-666666666666",
      organizationId: "77777777-7777-4777-8777-777777777777",
    }).contexts[0]!;
    const first = shiftStartContext({
      activeLocationId: shiftStartIds.locationA,
    }).contexts[0]!;

    session.observeOperationalContext(1, { contexts: [first, second] });

    expect(session.current().phase).toBe("uncertain");
  });

  it.each(["membership", "organization", "eligibility"] as const)(
    "purges uncertainty after %s authority loss",
    async (change) => {
      const { session } = await uncertainSession();

      session.observeOperationalContext(
        1,
        shiftStartContext({
          locations: change === "eligibility" ? [] : [shiftStartLocation()],
          ...(change === "membership"
            ? { membershipId: "66666666-6666-4666-8666-666666666666" }
            : {}),
          ...(change === "organization"
            ? { organizationId: "77777777-7777-4777-8777-777777777777" }
            : {}),
        }),
      );

      expect(session.current().phase).toBe("ready");
      expect(session.current().targetLocationId).toBeNull();
    },
  );

  it("purges on generation change and ignores the late old POST response", async () => {
    const response =
      deferredShiftStart<ReturnType<typeof activeShiftResponse>>();
    const transport = new StubShiftStartTransport();
    transport.results.push(response.promise);
    const refreshOperationalContext = vi.fn(async () => undefined);
    const session = new EmployeeShiftStartSession({
      refreshOperationalContext,
      transport,
    });
    session.activate(1);
    session.observeOperationalContext(1, shiftStartContext());
    const start = session.start();

    session.activate(2);
    response.resolve(activeShiftResponse());
    await start;

    expect(session.current()).toMatchObject({
      identityGeneration: 2,
      phase: "inactive",
      targetLocationId: null,
    });
    expect(refreshOperationalContext).not.toHaveBeenCalled();
  });
});
