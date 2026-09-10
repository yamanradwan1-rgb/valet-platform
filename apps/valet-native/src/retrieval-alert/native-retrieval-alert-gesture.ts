export const NATIVE_ALERT_SWIPE_DISMISS_PX = 48;
const DIRECTION_RATIO = 1.25;
const SLOP_PX = 8;

export interface NativeRetrievalAlertGesture {
  readonly dismiss: boolean;
  readonly offsetY: number;
  readonly opacity: number;
  readonly suppressOpen: boolean;
}

export function nativeRetrievalAlertGesture(
  translationX: number,
  translationY: number,
): NativeRetrievalAlertGesture {
  "worklet";
  const horizontal = Math.abs(translationX);
  const upward = Math.max(0, -translationY);
  const moved = Math.hypot(translationX, translationY) >= SLOP_PX;
  const upwardDominant =
    translationY < 0 && upward >= DIRECTION_RATIO * horizontal;
  const offsetY = moved && upwardDominant ? translationY : 0;
  return {
    dismiss: upwardDominant && upward >= NATIVE_ALERT_SWIPE_DISMISS_PX,
    offsetY,
    opacity: Math.max(0.55, 1 - Math.abs(offsetY) / 120),
    suppressOpen: moved,
  };
}
