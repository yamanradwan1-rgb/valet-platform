import type { NativeAuthSession } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

import { NativeQrController } from "../src/scanner/native-qr-controller";

const hooks = vi.hoisted(() => ({ states: [] as unknown[] }));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void) => callback(),
  useState: () => [hooks.states.shift(), vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  AppState: {
    addEventListener: () => ({ remove: vi.fn() }),
    currentState: "active",
  },
  Linking: { openSettings: vi.fn().mockResolvedValue(undefined) },
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
  CameraView: "CameraView",
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));

const { NativeParkingQrInput } =
  await import("../src/parking/native-parking-qr-input");
const { elements, style } =
  await import("./native-check-in-condition-test-support");

function fixture(
  kind: "key-slot" | "parking-spot" = "key-slot",
  locale: "en" | "ar" = "en",
  disabled = false,
) {
  const permission = { granted: true, canAskAgain: true };
  const controller = new NativeQrController(kind, {
    get: async () => permission,
    request: async () => permission,
  });
  const onChange = vi.fn();
  const render = (value = "") => {
    hooks.states = [controller];
    return elements(
      NativeParkingQrInput({
        auth: {} as NativeAuthSession,
        disabled,
        kind,
        label: locale === "ar" ? "رمز الموقع" : "Resource code",
        locale,
        onChange,
        value,
      }),
    );
  };
  return { controller, onChange, render };
}

describe("MOB-012B Native Parking QR/manual parity", () => {
  it("routes manual entry through the candidate callback", () => {
    const { controller, onChange, render } = fixture("parking-spot");
    const input = render().find((node) => node.type === "TextInput")!;
    (input.props.onChangeText as (value: string) => void)(" P-101 ");
    expect(onChange).toHaveBeenCalledWith(" P-101 ");
    expect(controller.current().resourceCode).toBe(" P-101 ");
  });

  it("uses the existing rear QR-only camera and returns the decoded candidate", async () => {
    const { controller, onChange, render } = fixture();
    await controller.open();
    const camera = render().find((node) => node.type === "CameraView")!;
    expect(camera.props).toMatchObject({
      barcodeScannerSettings: { barcodeTypes: ["qr"] },
      facing: "back",
    });
    (camera.props.onCameraReady as () => void)();
    (camera.props.onBarcodeScanned as (event: object) => void)({
      data: "vaylet:key-slot:K-03",
      type: "qr",
    });
    expect(onChange).toHaveBeenCalledWith("K-03");
  });

  it("keeps manual input available when camera capture is disabled", () => {
    const { controller, render } = fixture("key-slot", "en", true);
    const nodes = render("K-03");
    expect(
      nodes.find((node) => node.type === "TextInput")?.props,
    ).toMatchObject({
      editable: false,
      value: "K-03",
    });
    expect(controller.current().resourceCode).toBe("");
    expect(
      nodes.find(
        (node) =>
          node.type === "Pressable" &&
          node.props.accessibilityLabel === "Open camera",
      )?.props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it("keeps Arabic candidate input in an intentional LTR island", () => {
    const { render } = fixture("parking-spot", "ar");
    const input = render("P-101").find((node) => node.type === "TextInput")!;
    expect(input.props.accessibilityLabel).toBe("رمز الموقع");
    expect(input.props.accessibilityLiveRegion).toBe("polite");
    expect(input.props.accessibilityState).toEqual({ disabled: false });
    expect(style(input)).toMatchObject({
      textAlign: "left",
      writingDirection: "ltr",
    });
  });
});
