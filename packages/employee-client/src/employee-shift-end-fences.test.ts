import { describe, expect, it } from "vitest";

import { employeeNetworkError } from "./api-error";
import { EmployeeShiftEndSession } from "./employee-shift-end-session";
import {
  deferredShiftEnd,
  endedShift,
  shiftEndContext,
  shiftEndIds,
  StubShiftEndTransport,
} from "./employee-shift-end-test-fixture";

function submitting() {
  const pending = deferredShiftEnd<ReturnType<typeof endedShift>>();
  const transport = new StubShiftEndTransport();
  transport.results.push(pending.promise);
  const session = new EmployeeShiftEndSession({ transport });
  session.activate(1);
  session.observeOperationalContext(1, shiftEndContext());
  session.setCashInput("10.000");
  session.requestConfirmation();
  const result = session.endShift();
  return { pending, result, session, transport };
}

describe("Employee Shift end authority and lifecycle fences", () => {
  it("fences a late success after logout/auth generation change", async () => {
    const { pending, result, session } = submitting();
    session.clear();
    session.activate(2);
    pending.resolve(endedShift());
    await result;
    expect(session.current()).toMatchObject({
      authority: null,
      identityGeneration: 2,
      phase: "inactive",
      result: null,
    });
  });

  it.each(["organization", "membership", "location", "shift"] as const)(
    "fences a late result after %s replacement",
    async (field) => {
      const { pending, result, session } = submitting();
      session.observeOperationalContext(
        1,
        shiftEndContext({
          ...(field === "organization"
            ? { organizationId: crypto.randomUUID() }
            : {}),
          ...(field === "membership"
            ? { membershipId: crypto.randomUUID() }
            : {}),
          ...(field === "location" ? { locationId: crypto.randomUUID() } : {}),
          ...(field === "shift" ? { shiftId: crypto.randomUUID() } : {}),
        }),
      );
      pending.resolve(endedShift());
      await result;
      expect(session.current().phase).toBe("active");
      expect(session.current().result).toBeNull();
    },
  );

  it("backgrounds an in-flight command into uncertainty and ignores its late response", async () => {
    const { pending, result, session, transport } = submitting();
    session.suspendForBackground();
    expect(session.current().phase).toBe("uncertain");
    pending.resolve(endedShift());
    await result;
    expect(session.current().phase).toBe("uncertain");
    expect(transport.calls).toHaveLength(1);
  });

  it("fences an in-flight result when operational scope is purged", async () => {
    const { pending, result, session } = submitting();
    session.fenceOperationalScope();
    pending.resolve(endedShift());
    await result;
    expect(session.current()).toMatchObject({
      phase: "uncertain",
      result: null,
    });
  });

  it("never sends while definitely offline", async () => {
    const transport = new StubShiftEndTransport();
    const session = new EmployeeShiftEndSession({
      initialOnline: false,
      transport,
    });
    session.activate(1);
    session.observeOperationalContext(1, shiftEndContext());
    session.setCashInput("0");
    session.requestConfirmation();
    await session.endShift();
    expect(session.current()).toMatchObject({ online: false, phase: "active" });
    expect(transport.calls).toEqual([]);
  });

  it("does not attach an uncertain command to a replacement Shift", async () => {
    const transport = new StubShiftEndTransport();
    transport.results.push(Promise.reject(employeeNetworkError()));
    const session = new EmployeeShiftEndSession({ transport });
    session.activate(1);
    session.observeOperationalContext(1, shiftEndContext());
    session.setCashInput("10");
    session.requestConfirmation();
    await session.endShift();
    session.observeOperationalContext(
      1,
      shiftEndContext({ shiftId: crypto.randomUUID() }),
    );
    await session.retry();
    expect(session.current().phase).toBe("active");
    expect(transport.calls).toEqual([
      { cashReported: "10", shiftId: shiftEndIds.shift },
    ]);
  });

  it("keeps the exact uncertain intent when active context disappears", async () => {
    const transport = new StubShiftEndTransport();
    transport.results.push(Promise.reject(employeeNetworkError()));
    const session = new EmployeeShiftEndSession({ transport });
    session.activate(1);
    session.observeOperationalContext(1, shiftEndContext());
    session.setCashInput("10");
    session.requestConfirmation();
    await session.endShift();
    session.observeOperationalContext(1, { contexts: [] });
    expect(session.current()).toMatchObject({
      authority: { shiftId: shiftEndIds.shift },
      phase: "uncertain",
    });
  });
});
