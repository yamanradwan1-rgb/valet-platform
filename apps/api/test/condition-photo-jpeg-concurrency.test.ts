import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  canonicalizeConditionJpeg,
  verifyStoredConditionJpeg,
} from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";

import { syntheticSizedJpeg } from "./condition-photo-jpeg-fixture";

describe("independent real JPEG concurrency regression", () => {
  it("accepts small, medium and large images arriving together", async () => {
    const dimensions = [
      [720, 540],
      [1280, 960],
      [2048, 1536],
    ] as const;
    const sources = await Promise.all(
      dimensions.map(([w, h]) => syntheticSizedJpeg(w, h)),
    );
    const results = await Promise.all(
      sources.map((bytes) => canonicalizeConditionJpeg(bytes)),
    );
    expect(results).toHaveLength(3);
    const verified = await Promise.all(
      results.map((result) => verifyStoredConditionJpeg(result.canonicalBytes)),
    );
    expect(verified.map((result) => [result.width, result.height])).toEqual(
      dimensions,
    );
    for (const [index, result] of results.entries()) {
      expect([result.width, result.height]).toEqual(dimensions[index]);
      expect(
        result.sourceSha256.equals(
          createHash("sha256").update(sources[index]!).digest(),
        ),
      ).toBe(true);
      const metadata = await sharp(result.canonicalBytes).metadata();
      expect(metadata.format).toBe("jpeg");
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    }
  }, 20_000);
});
