import type { NativeAuthSession } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

import { NativeQrController } from "../src/scanner/native-qr-controller";

const hooks = vi.hoisted(() => ({
  focus: [] as (() => () => void)[],
  states: [] as unknown[],
}));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void) => callback(),
  useRef: (value: unknown) => ({ current: value }),
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
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => hooks.focus.push(callback),
}));

const { NativeParkingQrInput } =
  await import("../src/parking/native-parking-qr-input");
const { elements, style } =
  await import("./native-check-in-condition-test-support");

function fixture(
  kind: "key-slot" | "parking-spot" = "key-slot",
  locale: "en" | "ar" = "en",
  disabled = false,
  autoOpen = false,
  permission = { granted: true, canAskAgain: true },
) {
  const controller = new NativeQrController(kind, {
    get: async () => permission,
    request: async () => permission,
  });
  const onChange = vi.fn();
  const auth = {
    current: () => ({ authGeneration: 1, phase: "authenticated" }),
    subscribe: () => vi.fn(),
  } as unknown as NativeAuthSession;
  const render = (value = "") => {
    hooks.focus = [];
    hooks.states = [controller];
    return elements(
      NativeParkingQrInput({
        auth,
        autoOpen,
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
    const camera = render("K-9").find((node) => node.type === "CameraView")!;
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

  it("preserves the Parking scanner default secondary 44px control", () => {
    const { render } = fixture("parking-spot");
    const action = render().find(
      (node) =>
        node.type === "Pressable" &&
        node.props.accessibilityLabel === "Scan QR code",
    )!;
    const resolved = (
      action.props.style as (state: { pressed: boolean }) => unknown
    )({ pressed: false });
    expect(
      Object.assign({}, ...[resolved].flat(Infinity).filter(Boolean)),
    ).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
      height: 44,
    });
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
          node.props.accessibilityLabel === "Scan QR code",
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

  it("keeps explicit-open behavior when autoOpen is false", () => {
    const { controller, render } = fixture("parking-spot");
    render();
    const cleanup = hooks.focus[0]!();
    expect(controller.current().phase).toBe("idle");
    cleanup();
  });

  it("auto-opens once per focus entry without reopening after close", async () => {
    const { controller, render } = fixture("parking-spot", "en", false, true);
    const open = vi.spyOn(controller, "open");
    render();
    const cleanup = hooks.focus[0]!();
    await Promise.resolve();
    expect(open).toHaveBeenCalledOnce();
    expect(controller.current().phase).toBe("starting");
    controller.close();
    render();
    expect(open).toHaveBeenCalledOnce();
    cleanup();
    const reenteredCleanup = hooks.focus[0]!();
    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(2);
    reenteredCleanup();
  });

  it.each(["denied", "error", "accepted"] as const)(
    "does not loop auto-open after %s",
    async (outcome) => {
      const { controller, render } = fixture(
        "key-slot",
        "en",
        false,
        true,
        outcome === "denied"
          ? { granted: false, canAskAgain: false }
          : { granted: true, canAskAgain: true },
      );
      const open = vi.spyOn(controller, "open");
      render();
      const cleanup = hooks.focus[0]!();
      await Promise.resolve();
      if (outcome === "error") controller.fail(controller.current().generation);
      if (outcome === "accepted") {
        const generation = controller.current().generation;
        controller.barcode(generation, {
          data: "vaylet:key-slot:K-03",
          type: "qr",
        });
      }
      render();
      expect(open).toHaveBeenCalledOnce();
      cleanup();
    },
  );
});
