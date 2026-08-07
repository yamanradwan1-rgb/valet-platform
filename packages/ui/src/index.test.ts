import { describe, expect, it } from "vitest";

describe("ui package", () => {
  it("is available to workspace applications", () => {
    expect("@valet/ui").toContain("ui");
  });
});
