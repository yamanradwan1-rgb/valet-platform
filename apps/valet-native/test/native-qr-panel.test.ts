import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { NativeAuthSession } from "@valet/employee-client";
import { NativeQrController } from "../src/scanner/native-qr-controller";

// Exercise the actual presentation function with injected hook/platform ports;
// this is not a React Native reconciler or physical camera test.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  focus: [] as (() => () => void)[],
}));
vi.mock("react", () => ({
  useState: () => [hooks.states.shift(), vi.fn()],
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: vi.fn() }),
  },
  Linking: { openSettings: vi.fn().mockResolvedValue(undefined) },
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
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
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
const { NativeQrPanel } = await import("../src/scanner/native-qr-panel");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
function fixture(
  locale: "en" | "ar" = "en",
  permission = { granted: true, canAskAgain: true },
) {
  hooks.states = [true, "key-slot"];
  hooks.focus = [];
  const auth = {
    current: () => ({ phase: "authenticated", authGeneration: 1 }),
    subscribe: () => vi.fn(),
  } as unknown as NativeAuthSession;
  const panel = NativeQrPanel({ locale, auth });
  const workflow = elements(panel).find(
    (node) => typeof node.type === "function" && "kind" in node.props,
  )!;
  const controller = new NativeQrController("key-slot", {
    get: async () => permission,
    request: async () => permission,
  });
  const render = () => {
    hooks.states = [controller];
    return elements(
      (workflow.type as (props: unknown) => Element)(workflow.props),
    );
  };
  return { controller, render };
}

describe("Native Scan production presentation with injected camera", () => {
  it("exposes only Key Slot and Parking Spot tabs with manual input", () => {
    const { render } = fixture();
    const nodes = render();
    const tabs = nodes.filter((node) => node.props.selected !== undefined);
    expect(tabs.map((node) => node.props.label)).toEqual([
      "Key Slot",
      "Parking Spot",
    ]);
    expect(
      nodes.some((node) => node.props.label === "Dynamic handoff QR"),
    ).toBe(false);
    expect(nodes.some((node) => node.type === "TextInput")).toBe(true);
  });
  it("does not mount CameraView initially", () => {
    const { render } = fixture();
    expect(render().some((node) => node.type === "CameraView")).toBe(false);
  });
  it("mounts rear QR-only capture after permission and removes it on accepted callback", async () => {
    const { controller, render } = fixture();
    await controller.open();
    const camera = render().find((node) => node.type === "CameraView")!;
    expect(camera.props.facing).toBe("back");
    expect(camera.props.barcodeScannerSettings).toEqual({
      barcodeTypes: ["qr"],
    });
    (camera.props.onCameraReady as () => void)();
    const decode = camera.props.onBarcodeScanned as (event: {
      type: string;
      data: string;
    }) => void;
    decode({ type: "qr", data: "vaylet:key-slot:K-01" });
    decode({ type: "qr", data: "vaylet:key-slot:other" });
    expect(render().some((node) => node.type === "CameraView")).toBe(false);
    expect(controller.current().resourceCode).toBe("K-01");
  });
  it("invalid decode keeps CameraView and manual field; Close removes capture", async () => {
    const { controller, render } = fixture();
    controller.manual("manual");
    await controller.open();
    const camera = render().find((node) => node.type === "CameraView")!;
    (camera.props.onBarcodeScanned as (event: unknown) => void)({
      type: "qr",
      data: "invalid",
    });
    expect(
      render().find((node) => node.type === "TextInput")?.props.value,
    ).toBe("manual");
    expect(render().some((node) => node.type === "CameraView")).toBe(true);
    const close = render().find((node) => node.props.label === "Close camera")!;
    (close.props.onPress as () => void)();
    expect(render().some((node) => node.type === "CameraView")).toBe(false);
  });
  it.each(["denied", "error"] as const)(
    "keeps manual resource input available when camera is %s",
    async (phase) => {
      const context =
        phase === "denied"
          ? fixture("en", { granted: false, canAskAgain: false })
          : fixture();
      const { controller, render } = context;
      await controller.open();
      if (phase === "error") controller.fail(controller.current().generation);
      expect(render().some((node) => node.type === "TextInput")).toBe(true);
    },
  );
  it("native back exit clears synchronously before the workflow rerender", async () => {
    const { controller, render } = fixture();
    await controller.open();
    const modal = render().find((node) => node.type === "Modal")!;
    (modal.props.onRequestClose as () => void)();
    expect(controller.current().phase).toBe("idle");
  });
  it("registered focus/unmount cleanup removes capture and clears input", async () => {
    const { controller, render } = fixture();
    render();
    const cleanup = hooks.focus.at(-1)!();
    controller.manual("manual");
    await controller.open();
    cleanup();
    expect(render().some((node) => node.type === "CameraView")).toBe(false);
    expect(controller.current().resourceCode).toBe("");
  });
  it.each(["en", "ar"] as const)(
    "renders %s direction and isolated accessible manual input",
    (locale) => {
      const { render } = fixture(locale);
      const nodes = render();
      const input = nodes.find((node) => node.type === "TextInput")!;
      expect(input.props.accessibilityLabel).toBe(
        locale === "ar" ? "رمز الموقع" : "Resource code",
      );
      expect(input.props.style).toContainEqual({
        writingDirection: "ltr",
        textAlign: "left",
      });
      const scroll = nodes.find((node) => node.type === "ScrollView")!;
      expect(scroll.props.contentContainerStyle).toMatchObject({
        direction: locale === "ar" ? "rtl" : "ltr",
      });
    },
  );
});
