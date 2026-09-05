import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmployeeCheckInSession,
  type NativeAuthSession,
  type PlateOcrResponse,
} from "@valet/employee-client";
import type { CameraView } from "expo-camera";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { bindNativePlateCameraLifecycle } from "../src/check-in/native-plate-camera-lifecycle";
import { NativeIdentityStateBoundary } from "../src/auth/identity-state-boundary";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  request: vi.fn(),
  size: 200,
}));
vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
}));
vi.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    size = mocks.size;
    delete() {
      mocks.remove();
    }
  },
}));
vi.mock("../src/check-in/native-plate-ocr-client", () => ({
  recognizeNativePlate: mocks.request,
}));
vi.mock("../src/auth/native-api-http", () => ({
  resolveNativeApiOrigin: () => "http://localhost:3001",
}));
vi.mock("react-native", () => ({
  Text: "Text",
  View: "View",
  Pressable: "Pressable",
  TextInput: "TextInput",
  StyleSheet: { create: (value: unknown) => value },
}));
const { createNativePlateOcrPorts } =
  await import("../src/check-in/native-plate-ocr-adapter");
const { NativeConfirmStep } =
  await import("../src/check-in/native-check-in-confirm-step");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const match: PlateOcrResponse = {
  status: "MATCH",
  candidate: { plateNumberRaw: "12-34567", confidence: 1 },
};
type Element = ReactElement<Record<string, unknown>>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}
async function setup() {
  vi.useFakeTimers();
  mocks.remove.mockClear();
  mocks.size = 200;
  mocks.request.mockReset().mockResolvedValue(match);
  const recognize = vi.fn().mockResolvedValue({ vehicle: null });
  const session = new EmployeeCheckInSession({
    createOperationId: () => "test-operation",
    transport: {
      recognize,
      loadDrafts: async () => ({ drafts: [] }),
      loadContinuations: async () => ({ continuations: [] }),
      loadSession: vi.fn(),
      createIntake: vi.fn(),
    },
  });
  await session.activate(1, "11111111-1111-4111-8111-111111111111");
  session.setVehicle({ plateCountry: "AE" });
  const camera = {
    takePictureAsync: vi.fn().mockResolvedValue({ uri: "cache://private.jpg" }),
  };
  const ports = createNativePlateOcrPorts(
    () => camera as unknown as CameraView,
    {} as NativeAuthSession,
    session,
  );
  const controller = new NativePlateCameraController(
    {
      get: async () => ({ granted: true, canAskAgain: true }),
      request: vi.fn(),
    },
    ports,
  );
  const identity = new NativeIdentityStateBoundary();
  let authChange!: (value: {
    phase: "authenticated";
    authGeneration: number;
  }) => void;
  let appChange!: (value: string) => void;
  const dispose = bindNativePlateCameraLifecycle(controller, session, {
    auth: {
      current: () =>
        ({ phase: "authenticated", authGeneration: 1 }) as ReturnType<
          NativeAuthSession["current"]
        >,
      subscribe: (listener) => {
        authChange = listener as typeof authChange;
        return vi.fn();
      },
    },
    identity,
    appState: {
      currentState: "active",
      addEventListener: (_event, listener) => {
        appChange = listener;
        return { remove: vi.fn() };
      },
    },
  });
  await controller.open();
  controller.ready(controller.current().generation);
  return {
    controller,
    session,
    recognize,
    ports,
    camera,
    identity,
    authChange,
    appChange,
    dispose,
  };
}
afterEach(() => vi.useRealTimers());
describe("OCR integrates the real Check-In trust boundary", () => {
  it.each(["en", "ar"] as const)(
    "requires explicit Confirm Plate in %s even at confidence 1",
    async (locale) => {
      const c = await setup();
      const confirm = vi.spyOn(c.session, "confirmIdentity");
      await vi.advanceTimersByTimeAsync(1200);
      expect(c.camera.takePictureAsync).toHaveBeenCalledWith({
        quality: 0.6,
        exif: false,
        base64: false,
      });
      expect(mocks.remove).toHaveBeenCalledOnce();
      expect(c.controller.current().phase).toBe("idle");
      expect(c.session.current()).toMatchObject({
        phase: "confirm",
        vehicle: { plateCountry: "AE", plateNumberRaw: "12-34567" },
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(c.recognize).not.toHaveBeenCalled();
      const copy = getNativeCheckInCopy(locale);
      const rendered = nodes(
        NativeConfirmStep({
          copy,
          session: c.session,
          snapshot: c.session.current(),
          textAlign: locale === "ar" ? "right" : "left",
        }),
      );
      expect(c.recognize).not.toHaveBeenCalled();
      (
        rendered.find((node) => node.props.label === copy.confirmPlate)!.props
          .onPress as () => void
      )();
      expect(c.recognize).toHaveBeenCalledExactlyOnceWith({
        targetLocationId: c.session.current().locationId,
        vehicleIdentity: {
          mode: "CONFIRMED_PLATE",
          plateCountry: "AE",
          plateNumberRaw: "12-34567",
          confirmedByHuman: true,
        },
      });
      await vi.advanceTimersByTimeAsync(60000);
      expect(mocks.request).toHaveBeenCalledOnce();
      c.dispose();
    },
  );
  it("allows Edit before explicit confirmation", async () => {
    const c = await setup();
    await vi.advanceTimersByTimeAsync(1200);
    c.session.editIdentity();
    c.session.setVehicle({ plateNumberRaw: "EDITED" });
    c.session.reviewIdentity();
    expect(c.recognize).not.toHaveBeenCalled();
    await c.session.confirmIdentity();
    expect(c.recognize.mock.calls[0]?.[0].vehicleIdentity.plateNumberRaw).toBe(
      "EDITED",
    );
    c.dispose();
  });
  it.each([
    "back",
    "manual",
    "no-plate",
    "workflow",
    "auth",
    "identity",
    "background",
    "unmount",
  ])("real lifecycle ignores late MATCH after %s", async (reason) => {
    const c = await setup();
    let resolve!: (result: PlateOcrResponse) => void;
    mocks.request.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await vi.advanceTimersByTimeAsync(1200);
    switch (reason) {
      case "back":
        c.session.clear();
        break;
      case "manual":
        c.controller.close();
        c.session.setVehicle({ plateNumberRaw: "MANUAL" });
        break;
      case "no-plate":
        c.controller.close();
        c.session.setVehicle({ mode: "TEMPORARY_DESCRIPTOR" });
        break;
      case "workflow":
        c.session.setVehicle({ plateNumberRaw: "OTHER" });
        c.session.reviewIdentity();
        break;
      case "auth":
        c.authChange({ phase: "authenticated", authGeneration: 2 });
        break;
      case "identity":
        await c.identity.purge();
        break;
      case "background":
        c.appChange("background");
        break;
      case "unmount":
        c.dispose();
        break;
    }
    expect(mocks.remove).toHaveBeenCalledOnce();
    resolve(match);
    await vi.advanceTimersByTimeAsync(10000);
    expect(c.session.current().vehicle.plateNumberRaw).not.toBe("12-34567");
    expect(c.recognize).not.toHaveBeenCalled();
    c.dispose();
  });
  it("does not upload oversize local files and still deletes them", async () => {
    const c = await setup();
    mocks.size = 1048577;
    await vi.advanceTimersByTimeAsync(1200);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(c.camera.takePictureAsync).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(c.controller.current().phase).toBe("unavailable");
    c.dispose();
  });
});
