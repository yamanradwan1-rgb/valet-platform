import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";

class DashboardApiMatrixTestContext extends DashboardApiTestContext {}

const context = new DashboardApiMatrixTestContext("matrix");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

describe("VAL-009F G8 complete HTTP authorization matrix", () => {
  it(
    "proves all four surfaces across every role and location scope",
    async () => {
      const fixture = await context.managerFixture();
      await context.adminPool.query(
        `UPDATE organizations SET name = 'Matrix tenant' WHERE id = $1`,
        [fixture.organizationId],
      );
      const ungrantedLocation = await context.addLocation(fixture, {
        access: false,
      });
      const inactiveLocation = await context.addLocation(fixture, {
        status: "INACTIVE",
      });
      const crossTenantFixture = await context.createFixture({
        role: "LOCATION_MANAGER",
      });
      const staffBearers: Record<string, string> = {};
      for (const role of [
        "ORG_ADMIN",
        "VALET_SUPERVISOR",
        "VALET_EMPLOYEE",
      ] as const) {
        const staff = await context.createStaff(fixture, role);
        const login = await context.login(staff);
        expect(login.status).toBe(200);
        staffBearers[role] =
          `Bearer ${String(login.body?.accessToken)}`;
      }
      const managerBearer = (
        await context.authenticated(fixture)
      ).authorization;
      const base = (locationId: string) =>
        `/v1/staff/dashboard/locations/${locationId}`;

      // Authorized manager succeeds without Shift on all four routes.
      const brandingGet = await context.request(
        "GET",
        `${base(fixture.locationId)}/branding`,
        { authorization: managerBearer },
      );
      expect(brandingGet.status).toBe(200);
      const currentToken = brandingGet.body?.updatedAt;
      const subscriptionGet = await context.request(
        "GET",
        `${base(fixture.locationId)}/subscription`,
        { authorization: managerBearer },
      );
      expect(subscriptionGet.status).toBe(200);

      const putRoute = {
        method: "PUT" as const,
        path: "/branding/override",
        body: {
          expectedUpdatedAt: currentToken,
          setting: "brandDisplayName" as const,
          value: "Matrix Test",
        },
      };
      const clearRoute = {
        method: "POST" as const,
        path: "/branding/override/clear",
        body: {
          expectedUpdatedAt: currentToken,
          setting: "brandPrimaryColor" as const,
        },
      };
      // Manager PUT succeeds.
      const putResult = await context.request(
        "PUT",
        `${base(fixture.locationId)}${putRoute.path}`,
        { authorization: managerBearer, body: putRoute.body },
      );
      expect(putResult.status).toBe(200);
      // Manager CLEAR succeeds (using fresh token from PUT response).
      const clearBody = {
        ...clearRoute.body,
        expectedUpdatedAt: putResult.body?.updatedAt,
      };
      const clearResult = await context.request(
        "POST",
        `${base(fixture.locationId)}${clearRoute.path}`,
        { authorization: managerBearer, body: clearBody },
      );
      expect(clearResult.status).toBe(201);

      // Role denials on the authorized Location (syntactically valid bodies).
      for (const role of [
        "ORG_ADMIN",
        "VALET_SUPERVISOR",
        "VALET_EMPLOYEE",
      ]) {
        const dailyDenied = await context.request(
          "GET",
          `${base(fixture.locationId)}/branding`,
          { authorization: staffBearers[role]! },
        );
        expect(dailyDenied.status, `${role} GET branding`).toBe(404);
        const putDenied = await context.request(
          "PUT",
          `${base(fixture.locationId)}/branding/override`,
          { authorization: staffBearers[role]!, body: putRoute.body },
        );
        expect(putDenied.status, `${role} PUT`).toBe(404);
        const clearDenied = await context.request(
          "POST",
          `${base(fixture.locationId)}/branding/override/clear`,
          { authorization: staffBearers[role]!, body: clearRoute.body },
        );
        expect(clearDenied.status, `${role} CLEAR`).toBe(404);
        const subDenied = await context.request(
          "GET",
          `${base(fixture.locationId)}/subscription`,
          { authorization: staffBearers[role]! },
        );
        expect(subDenied.status, `${role} subscription`).toBe(404);
      }

      // Location-scope denials using the authorized manager.
      // All four surfaces exercised per denied target scope.
      const deniedProbeBody = {
        setting: "brandDisplayName" as const,
        value: "Denied Matrix Probe",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      };
      const deniedClearBody = {
        setting: "brandPrimaryColor" as const,
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      };
      for (const target of [
        ungrantedLocation,
        crossTenantFixture.locationId,
        randomUUID(),
        inactiveLocation,
      ]) {
        const getDenied = await context.request(
          "GET",
          `${base(target)}/branding`,
          { authorization: managerBearer },
        );
        expect(getDenied.status, `target ${target} GET branding`).toBe(404);
        const putDenied = await context.request(
          "PUT",
          `${base(target)}/branding/override`,
          { authorization: managerBearer, body: deniedProbeBody },
        );
        expect(putDenied.status, `target ${target} PUT`).toBe(404);
        const clearDenied = await context.request(
          "POST",
          `${base(target)}/branding/override/clear`,
          { authorization: managerBearer, body: deniedClearBody },
        );
        expect(clearDenied.status, `target ${target} CLEAR`).toBe(404);
        const subDenied = await context.request(
          "GET",
          `${base(target)}/subscription`,
          { authorization: managerBearer },
        );
        expect(subDenied.status, `target ${target} SUB`).toBe(404);
      }

      // Unauthenticated all four => 401.
      const unauthorizedRoutes = [
        { method: "GET", path: "/branding" },
        { method: "PUT", path: "/branding/override", body: putRoute.body },
        { method: "POST", path: "/branding/override/clear", body: clearRoute.body },
        { method: "GET", path: "/subscription" },
      ];
      for (const r of unauthorizedRoutes) {
        const result = await context.request(r.method, `${base(fixture.locationId)}${r.path}`, {
          ...(r.body === undefined ? {} : { body: r.body }),
        });
        expect(result.status).toBe(401);
      }
    },
    60_000,
  );
});
