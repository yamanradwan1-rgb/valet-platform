import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import {
  EmployeeApiError,
  type EmployeeGpsSample,
} from "@valet/employee-client";
import { NativeTaskGpsPublisher } from "../src/tracking/native-task-gps-publisher";
import type {
  NativeTaskLocationAccess,
  NativeTaskLocationFix,
  NativeTaskLocationPort,
  NativeTaskLocationWatcher,
} from "../src/tracking/native-task-location-adapter";
import type { NativeTaskTrackingBinding } from "../src/tracking/native-task-tracking-types";

const baseNow = Date.parse("2026-10-07T01:00:00.000Z");
const binding: NativeTaskTrackingBinding = {
  identityGeneration: 7,
  key: "authority-7:parking",
  locationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
  shiftId: "55555555-5555-4555-8555-555555555555",
  startedAt: baseNow - 1_000,
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "PARKING",
  trackingSessionId: "77777777-7777-4777-8777-777777777777",
};

function sequenceIds() {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
}

class FakeLocation implements NativeTaskLocationPort {
  access: NativeTaskLocationAccess = { kind: "granted" };
  ensureCalls = 0;
  ensureRequests: boolean[] = [];
  inspectCalls = 0;
  remove = vi.fn();
  watchCalls = 0;
  callback: ((fix: NativeTaskLocationFix) => void) | undefined;
  error: (() => void) | undefined;
  delayedWatch: Promise<NativeTaskLocationWatcher> | undefined;
  async ensureAccess(requestPermission: boolean): Promise<NativeTaskLocationAccess> {
    this.ensureCalls += 1;
    this.ensureRequests.push(requestPermission);
    return this.access;
  }
  async inspectAccess(): Promise<NativeTaskLocationAccess> {
    this.inspectCalls += 1;
    return this.access;
  }
  async openSettings(): Promise<void> {}
  async watch(onFix: (fix: NativeTaskLocationFix) => void, onError: () => void) {
    this.watchCalls += 1;
    this.callback = onFix;
    this.error = onError;
    return this.delayedWatch ?? { remove: this.remove };
  }
  emit(now: number, accuracyMeters = 8): void {
    this.callback?.({
      accuracyMeters,
      latitude: 31.95,
      longitude: 35.91,
      timestamp: now,
    });
  }
}

