import { beforeEach, expect, it, vi } from "vitest";
import type {
  PresenceDescriptor,
  StaffOperationalContextResponse,
} from "@valet/employee-client";
import {
  context,
  endResult,
  id,
  location,
  marker,
  ports,
  setup,
  shift,
  startResult,
} from "./native-shift-presence-test-fixture";

function operationalContext(action: "START" | "END") {
  const response = context(action === "END");
  if (action === "START") response.contexts[0]!.eligibleLocations = [location];
  return response;
}

function committedRecovery(action: "START" | "END") {
  ports.recover.mockResolvedValue({
    state: "RECOVERABLE",
    operationId: id,
    action,
    status: "COMMITTED",
    shiftId: shift,
    decisionId: null,
    denialReason: null,
    summary: null,
    result: action === "START" ? startResult : endResult,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ports.descriptors.clear();
  ports.readDescriptor.mockImplementation(async (action) =>
    ports.descriptors.get(action),
  );
  ports.recover.mockImplementation(async (operationId) => ({
    state: "PENDING",
    operationId,
    exceptionId: null,
  }));
});

it.each(["START", "END"] as const)(
  "recovers exact %s after transient same-generation storage rejection",
  async (action) => {
    const response = operationalContext(action);
    ports.descriptors.set(action, marker(action));
    committedRecovery(action);
    if (action === "END") ports.readDescriptor.mockResolvedValueOnce(undefined);
    ports.readDescriptor.mockRejectedValueOnce(
      new Error("temporary secure read failure"),
    );
    const { runtime } = setup(response);

    await expect(runtime.restore(2, response)).rejects.toThrow(
      "temporary secure read failure",
    );
    expect(ports.descriptors.has(action)).toBe(true);
    expect(ports.recover).not.toHaveBeenCalled();
    await runtime.restore(2, response);

    expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.challenge).not.toHaveBeenCalled();
    expect(ports.requestException).not.toHaveBeenCalled();
    expect(ports.acquire).not.toHaveBeenCalled();
  },
);

it("coalesces concurrent same-generation attempts and permits retry after rejection", async () => {
  const response = operationalContext("START");
  ports.descriptors.set("START", marker("START"));
  let rejectRead!: (reason: Error) => void;
  ports.readDescriptor.mockImplementationOnce(
    () =>
      new Promise<PresenceDescriptor | undefined>((_resolve, reject) => {
        rejectRead = reject;
      }),
  );
  const { runtime } = setup(response);

  const first = runtime.restore(2, response);
  const joined = runtime.restore(2, response);
  expect(joined).toBe(first);
  expect(ports.readDescriptor).toHaveBeenCalledTimes(1);
  rejectRead(new Error("transient read"));
  await expect(first).rejects.toThrow("transient read");

  await runtime.restore(2, response);
  expect(ports.readDescriptor).toHaveBeenCalledTimes(3);
  expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
  expect(ports.submit).not.toHaveBeenCalled();
});

it("keeps an already-restored START descriptor when the later END read fails", async () => {
  const response = context(true);
  response.contexts[0]!.eligibleLocations = [location];
  ports.descriptors.set("START", marker("START"));
  ports.descriptors.set("END", { ...marker("END"), operationId: shift });
  ports.readDescriptor.mockResolvedValueOnce(marker("START"));
  ports.readDescriptor.mockRejectedValueOnce(new Error("END read failed"));
  const { runtime } = setup(response);

  await expect(runtime.restore(2, response)).rejects.toThrow("END read failed");
  expect(runtime.start.descriptor()?.operationId).toBe(id);
  expect(runtime.end.descriptor()).toBeUndefined();
  await runtime.restore(2, response);

  expect(runtime.start.descriptor()?.operationId).toBe(id);
  expect(runtime.end.descriptor()?.operationId).toBe(shift);
  expect(ports.recover.mock.calls.map(([operationId]) => operationId)).toEqual([
    id,
    shift,
  ]);
  expect(ports.submit).not.toHaveBeenCalled();
  expect(ports.challenge).not.toHaveBeenCalled();
  expect(ports.acquire).not.toHaveBeenCalled();
});

it("does not let an older generation's rejection clear the newer success latch", async () => {
  let rejectOld!: (reason: Error) => void;
  ports.readDescriptor.mockImplementationOnce(
    () =>
      new Promise<PresenceDescriptor | undefined>((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  const response: StaffOperationalContextResponse = { contexts: [] };
  const { runtime, identity } = setup(response);
  const old = runtime.restore(2, response);

  identity.authGeneration = 3;
  await runtime.restore(3, response);
  rejectOld(new Error("stale read failed"));
  await expect(old).rejects.toThrow("stale read failed");
  await runtime.restore(3, response);

  expect(ports.readDescriptor).toHaveBeenCalledTimes(3);
  expect(ports.recover).not.toHaveBeenCalled();
  expect(ports.submit).not.toHaveBeenCalled();
});

it("ignores an old storage completion after identity replacement and purge", async () => {
  const response = operationalContext("START");
  ports.descriptors.set("START", marker("START"));
  let resolveOld!: (value: PresenceDescriptor) => void;
  ports.readDescriptor.mockImplementationOnce(
    () =>
      new Promise<PresenceDescriptor | undefined>((resolve) => {
        resolveOld = resolve;
      }),
  );
  const { runtime, identity } = setup(response);
  const old = runtime.restore(2, response);

  identity.authGeneration = 3;
  await runtime.purge();
  resolveOld(marker("START"));
  await old;

  expect(ports.descriptors.size).toBe(0);
  expect(runtime.start.descriptor()).toBeUndefined();
  expect(runtime.end.descriptor()).toBeUndefined();
  expect(ports.recover).not.toHaveBeenCalled();
  expect(ports.submit).not.toHaveBeenCalled();
});

it("keeps unknown server outcome uncertain without re-posting START", async () => {
  const response = operationalContext("START");
  ports.descriptors.set("START", marker("START"));
  ports.recover.mockRejectedValue(new Error("network disconnected"));
  const { runtime, start } = setup(response);

  await runtime.restore(2, response);
  await runtime.restore(2, response);
  expect(start.current().phase).toBe("uncertain");
  expect(runtime.start.descriptor()?.operationId).toBe(id);
  expect(ports.recover).toHaveBeenCalledTimes(1);
  expect(ports.submit).not.toHaveBeenCalled();
  expect(ports.challenge).not.toHaveBeenCalled();
  expect(ports.acquire).not.toHaveBeenCalled();
});
