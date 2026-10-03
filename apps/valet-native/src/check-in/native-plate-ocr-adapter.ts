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
  selectNativePlateFallbackPictureSize,
  selectNativePlatePictureSize,
} from "./native-plate-capture-policy";
import { NativePlateRoiBinding } from "./native-plate-roi-binding";
import {
  CameraCaptureFailure,
  capturePlateRoi,
} from "./native-plate-roi-capture";
import { renderPlateRoi } from "./native-plate-roi-crop-adapter";
import { inspectPlateFile, removePlateFile } from "./native-plate-roi-files";
import { NativePlateCameraTrace } from "./native-plate-camera-trace";

export type PlateRoiSource = Pick<
  NativePlateRoiBinding,
  "capture" | "isCurrent"
>;
const unavailable = () => new Error("Automatic plate reading is unavailable.");

export function createNativePlateOcrBinding(
  auth: NativeAuthSession,
  session: EmployeeCheckInSession,
) {
  const trace = new NativePlateCameraTrace(
    session.current().identityGeneration ?? 0,
  );
  const controller: NativePlateCameraController =
    new NativePlateCameraController(
      nativeCameraPermissions,
      createNativePlateOcrPorts(
        () =>
          roi.cameraFor(
            controller.current().generation,
            controller.current().mountId,
          ),
        auth,
        session,
        (generation, signal) =>
          controller.waitForCaptureFallback(generation, signal),
        () => controller.current().generation,
        {
          capture: () => roi.capture(),
          isCurrent: (value) => roi.isCurrent(value),
        },
        trace,
      ),
      trace,
    );
  const roi = new NativePlateRoiBinding(controller);
  return {
    controller,
    roi,
    cameraRef: (
      value: CameraView | null,
      generation: number,
      mountId: number,
    ) => roi.ref(value, generation, mountId),
    cameraLayout: (
      generation: number,
      mountId: number,
      width: number,
      height: number,
    ) => roi.layout(generation, mountId, width, height),
    cameraError: (generation: number, mountId: number) => {
      trace.record("native-error", {
        generation,
        mountId,
        current: roi.isMount(generation, mountId),
        reason: "native",
      });
      if (roi.isMount(generation, mountId)) controller.fail(generation);
    },
    async cameraReady(generation: number, mountId: number) {
      trace.record("ready-callback", {
        generation,
        mountId,
        current: roi.isMount(generation, mountId),
      });
      const current = controller.current();
      const camera = roi.cameraFor(generation, mountId);
      if (
        !camera ||
        !roi.isMount(generation, mountId) ||
        current.phase !== "starting"
      )
        return;
      logNativePlateOcr("camera-ready");
      if (current.pictureSize === undefined) {
        let selected: string | undefined;
        let fallback: string | undefined;
        try {
          trace.record("size-query-start", {
            generation,
            mountId,
            refId: trace.refId(camera),
          });
          const supported = await camera.getAvailablePictureSizesAsync();
          trace.record("size-query-complete", {
            generation,
            mountId,
            count: supported.length,
            refId: trace.refId(camera),
          });
          logNativePlateOcr("picture-sizes-loaded", {
            count: supported.length,
          });
          selected = selectNativePlatePictureSize(supported);
          if (selected)
            fallback = selectNativePlateFallbackPictureSize(
              supported,
              selected,
            );
        } catch {
          trace.record("size-query-failure", {
            generation,
            mountId,
            reason: "native",
          });
          selected = undefined;
        }
        if (
          !roi.isMount(generation, mountId) ||
          roi.cameraFor(generation, mountId) !== camera
        ) {
          trace.record("size-query-discard", {
            generation,
            mountId,
            current: false,
          });
          return;
        }
        trace.record("size-selection", {
          generation,
          mountId,
          preferredPictureSize: selected,
          fallbackPictureSize: fallback,
        });
        if (selected)
          logNativePlateOcr("picture-size-selected", { value: selected });
        else logNativePlateOcr("picture-size-none");
        if (
          selected &&
          controller.configurePictureSizes(generation, selected, fallback)
        ) {
          logNativePlateOcr("picture-size-remount");
          return;
        }
      }
      await roi.ready(generation, mountId);
    },
  };
}

export function createNativePlateOcrPorts(
  camera: () => CameraView | null,
  auth: NativeAuthSession,
  session: EmployeeCheckInSession,
  cameraFallback?: (
    generation: number,
    signal: AbortSignal,
  ) => Promise<boolean>,
  currentGeneration?: () => number,
  roi?: PlateRoiSource,
  trace?: NativePlateCameraTrace,
): NativePlateOcrPorts {
  const capture = (signal: AbortSignal) => {
    const active = camera();
    if (!active || !roi) {
      logNativePlateOcr("capture-exception");
      throw unavailable();
    }
    const snapshot = roi.capture();
    if (snapshot.camera !== active) throw unavailable();
    return capturePlateRoi(
      {
        ...snapshot,
        current: () => roi.isCurrent(snapshot),
        render: renderPlateRoi,
        inspect: inspectPlateFile,
        remove: removePlateFile,
        ...(trace === undefined ? {} : { trace }),
      },
      signal,
    );
  };
  return {
    async capture(signal) {
      const generation = currentGeneration?.() ?? 0;
      try {
        return await capture(signal);
      } catch (error) {
        if (
          !(error instanceof CameraCaptureFailure) ||
          !cameraFallback ||
          signal.aborted ||
          !(await cameraFallback(generation, signal))
        )
          throw error;
        if (signal.aborted) throw unavailable();
        return await capture(signal);
      }
    },
    async recognize(uri, signal) {
      logNativePlateOcr("recognize-preflight");
      if (signal.aborted) return { status: "UNAVAILABLE" };
      const file = new File(uri);
      if (!file.exists || !Number.isSafeInteger(file.size) || file.size <= 0) {
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
      } catch {
        logNativePlateOcr("http-exception");
        throw unavailable();
      }
    },
    remove: removePlateFile,
    accept(plateNumberRaw) {
      session.setVehicle({ mode: "CONFIRMED_PLATE", plateNumberRaw });
      session.reviewIdentity();
    },
  };
}
