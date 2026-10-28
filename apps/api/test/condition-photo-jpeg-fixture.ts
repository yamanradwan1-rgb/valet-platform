import { randomBytes } from "node:crypto";
import sharp from "sharp";

/** Synthetic noise avoids tiny uniform-image fixtures concealing decode work. */
export async function syntheticSizedJpeg(width: number, height: number) {
  return await sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}
