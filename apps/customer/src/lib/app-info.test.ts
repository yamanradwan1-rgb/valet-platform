import { describe, expect, it } from "vitest";

import { appInfo } from "./app-info";

describe("customer app scaffold", () => {
  it("has a title", () => {
    expect(appInfo.title).toBe("Customer Experience");
  });
});
