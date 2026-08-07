import { describe, expect, it } from "vitest";

import { nonEmptyStringSchema } from "./index";

describe("nonEmptyStringSchema", () => {
  it("accepts non-empty bootstrap values", () => {
    expect(nonEmptyStringSchema.parse("valet-platform")).toBe("valet-platform");
  });
});
