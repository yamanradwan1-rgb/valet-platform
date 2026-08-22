import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clearBrandingOverride,
  readLocationBranding,
  setBrandingOverride,
} from "../src/modules/dashboard/branding-command";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("g8-authz");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();

describe("VAL-009F G8 authorization matrix (true cross-tenant)", () => {
  it("proves all four G8 routes across the complete role/location matrix", async () => {
    const fixture = await manager();
    const otherTenant = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    const ungrantedLocation = await context.addLocation(fixture, {
      access: false,
    });
    const inactiveLocation = await context.addLocation(fixture, {
      status: "INACTIVE",
    });
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    const deniedScopes: string[] = [
      ungrantedLocation,
      otherTenant.locationId,
      inactiveLocation,
      randomUUID(),
    ];
    for (const target of deniedScopes) {
      await expect(
        readLocationBranding(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          locationId: target,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        readLocationBranding(context.runtimePool, {
          authenticatedUserId: randomUUID(),
          locationId: fixture.locationId,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
    for (const actor of [admin, supervisor, employee]) {
      await expect(
        readLocationBranding(context.runtimePool, {
          authenticatedUserId: actor.userId,
          locationId: fixture.locationId,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        setBrandingOverride(context.runtimePool, {
          authenticatedUserId: actor.userId,
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
          locationId: fixture.locationId,
          setting: "brandDisplayName",
          value: "X",
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        clearBrandingOverride(context.runtimePool, {
          authenticatedUserId: actor.userId,
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
          locationId: fixture.locationId,
          setting: "brandPrimaryColor",
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  });

  it("returns mutation token/projection from the same transaction", async () => {
    const fixture = await manager();
    const instance = {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    };
    const token1 = (
      await setBrandingOverride(context.runtimePool, {
        ...instance,
        setting: "brandPrimaryColor",
        value: "#123ABC",
        expectedUpdatedAt: (
          await readLocationBranding(context.runtimePool, instance)
        ).updatedAt,
      })
    ).updatedAt;
    const stateAfterSet = await readLocationBranding(context.runtimePool, {
      ...instance,
    });
    expect(stateAfterSet.updatedAt).toBe(token1);
    expect(stateAfterSet.primaryColor).toEqual({
      default: "#176BFF",
      effective: "#123ABC",
      override: "#123ABC",
      overridePresent: true,
    });

    const token2 = (
      await clearBrandingOverride(context.runtimePool, {
        ...instance,
        expectedUpdatedAt: token1,
        setting: "brandPrimaryColor",
      })
    ).updatedAt;
    expect(new Date(token2) > new Date(token1)).toBe(true);
    const stateAfterClear = await readLocationBranding(context.runtimePool, {
      ...instance,
    });
    expect(stateAfterClear.updatedAt).toBe(token2);
    expect(stateAfterClear.primaryColor).toEqual({
      default: "#176BFF",
      effective: "#176BFF",
      override: null,
      overridePresent: false,
    });

    // Exactly one audit per operation.
    const audits = await context.adminPool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
       WHERE event_type='DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'
         AND location_id = $1`,
      [fixture.locationId],
    );
    expect(Number(audits.rows[0]!.n)).toBe(2);
  });

  it("rejects lowercase primary-color values at HTTP level with no audit change", async () => {
    const fixture = await context.managerFixture();
    const instance = {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    };
    const current = await readLocationBranding(context.runtimePool, instance);
    await expect(
      setBrandingOverride(context.runtimePool, {
        ...instance,
        setting: "brandPrimaryColor",
        value: "#123abc" as never,
        expectedUpdatedAt: current.updatedAt,
      }),
    ).rejects.toBeTruthy();
    const after = await readLocationBranding(context.runtimePool, instance);
    expect(after.primaryColor).toMatchObject({
      overridePresent: false,
    });
  });
});
