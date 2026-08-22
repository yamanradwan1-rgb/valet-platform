import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DashboardOverviewError } from "../src/modules/dashboard/dashboard-overview-error";
import {
  dashboardSessionStateCounts,
  listDashboardSessions,
} from "../src/modules/dashboard/overview-sessions-query";
import {
  listActiveShifts,
  listKeyAccountability,
  listOpenIncidents,
} from "../src/modules/dashboard/overview-shifts-keys-incidents-query";
import {
  listDashboardTasks,
  listRetrievalQueue,
} from "../src/modules/dashboard/overview-retrieval-tasks-query";
import { financialOperationalOverview } from "../src/modules/dashboard/overview-financial-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("authz");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-009C overview authorization", () => {
  it("denies every non-manager path uniformly across all eight routes", async () => {
    const fixture = await context.managerFixture();
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    const ungrantedLocation = await context.addLocation(fixture, {
      access: false,
    });
    const locationId = fixture.locationId;
    const attempts: Array<() => Promise<unknown>> = [
      () =>
        listDashboardSessions(context.runtimePool, {
          authenticatedUserId: admin.userId,
          limit: 5,
          locationId,
        }),
      () =>
        listDashboardSessions(context.runtimePool, {
          authenticatedUserId: supervisor.userId,
          limit: 5,
          locationId,
        }),
      () =>
        listDashboardSessions(context.runtimePool, {
          authenticatedUserId: managerId(),
          limit: 5,
          locationId: ungrantedLocation,
        }),
      () =>
        dashboardSessionStateCounts(context.runtimePool, {
          authenticatedUserId: employee.userId,
          locationId,
        }),
      () =>
        listRetrievalQueue(context.runtimePool, {
          authenticatedUserId: managerId(),
          limit: 5,
          locationId: randomUUID(),
        }),
      () =>
        listDashboardTasks(context.runtimePool, {
          authenticatedUserId: supervisor.userId,
          limit: 5,
          locationId: ungrantedLocation,
        }),
      () =>
        listDashboardTasks(context.runtimePool, {
          authenticatedUserId: managerId(),
          limit: 5,
          locationId: randomUUID(),
        }),
      () =>
        listActiveShifts(context.runtimePool, {
          authenticatedUserId: randomUUID(),
          limit: 5,
          locationId,
        }),
      () =>
        listKeyAccountability(context.runtimePool, {
          authenticatedUserId: managerId(),
          limit: 5,
          locationId: ungrantedLocation,
        }),
      () =>
        listOpenIncidents(context.runtimePool, {
          authenticatedUserId: admin.userId,
          limit: 5,
          locationId,
        }),
      () =>
        financialOperationalOverview(context.runtimePool, {
          authenticatedUserId: employee.userId,
          locationId: ungrantedLocation,
        }),
    ];
    function managerId(): string {
      return fixture.userId;
    }
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(DashboardOverviewError);
      await expect(attempt()).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    }
  });

  it("requires no Shift for the authorized Location Manager on every route", async () => {
    const fixture = await context.managerFixture();
    const locationId = fixture.locationId;
    expect(
      (
        await listDashboardSessions(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          limit: 5,
          locationId,
        })
      ).nextCursor === null,
    ).toBe(true);
    expect(
      (
        await dashboardSessionStateCounts(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          locationId,
        })
      ).counts,
    ).toHaveLength(9);
    expect(
      (
        await listRetrievalQueue(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          limit: 5,
          locationId,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await listDashboardTasks(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          limit: 5,
          locationId,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await listActiveShifts(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          limit: 5,
          locationId,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await listKeyAccountability(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          limit: 5,
          locationId,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await listOpenIncidents(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          limit: 5,
          locationId,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await financialOperationalOverview(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          locationId,
        })
      ).currencies,
    ).toEqual([]);
  });
});
