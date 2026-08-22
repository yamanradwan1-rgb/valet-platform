import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  DashboardApiTestContext,
  type DashboardStaffCredentials,
} from "./dashboard-api-test-context";
import type { ShiftFixture } from "./shift-test-context";

const context = new DashboardApiTestContext("http");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function authorizedFixture(
  role:
    | "LOCATION_MANAGER"
    | "ORG_ADMIN"
    | "VALET_SUPERVISOR"
    | "VALET_EMPLOYEE" = "LOCATION_MANAGER",
): Promise<{
  authorization: string;
  fixture: ShiftFixture;
}> {
  const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
  const { authorization, login } = await context.authenticated(fixture, role);
  expect(login.status).toBe(200);
  return { authorization, fixture };
}

async function loginOnly(
  fixture: ShiftFixture,
  role: "ORG_ADMIN" | "VALET_SUPERVISOR" | "VALET_EMPLOYEE",
): Promise<string> {
  const staff: DashboardStaffCredentials = await context.createStaff(
    fixture,
    role,
  );
  const login = await context.login(staff);
  expect(login.status).toBe(200);
  return `Bearer ${String(login.body?.accessToken)}`;
}

describe("VAL-009B dashboard configuration HTTP boundary", () => {
  it("composes read, set and clear with real staff bearer authentication", async () => {
    const { authorization, fixture } = await authorizedFixture();
    const path = context.configurationPath(fixture.locationId);
    const initial = await context.request("GET", path, { authorization });
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      currency: "JOD",
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      timezone: "Asia/Amman",
    });
    expect(initial.body?.settings).toHaveLength(10);

    const set = await context.request("PUT", `${path}/override`, {
      authorization,
      body: {
        expectedUpdatedAt: initial.body?.updatedAt,
        setting: "valetServiceFee",
        value: "4.500",
      },
    });
    expect(set.status).toBe(200);
    const setResult = (
      set.body?.result as { effective?: string; overridePresent?: boolean }
    )!;
    expect(setResult.effective).toBe("4.500");
    expect(setResult.overridePresent).toBe(true);
    expect(set.body?.updatedAt).not.toBe(initial.body?.updatedAt);

    const clear = await context.request("POST", `${path}/override/clear`, {
      authorization,
      body: {
        expectedUpdatedAt: set.body?.updatedAt,
        setting: "valetServiceFee",
      },
    });
    expect(clear.status).toBe(201);
    expect(clear.body?.result).toMatchObject({
      override: null,
      overridePresent: false,
    });

    const finalRead = await context.request("GET", path, { authorization });
    expect(finalRead.status).toBe(200);
    expect(finalRead.body?.updatedAt).toBe(clear.body?.updatedAt);
  });

  it("denies wrong-scope, non-manager, cross-tenant and ORG_ADMIN callers non-disclosingly", async () => {
    const owned = await context.createFixture({ role: "LOCATION_MANAGER" });
    const managerAuth = (await context.authenticated(owned)).authorization;
    const otherTenant = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    const admin = await context.createActor(owned, "ORG_ADMIN");
    const supervisor = await context.createActor(owned, "VALET_SUPERVISOR");
    const employee = await context.createActor(owned, "VALET_EMPLOYEE");
    expect([admin, supervisor, employee].length).toBe(3);
    const deniedAuthorization = await loginOnly(owned, "ORG_ADMIN");
    const path = context.configurationPath(owned.locationId);
    const cases = [
      async () =>
        context.request("GET", path, {
          authorization: deniedAuthorization,
        }),
      async () =>
        context.request("GET", path, { authorization: `Bearer x` }),
      async () =>
        context.request("GET", context.configurationPath(randomUUID()), {
          authorization: managerAuth,
        }),
      async () =>
        context.request(
          "GET",
          context.configurationPath(otherTenant.locationId),
          { authorization: managerAuth },
        ),
      async () =>
        context.request("PUT", `${path}/override`, {
          authorization: deniedAuthorization,
          body: {
            expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
            setting: "tipsEnabled",
            value: true,
          },
        }),
      async () =>
        context.request("POST", `${path}/override/clear`, {
          authorization: deniedAuthorization,
          body: {
            expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
            setting: "tipsEnabled",
          },
        }),
    ];
    for (const attempt of cases) {
      const result = await attempt();
      expect([401, 404]).toContain(result.status);
    }
    const supervisorAuth = await loginOnly(owned, "VALET_SUPERVISOR");
    const supervisorResult = await context.request("PUT", `${path}/override`, {
      authorization: supervisorAuth,
      body: {
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        setting: "tipsEnabled",
        value: true,
      },
    });
    expect(supervisorResult.status).toBe(404);
    expect(supervisorResult.body?.code).toBe("AUTHORIZATION_DENIED");
  });

  it("rejects malformed bodies with REQUEST_INVALID and no mutation", async () => {
    const { authorization, fixture } = await authorizedFixture();
    const path = context.configurationPath(fixture.locationId);
    const before = await context.request("GET", path, { authorization });
    const malformed = [
      { body: { setting: "tipsEnabled", value: true }, method: "PUT" },
      {
        body: {
          expectedUpdatedAt: "not-a-date",
          setting: "tipsEnabled",
          value: true,
        },
        method: "PUT",
      },
      {
        body: {
          expectedUpdatedAt: before.body?.updatedAt,
          setting: "unknownSetting",
          value: true,
        },
        method: "PUT",
      },
      { body: { expectedUpdatedAt: before.body?.updatedAt }, method: "POST" },
    ] as const;
    for (const testCase of malformed) {
      const suffix = testCase.method === "PUT" ? "/override" : "/override/clear";
      const result = await context.request(testCase.method, `${path}${suffix}`, {
        authorization,
        body: testCase.body,
      });
      expect(result.status).toBe(400);
      expect(result.body?.code).toBe("REQUEST_INVALID");
    }
    const after = await context.request("GET", path, { authorization });
    expect(after.body?.settings).toEqual(before.body?.settings);
    expect(after.body?.updatedAt).toBe(before.body?.updatedAt);
  });

  it("exposes no Company-default write route", async () => {
    const { authorization, fixture } = await authorizedFixture();
    const attempts = [
      ["PATCH", `/v1/staff/dashboard/organizations/${fixture.organizationId}/configuration`],
      ["PUT", `/v1/staff/dashboard/configuration/company-default`],
      ["POST", `/v1/staff/dashboard/locations/${fixture.locationId}/configuration/company-default`],
    ] as const;
    for (const [method, candidate] of attempts) {
      const result = await context.request(method, candidate, {
        authorization,
        body: {},
      });
      expect(result.status).toBe(404);
    }
  });
});
