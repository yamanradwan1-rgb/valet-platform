import { beforeEach, describe, expect, it, vi } from "vitest";

const expo = vi.hoisted(() => ({
  clear: vi.fn(),
  get: vi.fn(),
  listener: undefined as ((response: unknown) => void) | undefined,
  remove: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  addNotificationResponseReceivedListener: (
    listener: (value: unknown) => void,
  ) => {
    expo.listener = listener;
    return { remove: expo.remove };
  },
  clearLastNotificationResponse: expo.clear,
  getLastNotificationResponse: expo.get,
}));

const { ExpoNativePushResponsePlatform } =
  await import("../src/notifications/expo-native-push-response-platform");

beforeEach(() => {
  expo.clear.mockReset();
  expo.get.mockReset();
  expo.listener = undefined;
  expo.remove.mockReset();
});

describe("Expo SDK 57 push response platform boundary", () => {
  it("uses the supported last-response snapshot and clear APIs", async () => {
    const initial = { actionIdentifier: "default" };
    expo.get.mockReturnValue(initial);
    const platform = new ExpoNativePushResponsePlatform();
    await expect(platform.getLastResponse()).resolves.toBe(initial);
    await expect(platform.clearLastResponse()).resolves.toBeUndefined();
    expect(expo.get).toHaveBeenCalledOnce();
    expect(expo.clear).toHaveBeenCalledOnce();
  });

  it("registers and removes the interactive response listener", () => {
    const platform = new ExpoNativePushResponsePlatform();
    const listener = vi.fn();
    const remove = platform.subscribeResponse(listener);
    const candidate = { actionIdentifier: "default" };
    expo.listener?.(candidate);
    expect(listener).toHaveBeenCalledExactlyOnceWith(candidate);
    remove();
    expect(expo.remove).toHaveBeenCalledOnce();
  });
});
