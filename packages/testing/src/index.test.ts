import { describe, expect, it } from "vitest";

import { createFixtureName } from "./index";

describe("createFixtureName", () => {
  it("creates a readable fixture label", () => {
    expect(createFixtureName("bootstrap")).toBe("fixture:bootstrap");
  });
});
