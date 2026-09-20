import { describe, expect, it } from "vitest";

import { appInfo } from "./app-info";

describe("dashboard application identity", () => {
  it("has a title", () => {
    expect(appInfo.title).toBe("VAYLET Management");
  });
});
