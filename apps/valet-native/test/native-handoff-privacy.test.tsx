import type { EmployeeHandoffSnapshot } from "@valet/employee-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  appListener: undefined as ((value: string) => void) | undefined,
  setters: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => unknown) => callback(),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    const value =
      state.setters.length === 0
        ? "0123"
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
    state.setters.push(setter);
    return [value, setter];
  },
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  AppState: {
    addEventListener: vi.fn((_event, listener) => {
      state.appListener = listener;
      return { remove: vi.fn() };
    }),
    currentState: "active",
  },
  Linking: { openSettings: vi.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
  CameraView: "CameraView",
}));

const { NativeHandoffPanel } =
  await import("../src/handoff/native-handoff-panel");
const { elements } = await import("./native-check-in-condition-test-support");

beforeEach(() => {
  state.setters = [];
  state.appListener = undefined;
});

describe("MOB-014A raw proof privacy", () => {
  it("clears pickup proof before submit and both proof inputs on background", () => {
    const verifyPickupCode = vi.fn();
    const snapshot = {
      failure: null,
      phase: "pending",
      scope: { membershipId: "member", role: "VALET_EMPLOYEE" },
      task: { currentAssigneeMembershipId: "member" },
    } as unknown as EmployeeHandoffSnapshot;
    const nodes = elements(
      NativeHandoffPanel({
        auth: {} as never,
        handoff: {
          abort: vi.fn(),
          checkServerState: vi.fn(),
          initiate: vi.fn(),
          override: vi.fn(),
          verifyDynamicQr: vi.fn(),
          verifyPickupCode,
        } as never,
        locale: "en",
        onBack: vi.fn(),
        snapshot,
      }),
    );
    const submit = nodes.find(
      (node) =>
        node.type === "Pressable" &&
        node.props.accessibilityLabel === "Verify pickup code",
    )!;
    (submit.props.onPress as () => void)();
    expect(state.setters[0]).toHaveBeenCalledWith("");
    expect(verifyPickupCode).toHaveBeenCalledWith("0123");
    state.setters[0]?.mockClear();
    state.setters[1]?.mockClear();
    state.appListener?.("inactive");
    expect(state.setters[0]).toHaveBeenCalledWith("");
    expect(state.setters[1]).toHaveBeenCalledWith("");
  });
});
