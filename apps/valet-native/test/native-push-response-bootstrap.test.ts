import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  clear: vi.fn(),
  get: vi.fn(() => null),
  remove: vi.fn(),
  subscribe: vi.fn(() => ({ remove: native.remove })),
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

vi.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  addNotificationResponseReceivedListener: native.subscribe,
  clearLastNotificationResponse: native.clear,
  getLastNotificationResponse: native.get,
}));

const singletonKey = "__vayletNativePushResponseCapture_v1";
const captureGlobal = globalThis as Record<string, unknown>;

beforeEach(() => {
  delete captureGlobal[singletonKey];
  native.clear.mockClear();
  native.get.mockClear();
  native.remove.mockClear();
  native.subscribe.mockClear();
  vi.resetModules();
});

afterEach(() => {
  delete captureGlobal[singletonKey];
});

describe("native push response startup bootstrap", () => {
  it("keeps one capture owner across starts and module re-evaluation", async () => {
    const first =
      await import("../src/notifications/native-push-response-bootstrap");
    first.startNativePushResponseCapture();
    first.startNativePushResponseCapture();

    vi.resetModules();
    const reloaded =
      await import("../src/notifications/native-push-response-bootstrap");
    reloaded.startNativePushResponseCapture();

    await vi.waitFor(() => expect(native.get).toHaveBeenCalledOnce());
    expect(reloaded.nativePushResponseCapture).toBe(
      first.nativePushResponseCapture,
    );
    expect(native.subscribe).toHaveBeenCalledOnce();

    first.nativePushResponseCapture.dispose();
    expect(native.remove).toHaveBeenCalledOnce();
  });
});
