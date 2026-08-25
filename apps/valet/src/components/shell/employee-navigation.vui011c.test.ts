import { describe, expect, it } from "vitest";

import {
  getActiveTab,
  liveEnabledTabs,
  livePermittedScreens,
  liveWorkflowScreens,
  topLevelScreenForTab,
} from "./employee-navigation";

describe("VUI-011C Vehicles tab activation (DEC-066 §1/§2/§6)", () => {
  it("enables the Vehicles tab now that its truthful Live read exists", () => {
    expect(liveEnabledTabs.vehicles).toBe(true);
    // Previously activated tabs stay enabled.
    expect(liveEnabledTabs.scan).toBe(true);
  });

  it("maps the Vehicles tab to vehicles-list and keeps every other mapping intact", () => {
    expect(topLevelScreenForTab("vehicles")).toBe("vehicles-list");
    expect(topLevelScreenForTab("home")).toBe("task-queue");
    expect(topLevelScreenForTab("scan")).toBe("scan-hub");
    expect(topLevelScreenForTab("shift")).toBe("shift-summary");
  });

  it("permits vehicles-list as a top-level Live surface with its own active tab", () => {
    expect(livePermittedScreens.has("vehicles-list")).toBe(true);
    expect(getActiveTab("vehicles-list")).toBe("vehicles");
  });

  it("keeps vehicles-list out of workflow pinning while workflows still pin", () => {
    expect(liveWorkflowScreens.has("vehicles-list")).toBe(false);
    for (const workflow of [
      "check-in",
      "parking",
      "retrieval",
      "incident",
      "guest-access",
    ] as const) {
      expect(liveWorkflowScreens.has(workflow)).toBe(true);
    }
    // The other top-level surfaces remain non-pinning too.
    expect(liveWorkflowScreens.has("task-queue")).toBe(false);
    expect(liveWorkflowScreens.has("scan-hub")).toBe(false);
    expect(liveWorkflowScreens.has("shift-summary")).toBe(false);
  });

  it("leaves the existing active-tab mappings unchanged", () => {
    expect(getActiveTab("task-queue")).toBe("home");
    expect(getActiveTab("scan-hub")).toBe("scan");
    expect(getActiveTab("shift-summary")).toBe("shift");
    expect(getActiveTab("check-in")).toBe("home");
    expect(getActiveTab("parking")).toBe("home");
    expect(getActiveTab("retrieval")).toBe("home");
  });
});
