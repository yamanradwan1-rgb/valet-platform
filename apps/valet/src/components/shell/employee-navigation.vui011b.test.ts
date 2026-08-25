import { describe, expect, it } from "vitest";

import {
  getActiveTab,
  liveEnabledTabs,
  livePermittedScreens,
  liveWorkflowScreens,
  topLevelScreenForTab,
} from "./employee-navigation";

describe("VUI-011B Scan tab activation (DEC-066 §1/§2)", () => {
  it("enables the Scan tab", () => {
    expect(liveEnabledTabs.scan).toBe(true);
  });

  it("maps the Scan tab to scan-hub and keeps every other mapping intact", () => {
    expect(topLevelScreenForTab("scan")).toBe("scan-hub");
    expect(topLevelScreenForTab("home")).toBe("task-queue");
    expect(topLevelScreenForTab("shift")).toBe("shift-summary");
  });

  it("permits scan-hub as a top-level Live surface with its own active tab", () => {
    expect(livePermittedScreens.has("scan-hub")).toBe(true);
    expect(getActiveTab("scan-hub")).toBe("scan");
  });

  it("keeps scan-hub out of workflow pinning while workflows still pin", () => {
    expect(liveWorkflowScreens.has("scan-hub")).toBe(false);
    for (const workflow of [
      "check-in",
      "parking",
      "retrieval",
      "incident",
      "guest-access",
    ] as const) {
      expect(liveWorkflowScreens.has(workflow)).toBe(true);
    }
  });

  it("leaves the existing active-tab mappings unchanged", () => {
    expect(getActiveTab("task-queue")).toBe("home");
    expect(getActiveTab("shift-summary")).toBe("shift");
    expect(getActiveTab("vehicles-list")).toBe("vehicles");
    expect(getActiveTab("check-in")).toBe("home");
    expect(getActiveTab("parking")).toBe("home");
  });
});
