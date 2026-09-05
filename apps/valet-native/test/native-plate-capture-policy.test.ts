import { describe, expect, it } from "vitest";
import { selectNativePlatePictureSize } from "../src/check-in/native-plate-capture-policy";

describe("Native ANPR picture-size policy", () => {
  it("selects the exact 1920x1080 target independent of device ordering", () => {
    const supported = [
      "4032x3024",
      "3840x2160",
      "1280x720",
      "640x480",
      "1920x1080",
    ];
    expect(selectNativePlatePictureSize(supported)).toBe("1920x1080");
    expect(selectNativePlatePictureSize([...supported].reverse())).toBe(
      "1920x1080",
    );
  });

  it("chooses the nearest supported bounded ANPR size", () => {
    expect(
      selectNativePlatePictureSize(["4000x3000", "1280x960", "1600x1200"]),
    ).toBe("1600x1200");
  });

  it("normalizes orientation only for comparison", () => {
    expect(selectNativePlatePictureSize(["720x1280", "1080x1920"])).toBe(
      "1080x1920",
    );
  });

  it("uses one reasonable supported size", () => {
    expect(selectNativePlatePictureSize(["640x480", "1024x768"])).toBe(
      "1024x768",
    );
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
