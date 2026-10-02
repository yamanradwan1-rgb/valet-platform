import { NativePlateRoiViewport } from "../src/check-in/native-plate-roi-viewport";
import { plateGuide } from "../src/check-in/native-plate-roi-geometry";
import type { ReactElement } from "react";
import { expect, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { getNativeCheckInCopy } from "../src/check-in/native-check-in-copy";

const cameraHooks = vi.hoisted(() => ({
  controller: undefined as unknown as NativePlateCameraController,
  focus: [] as (() => () => void)[],
}));
vi.mock("react", () => ({
  useState: () => [
    {
      controller: cameraHooks.controller,
      roi: {
        subscribe: () => () => {},
        current: () => ({
          ...cameraHooks.controller.current(),
          width: 360,
          height: 260,
          revision: 1,
          guide: plateGuide(360, 260),
        }),
      },
      cameraRef: vi.fn(),
      cameraLayout: vi.fn(),
      cameraError: (generation: number, mountId: number) => {
        if (cameraHooks.controller.current().mountId === mountId)
          cameraHooks.controller.fail(generation);
      },
      cameraReady: (generation: number) =>
        cameraHooks.controller.ready(generation),
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
  useFocusEffect: (callback: () => () => void) =>
    cameraHooks.focus.push(callback),
}));
const { NativePlateCameraStep } =
  await import("../src/check-in/native-plate-camera-step");

export type CameraElement = ReactElement<Record<string, unknown>>;

export function cameraElements(value: unknown): CameraElement[] {
  if (Array.isArray(value)) return value.flatMap(cameraElements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as CameraElement;
  if (node.type === NativePlateRoiViewport)
    return cameraElements(
      NativePlateRoiViewport(
        node.props as unknown as Parameters<typeof NativePlateRoiViewport>[0],
      ),
    );
  return [node, ...cameraElements(node.props.children)];
}

export function cameraStyle(node: CameraElement): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}

export function currentCameraController(): NativePlateCameraController {
  return cameraHooks.controller;
}

export function reenterPlateCamera(): () => void {
  return cameraHooks.focus.at(-1)!();
}

export function plateCameraFixture(
  granted = true,
  locale: "en" | "ar" = "en",
  deferPermission = false,
  textAlign: "left" | "right" = locale === "ar" ? "right" : "left",
  ocrUnavailable: boolean | "no-match" = false,
) {
  cameraHooks.focus = [];
  const permission = { granted, canAskAgain: false };
  let resolvePermission: (value: typeof permission) => void = () => undefined;
  const pendingPermission = new Promise<typeof permission>((resolve) => {
    resolvePermission = resolve;
  });
  const controller = new NativePlateCameraController(
    {
      get: vi.fn(async () =>
        deferPermission ? pendingPermission : permission,
      ),
      request: vi.fn(async () => permission),
    },
    ocrUnavailable
      ? {
          accept: vi.fn(),
          capture: vi.fn(async () => "cache://plate.jpg"),
          recognize: vi.fn(async () => ({
            status:
              ocrUnavailable === "no-match"
                ? ("NO_MATCH" as const)
                : ("UNAVAILABLE" as const),
          })),
          remove: vi.fn(async () => undefined),
        }
      : undefined,
  );
  const open = vi.spyOn(controller, "open");
  cameraHooks.controller = controller;
  const onManual = vi.fn(() => expect(controller.current().phase).toBe("idle"));
  const onNoPlate = vi.fn(() =>
    expect(controller.current().phase).toBe("idle"),
  );
  const render = () =>
    cameraElements(
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
  const cleanup = cameraHooks.focus[0]!();
  const press = (label: string) =>
    (
      render().find((node) => node.props.label === label)!.props
        .onPress as () => void
    )();
  return {
    cleanup,
    controller,
    onManual,
    onNoPlate,
    open,
    press,
    render,
    resolvePermission,
  };
}
