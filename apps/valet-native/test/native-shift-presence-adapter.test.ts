import { afterEach, expect, it, vi } from "vitest";
import type { PresenceChallenge } from "@valet/employee-client";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import { NativeShiftPresenceAdapter } from "../src/shift/native-shift-presence-adapter";

const now = Date.parse("2026-10-04T10:00:00Z");
const challenge = { presence: { maxAccuracyMeters: 50 } } as PresenceChallenge;
function setup(granted = true, services = true) {
  let callback: (value: unknown) => void = () => undefined;
  const remove = vi.fn();
  const location = {
    getForegroundPermissionsAsync: vi.fn(async () => ({
      granted,
      canAskAgain: true,
    })),
    requestForegroundPermissionsAsync: vi.fn(async () => ({ granted: false })),
    hasServicesEnabledAsync: vi.fn(async () => services),
    watchPositionAsync: vi.fn(async (_options, listener) => {
      callback = listener;
      return { remove };
    }),
  };
  const settings = vi.fn(async () => undefined);
  const adapter = new NativeShiftPresenceAdapter(
    location as never,
    settings,
    () => now,
  );
  return {
    location,
    adapter,
    settings,
    remove,
    emit: (mocked?: boolean, accuracy = 10, timestamp = now) =>
      callback({
        coords: { latitude: 1, longitude: 2, accuracy },
        timestamp,
        ...(mocked === undefined ? {} : { mocked }),
      }),
  };
}
async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}
afterEach(() => vi.useRealTimers());

it.each([true, false, undefined])(
  "preserves mocked %s and removes its foreground watch",
  async (mocked) => {
    const s = setup();
    const result = s.adapter.acquire(challenge, new AbortController().signal);
    await settle();
    s.emit(mocked);
    const value = await result;
    expect(value).toEqual({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: new Date(now).toISOString(),
      ...(mocked === undefined ? {} : { mocked }),
    });
    expect(s.remove).toHaveBeenCalledOnce();
    expect(s.location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(s.location.watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accuracy: 4,
        mayShowUserSettingsDialog: false,
        timeInterval: 1000,
        distanceInterval: 0,
      }),
      expect.any(Function),
      expect.any(Function),
    );
  },
);

it("requests permission only in acquire and offers explicit settings", async () => {
  const s = setup(false);
  expect(s.location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  await expect(
    s.adapter.acquire(challenge, new AbortController().signal),
  ).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
  expect(s.location.requestForegroundPermissionsAsync).toHaveBeenCalledOnce();
  expect(s.location.hasServicesEnabledAsync).not.toHaveBeenCalled();
  await s.adapter.openSettings();
  expect(s.settings).toHaveBeenCalledOnce();
});

it("does not acquire with disabled services", async () => {
  const s = setup(true, false);
  await expect(
    s.adapter.acquire(challenge, new AbortController().signal),
  ).rejects.toMatchObject({ code: "LOCATION_SERVICES_DISABLED" });
  expect(s.location.watchPositionAsync).not.toHaveBeenCalled();
});

it("caps samples and leaves inaccurate measurements to server policy", async () => {
  const s = setup();
  const result = s.adapter.acquire(challenge, new AbortController().signal);
  await settle();
  s.emit(undefined, 100);
  s.emit(undefined, 90);
  s.emit(undefined, 80);
  expect((await result).accuracyMeters).toBe(80);
  expect(s.remove).toHaveBeenCalledOnce();
});

it("ignores old callbacks and bounds timeout", async () => {
  vi.useFakeTimers();
  const s = setup();
  const result = s.adapter.acquire(challenge, new AbortController().signal);
  const assertion = expect(result).rejects.toMatchObject({
    code: "GPS_UNAVAILABLE",
  });
  await settle();
  s.emit(undefined, 10, now - 1);
  await vi.advanceTimersByTimeAsync(15_000);
  await assertion;
  expect(s.remove).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("removes a late non-cancellable watch registration after cancellation", async () => {
  const s = setup();
  let release!: (value: { remove: typeof s.remove }) => void;
  s.location.watchPositionAsync.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const controller = new AbortController();
  const result = s.adapter.acquire(challenge, controller.signal);
  const assertion = expect(result).rejects.toMatchObject({
    code: "LOCATION_CANCELLED",
  });
  await settle();
  controller.abort();
  await assertion;
  release({ remove: s.remove });
  await settle();
  expect(s.remove).toHaveBeenCalledOnce();
});

it("already-aborted actions make no location calls and leave no timer", async () => {
  vi.useFakeTimers();
  const s = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(
    s.adapter.acquire(challenge, controller.signal),
  ).rejects.toMatchObject({ code: "LOCATION_CANCELLED" });
  expect(s.location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("a late permission grant after background cannot start a watch", async () => {
  const s = setup(false);
  let release!: (value: { granted: boolean; canAskAgain: boolean }) => void;
  s.location.getForegroundPermissionsAsync.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const controller = new AbortController();
  const result = s.adapter.acquire(challenge, controller.signal);
  const assertion = expect(result).rejects.toMatchObject({
    code: "LOCATION_CANCELLED",
  });
  controller.abort();
  await assertion;
  release({ granted: true, canAskAgain: true });
  await settle();
  expect(s.location.watchPositionAsync).not.toHaveBeenCalled();
  expect(s.location.hasServicesEnabledAsync).not.toHaveBeenCalled();
});
