import type { CameraView } from "expo-camera";
import { File } from "expo-file-system";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import { PLATE_OCR_MAX_IMAGE_BYTES } from "@valet/employee-client";
import { resolveNativeApiOrigin } from "../auth/native-api-http";
import { recognizeNativePlate } from "./native-plate-ocr-client";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import type { NativePlateOcrPorts } from "./native-plate-ocr-loop";
import { NativePlateCameraController } from "./native-plate-camera-controller";
import { nativeCameraPermissions } from "../scanner/native-camera-adapter";
import {
  NATIVE_PLATE_FALLBACK_JPEG_QUALITY,
  NATIVE_PLATE_PRIMARY_JPEG_QUALITY,
  selectNativePlatePictureSize,
} from "./native-plate-capture-policy";

const unavailable = () => new Error("Automatic plate reading is unavailable.");

function removeCapture(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

function captureFile(
  uri: string,
  kind: "primary" | "fallback",
): { exists: boolean; size: number } {
  const file = new File(uri);
  if (!file.exists) {
    logNativePlateOcr(`${kind}-file-missing`);
    return { exists: false, size: file.size };
  }
  if (file.size > PLATE_OCR_MAX_IMAGE_BYTES) {
    logNativePlateOcr(`${kind}-file-oversize`, { bytes: file.size });
  } else {
    logNativePlateOcr(`${kind}-file-uploadable`, { bytes: file.size });
  }
  return { exists: true, size: file.size };
}

async function capture(
  camera: CameraView,
  quality: number,
  signal: AbortSignal,
  kind: "primary" | "fallback",
): Promise<string> {
  logNativePlateOcr(`${kind}-capture-start`, { quality });
  try {
    const picture = await camera.takePictureAsync({
      quality,
      exif: false,
      base64: false,
    });
    if (!picture?.uri) {
      logNativePlateOcr(`${kind}-capture-no-uri`);
      throw unavailable();
    }
    logNativePlateOcr(`${kind}-capture-success`);
    if (signal.aborted) {
      removeCapture(picture.uri);
      throw unavailable();
    }
    return picture.uri;
  } catch (error) {
    if (signal.aborted) logNativePlateOcr("capture-aborted");
    else logNativePlateOcr("capture-exception");
    throw error;
  }
}

export function createNativePlateOcrBinding(
  auth: NativeAuthSession,
  session: EmployeeCheckInSession,
) {
  let camera: CameraView | null = null;
  const controller = new NativePlateCameraController(
    nativeCameraPermissions,
    createNativePlateOcrPorts(() => camera, auth, session),
  );
  return {
    cameraRef: (value: CameraView | null) => {
      camera = value;
    },
    controller,
    async cameraReady(generation: number) {
      const current = controller.current();
      if (current.generation !== generation || current.phase !== "starting")
        return;
      if (current.pictureSize !== undefined) {
        controller.ready(generation);
        return;
      }
      let selected: string | undefined;
      try {
        const supported = (await camera?.getAvailablePictureSizesAsync()) ?? [];
        logNativePlateOcr("picture-sizes-loaded", {
          count: supported.length,
        });
        selected = selectNativePlatePictureSize(supported);
      } catch {
        selected = undefined;
      }
      if (selected) {
        logNativePlateOcr("picture-size-selected", { value: selected });
      } else {
        logNativePlateOcr("picture-size-none");
      }
      if (selected && controller.configurePictureSize(generation, selected)) {
        logNativePlateOcr("picture-size-remount");
        return;
      }
      controller.ready(generation);
    },
  };
}

export function createNativePlateOcrPorts(
  camera: () => CameraView | null,
  auth: NativeAuthSession,
  session: EmployeeCheckInSession,
): NativePlateOcrPorts {
  return {
    async capture(signal) {
      const active = camera();
      if (!active) {
        logNativePlateOcr("capture-exception");
        throw unavailable();
      }
      const first = await capture(
        active,
        NATIVE_PLATE_PRIMARY_JPEG_QUALITY,
        signal,
        "primary",
      );
      const primary = captureFile(first, "primary");
      if (primary.exists && primary.size <= PLATE_OCR_MAX_IMAGE_BYTES)
        return first;
      removeCapture(first);
      if (signal.aborted) {
        logNativePlateOcr("capture-aborted");
        throw unavailable();
      }
      const fallback = await capture(
        active,
        NATIVE_PLATE_FALLBACK_JPEG_QUALITY,
        signal,
        "fallback",
      );
      const second = captureFile(fallback, "fallback");
      if (second.exists && second.size <= PLATE_OCR_MAX_IMAGE_BYTES)
        return fallback;
      removeCapture(fallback);
      throw unavailable();
    },
    async recognize(uri, signal) {
      logNativePlateOcr("recognize-preflight");
      const file = new File(uri);
      if (!file.exists) {
        logNativePlateOcr("recognize-file-missing");
        return { status: "UNAVAILABLE" };
      }
      if (file.size > PLATE_OCR_MAX_IMAGE_BYTES) {
        logNativePlateOcr("recognize-file-oversize", { bytes: file.size });
        return { status: "UNAVAILABLE" };
      }
      const current = session.current();
      if (current.locationId === null) {
        logNativePlateOcr("recognize-location-missing");
        return { status: "UNAVAILABLE" };
      }
      logNativePlateOcr("http-dispatch");
      try {
        const result = await recognizeNativePlate(
          resolveNativeApiOrigin(),
          auth,
          {
            targetLocationId: current.locationId,
            plateCountry: current.vehicle.plateCountry,
          },
          uri,
          signal,
        );
        logNativePlateOcr("http-result", { status: result.status });
        return result;
      } catch (error) {
        logNativePlateOcr("http-exception");
        throw error;
      }
    },
    async remove(uri) {
      removeCapture(uri);
    },
    accept(plateNumberRaw) {
      session.setVehicle({ mode: "CONFIRMED_PLATE", plateNumberRaw });
      session.reviewIdentity();
    },
  };
}
