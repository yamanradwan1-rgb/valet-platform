import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webBrandDirectory = resolve(
  import.meta.dirname,
  "../../valet/public/brand",
);
const nativeBrandDirectory = resolve(import.meta.dirname, "../assets/brand");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Employee brand assets", () => {
  it("keeps the complete Native brand directory byte-identical to Web", () => {
    const webFiles = readdirSync(webBrandDirectory).sort();
    const nativeFiles = readdirSync(nativeBrandDirectory).sort();

    expect(nativeFiles).toEqual(webFiles);
    expect(nativeFiles).toEqual([
      "VAYLET_Logo_Dark_Background.png",
      "VAYLET_Logo_Light_Background.png",
    ]);
    for (const file of webFiles) {
      expect(sha256(resolve(nativeBrandDirectory, file))).toBe(
        sha256(resolve(webBrandDirectory, file)),
      );
    }
  });
});
