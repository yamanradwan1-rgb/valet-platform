import { describe, expect, it } from "vitest";
import {
  NATIVE_ALERT_SWIPE_DISMISS_PX,
  nativeRetrievalAlertGesture,
} from "../src/retrieval-alert/native-retrieval-alert-gesture";

describe("Native retrieval alert upward swipe", () => {
  it("follows an upward-dominant drag and fades no lower than 55%", () => {
    expect(nativeRetrievalAlertGesture(4, -24)).toMatchObject({
      dismiss: false,
      offsetY: -24,
      opacity: 0.8,
      suppressOpen: true,
    });
    expect(nativeRetrievalAlertGesture(0, -200).opacity).toBe(0.55);
  });

  it("dismisses at the exact 48px Web threshold", () => {
    expect(
      nativeRetrievalAlertGesture(0, -NATIVE_ALERT_SWIPE_DISMISS_PX),
    ).toMatchObject({ dismiss: true, suppressOpen: true });
  });

  it("resets insufficient movement and suppresses its resulting Open", () => {
    expect(nativeRetrievalAlertGesture(0, -47)).toMatchObject({
      dismiss: false,
      offsetY: -47,
      suppressOpen: true,
    });
  });

  it.each([
    [60, -20],
    [0, 40],
  ])("does not dismiss horizontal/down movement (%i, %i)", (x, y) => {
    expect(nativeRetrievalAlertGesture(x, y)).toMatchObject({
      dismiss: false,
      offsetY: 0,
      suppressOpen: true,
    });
  });
});
