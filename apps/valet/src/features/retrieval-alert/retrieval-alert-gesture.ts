export const ALERT_SWIPE_DISMISS_PX = 48;
export const ALERT_SWIPE_DIRECTION_RATIO = 1.25;
const ALERT_SWIPE_SLOP_PX = 8;

export interface AlertSwipeGesture {
  readonly cancelled: boolean;
  readonly moved: boolean;
  readonly offsetY: number;
  readonly originX: number;
  readonly originY: number;
  readonly pointerId: number;
}

export interface AlertSwipeResult {
  readonly dismiss: boolean;
  readonly suppressClick: boolean;
}

export function startAlertSwipe(
  pointerId: number,
  originX: number,
  originY: number,
): AlertSwipeGesture {
  return {
    cancelled: false,
    moved: false,
    offsetY: 0,
    originX,
    originY,
    pointerId,
  };
}

export function moveAlertSwipe(
  gesture: AlertSwipeGesture,
  pointerId: number,
  clientX: number,
  clientY: number,
): AlertSwipeGesture {
  if (pointerId !== gesture.pointerId || gesture.cancelled) return gesture;

  const deltaX = clientX - gesture.originX;
  const deltaY = clientY - gesture.originY;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  const moved = Math.hypot(deltaX, deltaY) >= ALERT_SWIPE_SLOP_PX;
  if (!moved) return { ...gesture, moved: false };

  const downward = deltaY > 0 && verticalDistance >= ALERT_SWIPE_SLOP_PX;
  const horizontallyDominant =
    horizontalDistance >= ALERT_SWIPE_SLOP_PX &&
    horizontalDistance > verticalDistance;
  if (downward || horizontallyDominant) {
    return { ...gesture, cancelled: true, moved: true, offsetY: 0 };
  }

  const upwardDominant =
    deltaY < 0 &&
    verticalDistance >= ALERT_SWIPE_DIRECTION_RATIO * horizontalDistance;
  return {
    ...gesture,
    cancelled: false,
    moved: true,
    offsetY: upwardDominant ? deltaY : 0,
  };
}

export function completeAlertSwipe(
  gesture: AlertSwipeGesture,
  pointerId: number,
  clientX: number,
  clientY: number,
): AlertSwipeResult {
  if (pointerId !== gesture.pointerId) {
    return { dismiss: false, suppressClick: false };
  }

  const completed = moveAlertSwipe(gesture, pointerId, clientX, clientY);
  const horizontalDistance = Math.abs(clientX - completed.originX);
  const upwardDistance = completed.originY - clientY;
  const directionAccepted =
    upwardDistance >= ALERT_SWIPE_DIRECTION_RATIO * horizontalDistance;

  return {
    dismiss:
      !completed.cancelled &&
      upwardDistance >= ALERT_SWIPE_DISMISS_PX &&
      directionAccepted,
    suppressClick: completed.moved,
  };
}
