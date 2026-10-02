import { describe, expect, it } from "vitest";
import {
  plateGuide,
  plateRoiCrop,
} from "../src/check-in/native-plate-roi-geometry";
const ids = { generation: 1, mountId: 2, revision: 3 };
describe("native transform aspect and edge boundaries", () => {
  it.each([
    {
      w: 400,
      h: 300,
      iw: 800,
      ih: 600,
      m: [2, 0, 0, 0, 2, 0, 0, 0, 1],
      result: { originX: 16, originY: 180, width: 768, height: 240 },
    },
    {
      w: 300,
      h: 300,
      iw: 1000,
      ih: 500,
      m: [5 / 3, 0, 250, 0, 5 / 3, 0, 0, 0, 1],
      result: { originX: 260, originY: 175, width: 480, height: 150 },
    },
    {
      w: 500,
      h: 260,
      iw: 720,
      ih: 1280,
      m: [1.44, 0, 0, 0, 1.44, 452.8, 0, 0, 1],
      result: { originX: 101, originY: 559, width: 518, height: 162 },
    },
  ])(
    "maps actual source $iw×$ih against measured viewport $w×$h",
    ({ w, h, iw, ih, m, result }) => {
      const geometry = { ...ids, width: w, height: h, guide: plateGuide(w, h) };
      const metadata = {
        ...ids,
        previewWidth: w,
        previewHeight: h,
        imageWidth: iw,
        imageHeight: ih,
        previewToImage: m,
      };
      const actual = { width: iw, height: ih };
      expect(plateRoiCrop(geometry, metadata, actual)).toEqual(result);
      expect(plateRoiCrop(geometry, metadata, actual)).toEqual(result);
    },
  );
  it.each([
    [0, 0, { originX: 0, originY: 0, width: 110, height: 55 }],
    [300, 0, { originX: 290, originY: 0, width: 110, height: 55 }],
    [0, 250, { originX: 0, originY: 245, width: 110, height: 55 }],
    [300, 250, { originX: 290, originY: 245, width: 110, height: 55 }],
  ] as const)(
    "keeps complete guide at edge (%s,%s) while clamping margin",
    (originX, originY, expected) => {
      const geometry = {
        ...ids,
        width: 400,
        height: 300,
        guide: { originX, originY, width: 100, height: 50 },
      };
      expect(
        plateRoiCrop(
          geometry,
          {
            ...ids,
            previewWidth: 400,
            previewHeight: 300,
            imageWidth: 400,
            imageHeight: 300,
            previewToImage: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          },
          { width: 400, height: 300 },
        ),
      ).toEqual(expected);
    },
  );
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid measured layout %s",
    (value) => {
      expect(() => plateGuide(value, 260)).toThrow();
      expect(() => plateGuide(360, value)).toThrow();
    },
  );
});
