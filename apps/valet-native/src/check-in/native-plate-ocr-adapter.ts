import type { CameraView } from "expo-camera";
import { File } from "expo-file-system";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import { PLATE_OCR_MAX_IMAGE_BYTES } from "@valet/employee-client";
import { resolveNativeApiOrigin } from "../auth/native-api-http";
import { recognizeNativePlate } from "./native-plate-ocr-client";
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

function uploadable(uri: string): boolean {
  const file = new File(uri);
  return file.exists && file.size <= PLATE_OCR_MAX_IMAGE_BYTES;
}

async function capture(
  camera: CameraView,
  quality: number,
  signal: AbortSignal,
): Promise<string> {
  const picture = await camera.takePictureAsync({
    quality,
    exif: false,
    base64: false,
  });
  if (!picture?.uri) throw unavailable();
  if (signal.aborted) {
    removeCapture(picture.uri);
    throw unavailable();
  }
  return picture.uri;
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
        selected = selectNativePlatePictureSize(
          (await camera?.getAvailablePictureSizesAsync()) ?? [],
        );
      } catch {
        selected = undefined;
      }
      if (selected && controller.configurePictureSize(generation, selected))
        return;
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
      if (!active) throw unavailable();
      const first = await capture(
        active,
        NATIVE_PLATE_PRIMARY_JPEG_QUALITY,
        signal,
      );
      if (uploadable(first)) return first;
      removeCapture(first);
      if (signal.aborted) throw unavailable();
      const fallback = await capture(
        active,
        NATIVE_PLATE_FALLBACK_JPEG_QUALITY,
        signal,
      );
      if (uploadable(fallback)) return fallback;
      removeCapture(fallback);
      throw unavailable();
    },
    async recognize(uri, signal) {
      const file = new File(uri);
      if (!file.exists || file.size > PLATE_OCR_MAX_IMAGE_BYTES)
        return { status: "UNAVAILABLE" };
      const current = session.current();
      if (current.locationId === null) return { status: "UNAVAILABLE" };
      return recognizeNativePlate(
        resolveNativeApiOrigin(),
        auth,
        {
          targetLocationId: current.locationId,
          plateCountry: current.vehicle.plateCountry,
        },
        uri,
        signal,
      );
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
