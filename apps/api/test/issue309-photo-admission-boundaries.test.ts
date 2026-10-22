import { describe, expect, it, vi } from "vitest";

import { DashboardSessionPhotoAdmission } from
  "../src/modules/dashboard/session-photo-admission";

describe("#309 photo-view admission exact bounds (backend QA)", () => {
  it("permits 120 view requests, rejects 121st without touching upload/status scopes", async () => {
    let counted = 0;
    const key = vi.fn((scope: string, user: string) => `${scope}:${user}`);
    const count = vi.fn(async (_key: string, limit: number) => {
      expect(limit).toBe(120);
      counted++;
      return counted <= limit
        ? { allowed: true as const }
        : { allowed: false as const, retryAfter: 31 };
    });
    const admit = new DashboardSessionPhotoAdmission({ key, count } as never);
    for (let i = 0; i < 120; i++) await expect(admit.admit("viewer"))
      .resolves.toBeUndefined();
    await expect(admit.admit("viewer")).rejects.toMatchObject({
      code: "DASHBOARD_SESSION_PHOTO_RATE_LIMITED", retryAfter: 31,
    });
    expect(count).toHaveBeenCalledTimes(121);
    expect(key).toHaveBeenCalledTimes(121);
    expect(key.mock.calls.every(([scope, user]) =>
      scope === "v1:dashboard-session-photo-view-user" && user === "viewer",
    )).toBe(true);
  });

  it("limits two leases per user and four per replica with idempotent release", () => {
    const first = new DashboardSessionPhotoAdmission({} as never);
    const a1 = first.reserve("alice");
    const a2 = first.reserve("alice");
    expect(() => first.reserve("alice")).toThrow();
    const b1 = first.reserve("bob");
    const b2 = first.reserve("bob");
    expect(() => first.reserve("carol")).toThrow();
    a1(); a1(); // duplicate socket finish + close must not double-decrement
    const c1 = first.reserve("carol");
    expect(() => first.reserve("carol")).toThrow();

    // Bounds are deliberately per replica, not an implied fleet-wide quota.
    const otherReplica = new DashboardSessionPhotoAdmission({} as never);
    const independent = otherReplica.reserve("alice");
    independent();
    a2(); b1(); b2(); c1();
    const again = first.reserve("alice");
    again();
  });

  it("returns an uninformative rate-limit code for an exhausted per-user byte slot", () => {
    const admission = new DashboardSessionPhotoAdmission({} as never);
    const release1 = admission.reserve("alice");
    const release2 = admission.reserve("alice");
    expect(() => admission.reserve("alice")).toThrowError();
    try { admission.reserve("alice"); }
    catch (error) {
      expect(error).toMatchObject({ code: "DASHBOARD_SESSION_PHOTO_RATE_LIMITED" });
      expect(JSON.stringify(error)).not.toMatch(/photoId|bucket|objectKey|sha256/i);
    }
    release1(); release2();
  });
});
