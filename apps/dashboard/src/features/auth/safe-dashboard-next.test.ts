import { describe, expect, it } from "vitest";

import { safeDashboardNext } from "./safe-dashboard-next";

describe("safeDashboardNext", () => {
  it.each(["/overview", "/tasks", "/sessions?state=active"])(
    "accepts internal dashboard path %s",
    (value) => expect(safeDashboardNext(value)).toBe(value),
  );

  it.each([
    null,
    "",
    "https://example.com",
    "//example.com",
    "javascript:alert(1)",
    "data:text/plain,x",
    "/sign-in",
  ])("falls back safely for %s", (value) => {
    expect(safeDashboardNext(value)).toBe("/overview");
  });
});
