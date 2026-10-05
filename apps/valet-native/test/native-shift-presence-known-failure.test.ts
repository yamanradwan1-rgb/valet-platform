import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { EmployeeApiError } from "@valet/employee-client";
import {
  ports,
  id,
  shift,
  context,
  location,
  setup,
  startResult,
  endResult,
} from "./native-shift-presence-test-fixture";

beforeEach(() => {
  vi.resetAllMocks();
  ports.descriptors.clear();
  vi.stubGlobal("expo", { uuidv4: () => id });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["END", "OPEN_TASK_HANDOFF_REQUIRED", "blocked-open-work", 409],
  ["START", "ACTIVE_SHIFT_CONFLICT", "conflict", 409],
  ["END", "SHIFT_CASH_REPORT_INVALID", "error", 422],
] as const)(
  "%s known %s cannot reappear as unknown after Native restart",
  async (action, code, phase, status) => {
    const response = context(action === "END");
    response.contexts[0]!.eligibleLocations = [location];
    ports.challenge.mockImplementation(async (intent) => ({
      operationId: intent.operationId,
      challengeId: id,
      action,
      locationId: id,
      shiftId: action === "END" ? shift : null,
      issuedAt: startResult.startedAt,
      expiresAt: "2026-10-04T10:05:00Z",
      presence: { mode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
    }));
    const dispatch = (s: ReturnType<typeof setup>) => {
      if (action === "START") {
        s.start.selectLocation(id);
        return s.start.start();
      }
      s.end.setCashInput("1");
      s.end.requestConfirmation();
      return s.end.endShift();
    };
    const s = setup(response);
    ports.submit.mockRejectedValueOnce(
      new EmployeeApiError({ code, status, message: "Known failure" }),
    );
    await dispatch(s);
    expect((action === "START" ? s.start : s.end).current().phase).toBe(phase);
    const old = (
      action === "START" ? s.runtime.start : s.runtime.end
    ).descriptor()!.operationId;
    expect(ports.descriptors.has(action)).toBe(false);
    const fresh = setup(response);
    await fresh.runtime.restore(2, response);
    expect((action === "START" ? fresh.start : fresh.end).current().phase).toBe(
      action === "START" ? "ready" : "active",
    );
    expect(ports.recover).not.toHaveBeenCalled();
    vi.stubGlobal("expo", { uuidv4: () => shift });
    ports.submit.mockResolvedValue(
      action === "START" ? startResult : endResult,
    );
    await dispatch(fresh);
    expect(
      (action === "START"
        ? fresh.runtime.start
        : fresh.runtime.end
      ).descriptor()!.operationId,
    ).not.toBe(old);
    expect(ports.submit).toHaveBeenCalledTimes(2);
    expect(ports.recover).not.toHaveBeenCalled();
    expect(ports.acquire).not.toHaveBeenCalled();
  },
);
