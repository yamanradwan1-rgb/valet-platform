import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { getNativeCheckInCopy } from "../src/check-in/native-check-in-copy";

// Existing Native test style: injected hooks, not a device or reconciler.
const hooks = vi.hoisted(() => ({
  controller: undefined as unknown,
  focus: [] as (() => () => void)[],
}));
vi.mock("react", () => ({
  useState: () => [hooks.controller, vi.fn()],
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: vi.fn() }),
  },
  Linking: { openSettings: vi.fn() },
  Text: "Text",
  Pressable: "Pressable",
  View: "View",
  TextInput: "TextInput",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("expo-camera", () => ({
  CameraView: "CameraView",
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => hooks.focus.push(callback),
}));
const { NativePlateCameraStep } =
  await import("../src/check-in/native-plate-camera-step");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
function fixture(granted = true, locale: "en" | "ar" = "en") {
  hooks.focus = [];
  const permission = { granted, canAskAgain: false };
  const controller = new NativePlateCameraController({
    get: async () => permission,
    request: async () => permission,
  });
  hooks.controller = controller;
  const onManual = vi.fn(() => expect(controller.current().phase).toBe("idle"));
  const onNoPlate = vi.fn(() =>
    expect(controller.current().phase).toBe("idle"),
  );
  const render = () =>
    elements(
      NativePlateCameraStep({
        auth: {
          current: () => ({ phase: "authenticated", authGeneration: 1 }),
          subscribe: () => vi.fn(),
        } as unknown as NativeAuthSession,
        session: {
          current: () => ({
            phase: "capture",
            identityGeneration: 1,
            locationId: "location",
          }),
          subscribe: () => vi.fn(),
        } as unknown as EmployeeCheckInSession,
        copy: getNativeCheckInCopy(locale),
        textAlign: locale === "ar" ? "right" : "left",
        onManual,
        onNoPlate,
      }),
    );
  render();
  const cleanup = hooks.focus[0]!();
  const press = (label: string) =>
    (
      render().find((node) => node.props.label === label)!.props
        .onPress as () => void
    )();
  return { controller, onManual, onNoPlate, render, press, cleanup };
}

describe("Native assistive plate camera presentation", () => {
  it("prioritizes Open camera, with immediate manual and no-plate actions", () => {
    const { render } = fixture();
    expect(
      render()
        .filter((node) => node.props.label)
        .map((node) => node.props.label),
    ).toEqual(["Open camera", "Enter plate manually", "No / unreadable plate"]);
    expect(render().some((node) => node.type === "CameraView")).toBe(false);
  });
  it("mounts only a muted rear preview with no scan/capture/data callback", async () => {
    const context = fixture();
    await context.controller.open();
    const camera = context.render().find((node) => node.type === "CameraView")!;
    expect(camera.props).toMatchObject({ facing: "back", mute: true });
    expect(camera.props.onBarcodeScanned).toBeUndefined();
    expect(camera.props.ref).toBeUndefined();
    (camera.props.onCameraReady as () => void)();
    context.press("Enter the plate I can see");
    expect(context.onManual).toHaveBeenCalledOnce();
    expect(context.render().some((node) => node.type === "CameraView")).toBe(
      false,
    );
  });
  it.each(["Enter plate manually", "No / unreadable plate", "Close camera"])(
    "%s removes preview before transition",
    async (label) => {
      const context = fixture();
      await context.controller.open();
      context.press(label);
      expect(context.controller.current().phase).toBe("idle");
      expect(context.render().some((node) => node.type === "CameraView")).toBe(
        false,
      );
    },
  );
  it.each(["denied", "mount-error"])(
    "keeps fallback on %s and reports camera state",
    async (failure) => {
      const context = fixture(failure !== "denied");
      await context.controller.open();
      if (failure === "mount-error") {
        const camera = context
          .render()
          .find((node) => node.type === "CameraView")!;
        (camera.props.onMountError as () => void)();
      }
      expect(context.render().some((node) => node.type === "CameraView")).toBe(
        false,
      );
      expect(
        context
          .render()
          .some((node) => node.props.label === "Enter plate manually"),
      ).toBe(true);
      expect(
        context
          .render()
          .some((node) => node.props.label === "No / unreadable plate"),
      ).toBe(true);
      expect(context.controller.current().phase).toBe(
        failure === "denied" ? "denied" : "error",
      );
      if (failure === "denied")
        expect(
          context
            .render()
            .some((node) => node.props.label === "Open camera settings"),
        ).toBe(true);
    },
  );
  it("uses localized Arabic entry and cleanup removes preview on focus/unmount exit", async () => {
    const context = fixture(true, "ar");
    expect(
      context.render().some((node) => node.props.label === "فتح الكاميرا"),
    ).toBe(true);
    await context.controller.open();
    context.cleanup();
    expect(context.render().some((node) => node.type === "CameraView")).toBe(
      false,
    );
  });
});
