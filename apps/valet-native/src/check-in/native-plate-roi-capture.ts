import type { CameraView } from "expo-camera";
import { PLATE_OCR_MAX_IMAGE_BYTES } from "@valet/employee-client";
import {
  plateRoiCrop,
  type PlateRoiGeometry,
} from "./native-plate-roi-geometry";
import {
  readPlateCaptureMetadata,
  type PlatePreviewMetadata,
} from "./native-plate-roi-metadata";
import type { PlateRoiImage } from "./native-plate-roi-crop-adapter";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import {
  NATIVE_PLATE_SOURCE_JPEG_QUALITY,
  NATIVE_PLATE_PRIMARY_JPEG_QUALITY,
  NATIVE_PLATE_FALLBACK_JPEG_QUALITY,
} from "./native-plate-capture-policy";

import type { NativePlateCameraTrace } from "./native-plate-camera-trace";
import {
  nativePlateRoiFailureReason,
  PlateRoiCaptureDiagnosticError,
  type PlateRoiCaptureFailureReason,
} from "./native-plate-roi-failure";

export class CameraCaptureFailure extends PlateRoiCaptureDiagnosticError {
  constructor(
    reason: PlateRoiCaptureFailureReason = "NATIVE_CAPTURE_FAILED",
  ) {
    super(reason);
    this.name = "CameraCaptureFailure";
  }
}

export interface PlateRoiCapturePorts {
  readonly camera: CameraView;
  readonly geometry: PlateRoiGeometry;
  readonly preview: PlatePreviewMetadata;
  readonly trace?: NativePlateCameraTrace;
  current(): boolean;
  render(
    uri: string,
    crop: ReturnType<typeof plateRoiCrop>,
  ): Promise<PlateRoiImage>;
  inspect(uri: string): { readonly exists: boolean; readonly size: number };
  remove(uri: string): Promise<void>;
}

