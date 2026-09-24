import { CircleHelp } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  firstMainNavigationHref,
  resolveRootProductLanding,
} from "./navigation-landing";
import type { DashboardNavigationItem } from "./navigation-types";

function item(
  id: string,
  href: string,
  placement: "MAIN" | "UTILITY",
): DashboardNavigationItem {
  return {
    href,
    icon: CircleHelp,
    id,
    label: id,
    owner: "MD-R01",
    placement,
  };
}

describe("root product landing", () => {
  it("chooses the first eligible MAIN destination rather than a fixed route", () => {
    expect(
      firstMainNavigationHref([
        item("security", "/security", "UTILITY"),
        item("maps", "/maps-zones", "MAIN"),
        item("audit", "/audit-log", "MAIN"),
      ]),
    ).toBe("/maps-zones");
  });

  it("falls through to the next eligible MAIN destination when Overview is absent", () => {
    expect(
      firstMainNavigationHref([
        item("vehicles", "/vehicles", "MAIN"),
        item("help", "/help", "UTILITY"),
      ]),
    ).toBe("/vehicles");
  });

  it("returns no destination when only recovery utilities are eligible", () => {
    const utilities = [
      item("security", "/security", "UTILITY"),
      item("help", "/help", "UTILITY"),
    ];
    expect(firstMainNavigationHref(utilities)).toBeNull();
    expect(resolveRootProductLanding("valid", utilities)).toEqual({
      kind: "fallback",
    });
  });

  it("keeps authority failures in the safe fallback instead of redirecting", () => {
    expect(
      resolveRootProductLanding("error", [
        item("overview", "/overview", "MAIN"),
      ]),
    ).toEqual({ kind: "fallback" });
  });
});
