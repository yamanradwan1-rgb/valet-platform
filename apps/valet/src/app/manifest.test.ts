import { describe, expect, it } from "vitest";

import manifest from "./manifest";

type AnyRecord = Record<string, unknown>;

describe("PWA manifest install metadata", () => {
  it("declares standalone display and complete icon set", () => {
    expect(manifest().display).toBe("standalone");
    expect(manifest().start_url).toBe("/");
    expect(manifest().name).toContain("Valet");
    const icons = manifest().icons as unknown as AnyRecord[];
    expect(icons).toHaveLength(4);
    const purposes = icons.map((i) => i.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const icon of icons) {
      expect(String(icon.src).startsWith("/icons/")).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });
});
