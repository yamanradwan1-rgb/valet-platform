import { describe, expect, it } from "vitest";

import { overviewSessionStateLabel } from "./overview-session-state";

describe("Overview session state labels", () => {
  it("uses manager-facing labels for all contract states in both locales", () => {
    const states = [
      "CHECKING_IN", "AWAITING_PARKING", "PARKING", "PARKED", "REQUESTED",
      "RETRIEVING", "READY", "HANDOFF_PENDING", "COMPLETED",
    ];
    for (const state of states) {
      expect(overviewSessionStateLabel(state, "en")).not.toContain("_");
      expect(overviewSessionStateLabel(state, "ar")).toMatch(/[\u0600-\u06ff]/u);
      expect(overviewSessionStateLabel(state, "ar")).not.toContain(state);
    }
  });

  it("does not guess the meaning of an unknown code", () => {
    expect(overviewSessionStateLabel("FUTURE_STATE", "en")).toBe("Unknown state");
    expect(overviewSessionStateLabel("FUTURE_STATE", "ar")).toBe("حالة غير معروفة");
  });
});
