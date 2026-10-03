import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function inspectPng(relativePath) {
  const png = readFileSync(resolve(root, relativePath));
  expect(png.byteLength).toBeGreaterThan(0);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );

  let offset = 8;
  let width;
  let height;
  let colorType;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      colorType = data[9];
    } else if (type === "IDAT") {
      compressed.push(data);
    }
    offset += length + 12;
  }

  expect(colorType).toBe(6);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (stride + 1)];
    expect([0, 1, 2, 3, 4]).toContain(filter);
    const rowStart = y * (stride + 1) + 1;
    const outputStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[rowStart + x];
      const left = x >= bytesPerPixel ? pixels[outputStart + x - 4] : 0;
      const above = y > 0 ? pixels[outputStart + x - stride] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel ? pixels[outputStart + x - stride - 4] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) {
        const prediction = left + above - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const aboveDistance = Math.abs(prediction - above);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        value +=
          leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
            ? left
            : aboveDistance <= upperLeftDistance
              ? above
              : upperLeft;
      }
      pixels[outputStart + x] = value & 0xff;
    }
  }

  const visibleColors = new Set();
  let transparentPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0) transparentPixels += 1;
    else {
      visibleColors.add(
        `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`,
      );
    }
  }

  return { width, height, transparentPixels, visibleColors };
}

describe("Native production branding assets", () => {
  it.each([
    ["app icon", "assets/branding/app-icon.png"],
    ["adaptive background", "assets/branding/adaptive-icon-background.png"],
  ])("keeps the %s master fully opaque", (_role, path) => {
    const image = inspectPng(path);
    expect([image.width, image.height]).toEqual([1024, 1024]);
    expect(image.transparentPixels).toBe(0);
  });

  it.each([
    ["adaptive foreground", "assets/branding/adaptive-icon-foreground.png"],
    ["splash logo", "assets/branding/splash-logo.png"],
  ])("keeps real transparency around the %s", (_role, path) => {
    const image = inspectPng(path);
    expect([image.width, image.height]).toEqual([1024, 1024]);
    expect(image.transparentPixels).toBeGreaterThan(0);
    expect(image.visibleColors.size).toBeGreaterThan(1);
  });

  it.each([
    ["monochrome icon", "assets/branding/monochrome-icon.png", "0,0,0"],
    [
      "notification icon",
      "assets/branding/notification-icon.png",
      "255,255,255",
    ],
  ])(
    "keeps the %s a one-color transparent silhouette",
    (_role, path, color) => {
      const image = inspectPng(path);
      expect([image.width, image.height]).toEqual([1024, 1024]);
      expect(image.transparentPixels).toBeGreaterThan(0);
      expect([...image.visibleColors]).toEqual([color]);
    },
  );
});

describe("Native splash lifecycle", () => {
  const layout = readFileSync(resolve(root, "app/_layout.tsx"), "utf8");

  it("takes early prevent-auto-hide ownership", () => {
    expect(layout).toContain("SplashScreen.preventAutoHideAsync()");
  });

  it("hides once after layout and bounded appearance restore without operational gates", () => {
    const readyHandler = layout.match(
      /const hideSplashWhenRootIsReady = useCallback\([\s\S]*?\n[ ]{2}\}, \[ready\]\);/,
    )?.[0];
    expect(readyHandler).toBeDefined();
    expect(layout).toContain("hasLaidOut.current = true");
    expect(readyHandler).toContain(
      "!ready || !hasLaidOut.current || hasHiddenSplash.current",
    );
    expect(layout).toContain('pointerEvents={ready ? "auto" : "none"}');
    expect(layout).toContain("opacity: ready ? 1 : 0");
    expect(layout).toContain("<EmployeeAppearanceProvider>");
    expect(layout).toContain("<Stack screenOptions={{ headerShown: false }}>");
    expect(layout).not.toMatch(/key=|if \(!ready\) return/);
    expect(readyHandler).toContain("hasHiddenSplash.current = true");
    expect(readyHandler).toContain("SplashScreen.hideAsync()");
    expect(layout.match(/SplashScreen\.hideAsync\(\)/g)).toHaveLength(1);
    expect(readyHandler).not.toMatch(/setTimeout|setInterval/);
    expect(readyHandler).not.toMatch(
      /auth|network|notification|push|firebase/i,
    );
  });
});