function setup() {
  let now = baseNow;
  let authorized = true;
  const location = new FakeLocation();
  const uploads: Array<{ sessionId: string; samples: readonly unknown[] }> = [];
  const upload = vi.fn(async (
    sessionId: string,
    samples: readonly EmployeeGpsSample[],
    signal?: AbortSignal,
  ) => {
    void signal;
    uploads.push({ sessionId, samples });
    return {
      samples: samples.map((sample) => ({
        clientSampleId: sample.clientSampleId,
        status: "ACCEPTED" as const,
      })),
    };
  });
  const unknown = vi.fn();
  const definitive = vi.fn();
  const publisher = new NativeTaskGpsPublisher({
    createId: sequenceIds(),
    isAuthorized: () => authorized,
    location,
    now: () => now,
    random: () => 0.5,
    onDefinitiveFailure: definitive,
    onUnknown: unknown,
    transport: { upload },
  });
  return {
    definitive,
    location,
    publisher,
    unknown,
    upload,
    uploads,
    authorize: (value: boolean) => {
      authorized = value;
    },
    setNow: (value: number) => {
      now = value;
    },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("#270 Native task GPS publisher", () => {
  it("removes a late watcher after dispose and keeps double dispose idempotent", async () => {
    const s = setup();
    let release!: (watcher: NativeTaskLocationWatcher) => void;
    s.location.delayedWatch = new Promise((resolve) => {
      release = resolve;
    });
    s.publisher.start(binding);
    await settle();
    expect(s.publisher.current().kind).toBe("checking");
    s.publisher.dispose();
    s.publisher.dispose();
    release({ remove: s.location.remove });
    await settle();
    expect(s.location.remove).toHaveBeenCalledOnce();
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("dispose removes the watcher, aborts in-flight upload and clears later work", async () => {
    vi.useFakeTimers();
    const s = setup();
    const pending = deferred<{ samples: never[] }>();
    let uploadSignal: AbortSignal | undefined;
    s.upload.mockImplementationOnce(async (_sessionId, _samples, signal) => {
      uploadSignal = signal;
      return pending.promise;
    });
    s.publisher.start(binding);
    await settle();
    s.location.emit(baseNow);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(uploadSignal?.aborted).toBe(false);
    s.publisher.dispose();
    s.publisher.dispose();
    expect(s.location.remove).toHaveBeenCalledOnce();
    expect(uploadSignal?.aborted).toBe(true);
    pending.resolve({ samples: [] });
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.upload).toHaveBeenCalledOnce();
  });

  it("prompts once per tracker unless retry is explicit", async () => {
    const s = setup();
    s.location.access = { canAskAgain: true, kind: "denied" };
    s.publisher.start(binding);
    await settle();
    expect(s.publisher.current().kind).toBe("permission-denied");
    s.publisher.retire({ kind: "idle" });
    s.publisher.start(binding);
    await settle();
    s.publisher.start(binding);
    await settle();
    expect(s.location.ensureRequests).toEqual([true, false, false]);
    s.publisher.start(binding, true);
    await settle();
    expect(s.location.ensureRequests).toEqual([true, false, false, true]);
    s.publisher.retire({ kind: "idle" });
    s.publisher.start({ ...binding, trackingSessionId: "88888888-8888-4888-8888-888888888888" });
    await settle();
    expect(s.location.ensureRequests.at(-1)).toBe(true);
  });

  it.each([
    [{ canAskAgain: true, kind: "denied" } as const, "permission-denied"],
    [{ canAskAgain: false, kind: "denied" } as const, "permission-blocked"],
    [{ kind: "services-disabled" } as const, "services-disabled"],
  ])("fails closed for %o without a watcher", async (access, expected) => {
    const s = setup();
    s.location.access = access;
    s.publisher.start(binding);
    await settle();
    expect(s.publisher.current().kind).toBe(expected);
    expect(s.location.watchCalls).toBe(0);
    expect(s.location.ensureRequests).toEqual([true]);
    s.location.access = { kind: "granted" };
    s.publisher.start(binding);
    await settle();
    expect(s.location.ensureRequests).toEqual([true, false]);
    expect(s.location.watchCalls).toBe(1);
  });

  it("admits at most one fix per 5 seconds and uploads every 10 seconds", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.publisher.start(binding);
    await settle();
    s.location.emit(baseNow);
    s.setNow(baseNow + 1_000);
    s.location.emit(baseNow + 1_000);
    s.setNow(baseNow + 5_000);
    s.location.emit(baseNow + 5_000, 101);
    s.location.emit(baseNow + 5_000, 7);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(s.upload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.upload).toHaveBeenCalledOnce();
    expect(s.uploads[0]?.samples).toMatchObject([
      { capturedAt: new Date(baseNow).toISOString() },
      { capturedAt: new Date(baseNow + 5_000).toISOString() },
    ]);
  });

  it("retries an unknown network outcome with the identical canonical sample", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.upload.mockRejectedValueOnce(
      new EmployeeApiError({
        code: "NETWORK_ERROR",
        isNetworkError: true,
        message: "offline",
        status: 0,
      }),
    );
    s.publisher.start(binding);
    await settle();
    s.location.emit(baseNow);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.unknown).toHaveBeenCalledOnce();
    const first = s.upload.mock.calls[0]?.[1];
    s.publisher.start(binding);
    await settle();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.upload.mock.calls[1]?.[1]).toEqual(first);
  });

  it("retires on permission revocation or local authority loss before a send", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.publisher.start(binding);
    await settle();
    s.location.emit(baseNow);
    s.location.access = { canAskAgain: false, kind: "denied" };
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.upload).not.toHaveBeenCalled();
    expect(s.publisher.current().kind).toBe("permission-blocked");

    s.location.access = { kind: "granted" };
    s.authorize(false);
    s.publisher.start(binding, true);
    await settle();
    s.location.emit(baseNow + 20_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.upload).not.toHaveBeenCalled();
    expect(s.publisher.current().kind).toBe("idle");
  });
});
