import { describe, expect, it } from "vitest";

import {
  DEV_MAP_CENTER,
  DEV_MAP_ZOOM,
  OPENFREEMAP_LIBERTY_STYLE_URL,
} from "./app-config";

describe("map development configuration", () => {
  it("defaults to the hotel + parking area center without any API key", () => {
    expect(DEV_MAP_CENTER.latitude).toBeCloseTo(32.562703, 6);
    expect(DEV_MAP_CENTER.longitude).toBeCloseTo(35.880055, 6);
    expect(DEV_MAP_ZOOM).toBeGreaterThanOrEqual(17.5);
    expect(DEV_MAP_ZOOM).toBeLessThanOrEqual(18);
  });

  it("uses the key-free OpenFreeMap style endpoint", () => {
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).toContain("openfreemap.org");
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).not.toMatch(/key|token/iu);
  });
});
