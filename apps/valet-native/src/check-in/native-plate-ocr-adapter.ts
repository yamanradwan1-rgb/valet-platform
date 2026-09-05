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

export function createNativePlateOcrBinding(
  auth: NativeAuthSession,
  session: EmployeeCheckInSession,
) {
  let camera: CameraView | null = null;
  return {
    cameraRef: (value: CameraView | null) => {
      camera = value;
    },
    controller: new NativePlateCameraController(
      nativeCameraPermissions,
      createNativePlateOcrPorts(() => camera, auth, session),
    ),
  };
}

export function createNativePlateOcrPorts(
  camera: () => CameraView | null,
  auth: NativeAuthSession,
  session: EmployeeCheckInSession,
): NativePlateOcrPorts {
  return {
    async capture() {
      const picture = await camera()?.takePictureAsync({
        quality: 0.6,
        exif: false,
        base64: false,
      });
      if (!picture?.uri)
        throw new Error("Automatic plate reading is unavailable.");
      return picture.uri;
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
      const file = new File(uri);
      if (file.exists) file.delete();
    },
    accept(plateNumberRaw) {
      session.setVehicle({ mode: "CONFIRMED_PLATE", plateNumberRaw });
      session.reviewIdentity();
    },
  };
}
