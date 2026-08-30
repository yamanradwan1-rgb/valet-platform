import { describe, expect, it } from "vitest";

import {
  ALERT_SWIPE_DISMISS_PX,
  completeAlertSwipe,
  moveAlertSwipe,
  startAlertSwipe,
} from "./retrieval-alert-gesture";

function gestureAt(x: number, y: number) {
  const gesture = startAlertSwipe(7, 0, 0);
  return moveAlertSwipe(gesture, 7, x, y);
}

describe("Employee retrieval alert upward-swipe gesture", () => {
  it("dismisses a deliberate upward-dominant swipe beyond the threshold", () => {
    const gesture = gestureAt(8, -60);
    expect(gesture.offsetY).toBe(-60);
    expect(completeAlertSwipe(gesture, 7, 8, -60)).toEqual({
      dismiss: true,
      suppressClick: true,
    });
  });

  it("does not dismiss a short upward swipe", () => {
    const gesture = gestureAt(0, -(ALERT_SWIPE_DISMISS_PX - 1));
    expect(completeAlertSwipe(gesture, 7, 0, -47)).toEqual({
      dismiss: false,
      suppressClick: true,
    });
  });

  it("accepts the exact 48px threshold deterministically", () => {
    const gesture = gestureAt(0, -ALERT_SWIPE_DISMISS_PX);
    expect(
      completeAlertSwipe(gesture, 7, 0, -ALERT_SWIPE_DISMISS_PX).dismiss,
    ).toBe(true);
  });

  it("cancels downward movement", () => {
    const gesture = gestureAt(0, 20);
    expect(gesture.cancelled).toBe(true);
    expect(completeAlertSwipe(gesture, 7, 0, 60).dismiss).toBe(false);
  });

  it("cancels horizontally dominant movement", () => {
    const gesture = gestureAt(60, -20);
    expect(gesture.cancelled).toBe(true);
    expect(completeAlertSwipe(gesture, 7, 60, -20).dismiss).toBe(false);
  });

  it("requires 1.25x upward dominance at completion", () => {
    const insufficient = gestureAt(40, -49);
    expect(completeAlertSwipe(insufficient, 7, 40, -49).dismiss).toBe(false);

    const sufficient = gestureAt(38, -48);
    expect(completeAlertSwipe(sufficient, 7, 38, -48).dismiss).toBe(true);
  });

  it("ignores events from a different pointer", () => {
    const gesture = startAlertSwipe(7, 0, 0);
    expect(moveAlertSwipe(gesture, 8, 0, -60)).toBe(gesture);
    expect(completeAlertSwipe(gesture, 8, 0, -60)).toEqual({
      dismiss: false,
      suppressClick: false,
    });
  });
});
