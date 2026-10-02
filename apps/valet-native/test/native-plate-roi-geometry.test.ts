import { describe, expect, it } from "vitest";
import {
  plateGuide,
  plateRoiCrop,
  validPlateMatrix,
} from "../src/check-in/native-plate-roi-geometry";

const geometry = {
  generation: 7,
  mountId: 3,
  revision: 2,
  width: 360,
  height: 260,
  guide: plateGuide(360, 260),
};
const metadata = {
  generation: 7,
  mountId: 3,
  revision: 2,
  previewWidth: 360,
  previewHeight: 260,
  imageWidth: 720,
  imageHeight: 1280,
  previewToImage: [2, 0, 0, 0, 2, 380, 0, 0, 1],
};
const actual = { width: 720, height: 1280 };
describe("authoritative native plate ROI geometry", () => {
  it("maps the 360×260 guide to the golden 720×1280 JPEG with outward 10% margin", () => {
    expect(geometry.guide).toEqual({
      originX: 36,
      originY: 85,
      width: 288,
      height: 90,
    });
    expect(plateRoiCrop(geometry, metadata, actual)).toEqual({
      originX: 14,
      originY: 532,
      width: 692,
      height: 216,
    });
  });
  it("converts measured RN layout units to real native preview pixels", () => {
    expect(
      plateRoiCrop(
        geometry,
        {
          ...metadata,
          previewWidth: 1080,
          previewHeight: 780,
          previewToImage: [2 / 3, 0, 0, 0, 2 / 3, 380, 0, 0, 1],
        },
        actual,
      ),
    ).toEqual(plateRoiCrop(geometry, metadata, actual));
  });
  it("uses asymmetric sensor mapping rather than a guessed center-cover transform", () => {
    expect(
      plateRoiCrop(
        geometry,
        { ...metadata, previewToImage: [1.5, 0, 70, 0, 2.5, 230, 0, 0, 1] },
        actual,
      ),
    ).toEqual({ originX: 80, originY: 420, width: 520, height: 270 });
  });
  it.each([
    [
      0,
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      400,
      300,
      { originX: 40, originY: 80, width: 120, height: 60 },
    ],
    [
      90,
      [0, -1, 300, 1, 0, 0, 0, 0, 1],
      300,
      400,
      { originX: 160, originY: 40, width: 60, height: 120 },
    ],
    [
      180,
      [-1, 0, 400, 0, -1, 300, 0, 0, 1],
      400,
      300,
      { originX: 240, originY: 160, width: 120, height: 60 },
    ],
    [
      270,
      [0, 1, 0, -1, 0, 400, 0, 0, 1],
      300,
      400,
      { originX: 80, originY: 240, width: 60, height: 120 },
    ],
  ] as const)(
    "maps all four corners after %s-degree native orientation",
    (_rotation, matrix, width, height, expected) => {
      const g = {
        ...geometry,
        width: 400,
        height: 300,
        guide: { originX: 50, originY: 85, width: 100, height: 50 },
      };
      expect(
        plateRoiCrop(
          g,
          {
            ...metadata,
            previewWidth: 400,
            previewHeight: 300,
            imageWidth: width,
            imageHeight: height,
            previewToImage: matrix,
          },
          { width, height },
        ),
      ).toEqual(expected);
    },
  );
  it.each([
    [360, 260],
    [280, 260],
    [1024, 260],
    [260, 700],
  ])(
    "centers a bounded physical guide at %s×%s independent of locale",
    (width, height) => {
      const guide = plateGuide(width, height);
      expect(guide.width / guide.height).toBeCloseTo(3.2);
      expect(guide.originX * 2 + guide.width).toBeCloseTo(width);
      expect(guide.originY * 2 + guide.height).toBeCloseTo(height);
      expect(guide.width).toBeLessThanOrEqual(520);
      expect(guide.height).toBeLessThanOrEqual(height * 0.36);
    },
  );
  it("clamps only added margin when the entire mapped guide is inside", () => {
    const g = {
      ...geometry,
      guide: { originX: 0, originY: 0, width: 360, height: 260 },
    };
    expect(
      plateRoiCrop(
        g,
        { ...metadata, previewToImage: [2, 0, 0, 0, 2, 0, 0, 0, 1] },
        actual,
      ),
    ).toEqual({ originX: 0, originY: 0, width: 720, height: 572 });
    expect(() =>
      plateRoiCrop(
        g,
        { ...metadata, previewToImage: [2, 0, -1, 0, 2, 0, 0, 0, 1] },
        actual,
      ),
    ).toThrow();
  });
  it.each(["generation", "mountId", "revision"] as const)(
    "rejects stale %s",
    (key) => {
      expect(() =>
        plateRoiCrop(
          geometry,
          { ...metadata, [key]: metadata[key] + 1 },
          actual,
        ),
      ).toThrow();
    },
  );
  it("rejects mismatched actual JPEG dimensions, empty layouts and invalid guides", () => {
    expect(() =>
      plateRoiCrop(geometry, metadata, { width: 1280, height: 720 }),
    ).toThrow();
    expect(() =>
      plateRoiCrop({ ...geometry, width: 0 }, metadata, actual),
    ).toThrow();
    expect(() =>
      plateRoiCrop(
        { ...geometry, guide: { ...geometry.guide, originX: -1 } },
        metadata,
        actual,
      ),
    ).toThrow();
  });
  it.each(
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 1],
      [NaN, 0, 0, 0, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 0, 0.1, 0, 1],
      [],
    ].map((matrix) => ({ matrix })),
  )("rejects singular/nonfinite/unproven matrix $matrix", ({ matrix }) => {
    expect(validPlateMatrix(matrix)).toBe(false);
    expect(() =>
      plateRoiCrop(geometry, { ...metadata, previewToImage: matrix }, actual),
    ).toThrow();
  });
});
