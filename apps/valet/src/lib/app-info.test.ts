import { describe, expect, it } from "vitest";

import { appInfo } from "./app-info";

describe("valet app scaffold", () => {
  it("has a title", () => {
    expect(appInfo.title).toBe("Valet Employee App");
  });
});
