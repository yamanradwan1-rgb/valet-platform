import { describe, expect, it } from "vitest";

import {
  OPENFREEMAP_LIBERTY_STYLE_URL,
  SMOKE_MAP_CENTER,
  SMOKE_MAP_ZOOM,
} from "./app-config";

describe("map development configuration (D6-004 smoke-only)", () => {
  it("uses a named smoke fallback for the MapContainer harness", () => {
    expect(SMOKE_MAP_CENTER.latitude).toBeCloseTo(32.562703, 6);
    expect(SMOKE_MAP_CENTER.longitude).toBeCloseTo(35.880055, 6);
    expect(SMOKE_MAP_ZOOM).toBeGreaterThanOrEqual(17.5);
    expect(SMOKE_MAP_ZOOM).toBeLessThanOrEqual(18);
  });

  it("uses the key-free OpenFreeMap style endpoint", () => {
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).toContain("openfreemap.org");
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).not.toMatch(/key|token/iu);
  });
});
