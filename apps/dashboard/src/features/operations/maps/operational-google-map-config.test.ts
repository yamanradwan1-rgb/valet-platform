import { describe, expect, it } from "vitest";

import { hasOperationalGoogleMapConfig } from "./operational-google-map-config";

describe("operational Google map configuration", () => {
  it("requires both the browser API key and Map ID", () => {
    expect(hasOperationalGoogleMapConfig(undefined, "map-id")).toBe(false);
    expect(hasOperationalGoogleMapConfig("", "map-id")).toBe(false);
    expect(hasOperationalGoogleMapConfig("fixture-key", undefined)).toBe(false);
    expect(hasOperationalGoogleMapConfig("fixture-key", "   ")).toBe(false);
    expect(hasOperationalGoogleMapConfig("fixture-key", "map-id")).toBe(true);
  });
});
