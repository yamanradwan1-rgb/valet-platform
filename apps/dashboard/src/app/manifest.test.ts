import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("Management Dashboard install manifest", () => {
  it("uses a distinct, stable identity and launches the existing dashboard entry", () => {
    expect(manifest()).toMatchObject({
      id: "/vaylet-management",
      name: "VAYLET Management",
      short_name: "Vaylet Mgmt",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
  });

  it("references the Titanium assets at their declared PNG dimensions", () => {
    const icons = manifest().icons;
    expect(icons?.map(({ sizes, purpose }) => [sizes, purpose])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
    for (const icon of icons ?? []) {
      expect(icon.src).toMatch(/^\/icons\/management-titanium-v1\/[^/]+\.png$/);
      expect(icon.type).toBe("image/png");
      const png = readFileSync(new URL(`../../public${icon.src}`, import.meta.url));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });
});
