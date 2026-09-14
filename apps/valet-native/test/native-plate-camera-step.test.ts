import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { getNativeCheckInCopy } from "../src/check-in/native-check-in-copy";

const hooks = vi.hoisted(() => ({
  controller: undefined as unknown as NativePlateCameraController,
  focus: [] as (() => () => void)[],
}));
vi.mock("react", () => ({
  useState: () => [
    {
      controller: hooks.controller,
      cameraRef: vi.fn(),
      cameraReady: (generation: number) => hooks.controller.ready(generation),
    },
  ],
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("../src/check-in/native-plate-ocr-adapter", () => ({}));
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
function style(node: Element): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}
function fixture(
  granted = true,
  locale: "en" | "ar" = "en",
  deferPermission = false,
  textAlign: "left" | "right" = locale === "ar" ? "right" : "left",
) {
  hooks.focus = [];
  const permission = { granted, canAskAgain: false };
  let resolvePermission: (value: typeof permission) => void = () => undefined;
  const pendingPermission = new Promise<typeof permission>((resolve) => {
    resolvePermission = resolve;
  });
  const controller = new NativePlateCameraController({
    get: vi.fn(async () => (deferPermission ? pendingPermission : permission)),
    request: vi.fn(async () => permission),
  });
  const open = vi.spyOn(controller, "open");
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
        locale,
        textAlign,
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
  return {
    controller,
    open,
    onManual,
    onNoPlate,
    render,
    press,
    cleanup,
    resolvePermission,
  };
}

describe("Native assistive plate camera presentation", () => {
  it("auto-opens once on focus while retaining manual and no-plate actions", async () => {
    const { open, render } = fixture();
    await Promise.resolve();
    expect(open).toHaveBeenCalledOnce();
    expect(hooks.controller.current().phase).toBe("starting");
    expect(
      render()
        .filter((node) => node.props.label)
        .map((node) => node.props.label),
    ).toContain("Enter manually");
    expect(
      render().some(
        (node) => node.props.label === "No plate / unreadable plate",
      ),
    ).toBe(true);
  });
  it("does not auto-reopen after close, but re-entry opens again", async () => {
    const context = fixture();
    await Promise.resolve();
    context.controller.close();
    context.render();
    expect(context.open).toHaveBeenCalledOnce();
    context.cleanup();
    const reenteredCleanup = hooks.focus.at(-1)!();
    await Promise.resolve();
    expect(context.open).toHaveBeenCalledTimes(2);
    reenteredCleanup();
  });
  it("mounts a muted rear camera and exposes explicit capture with no QR callback", async () => {
    const context = fixture();
    await context.controller.open();
    const starting = context.render();
    const camera = starting.find((node) => node.type === "CameraView")!;
    const viewport = starting.find(
      (node) => node.type === "View" && style(node).height === 260,
    )!;
    expect(style(viewport)).toMatchObject({
      backgroundColor: "#0B1626",
      borderRadius: 16,
      height: 260,
      overflow: "hidden",
    });
    expect(
      starting.some((node) => node.props.message === "Starting camera…"),
    ).toBe(true);
    expect(camera.props).toMatchObject({ facing: "back", mute: true });
    expect(camera.props.onBarcodeScanned).toBeUndefined();
    expect(camera.props.ref).toEqual(expect.any(Function));
    (camera.props.onCameraReady as () => void)();
    expect(
      context
        .render()
        .some((node) => node.props.label === "Capture plate image"),
    ).toBe(true);
    context.press("Enter manually");
    expect(context.onManual).toHaveBeenCalledOnce();
    expect(context.render().some((node) => node.type === "CameraView")).toBe(
      false,
    );
  });
  it("keeps requesting permission inside the same camera viewport shell", async () => {
    const context = fixture(true, "en", true);
    const opening = context.controller.open();
    expect(context.controller.current().phase).toBe("requesting");
    const requesting = context.render();
    expect(
      requesting.some(
        (node) => node.type === "View" && style(node).height === 260,
      ),
    ).toBe(true);
    expect(
      requesting.some(
        (node) => node.props.message === "Requesting camera permission…",
      ),
    ).toBe(true);
    context.resolvePermission({ granted: true, canAskAgain: false });
    await opening;
  });
  it.each(["Enter manually", "No plate / unreadable plate", "Close camera"])(
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
        context.render().some((node) => node.props.label === "Enter manually"),
      ).toBe(true);
      expect(
        context
          .render()
          .some((node) => node.props.label === "No plate / unreadable plate"),
      ).toBe(true);
      expect(context.controller.current().phase).toBe(
        failure === "denied" ? "denied" : "error",
      );
      const failed = context.render();
      expect(
        failed.some(
          (node) => node.type === "View" && style(node).height === 260,
        ),
      ).toBe(true);
      expect(
        failed.some((node) => typeof node.props.message === "string"),
      ).toBe(true);
      expect(
        context
          .render()
          .some((node) => node.props.label === "Try camera again"),
      ).toBe(true);
      if (failure === "denied")
        expect(
          context
            .render()
            .some((node) => node.props.label === "Open camera settings"),
        ).toBe(true);
    },
  );
  it("uses localized Arabic entry and cleanup removes preview on focus/unmount exit", async () => {
    const context = fixture(true, "ar", false, "left");
    context.controller.close();
    expect(
      context.render().some((node) => node.props.label === "فتح كاميرا اللوحة"),
    ).toBe(true);
    await context.controller.open();
    context.cleanup();
    expect(context.render().some((node) => node.type === "CameraView")).toBe(
      false,
    );
  });
});
