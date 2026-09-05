import { describe, expect, it } from "vitest";
import {
  selectNativePlateFallbackPictureSize,
  selectNativePlatePictureSize,
} from "../src/check-in/native-plate-capture-policy";

describe("Native ANPR picture-size policy", () => {
  it("selects the exact 1280x720 target independent of device ordering", () => {
    const supported = [
      "4032x3024",
      "3840x2160",
      "1280x720",
      "640x480",
      "1920x1080",
    ];
    expect(selectNativePlatePictureSize(supported)).toBe("1280x720");
    expect(selectNativePlatePictureSize([...supported].reverse())).toBe(
      "1280x720",
    );
  });

  it("chooses the nearest supported bounded ANPR size", () => {
    const supported = ["4000x3000", "1152x648", "1024x576"];
    expect(selectNativePlatePictureSize(supported)).toBe("1152x648");
    expect(selectNativePlatePictureSize([...supported].reverse())).toBe(
      "1152x648",
    );
    expect(selectNativePlatePictureSize(["1920x1080"])).toBeUndefined();
  });

  it("normalizes orientation only for comparison", () => {
    expect(selectNativePlatePictureSize(["720x1280", "1080x1920"])).toBe(
      "720x1280",
    );
  });

  it("uses one reasonable supported size", () => {
    expect(selectNativePlatePictureSize(["640x480", "1024x576"])).toBe(
      "1024x576",
    );
  });

  it("selects a deterministic exact lower camera fallback", () => {
    const supported = ["1280x720", "1152x648", "1024x576", "960x540"];
    expect(selectNativePlateFallbackPictureSize(supported, "1280x720")).toBe(
      "1024x576",
    );
    expect(
      selectNativePlateFallbackPictureSize(
        [...supported].reverse(),
        "1280x720",
      ),
    ).toBe("1024x576");
  });

  it("returns undefined instead of inventing a size", () => {
    expect(
      selectNativePlatePictureSize([
        "8000x6000",
        "640x480",
        "bad",
        "1920:1080",
      ]),
    ).toBeUndefined();
  });
});
