import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  readPowerAllowlistAsync: vi.fn(),
  openBatterySettingsAsync: vi.fn(),
  missing: false,
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("../modules/vaylet-battery-status", () => ({
  loadVayletBatteryStatusModule: () => mocks.missing ? null : {
    readPowerAllowlistAsync: mocks.readPowerAllowlistAsync,
    openBatterySettingsAsync: mocks.openBatterySettingsAsync,
  },
}));

const { AndroidBatteryOptimizationAdapter } = await import(
  "../src/notifications/native-battery-platform"
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.OS = "android";
  mocks.missing = false;
});

describe("#274 Android framework power allowlist adapter", () => {
  it.each([
    ["exempt", "configured"],
    ["not-exempt", "restricted"],
    ["unknown", "unknown"],
    ["unexpected-oem-output", "unknown"],
  ] as const)("maps actual OS signal %s only to %s", async (raw, expected) => {
    mocks.readPowerAllowlistAsync.mockResolvedValue(raw);
    await expect(new AndroidBatteryOptimizationAdapter().readStatus()).resolves.toBe(expected);
  });

  it("fails closed on module absence, OS unsupported, or bridge error", async () => {
    const adapter = new AndroidBatteryOptimizationAdapter();
    mocks.readPowerAllowlistAsync.mockRejectedValueOnce(new Error("native failure"));
    await expect(adapter.readStatus()).resolves.toBe("unknown");
    mocks.missing = true;
    await expect(adapter.readStatus()).resolves.toBe("unsupported");
    mocks.platform.OS = "ios";
    await expect(adapter.readStatus()).resolves.toBe("unsupported");
    mocks.platform.OS = "web";
    await expect(adapter.readStatus()).resolves.toBe("unsupported");
  });

  it("does not launch settings while reading, and isolates rejected settings intents", async () => {
    mocks.readPowerAllowlistAsync.mockResolvedValue("not-exempt");
    mocks.openBatterySettingsAsync.mockRejectedValue(new Error("disabled"));
    const adapter = new AndroidBatteryOptimizationAdapter();
    expect(await adapter.readStatus()).toBe("restricted");
    expect(mocks.openBatterySettingsAsync).not.toHaveBeenCalled();
    await expect(adapter.openSettings()).resolves.toBeUndefined();
    expect(mocks.openBatterySettingsAsync).toHaveBeenCalledOnce();
  });
});
