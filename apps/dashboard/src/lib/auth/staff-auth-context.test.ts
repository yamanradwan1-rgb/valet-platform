import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../api/dashboard-api-error";
import { StaffAuthRefreshError } from "./staff-auth-client";
import { refreshFailureStatus } from "./staff-auth-status";

describe("refreshFailureStatus", () => {
  it("distinguishes definitive invalidation from a transient bootstrap outage", () => {
    const auth = new DashboardApiError({
      kind: "auth",
      status: 401,
      code: "STAFF_AUTHENTICATION_FAILED",
      message: "Denied",
    });
    const network = new DashboardApiError({
      kind: "network",
      code: "NETWORK_ERROR",
      message: "Offline",
    });

    expect(refreshFailureStatus(new StaffAuthRefreshError("definitive", auth))).toBe(
      "unauthenticated",
    );
    expect(refreshFailureStatus(new StaffAuthRefreshError("transient", network))).toBe(
      "refresh-unavailable",
    );
  });
});
