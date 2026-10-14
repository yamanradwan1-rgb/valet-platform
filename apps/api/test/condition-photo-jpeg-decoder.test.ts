import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  canonicalizeConditionJpeg,
  ConditionPhotoDecodeError,
} from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";

describe("bounded canonical condition JPEG", () => {
  it("rejects empty, oversized and fake JPEGs", async () => {
    await expect(canonicalizeConditionJpeg(Buffer.alloc(0))).rejects.toBeInstanceOf(
      ConditionPhotoDecodeError,
    );
    await expect(canonicalizeConditionJpeg(Buffer.alloc(8 * 1024 * 1024 + 1)))
      .rejects.toMatchObject({ code: "CONDITION_PHOTO_TOO_LARGE" });
    await expect(canonicalizeConditionJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .rejects.toMatchObject({ code: "CONDITION_PHOTO_INVALID_IMAGE" });
  });

  it("re-encodes actual pixels, removing source EXIF and preserving source hash", async () => {
    const source = await sharp({
      create: {
        width: 16,
        height: 12,
        channels: 3,
        background: "red",
      },
    }).jpeg().withExif({ IFD0: { Copyright: "sensitive-canary" } }).toBuffer();
    const result = await canonicalizeConditionJpeg(source);
    expect(result.sourceSha256).toHaveLength(32);
    expect(result.canonicalSha256).toHaveLength(32);
    expect(result.sourceByteSize).toBe(source.length);
    expect(result.canonicalByteSize).toBe(result.canonicalBytes.length);
    expect(result.normalizationVersion).toBe(1);
    expect(result.width).toBe(16);
    expect(result.height).toBe(12);
    expect(result.canonicalBytes.includes(Buffer.from("sensitive-canary"))).toBe(false);
    const metadata = await sharp(result.canonicalBytes).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
  });
});