/** Owns every known file until ONLY a validated cropped JPEG is handed to the loop. */
export async function capturePlateRoi(
  ports: PlateRoiCapturePorts,
  signal: AbortSignal,
): Promise<string> {
  const owned = new Set<string>();
  let image: PlateRoiImage | undefined;
  const assertCurrent = () => {
    if (signal.aborted || !ports.current())
      throw new Error("Plate capture expired.");
  };
  const remove = async (uri: string) => {
    await ports.remove(uri);
    owned.delete(uri);
  };
  let result: string | undefined;
  let failure: Error | undefined;
  const started = performance.now();
  const owner = {
    generation: ports.geometry.generation,
    mountId: ports.geometry.mountId,
    geometryRevision: ports.geometry.revision,
    refId: ports.trace?.refId(ports.camera) ?? -1,
  };
  try {
    assertCurrent();
    logNativePlateOcr("primary-capture-start", {
      quality: NATIVE_PLATE_SOURCE_JPEG_QUALITY,
    });
    let picture: Awaited<ReturnType<CameraView["takePictureAsync"]>>;
    try {
      ports.trace?.record("native-capture-start", owner);
      // The installed JS camera forwards these opt-in fields to the patched native record.
      const options = {
        quality: NATIVE_PLATE_SOURCE_JPEG_QUALITY,
        skipProcessing: false,
        exif: false,
        base64: false,
        plateRoiMetadata: {
          generation: ports.geometry.generation,
          mountId: ports.geometry.mountId,
          revision: ports.geometry.revision,
        },
      };
      picture = await ports.camera.takePictureAsync(options);
      ports.trace?.record("native-capture-success", {
        ...owner,
        current: ports.current(),
        aborted: signal.aborted,
      });
    } catch (error) {
      ports.trace?.record("native-capture-failure", {
        ...owner,
        current: ports.current(),
        aborted: signal.aborted,
        reason: "native",
      });
      assertCurrent();
      logNativePlateOcr("capture-exception");
      throw new CameraCaptureFailure(
        nativePlateRoiFailureReason(error) ?? "NATIVE_CAPTURE_FAILED",
      );
    }
    if (!picture?.uri) {
      logNativePlateOcr("primary-capture-no-uri");
      throw new Error("Plate capture unavailable.");
    }
    owned.add(picture.uri);
    assertCurrent();
    logNativePlateOcr("primary-capture-success");
    const metadata = readPlateCaptureMetadata(picture);
    if (
      metadata.generation !== ports.geometry.generation ||
      metadata.mountId !== ports.geometry.mountId ||
      metadata.revision !== ports.geometry.revision
    )
      throw new PlateRoiCaptureDiagnosticError(
        "CAPTURE_METADATA_IDENTITY_MISMATCH",
      );
    if (
      metadata.previewWidth !== ports.preview.width ||
      metadata.previewHeight !== ports.preview.height
    )
      throw new PlateRoiCaptureDiagnosticError("PREVIEW_SIZE_MISMATCH");
    const crop = plateRoiCrop(ports.geometry, metadata, picture);
    logNativePlateOcr("roi-mapped", {
      width: picture.width,
      height: picture.height,
      x: crop.originX,
      y: crop.originY,
      cropWidth: crop.width,
      cropHeight: crop.height,
      mountId: ports.geometry.mountId,
      revision: ports.geometry.revision,
    });
    const cropStarted = performance.now();
    image = await ports.render(picture.uri, crop);
    assertCurrent();
    logNativePlateOcr("roi-rendered", {
      durationMs: performance.now() - cropStarted,
    });
    for (const [index, quality] of [
      NATIVE_PLATE_PRIMARY_JPEG_QUALITY,
      NATIVE_PLATE_FALLBACK_JPEG_QUALITY,
    ].entries()) {
      assertCurrent();
      const saveStarted = performance.now();
      const output = await image.save(quality);
      if (output?.uri) owned.add(output.uri);
      assertCurrent();
      if (
        !output?.uri ||
        output.uri === picture.uri ||
        output.width !== crop.width ||
        output.height !== crop.height
      )
        throw new Error("Plate crop output unavailable.");
      const file = ports.inspect(output.uri);
      const kind = index === 0 ? "primary" : "fallback";
      if (!file.exists || !Number.isSafeInteger(file.size) || file.size <= 0) {
        logNativePlateOcr(`${kind}-file-missing`);
        throw new Error("Plate crop file unavailable.");
      }
      logNativePlateOcr("roi-encoded", {
        quality,
        bytes: file.size,
        durationMs: performance.now() - saveStarted,
      });
      if (file.size > PLATE_OCR_MAX_IMAGE_BYTES) {
        logNativePlateOcr(`${kind}-file-oversize`, { bytes: file.size });
        await remove(output.uri);
        continue;
      }
      logNativePlateOcr(`${kind}-file-uploadable`, { bytes: file.size });
      await remove(picture.uri);
      assertCurrent();
      const rendered = image;
      image = undefined;
      rendered.release();
      assertCurrent();
      logNativePlateOcr("roi-handoff", {
        durationMs: performance.now() - started,
      });
      owned.delete(output.uri);
      result = output.uri;
      break;
    }
    if (!result) throw new Error("Plate crop exceeds upload limit.");
  } catch (error) {
    if (signal.aborted || !ports.current())
      logNativePlateOcr("capture-aborted");
    else logNativePlateOcr("roi-unavailable");
    failure =
      error instanceof PlateRoiCaptureDiagnosticError
        ? error
        : new Error("Automatic plate reading is unavailable.");
  }
  {
    // Native render/save cannot always be aborted; late-created outputs are owned here.
    let failed = false;
    try {
      image?.release();
    } catch {
      failed = true;
    } finally {
      for (const uri of owned) {
        try {
          await ports.remove(uri);
        } catch {
          failed = true;
        }
      }
    }
    if (failed) throw new Error("Plate image cleanup unavailable.");
  }
  if (failure) throw failure;
  if (!result) throw new Error("Automatic plate reading is unavailable.");
  return result;
}
