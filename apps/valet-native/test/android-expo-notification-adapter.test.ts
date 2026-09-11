import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addNotificationReceivedListener: vi.fn(),
  addPushTokenListener: vi.fn(),
  getDevicePushTokenAsync: vi.fn(),
  getNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
  unregisterForNotificationsAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-application", () => ({
  nativeApplicationVersion: "2.4.6",
  nativeBuildVersion: "246",
}));
vi.mock("expo-notifications", () => ({
  ...mocks,
  AndroidImportance: { DEFAULT: 5, NONE: 0 },
  PermissionStatus: {
    DENIED: "denied",
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
  },
}));

import {
  AndroidExpoNotificationAdapter,
  nativeRetrievalChannelId,
} from "../src/notifications/android-expo-notification-adapter";

function permission(status: string, canAskAgain: boolean, granted = false) {
  return { canAskAgain, expires: "never", granted, status };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setNotificationChannelAsync.mockResolvedValue({});
  mocks.getNotificationChannelAsync.mockResolvedValue({ importance: 5 });
  mocks.unregisterForNotificationsAsync.mockResolvedValue(undefined);
  mocks.addNotificationReceivedListener.mockReturnValue({ remove: vi.fn() });
  mocks.addPushTokenListener.mockReturnValue({ remove: vi.fn() });
});

describe("Android Expo notification adapter", () => {
  it("builds the exact Android provider request at the platform boundary", () => {
    expect(
      new AndroidExpoNotificationAdapter().buildRegistrationRequest({
        installationId: "11111111-1111-4111-8111-111111111111",
        locale: "ar",
        metadata: { appBuild: "246", appVersion: "2.4.6" },
        token: "synthetic-native-fcm-token",
      }),
    ).toEqual({
      appBuild: "246",
      appIdentifier: "com.vaylet.employee",
      appVersion: "2.4.6",
      installationId: "11111111-1111-4111-8111-111111111111",
      locale: "ar",
      platform: "ANDROID",
      provider: "FCM",
      providerToken: "synthetic-native-fcm-token",
    });
  });

  it("uses the direct native Android token path and real build metadata", async () => {
    mocks.getDevicePushTokenAsync.mockResolvedValue({
      data: "synthetic-native-fcm-token",
      type: "android",
    });
    const adapter = new AndroidExpoNotificationAdapter();
    expect(await adapter.getCurrentToken()).toBe("synthetic-native-fcm-token");
    expect(adapter.currentMetadata()).toEqual({
      appBuild: "246",
      appVersion: "2.4.6",
    });
    expect(mocks.getDevicePushTokenAsync).toHaveBeenCalledOnce();
  });

  it.each([
    { data: "", type: "android" },
    { data: "synthetic-ios-token", type: "ios" },
    { data: { endpoint: "x" }, type: "android" },
  ])("rejects $type provider output", async (candidate) => {
    mocks.getDevicePushTokenAsync.mockResolvedValue(candidate);
    await expect(
      new AndroidExpoNotificationAdapter().getCurrentToken(),
    ).rejects.toThrow("Native push token is unavailable.");
  });

  it.each([
    [permission("undetermined", true), "undetermined"],
    [permission("denied", true), "denied"],
    [permission("denied", false), "blocked"],
    [permission("granted", false, true), "granted"],
  ])("maps permission truthfully", async (source, expected) => {
    mocks.getPermissionsAsync.mockResolvedValue(source);
    await expect(
      new AndroidExpoNotificationAdapter().readPermission(),
    ).resolves.toBe(expected);
  });

  it("creates the Android channel before requesting permission", async () => {
    const order: string[] = [];
    mocks.setNotificationChannelAsync.mockImplementation(async () => {
      order.push("channel-created");
    });
    mocks.getNotificationChannelAsync.mockImplementation(async () => {
      order.push("channel-checked");
      return { importance: 5 };
    });
    mocks.requestPermissionsAsync.mockImplementation(async () => {
      order.push("permission-requested");
      return permission("granted", false, true);
    });

    await expect(
      new AndroidExpoNotificationAdapter().requestPermission(),
    ).resolves.toBe("granted");
    expect(order).toEqual([
      "channel-created",
      "channel-checked",
      "permission-requested",
    ]);
  });

  it("does not request permission when channel setup fails", async () => {
    mocks.setNotificationChannelAsync.mockRejectedValue(
      new Error("synthetic channel setup failure"),
    );
    await expect(
      new AndroidExpoNotificationAdapter().requestPermission(),
    ).rejects.toThrow("synthetic channel setup failure");
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("creates the one safe retrieval channel idempotently", async () => {
    const adapter = new AndroidExpoNotificationAdapter();
    await Promise.all([
      adapter.ensureRetrievalChannel(),
      adapter.ensureRetrievalChannel(),
    ]);
    await adapter.ensureRetrievalChannel();
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledOnce();
    expect(mocks.getNotificationChannelAsync).toHaveBeenCalledTimes(3);
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledWith(
      nativeRetrievalChannelId,
      {
        description: "Operational retrieval alerts",
        importance: 5,
        name: "Retrieval updates",
      },
    );
  });

  it("reports a user-disabled channel without recreating it", async () => {
    mocks.getNotificationChannelAsync.mockResolvedValue({ importance: 0 });
    const adapter = new AndroidExpoNotificationAdapter();
    await expect(adapter.ensureRetrievalChannel()).resolves.toBe(false);
    await expect(adapter.ensureRetrievalChannel()).resolves.toBe(false);
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledOnce();
  });

  it("suppresses duplicate OS foreground presentation", async () => {
    const adapter = new AndroidExpoNotificationAdapter();
    const stop = adapter.startForegroundPresentation();
    const handler = mocks.setNotificationHandler.mock.calls[0]![0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    });
    stop();
    expect(mocks.setNotificationHandler).toHaveBeenLastCalledWith(null);
  });

  it("uses best-effort native provider unregister on identity purge", async () => {
    await new AndroidExpoNotificationAdapter().deleteCurrentToken();
    expect(mocks.unregisterForNotificationsAsync).toHaveBeenCalledOnce();
  });

  it("installs one removable native token listener and filters invalid values", () => {
    const remove = vi.fn();
    mocks.addPushTokenListener.mockReturnValue({ remove });
    const listener = vi.fn();
    const stop = new AndroidExpoNotificationAdapter().subscribeToken(listener);
    const receive = mocks.addPushTokenListener.mock.calls[0]![0];

    receive({ data: "synthetic-rotated-native-token", type: "android" });
    receive({ data: "synthetic-apns-token", type: "ios" });
    stop();

    expect(mocks.addPushTokenListener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      "synthetic-rotated-native-token",
    );
    expect(remove).toHaveBeenCalledOnce();
  });

  it("degrades listener and handler setup failures to no-op cleanup", () => {
    mocks.setNotificationHandler.mockImplementation(() => {
      throw new Error("synthetic handler failure");
    });
    mocks.addNotificationReceivedListener.mockImplementation(() => {
      throw new Error("synthetic receipt listener failure");
    });
    mocks.addPushTokenListener.mockImplementation(() => {
      throw new Error("synthetic token listener failure");
    });
    const adapter = new AndroidExpoNotificationAdapter();
    expect(() => adapter.startForegroundPresentation()()).not.toThrow();
    expect(() => adapter.subscribeForegroundReceipt(vi.fn())()).not.toThrow();
    expect(() => adapter.subscribeToken(vi.fn())()).not.toThrow();
  });
});
