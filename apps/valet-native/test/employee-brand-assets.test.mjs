import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webBrandDirectory = resolve(
  import.meta.dirname,
  "../../valet/public/brand",
);
const nativeBrandDirectory = resolve(import.meta.dirname, "../assets/brand");
// The Native dark-gate asset was deliberately replaced with a 4x sharper
// approved raster in #249/#260; #265 preserves its rendered geometry.
const approvedDarkLogoHashes = {
  native: "e605e9e444e981efa2e40b5b14cc9e19d7b4d50a546e0e15950177d0d5c38d86",
  web: "819ff2c5cd568619f7d642a44d981a52a8320c26fd7c013d8cf51e50d1075bf3",
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Employee brand assets", () => {
  it("keeps the approved Native brand variants without reverting the sharper dark logo", () => {
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
      if (file === "VAYLET_Logo_Dark_Background.png") {
        expect(nativeHash).toBe(approvedDarkLogoHashes.native);
        expect(webHash).toBe(approvedDarkLogoHashes.web);
      } else {
        expect(nativeHash).toBe(webHash);
      }
    }
  });
});
