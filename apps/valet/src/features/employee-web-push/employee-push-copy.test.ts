import { describe, expect, it } from "vitest";

import { employeeEnglishWebPushDictionary as copy } from "../../lib/i18n/dictionary-en-web-push";

describe("Employee push permission guidance", () => {
  it("explains the explicit operational benefit", () => {
    expect(copy.pushEnableDescription).toContain("new retrieval requests");
  });

  it("gives truthful iOS Home Screen guidance", () => {
    expect(copy.pushIosHomeScreen).toContain("Home Screen");
  });

  it("sends denied users to settings without blocking the queue", () => {
    expect(copy.pushDenied).toContain("settings");
    expect(copy.pushDenied).toContain("live task queue remains available");
  });
});
