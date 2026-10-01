import { describe, expect, it } from "vitest";
import { CircleHelp } from "lucide-react";

import type { DashboardNavigationItem } from "../../lib/navigation";
import {
  allowsAllLocationsForPath,
  canOfferLocationForPath,
  isCurrentPathAuthorized,
  navigationForLocationStatus,
  safeLocationSwitchLanding,
} from "./location-switch-policy";

describe("topbar Location switch route policy", () => {
  it("allows All Locations only on routes whose registered scope is not exact-Location", () => {
    expect(
      allowsAllLocationsForPath("/overview", "MANAGEMENT_INTELLIGENCE"),
    ).toBe(true);
    expect(allowsAllLocationsForPath("/employees", "DASHBOARD")).toBe(true);
    expect(allowsAllLocationsForPath("/help", "FOUNDATION_ENTRY")).toBe(true);
    expect(allowsAllLocationsForPath("/live-operations", "DASHBOARD")).toBe(
      false,
    );
    expect(allowsAllLocationsForPath("/maps-zones", "LOCATION_MAPS")).toBe(
      false,
    );
  });

  it("uses current navigation metadata for nested routes", () => {
    expect(allowsAllLocationsForPath("/vehicles/detail", "DASHBOARD")).toBe(
      false,
    );
  });

  it("rejects inactive Locations on exact operational routes", () => {
    const inactive = {
      code: "HIST",
      currency: "JOD",
      locationId: "11111111-1111-4111-8111-111111111111",
      name: "Historic",
      status: "INACTIVE" as const,
      timezone: "Asia/Amman",
    };
    expect(
      canOfferLocationForPath(
        "/vehicles",
        "DASHBOARD",
        "COMPANY_ADMIN",
        inactive,
      ),
    ).toBe(false);
    expect(
      canOfferLocationForPath(
        "/audit-log",
        "MANAGEMENT_AUDIT",
        "COMPANY_ADMIN",
        inactive,
      ),
    ).toBe(true);
    expect(
      canOfferLocationForPath("/keys", "DASHBOARD", "COMPANY_ADMIN", inactive),
    ).toBe(true);
    expect(
      canOfferLocationForPath(
        "/keys",
        "DASHBOARD",
        "LOCATION_MANAGER",
        inactive,
      ),
    ).toBe(false);
  });

  it("preserves an authorized current route and otherwise chooses the existing landing order", () => {
    const navigation = [
      item("overview", "/overview", "MAIN"),
      item("help", "/help", "UTILITY"),
    ];
    expect(isCurrentPathAuthorized("/overview", navigation)).toBe(true);
    expect(isCurrentPathAuthorized("/vehicles", navigation)).toBe(false);
    expect(safeLocationSwitchLanding(navigation)).toBe("/overview");
    expect(safeLocationSwitchLanding([item("help", "/help", "UTILITY")])).toBe(
      "/help",
    );
    expect(safeLocationSwitchLanding([])).toBeNull();
  });

  it("removes exact-Location destinations from inactive canonical navigation", () => {
    const navigation = [
      item("overview", "/overview", "MAIN"),
      item("vehicles", "/vehicles", "MAIN"),
      item("keys", "/keys", "MAIN"),
      item("help", "/help", "UTILITY"),
    ];
    expect(
      navigationForLocationStatus(navigation, "INACTIVE", true).map(
        (entry) => entry.href,
      ),
    ).toEqual(["/overview", "/keys", "/help"]);
    expect(
      navigationForLocationStatus(navigation, "INACTIVE", false).map(
        (entry) => entry.href,
      ),
    ).toEqual(["/overview", "/help"]);
  });
});

function item(
  id: string,
  href: string,
  placement: DashboardNavigationItem["placement"],
): DashboardNavigationItem {
  return { href, icon: CircleHelp, id, label: id, owner: "MD-01", placement };
}
