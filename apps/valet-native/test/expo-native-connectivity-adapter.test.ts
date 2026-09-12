import { describe, expect, it, vi } from "vitest";

vi.mock("expo-network", () => ({
  NetworkStateType: {
    CELLULAR: "CELLULAR",
    NONE: "NONE",
    UNKNOWN: "UNKNOWN",
    WIFI: "WIFI",
  },
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(),
}));

const { NetworkStateType } = await import("expo-network");
const { ExpoNativeConnectivityAdapter, nativeConnectivityStatus } =
  await import("../src/shell/expo-native-connectivity-adapter");

describe("Expo Native connectivity normalization", () => {
  it.each([
    [{ type: NetworkStateType.WIFI, isConnected: true }, "online"],
    [{ type: NetworkStateType.CELLULAR, isConnected: true }, "online"],
    [{ type: NetworkStateType.NONE, isConnected: false }, "offline"],
    [{ type: NetworkStateType.UNKNOWN }, "unknown"],
    [{}, "unknown"],
  ] as const)("normalizes %o as %s", (state, expected) => {
    expect(nativeConnectivityStatus(state)).toBe(expected);
  });

  it("does not turn a connected hint into API-health authority", () => {
    expect(
      nativeConnectivityStatus({
        isConnected: true,
        isInternetReachable: false,
        type: NetworkStateType.WIFI,
      }),
    ).toBe("online");
  });

  it("uses the subscribed Expo source and exposes disposal", async () => {
    const network = await import("expo-network");
    const remove = vi.fn();
    let listener!: (state: { isConnected: boolean; type: string }) => void;
    vi.mocked(network.getNetworkStateAsync).mockResolvedValue({
      isConnected: false,
      type: NetworkStateType.NONE,
    });
    vi.mocked(network.addNetworkStateListener).mockImplementation((next) => {
      listener = next as typeof listener;
      return { remove } as never;
    });
    const adapter = new ExpoNativeConnectivityAdapter();
    await expect(adapter.read()).resolves.toBe("offline");
    const observed = vi.fn();
    const dispose = adapter.subscribe(observed);
    listener({ isConnected: true, type: NetworkStateType.CELLULAR });
    expect(observed).toHaveBeenCalledWith("online");
    dispose();
    expect(remove).toHaveBeenCalledOnce();
  });
});
