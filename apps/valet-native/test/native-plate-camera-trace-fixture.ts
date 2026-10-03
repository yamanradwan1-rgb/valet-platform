import { vi } from "vitest";
import type { CameraView } from "expo-camera";
import type {
  EmployeeCheckInSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { NativePlateRoiBinding } from "../src/check-in/native-plate-roi-binding";
import {
  NativePlateCameraTrace,
  readNativePlateCameraTrace,
} from "../src/check-in/native-plate-camera-trace";
import { bindNativePlateCameraLifecycle } from "../src/check-in/native-plate-camera-lifecycle";
import type { NativePlateOcrPorts } from "../src/check-in/native-plate-ocr-loop";

export const previewMetadata = {
  width: 360,
  height: 260,
  sensorToView: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function traceFixture(ports?: NativePlateOcrPorts) {
  const trace = new NativePlateCameraTrace(7);
  const permission = { granted: true, canAskAgain: true };
  const get = vi.fn().mockResolvedValue(permission);
  const request = vi.fn().mockResolvedValue(permission);
  const controller = new NativePlateCameraController(
    { get, request },
    ports,
    trace,
  );
  const roi = new NativePlateRoiBinding(controller);
  const metadata = vi.fn().mockResolvedValue(previewMetadata);
  const camera = {
    getPlatePreviewMetadataAsync: metadata,
  } as unknown as CameraView;
  const mount = (value = camera) => {
    const { generation, mountId } = controller.current();
    roi.ref(value, generation, mountId);
    roi.layout(generation, mountId, 360, 260);
    return { generation, mountId };
  };
  let state = "active";
  let appChange!: (value: string) => void;
  let sessionChange!: () => void;
  let snapshot = {
    phase: "capture",
    identityGeneration: 7,
    locationId: "scope-A",
  };
  const session = {
    current: () => snapshot,
    subscribe: (callback: () => void) => {
      sessionChange = callback;
      return vi.fn();
    },
  } as unknown as EmployeeCheckInSession;
  const cleanup = bindNativePlateCameraLifecycle(controller, session, {
    auth: {
      current: () =>
        ({ phase: "authenticated", authGeneration: 7 }) as NativeAuthSnapshot,
      subscribe: () => vi.fn(),
    },
    identity: { register: () => vi.fn() },
    appState: {
      get currentState() {
        return state;
      },
      addEventListener: (_event, callback) => {
        appChange = callback;
        return { remove: vi.fn() };
      },
    },
  });
  return {
    trace,
    controller,
    roi,
    camera,
    metadata,
    mount,
    cleanup,
    get,
    request,
    records: () =>
      readNativePlateCameraTrace().filter(
        (r) => r.details.workflowGeneration === trace.workflowGeneration,
      ),
    background: (value = "background") => {
      state = value;
      appChange(value);
    },
    scope: (locationId: string) => {
      snapshot = { ...snapshot, locationId };
      sessionChange();
    },
  };
}

export function enableTrace() {
  vi.stubEnv("EXPO_PUBLIC_PLATE_CAMERA_TRACE", "1");
  vi.spyOn(console, "info").mockImplementation(() => {});
}
