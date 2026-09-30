import { describe, expect, it } from "vitest";

import { dashboardNavigationRegistrations } from "./index";
import {
  navigationItemsFromPresentationIds,
  reconcileAccountSecurityNavigation,
} from "./account-security-navigation";

describe("account Security navigation presentation", () => {
  it("adds Security from account eligibility independently of selected-role items", () => {
    const base = navigationItemsFromPresentationIds(
      dashboardNavigationRegistrations,
      ["help"],
      "en",
    );
    expect(
      reconcileAccountSecurityNavigation(
        dashboardNavigationRegistrations,
        base,
        "en",
        true,
      ).map((item) => item.id),
    ).toEqual(["security", "help"]);
  });

  it("removes Security while account eligibility is unknown or denied", () => {
    const base = navigationItemsFromPresentationIds(
      dashboardNavigationRegistrations,
      ["security", "help"],
      "en",
    );
    expect(
      reconcileAccountSecurityNavigation(
        dashboardNavigationRegistrations,
        base,
        "en",
        false,
      ).map((item) => item.id),
    ).toEqual(["help"]);
  });
});
