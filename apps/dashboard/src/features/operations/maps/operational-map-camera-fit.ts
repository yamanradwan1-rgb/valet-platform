import type { OperationalMapCamera } from "./operational-map-model";

export interface OperationalMapCameraFitState {
  readonly fallbackCameraKey: string | null;
  readonly usableCameraKey: string | null;
}

export function shouldRefitOperationalMapCamera(
  camera: OperationalMapCamera,
  cameraKey: string,
  state: OperationalMapCameraFitState,
): boolean {
  if (camera.kind === "WORLD") {
    return (
      state.usableCameraKey !== cameraKey &&
      state.fallbackCameraKey !== cameraKey
    );
  }
  return state.usableCameraKey !== cameraKey;
}

export function recordOperationalMapCameraFit(
  camera: OperationalMapCamera,
  cameraKey: string,
  state: OperationalMapCameraFitState,
): OperationalMapCameraFitState {
  if (camera.kind === "WORLD") {
    return { ...state, fallbackCameraKey: cameraKey };
  }
  return { ...state, usableCameraKey: cameraKey };
}
