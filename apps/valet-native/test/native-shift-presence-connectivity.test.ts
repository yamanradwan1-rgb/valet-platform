import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ports,
  id,
  shift,
  startResult,
  endResult,
  context,
} from "./native-shift-presence-test-fixture";
import {
  deferred,
  settle,
  fixture,
} from "./native-shift-presence-connectivity-fixture";

beforeEach(() => {
  vi.resetAllMocks();
  ports.descriptors.clear();
  vi.stubGlobal("expo", { uuidv4: () => id });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["START", "END"] as const)(
  "%s already-confirmed result stays settled on offline transition",
  async (action) => {
    const s = fixture(action);
    await s.owner.whenIdle();
    ports.submit.mockResolvedValue(
      action === "START" ? startResult : endResult,
    );
    await s.dispatch();
    if (action === "START") s.start.observeOperationalContext(2, context(true));
    expect(s.parent.current().phase).toBe(
      action === "START" ? "active" : "ended",
    );
    s.offline();
    expect(s.coordinator.snapshot().phase).toBe("confirmed");
    expect(s.parent.current().phase).toBe(
      action === "START" ? "active" : "ended",
    );
    s.owner.dispose();
  },
);

it.each(["START", "END"] as const)(
  "%s offline preserves dispatched O after either late outcome",
  async (action) => {
    for (const outcome of ["reject", "resolve"] as const) {
      ports.descriptors.clear();
      ports.submit.mockClear();
      ports.acquire.mockClear();
      ports.recover.mockClear();
      const s = fixture(action);
      await s.owner.whenIdle();
      const late = deferred<typeof startResult | typeof endResult>();
      ports.submit.mockReturnValue(late.promise);
      const sending = s.dispatch();
      await settle();
      expect(ports.submit).toHaveBeenCalledOnce();
      const descriptor = s.coordinator.descriptor()!;
      expect(descriptor.stage).toBe("SHIFT_MAY_HAVE_LEFT");
      s.offline();
      if (outcome === "reject") late.reject(new Error("connection lost"));
      else late.resolve(action === "START" ? startResult : endResult);
      await sending;
      expect(s.parent.current().phase).toBe("uncertain");
      expect(s.coordinator.snapshot().phase).toBe("uncertain");
      s.start.selectLocation(shift);
      s.end.setCashInput("9");
      expect(s.coordinator.descriptor()).toEqual(descriptor);
      expect(ports.descriptors.get(action)).toEqual(descriptor);
      if (action === "START")
        expect(s.start.current().selectedLocationId).toBe(id);
      else expect(s.end.current().cashInput).toBe("1");
      ports.recover.mockImplementation(async (operationId) => ({
        state: "PENDING",
        operationId,
        exceptionId: null,
      }));
      const validated = s.revalidate.mock.calls.length;
      await s.reconnect();
      expect(s.revalidate.mock.calls.length).toBeGreaterThan(validated);
      expect(ports.recover).toHaveBeenCalledExactlyOnceWith(
        descriptor.operationId,
      );
      expect(ports.submit).toHaveBeenCalledOnce();
      expect(ports.acquire).not.toHaveBeenCalled();
      expect(s.parent.current().phase).toBe("uncertain");
      s.owner.dispose();
    }
  },
);

it.each(["START", "END"] as const)(
  "%s offline before protected dispatch cancels acquisition and requires explicit fresh action",
  async (action) => {
    const s = fixture(action, "REQUIRE");
    await s.owner.whenIdle();
    const late = deferred<unknown>();
    ports.acquire.mockReturnValueOnce(late.promise);
    const sending = s.dispatch();
    await settle();
    expect(s.coordinator.descriptor()!.stage).toBe("LOCAL");
    s.offline();
    late.resolve({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: "2026-10-04T10:00:01Z",
    });
    await sending;
    await s.reconnect();
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.recover).not.toHaveBeenCalled();
    expect(ports.acquire).toHaveBeenCalledOnce();
    vi.stubGlobal("expo", { uuidv4: () => shift });
    ports.acquire.mockResolvedValue({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: "2026-10-04T10:00:01Z",
    });
    ports.submit.mockResolvedValue(
      action === "START" ? startResult : endResult,
    );
    if (action === "END")
      ports.recover.mockResolvedValue({ state: "EXPIRED", operationId: id });
    await s.parent.retry();
    if (action === "END") {
      expect(ports.submit).not.toHaveBeenCalled();
      s.end.requestConfirmation();
      await s.end.endShift();
    }
    expect(ports.submit).toHaveBeenCalledOnce();
    expect(s.coordinator.descriptor()!.operationId).toBe(shift);
    s.owner.dispose();
  },
);

it.each([
  ["START", "resolve"],
  ["END", "resolve"],
  ["START", "reject"],
  ["END", "reject"],
] as const)(
  "%s offline also fences a manager Exception POST with late %s",
  async (action, outcome) => {
    const s = fixture(action, "REQUIRE_OR_OVERRIDE");
    await s.owner.whenIdle();
    ports.acquire.mockRejectedValue(new Error("no GPS"));
    await s.dispatch();
    expect(s.parent.current().phase).toBe("error");
    const late = deferred<unknown>();
    ports.requestException.mockReturnValue(late.promise);
    const request = s.coordinator.requestManager();
    await settle();
    expect(ports.requestException).toHaveBeenCalledOnce();
    const descriptor = s.coordinator.descriptor()!;
    expect(descriptor.stage).toBe("EXCEPTION_MAY_HAVE_LEFT");
    s.offline();
    if (outcome === "reject") late.reject(new Error("connection lost"));
    else
      late.resolve({
        exceptionId: shift,
        action,
        locationId: id,
        shiftId: action === "END" ? shift : null,
        status: "PENDING",
      });
    await request;
    expect(s.parent.current().phase).toBe("uncertain");
    s.start.selectLocation(shift);
    s.end.setCashInput("9");
    expect(s.coordinator.descriptor()).toEqual(descriptor);
    ports.recover.mockImplementation(async (operationId) => ({
      state: "PENDING",
      operationId,
      exceptionId: shift,
    }));
    ports.readException.mockResolvedValue({
      exceptionId: shift,
      action,
      locationId: id,
      shiftId: action === "END" ? shift : null,
      status: "PENDING",
    });
    await s.reconnect();
    expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
    expect(ports.readException).toHaveBeenCalledExactlyOnceWith(shift);
    expect(ports.requestException).toHaveBeenCalledOnce();
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.acquire).toHaveBeenCalledOnce();
    s.owner.dispose();
  },
);
