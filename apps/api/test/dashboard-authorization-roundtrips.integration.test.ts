import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authorizeDashboardLocation } from "../src/modules/dashboard/dashboard-location-authorization";
import type { ManagementCommercialRequirement } from "../src/modules/management/management-commercial-access-policy";
import { DashboardTestContext } from "./dashboard-test-context";

const context = new DashboardTestContext("authorization_roundtrips");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Dashboard authorization preserves entitlement proof in one round trip", () => {
  it("reads the authorized scope and its current subscription in one SQL statement", async () => {
    const actor = await context.createFixture({ role: "LOCATION_MANAGER" });
    const client = await context.runtimePool.connect();
    const query = vi.spyOn(client, "query");
    try {
      expect(
        await authorizeDashboardLocation(
          client,
          actor.userId,
          actor.locationId,
        ),
      ).toEqual({
        organizationId: actor.organizationId,
        locationId: actor.locationId,
        membershipId: actor.membershipId,
      });
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      query.mockRestore();
      client.release();
    }
  });
  it("preserves the complete typed entitlement matrix without using status or plan labels", async () => {
    const actor = await context.createFixture({ role: "LOCATION_MANAGER" });
    const client = await context.runtimePool.connect();
    try {
      const requirements: ManagementCommercialRequirement[] = [
        "DASHBOARD_ACCESS",
        "REPORT_EXPORTS",
        "BASIC_BRANDING",
      ];
      for (let bits = 0; bits < 8; bits += 1) {
        const dashboard = Boolean(bits & 1),
          exports = Boolean(bits & 2),
          branding = Boolean(bits & 4);
        await context.adminPool.query(
          `UPDATE organization_subscriptions SET
          dashboard_access_enabled=$2, report_exports_enabled=$3, basic_branding_enabled=$4,
          status='SUSPENDED', plan_code='OPAQUE_PLAN' WHERE organization_id=$1`,
          [actor.organizationId, dashboard, exports, branding],
        );
        for (const [index, requirement] of requirements.entries()) {
          const expected = dashboard && [true, exports, branding][index];
          const scope = await authorizeDashboardLocation(
            client,
            actor.userId,
            actor.locationId,
            requirement,
          );
          expect(scope !== null).toBe(expected);
          if (scope)
            expect(Object.keys(scope).sort()).toEqual([
              "locationId",
              "membershipId",
              "organizationId",
            ]);
        }
        expect(
          await authorizeDashboardLocation(
            client,
            actor.userId,
            actor.locationId,
            null,
          ),
        ).not.toBeNull();
      }
    } finally {
      client.release();
    }
  });

  it("fails closed on a missing own subscription and never borrows a foreign tenant's entitlement", async () => {
    const actor = await context.createFixture({ role: "LOCATION_MANAGER" });
    const foreign = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.adminPool.query(
      "DELETE FROM organization_subscriptions WHERE organization_id=$1",
      [actor.organizationId],
    );
    const client = await context.runtimePool.connect();
    try {
      for (const requirement of [
        "DASHBOARD_ACCESS",
        "REPORT_EXPORTS",
        "BASIC_BRANDING",
      ] as const)
        expect(
          await authorizeDashboardLocation(
            client,
            actor.userId,
            actor.locationId,
            requirement,
          ),
        ).toBeNull();
      expect(
        await authorizeDashboardLocation(
          client,
          actor.userId,
          actor.locationId,
          null,
        ),
      ).not.toBeNull();
      expect(
        await authorizeDashboardLocation(
          client,
          actor.userId,
          foreign.locationId,
          null,
        ),
      ).toBeNull();
    } finally {
      client.release();
    }
  });
  it("keeps ungated reads independent of subscription SELECT privileges", async () => {
    const actor = await context.createFixture({ role: "LOCATION_MANAGER" });
    const client = await context.runtimePool.connect();
    try {
      await context.adminPool.query(
        `REVOKE SELECT ON organization_subscriptions FROM "${context.runtimeRole}"`,
      );
      expect(
        await authorizeDashboardLocation(
          client,
          actor.userId,
          actor.locationId,
          null,
        ),
      ).not.toBeNull();
      await expect(
        authorizeDashboardLocation(client, actor.userId, actor.locationId),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release(true);
      await context.adminPool.query(
        `GRANT SELECT ON organization_subscriptions TO "${context.runtimeRole}"`,
      );
    }
  });
});
