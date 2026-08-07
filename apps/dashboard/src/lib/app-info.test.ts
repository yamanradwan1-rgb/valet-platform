import { describe, expect, it } from "vitest";

import { appInfo } from "./app-info";

describe("dashboard app scaffold", () => {
  it("has a title", () => {
    expect(appInfo.title).toBe("Management Dashboard");
  });
});
