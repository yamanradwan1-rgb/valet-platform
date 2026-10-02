import type { CameraView } from "expo-camera";
import {
  validPlateMatrix,
  type PlateRoiMetadata,
} from "./native-plate-roi-geometry";

export interface PlatePreviewMetadata {
  readonly width: number;
  readonly height: number;
  readonly sensorToView: readonly number[];
}

/** Version-specific native package extension stays behind this plate-only boundary. */
export async function readPlatePreview(
  camera: CameraView,
): Promise<PlatePreviewMetadata> {
  const view = camera as CameraView & {
    getPlatePreviewMetadataAsync?: () => Promise<unknown>;
  };
  const value = await view.getPlatePreviewMetadataAsync?.();
  if (!value || typeof value !== "object")
    throw new Error("Plate mapping unavailable.");
  const data = value as PlatePreviewMetadata;
  if (
    !Number.isSafeInteger(data.width) ||
    data.width <= 0 ||
    !Number.isSafeInteger(data.height) ||
    data.height <= 0 ||
    !Array.isArray(data.sensorToView) ||
    !validPlateMatrix(data.sensorToView)
  )
    throw new Error("Plate mapping unavailable.");
  return data;
}

export function readPlateCaptureMetadata(picture: unknown): PlateRoiMetadata {
  const value = (picture as { plateRoiMetadata?: unknown })?.plateRoiMetadata;
  if (!value || typeof value !== "object")
    throw new Error("Plate mapping unavailable.");
  const data = value as PlateRoiMetadata;
  if (
    ![data.generation, data.mountId, data.revision].every(
      Number.isSafeInteger,
    ) ||
    !Array.isArray(data.previewToImage) ||
    !validPlateMatrix(data.previewToImage)
  )
    throw new Error("Plate mapping unavailable.");
  return data;
}
