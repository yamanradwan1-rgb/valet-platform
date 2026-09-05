import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeShiftStartSession } from "./employee-shift-start-session";
import {
  activeShiftResponse,
  deferredShiftStart,
  shiftStartContext,
  shiftStartIds,
  shiftStartLocation,
  StubShiftStartTransport,
} from "./employee-shift-start-test-fixture";

function readySession(transport: StubShiftStartTransport) {
  const refreshOperationalContext = vi.fn(async () => undefined);
  const session = new EmployeeShiftStartSession({
    refreshOperationalContext,
    transport,
  });
  session.activate(1);
  session.observeOperationalContext(1, shiftStartContext());
  return { refreshOperationalContext, session };
}

describe("Employee Shift start mutation", () => {
  it("coalesces rapid taps and waits for canonical context after success", async () => {
    const response =
      deferredShiftStart<ReturnType<typeof activeShiftResponse>>();
    const transport = new StubShiftStartTransport();
    transport.results.push(response.promise);
    const { refreshOperationalContext, session } = readySession(transport);

    const first = session.start();
    const second = session.start();
    expect(second).toBe(first);
    expect(transport.calls).toEqual([shiftStartIds.locationA]);
    expect(session.current().phase).toBe("submitting");

    response.resolve(activeShiftResponse());
    await first;
    expect(refreshOperationalContext).toHaveBeenCalledOnce();
    expect(session.current()).toMatchObject({
      phase: "verifying",
      selectedLocationId: shiftStartIds.locationA,
      targetLocationId: shiftStartIds.locationA,
    });
  });

  it("enters active only after post-success context proves the same active Shift", async () => {
    const transport = new StubShiftStartTransport();
    transport.results.push(Promise.resolve(activeShiftResponse()));
    const holder: { session?: EmployeeShiftStartSession } = {};
    const refreshOperationalContext = vi.fn(async () => {
      expect(holder.session?.current().phase).toBe("verifying");
      holder.session?.observeOperationalContext(
        1,
        shiftStartContext({ activeLocationId: shiftStartIds.locationA }),
      );
    });
    const session = new EmployeeShiftStartSession({
      refreshOperationalContext,
      transport,
    });
    holder.session = session;
    session.activate(1);
    session.observeOperationalContext(1, shiftStartContext());

    await session.start();

    expect(refreshOperationalContext).toHaveBeenCalledOnce();
    expect(session.current()).toMatchObject({
      phase: "active",
      targetLocationId: null,
    });
  });

  it("treats the current same-Location server response like any successful Start", async () => {
    const transport = new StubShiftStartTransport();
    transport.results.push(Promise.resolve(activeShiftResponse()));
    const { refreshOperationalContext, session } = readySession(transport);

    await session.start();

    expect(transport.calls).toEqual([shiftStartIds.locationA]);
    expect(refreshOperationalContext).toHaveBeenCalledOnce();
    expect(session.current().phase).toBe("verifying");
  });

  it("surfaces same-membership different-Location conflict", async () => {
    const transport = new StubShiftStartTransport();
    transport.results.push(
      Promise.reject(
        new EmployeeApiError({
          code: "ACTIVE_SHIFT_CONFLICT",
          message: "Conflict",
          status: 409,
        }),
      ),
    );
    const { session } = readySession(transport);

    await session.start();

    expect(session.current()).toMatchObject({
      failure: { code: "ACTIVE_SHIFT_CONFLICT" },
      phase: "conflict",
    });
  });

  it.each([403, 404])(
    "surfaces definitive %s denial without active state",
    async (status) => {
      const transport = new StubShiftStartTransport();
      transport.results.push(
        Promise.reject(
          new EmployeeApiError({ code: "DENIED", message: "Denied", status }),
        ),
      );
      const { session } = readySession(transport);

      await session.start();

      expect(session.current().phase).toBe("denied");
      expect(session.current().phase).not.toBe("active");
    },
  );

  it("surfaces a definitive ordinary error without active state", async () => {
    const transport = new StubShiftStartTransport();
    transport.results.push(
      Promise.reject(
        new EmployeeApiError({
          code: "INVALID_START",
          message: "Invalid",
          status: 400,
        }),
      ),
    );
    const { session } = readySession(transport);

    await session.start();

    expect(session.current()).toMatchObject({
      failure: { code: "INVALID_START" },
      phase: "error",
      targetLocationId: null,
    });
  });

  it("retains an ambiguous result and retries only the same target explicitly", async () => {
    const secondLocation = shiftStartLocation(shiftStartIds.locationB, "AQJ-1");
    const transport = new StubShiftStartTransport();
    transport.results.push(
      Promise.reject(employeeNetworkError()),
      Promise.resolve(activeShiftResponse()),
    );
    const refreshOperationalContext = vi.fn(async () => undefined);
    const session = new EmployeeShiftStartSession({
      refreshOperationalContext,
      transport,
    });
    session.activate(1);
    session.observeOperationalContext(
      1,
      shiftStartContext({ locations: [shiftStartLocation(), secondLocation] }),
    );
    session.selectLocation(shiftStartIds.locationA);

    await session.start();
    expect(session.current().phase).toBe("uncertain");
    session.selectLocation(shiftStartIds.locationB);
    session.observeOperationalContext(
      1,
      shiftStartContext({ locations: [shiftStartLocation(), secondLocation] }),
    );
    expect(transport.calls).toEqual([shiftStartIds.locationA]);

    await session.retry();
    expect(transport.calls).toEqual([
      shiftStartIds.locationA,
      shiftStartIds.locationA,
    ]);
    expect(refreshOperationalContext).toHaveBeenCalledOnce();
  });

  it.each([408, 503])(
    "treats an HTTP %s result as an unknown outcome",
    async (status) => {
      const transport = new StubShiftStartTransport();
      transport.results.push(
        Promise.reject(
          new EmployeeApiError({
            code: "TEMPORARY",
            message: "Unknown",
            status,
          }),
        ),
      );
      const { session } = readySession(transport);

      await session.start();

      expect(session.current()).toMatchObject({
        failure: { status },
        phase: "uncertain",
      });
    },
  );
});
