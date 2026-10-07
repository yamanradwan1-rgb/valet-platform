import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import { NativeTaskLocationAdapter } from "../src/tracking/native-task-location-adapter";

describe("#270 task location permission adapter", () => {
  it("does not invoke the OS request again after permanent denial", async () => {
    const requestForegroundPermissionsAsync = vi.fn(async () => ({
      canAskAgain: false,
      granted: false,
    }));
    const adapter = new NativeTaskLocationAdapter({
      getForegroundPermissionsAsync: vi.fn(async () => ({
        canAskAgain: false,
        granted: false,
      })),
      hasServicesEnabledAsync: vi.fn(async () => true),
      requestForegroundPermissionsAsync,
      watchPositionAsync: vi.fn(),
    } as never);

    await expect(adapter.ensureAccess(true)).resolves.toEqual({
      canAskAgain: false,
      kind: "denied",
    });
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
