import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const webBrandDirectory = resolve(
  import.meta.dirname,
  "../../valet/public/brand",
);
const nativeBrandDirectory = resolve(import.meta.dirname, "../assets/brand");
// The Native dark asset is 4x the approved Web wordmark's dimensions.
// Check full PNG decode: the earlier hash-only test pinned a truncated IDAT.
const approvedDarkLogoHashes = {
  native: "dd74db01c7041fca81d5bb38f00e0f6b9ebe23f8a19bdedc232a0765da546172",
  web: "819ff2c5cd568619f7d642a44d981a52a8320c26fd7c013d8cf51e50d1075bf3",
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function expectDecodableRgbaPng(path) {
  const png = readFileSync(path);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect([...png.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);

  const idat = [];
  let cursor = 8;
  let foundEnd = false;
  while (cursor < png.length) {
    expect(cursor + 12).toBeLessThanOrEqual(png.length);
    const length = png.readUInt32BE(cursor);
    const end = cursor + length + 12;
    expect(end).toBeLessThanOrEqual(png.length);
    const type = png.toString("ascii", cursor + 4, cursor + 8);
    if (type === "IDAT")
      idat.push(png.subarray(cursor + 8, cursor + 8 + length));
    if (type === "IEND") {
      expect(length).toBe(0);
      foundEnd = true;
    }
    cursor = end;
  }

  expect(foundEnd).toBe(true);
  expect(idat.length).toBeGreaterThan(0);
  expect(inflateSync(Buffer.concat(idat)).length).toBe(
    height * (1 + width * 4),
  );
}

describe("Employee brand assets", () => {
  it("keeps official brand variants and fully decodable Native PNG assets", () => {
    const webFiles = readdirSync(webBrandDirectory).sort();
    const nativeFiles = readdirSync(nativeBrandDirectory).sort();

    expect(nativeFiles).toEqual(webFiles);
    expect(nativeFiles).toEqual([
      "VAYLET_Logo_Dark_Background.png",
      "VAYLET_Logo_Light_Background.png",
    ]);
    for (const file of webFiles) {
      const nativeHash = sha256(resolve(nativeBrandDirectory, file));
      const webHash = sha256(resolve(webBrandDirectory, file));
      expectDecodableRgbaPng(resolve(nativeBrandDirectory, file));
      if (file === "VAYLET_Logo_Dark_Background.png") {
        expect(nativeHash).toBe(approvedDarkLogoHashes.native);
        expect(webHash).toBe(approvedDarkLogoHashes.web);
      } else {
        expect(nativeHash).toBe(webHash);
      }
    }
  });
});
