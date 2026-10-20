import type { PHOTO_DIAGNOSTIC_STAGES } from "../telemetry/native-pinned-diagnostics";

export type NativePhotoStage = (typeof PHOTO_DIAGNOSTIC_STAGES)[number];
export type NativePhotoStageObserver = (
  stage: NativePhotoStage, outcome: "start" | "success" | "error",
) => void;

export function observePhotoStage<T>(
  observer: NativePhotoStageObserver | undefined,
  stage: NativePhotoStage,
  action: () => T,
): T {
  notify(observer, stage, "start");
  try {
    const result = action();
    notify(observer, stage, "success");
    return result;
  } catch (error) {
    notify(observer, stage, "error");
    throw error;
  }
}

export async function observePhotoStageAsync<T>(
  observer: NativePhotoStageObserver | undefined,
  stage: NativePhotoStage,
  action: () => Promise<T>,
): Promise<T> {
  notify(observer, stage, "start");
  try {
    const result = await action();
    notify(observer, stage, "success");
    return result;
  } catch (error) {
    notify(observer, stage, "error");
    throw error;
  }
}

export function notify(
  observer: NativePhotoStageObserver | undefined,
  stage: NativePhotoStage,
  outcome: "start" | "success" | "error",
): void {
  try { observer?.(stage, outcome); } catch {
    // Non-authoritative diagnostics must never change the photo operation.
  }
}
