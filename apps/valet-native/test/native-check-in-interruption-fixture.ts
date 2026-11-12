import type { ReactElement } from "react";
import {
  EmployeeCheckInSession,
  type NativeAuthSession,
} from "@valet/employee-client";
import { beforeEach, expect, vi } from "vitest";

import "./native-condition-photo-test-boundary";
import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { CheckInHeader } from "../src/check-in/native-check-in-primitives";
import { NativeCheckInWorkflow } from "../src/check-in/native-check-in-workflow";
import type { NativePushResponseConsumer } from "../src/notifications/native-push-response-types";
import { NativeCheckInRoute } from "../src/shell/native-check-in-route";
import { useNativeProductionBackHandler } from "../src/shell/native-production-back-handler";
import {
  ProductionShellController,
  type ProductionShellState,
} from "../src/shell/production-shell-controller";
import { FakeRouteOperations, routeAuth } from "./native-push-route-fixture";
import { scope } from "./production-shell-test-fixture";

const hooks = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  theme: "light" as "light" | "dark",
  onBack: undefined as (() => boolean) | undefined,
  onResponse: undefined as NativePushResponseConsumer | undefined,
}));

export const interruptionHooks = hooks;

vi.mock("react", () => ({
  useEffect: (effect: () => (() => void) | void) => {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeeDarkPalette, employeeLightPalette } =
    await import("../src/appearance/employee-palette");
  const palette = () =>
    hooks.theme === "dark" ? employeeDarkPalette : employeeLightPalette;
  return {
    useEmployeeAppearance: () => ({ palette: palette(), ready: true }),
    useEmployeePalette: palette,
    useEmployeeStyles: <T>(styles: { light: T; dark: T }) =>
      styles[hooks.theme],
  };
});
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: vi.fn() }),
  },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      hooks.onBack = handler;
      return { remove: vi.fn() };
    },
  },
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("../src/check-in/native-plate-camera-step", () => ({
  NativePlateCameraStep: "NativePlateCameraStep",
}));
vi.mock("../src/notifications/native-push-response-bootstrap", () => ({
  nativePushResponseCapture: {
    subscribe: (listener: NativePushResponseConsumer) => {
      hooks.onResponse = listener;
      return () => {
        hooks.onResponse = undefined;
      };
    },
  },
}));
vi.mock("../src/notifications/use-native-push-lifecycle", () => ({
  useNativePushLifecycle: () => ({ snapshot: { attentionIntentIds: [] } }),
}));
vi.mock("../src/tasks/use-native-retrieval-attention", () => ({
  useNativeRetrievalAttention: vi.fn(),
}));

export const auth = routeAuth("authenticated");
const clearable = { clear: vi.fn() };
export const backFrom = (element: ReactElement) => {
  const children = (element.props as { children: ReactElement[] }).children;
  expect(children[0]?.type).toBe(CheckInHeader);
  return (children[0]!.props as { onBack: () => void }).onBack;
};

function CheckInHardwareBack({
  controller,
  runtime,
  shell,
}: {
  controller: ProductionShellController;
  runtime: NativeEmployeeRuntime;
  shell: ProductionShellState;
}) {
  useNativeProductionBackHandler(
    controller,
    runtime,
    shell,
    vi.fn(),
    () => false,
  );
  return null;
}

export async function start(
  locale: "en" | "ar" = "en",
  theme: "light" | "dark" = "light",
) {
  hooks.theme = theme;
  const transport = {
    completeCheckIn: vi.fn(),
    completeCondition: vi.fn(),
    correctDetails: vi.fn(),
    correctIdentity: vi.fn(),
    createConditionNote: vi.fn(),
    createIntake: vi.fn(),
    loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
    loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
    loadSession: vi.fn(),
    recognize: vi.fn().mockResolvedValue({ vehicle: null }),
  };
  const checkIn = new EmployeeCheckInSession({
    createOperationId: () => "intake-test",
    transport,
  });
  const operations = new FakeRouteOperations();
  const controller = new ProductionShellController();
  let cancellationProtected = false;
  let onCancellationChange: (() => void) | undefined;
  const setCancellationProtected = (value: boolean) => {
    cancellationProtected = value;
    onCancellationChange?.();
  };
  const runtime = {
    checkIn,
    checkInActions: { ...clearable, returnDestination: () => "tasks" },
    confirmParking: clearable,
    guestAccess: clearable,
    handoff: clearable,
    incident: clearable,
    operations,
    parking: clearable,
    parkingCancellation: {
      clear: () => setCancellationProtected(false),
      current: () => ({ phase: "idle" }),
      protected: () => cancellationProtected,
      subscribe: (listener: () => void) => {
        onCancellationChange = listener;
        return () => {
          onCancellationChange = undefined;
        };
      },
    },
    release: clearable,
    retrieval: clearable,
    shiftEnd: {
      current: () => ({ phase: "idle" }),
      fenceOperationalScope: vi.fn(),
    },
    taskTracking: clearable,
    vehicleDirectory: clearable,
  } as unknown as NativeEmployeeRuntime;
  const update = () => controller.update(auth, operations.current());
  const navigate = (destination: "tasks" | "check-in") => {
    update();
    expect(controller.receive({ destination, source: "navigation" })).toBe(
      "resolved",
    );
    return update();
  };
  const onClose = vi.fn(() => navigate("tasks"));
  const route = () =>
    NativeCheckInRoute({
      auth: {} as NativeAuthSession,
      checkIn,
      identityGeneration: auth.authGeneration,
      locale,
      onClose,
      onOpenParking: vi.fn(),
      scope,
    });
  const initial = navigate("check-in");
  CheckInHardwareBack({ controller, runtime, shell: initial });
  let mountedRoute: ReturnType<typeof route>;
  let detach: () => void;
  const mountCheckIn = () => {
    const firstEffect = hooks.cleanups.length;
    mountedRoute = route();
    detach = hooks.cleanups.splice(firstEffect, 1)[0]!;
  };
  mountCheckIn();
  await vi.waitFor(() => expect(checkIn.current().phase).toBe("capture"));
  checkIn.setVehicle({
    mode: "TEMPORARY_DESCRIPTOR",
    temporaryDescriptor: "SUV with roof rack",
  });
  checkIn.reviewIdentity();
  await checkIn.confirmIdentity();
  checkIn.setPreIntakeVehicleDetails({
    make: "Toyota",
    model: "RAV4",
    color: "Silver",
  });
  checkIn.continueVehicleDetails();
  checkIn.setCustomerPhone("07912");
  const workflowProps = () =>
    mountedRoute.props as Parameters<typeof NativeCheckInWorkflow>[0];
  const render = () =>
    NativeCheckInWorkflow({ ...workflowProps(), snapshot: checkIn.current() });
  return {
    checkIn,
    controller,
    detach: () => detach(),
    mountCheckIn,
    navigate,
    onClose,
    operations,
    render,
    runtime,
    setCancellationProtected,
    transport,
    update,
    workflowProps,
  };
}

beforeEach(() => {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  hooks.onBack = undefined;
});
