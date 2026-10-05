import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ports,
  id,
  shift,
  startResult,
  endResult,
  context,
  marker,
  setup,
  location,
} from "./native-shift-presence-test-fixture";

beforeEach(() => {
  vi.clearAllMocks();
  ports.descriptors.clear();
  ports.recover.mockImplementation(async () => ports.recovery);
});
afterEach(() => vi.unstubAllGlobals());

it.each(["START", "END"] as const)(
  "local-only %s restart revalidates challenge and allows explicit manager choice",
  async (action) => {
    const descriptor = { ...marker(action), stage: "LOCAL" as const };
    ports.descriptors.set(action, descriptor);
    ports.recover.mockResolvedValue({
      state: "PENDING",
      operationId: id,
      exceptionId: null,
    });
    ports.readChallenge.mockResolvedValue({
      operationId: id,
      challengeId: id,
      action,
      locationId: id,
      shiftId: action === "END" ? shift : null,
      issuedAt: startResult.startedAt,
      expiresAt: "2026-10-04T10:05:00Z",
      presence: {
        mode: "REQUIRE_OR_OVERRIDE",
        maxAccuracyMeters: 50,
        maxFixAgeSeconds: 30,
      },
    });
    ports.requestException.mockResolvedValue({
      exceptionId: shift,
      action,
      locationId: id,
      shiftId: action === "END" ? shift : null,
      status: "PENDING",
    });
    const response = context(action === "END");
    response.contexts[0]!.eligibleLocations = [location];
    const s = setup(response);
    await s.runtime.restore(2, response);
    const coordinator = action === "START" ? s.runtime.start : s.runtime.end;
    const parent = action === "START" ? s.start : s.end;
    expect(parent.current().phase).toBe("error");
    expect(coordinator.snapshot()).toMatchObject({
      phase: "unavailable",
      overrideReason: "GPS_UNAVAILABLE",
    });
    expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.acquire).not.toHaveBeenCalled();
    await coordinator.requestManager();
    expect(ports.readChallenge).toHaveBeenCalledTimes(2);
    expect(ports.requestException).toHaveBeenCalledExactlyOnceWith(
      id,
      id,
      "GPS_UNAVAILABLE",
    );
    expect(ports.descriptors.get(action)?.stage).toBe(
      "EXCEPTION_MAY_HAVE_LEFT",
    );
  },
);

it.each(["START", "END"] as const)(
  "restart recovers exact %s even after the Shift already changed",
  async (action) => {
    ports.descriptors.set(action, marker(action));
    ports.recovery = {
      state: "RECOVERABLE",
      operationId: id,
      action,
      status: "COMMITTED",
      shiftId: shift,
      decisionId: null,
      denialReason: null,
      summary: null,
      result: action === "START" ? startResult : endResult,
    };
    const s = setup(context(action === "START"));
    expect(ports.descriptors.get(action)).toEqual(marker(action));
    await s.runtime.restore(2, context(action === "START"));
    expect(
      (action === "START" ? s.runtime.start : s.runtime.end).descriptor(),
    ).toBeDefined();
    expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.challenge).not.toHaveBeenCalled();
    expect(ports.acquire).not.toHaveBeenCalled();
    expect(
      action === "START" ? s.start.current().phase : s.end.current().phase,
    ).toBe(action === "START" ? "active" : "ended");
  },
);
it("unknown restart stays uncertain despite visible active Shift", async () => {
  ports.descriptors.set("START", marker("START"));
  ports.recover.mockRejectedValue(new Error("offline"));
  const s = setup(context(true));
  await s.runtime.restore(2, context(true));
  s.start.observeOperationalContext(2, context(true));
  expect(s.start.current().phase).toBe("uncertain");
  expect(ports.submit).not.toHaveBeenCalled();
});
it("a replaced Shift discards its marker", async () => {
  ports.descriptors.set("END", marker("END"));
  const response = context(true);
  response.contexts[0]!.activeShift = {
    ...response.contexts[0]!.activeShift!,
    shiftId: "33333333-3333-4333-8333-333333333333",
  };
  const s = setup(response);
  await s.runtime.restore(2, response);
  expect(ports.recover).not.toHaveBeenCalled();
  expect(ports.descriptors.has("END")).toBe(false);
  await s.runtime.purge();
  expect(s.runtime.start.descriptor()).toBeUndefined();
  expect(s.runtime.end.descriptor()).toBeUndefined();
});

it("detached/inactive membership does not block exact own-End recovery", async () => {
  ports.descriptors.set("END", marker("END"));
  ports.recovery = {
    state: "RECOVERABLE",
    operationId: id,
    action: "END",
    status: "COMMITTED",
    shiftId: shift,
    decisionId: null,
    denialReason: null,
    summary: null,
    result: endResult,
  };
  const response = { contexts: [] };
  const s = setup(response);
  await s.runtime.restore(2, response);
  expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
  expect(s.end.current().phase).toBe("ended");
  expect(ports.submit).not.toHaveBeenCalled();
});

it("detached own-End still challenges and submits OFF with ordinary cash guards", async () => {
  vi.stubGlobal("expo", { uuidv4: () => id });
  const s = setup(context(true));
  const degraded = { contexts: [] };
  s.end.observeOperationalContext(2, degraded);
  await s.runtime.restore(2, degraded);
  ports.challenge.mockImplementation(async (intent) => ({
    operationId: intent.operationId,
    action: "END",
    shiftId: shift,
    locationId: id,
    challengeId: id,
    issuedAt: startResult.startedAt,
    expiresAt: "2026-10-04T10:05:00Z",
    presence: { mode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
  }));
  ports.submit.mockResolvedValue(endResult);
  s.end.setCashInput("1");
  s.end.requestConfirmation();
  await s.end.endShift();
  expect(s.end.current().phase).toBe("ended");
  expect(ports.challenge).toHaveBeenCalledOnce();
  expect(ports.submit).toHaveBeenCalledWith(
    expect.objectContaining({ shiftId: shift, cashReported: "1" }),
    id,
    undefined,
  );
  expect(ports.acquire).not.toHaveBeenCalled();
});

it.each(["logout", "user replacement"])(
  "%s purges both durable recovery descriptors",
  async () => {
    ports.descriptors.set("START", {
      ...marker("START"),
      stage: "SHIFT_MAY_HAVE_LEFT",
    });
    ports.descriptors.set("END", {
      ...marker("END"),
      stage: "EXCEPTION_MAY_HAVE_LEFT",
    });
    const s = setup(context(true));
    s.identity.authGeneration += 1;
    await s.runtime.purge();
    expect(ports.descriptors.size).toBe(0);
    expect(s.runtime.start.descriptor()).toBeUndefined();
    expect(s.runtime.end.descriptor()).toBeUndefined();
  },
);
