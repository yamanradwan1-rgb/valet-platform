import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeShiftEndSession } from "./employee-shift-end-session";
import {
  deferredShiftEnd,
  endedShift,
  shiftEndContext,
  shiftEndIds,
  StubShiftEndTransport,
} from "./employee-shift-end-test-fixture";

function activeSession(transport = new StubShiftEndTransport()) {
  const session = new EmployeeShiftEndSession({ transport });
  session.activate(1);
  session.observeOperationalContext(1, shiftEndContext());
  session.setCashInput(" 10 ");
  return { session, transport };
}

describe("Employee Shift end command", () => {
  it("requires valid cash and explicit confirmation; cancel has no effect", async () => {
    const { session, transport } = activeSession();
    session.setCashInput("");
    session.requestConfirmation();
    expect(session.current()).toMatchObject({
      cashValidationVisible: true,
      phase: "active",
    });
    session.setCashInput("0");
    session.requestConfirmation();
    expect(session.current().phase).toBe("confirming");
    session.cancelConfirmation();
    await session.endShift();
    expect(transport.calls).toEqual([]);
  });

  it("sends one normalized exact command and adopts strict terminal truth", async () => {
    const pending = deferredShiftEnd<ReturnType<typeof endedShift>>();
    const { session, transport } = activeSession();
    transport.results.push(pending.promise);
    session.requestConfirmation();
    const first = session.endShift();
    const second = session.endShift();

    expect(second).toBe(first);
    expect(session.current().phase).toBe("submitting");
    expect(transport.calls).toEqual([
      { cashReported: "10", shiftId: shiftEndIds.shift },
    ]);
    pending.resolve(endedShift());
    await first;
    expect(session.current()).toMatchObject({
      phase: "ended",
      result: { status: "ENDED" },
    });
  });

  it("retires downstream scope only after strict success", async () => {
    const onEnded = vi.fn();
    const transport = new StubShiftEndTransport();
    transport.results.push(
      Promise.resolve(endedShift("11.000")),
      Promise.resolve(endedShift()),
    );
    const session = new EmployeeShiftEndSession({ onEnded, transport });
    session.activate(1);
    session.observeOperationalContext(1, shiftEndContext());
    session.setCashInput("10");
    session.requestConfirmation();
    await session.endShift();
    expect(onEnded).not.toHaveBeenCalled();
    await session.retry();
    expect(onEnded).toHaveBeenCalledExactlyOnceWith(endedShift());
  });

  it("classifies open work as a definite block and permits a new explicit attempt", async () => {
    const { session, transport } = activeSession();
    transport.results.push(
      Promise.reject(
        new EmployeeApiError({
          code: "OPEN_TASK_HANDOFF_REQUIRED",
          message: "Hand off work",
          status: 409,
        }),
      ),
      Promise.resolve(endedShift()),
    );
    session.requestConfirmation();
    await session.endShift();
    expect(session.current()).toMatchObject({
      failure: { code: "OPEN_TASK_HANDOFF_REQUIRED" },
      phase: "blocked-open-work",
    });

    session.requestConfirmation();
    await session.endShift();
    expect(transport.calls).toHaveLength(2);
    expect(session.current().phase).toBe("ended");
  });

  it("keeps definite authorization/cash errors distinct from uncertainty", async () => {
    const { session, transport } = activeSession();
    transport.results.push(
      Promise.reject(
        new EmployeeApiError({
          code: "SHIFT_CASH_REPORT_INVALID",
          message: "Invalid cash report",
          status: 400,
        }),
      ),
    );
    session.requestConfirmation();
    await session.endShift();
    expect(session.current()).toMatchObject({
      failure: { code: "SHIFT_CASH_REPORT_INVALID" },
      phase: "error",
    });
  });

  it("does not impose a Native-only eligibility block on retained self-cleanup", async () => {
    const { session, transport } = activeSession();
    transport.results.push(Promise.resolve(endedShift()));
    session.observeOperationalContext(1, { contexts: [] });
    session.requestConfirmation();
    await session.endShift();
    expect(transport.calls).toEqual([
      { cashReported: "10", shiftId: shiftEndIds.shift },
    ]);
    expect(session.current().phase).toBe("ended");
  });

  it("leaves presented success only after authoritative no-active-shift reconciliation", async () => {
    const { session, transport } = activeSession();
    transport.results.push(Promise.resolve(endedShift()));
    session.requestConfirmation();
    await session.endShift();

    expect(session.current()).toMatchObject({
      authority: { shiftId: shiftEndIds.shift },
      phase: "ended",
      result: { status: "ENDED" },
    });
    session.observeOperationalContext(1, { contexts: [] });
    expect(session.current().phase).toBe("ended");

    session.acknowledgeEndedPresentation();
    expect(session.current()).toMatchObject({
      authority: null,
      phase: "inactive",
      result: null,
    });
  });

  it("never auto-replays an uncertain command and explicitly retries the exact intent", async () => {
    const { session, transport } = activeSession();
    transport.results.push(
      Promise.reject(employeeNetworkError()),
      Promise.resolve(endedShift()),
    );
    session.requestConfirmation();
    await session.endShift();

    expect(session.current().phase).toBe("uncertain");
    session.setCashInput("99.999");
    session.setOnline(false);
    session.setOnline(true);
    session.observeOperationalContext(1, shiftEndContext());
    expect(transport.calls).toEqual([
      { cashReported: "10", shiftId: shiftEndIds.shift },
    ]);

    await session.retry();
    expect(transport.calls).toEqual([
      { cashReported: "10", shiftId: shiftEndIds.shift },
      { cashReported: "10", shiftId: shiftEndIds.shift },
    ]);
    expect(session.current().phase).toBe("ended");
  });

  it.each([408, 500, 503])(
    "treats HTTP %s as an uncertain outcome",
    async (status) => {
      const { session, transport } = activeSession();
      transport.results.push(
        Promise.reject(
          new EmployeeApiError({
            code: "TEMPORARY",
            message: "Unknown",
            status,
          }),
        ),
      );
      session.requestConfirmation();
      await session.endShift();
      expect(session.current().phase).toBe("uncertain");
      expect(transport.calls).toHaveLength(1);
    },
  );

  it("treats a mismatched 2xx result as uncertain and never fabricates ENDED", async () => {
    const { session, transport } = activeSession();
    transport.results.push(Promise.resolve(endedShift("11.000")));
    session.requestConfirmation();
    await session.endShift();
    expect(session.current()).toMatchObject({
      failure: { code: "SHIFT_END_RESPONSE_MISMATCH" },
      phase: "uncertain",
      result: null,
    });
  });
});
