import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { incidentOverviewEntrySchema } from "@valet/contracts";
import { listOpenIncidents } from "../src/modules/dashboard/overview-shifts-keys-incidents-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("incident_reporter");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("#306 original Incident reporter identity", () => {
  it("resolves the persisted original reporter, independent of current assignee, Shift and employment status", async () => {
    const manager = await context.managerFixture();
    const reporter = await context.createActor(manager, "VALET_EMPLOYEE");
    const assignee = await context.createActor(manager, "VALET_EMPLOYEE");
    await context.adminPool.query(
      `UPDATE organization_memberships SET first_name=$2, last_name=$3
       WHERE id=$1`,
      [reporter.membershipId, "ليلى", "الخطيب"],
    );
    await context.adminPool.query(
      `UPDATE organization_memberships SET first_name='Another', last_name='Worker'
       WHERE id=$1`,
      [assignee.membershipId],
    );
    const sessionId = await context.seedSession({
      state: "PARKED",
      currentAssigneeMembershipId: assignee.membershipId,
    });
    const incidentId = await context.seedIncident({
      sessionId,
      status: "OPEN",
      reporterMembershipId: reporter.membershipId,
    });
    const read = () => listOpenIncidents(context.runtimePool, {
      authenticatedUserId: manager.userId,
      limit: 5,
      locationId: manager.locationId,
    });
    const initial = (await read()).items.find((entry) => entry.incidentId === incidentId);
    expect(initial?.reporterDisplayName).toBe("ليلى الخطيب");
    expect(incidentOverviewEntrySchema.safeParse(initial).success).toBe(true);
    expect(Object.keys(initial ?? {})).not.toContain("reportedByMembershipId");

    await context.adminPool.query(
      `UPDATE organization_memberships SET status='INACTIVE'
       WHERE id=$1`,
      [reporter.membershipId],
    );
    await context.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [reporter.membershipId],
    );
    await context.adminPool.query(
      `UPDATE users SET status='DISABLED' WHERE id=$1`,
      [reporter.userId],
    );
    expect((await read()).items.find((entry) => entry.incidentId === incidentId)?.reporterDisplayName)
      .toBe("ليلى الخطيب");

    await context.adminPool.query(
      `UPDATE organization_memberships SET last_name=NULL WHERE id=$1`,
      [reporter.membershipId],
    );
    expect((await read()).items.find((entry) => entry.incidentId === incidentId)?.reporterDisplayName)
      .toBeNull();
  });

  it("enforces current viewer exact Location scope and emits no extra identity fields", async () => {
    const manager = await context.managerFixture();
    const secondLocation = await context.addLocation(manager);
    const ungrantedLocation = await context.addLocation(manager, { access: false });
    const otherOrganization = await context.createFixture({ role: "LOCATION_MANAGER" });
    const supervisor = await context.createActor(manager, "VALET_SUPERVISOR");
    const page = await listOpenIncidents(context.runtimePool, {
      authenticatedUserId: manager.userId,
      limit: 10,
      locationId: secondLocation,
    });
    expect(page.items).toEqual([]);
    for (const forbiddenLocation of [ungrantedLocation, otherOrganization.locationId]) {
      await expect(listOpenIncidents(context.runtimePool, {
        authenticatedUserId: manager.userId,
        limit: 10,
        locationId: forbiddenLocation,
      })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
    const unauthorized = await context.createActor(manager, "VALET_EMPLOYEE");
    for (const actor of [unauthorized, supervisor]) {
      await expect(listOpenIncidents(context.runtimePool, {
        authenticatedUserId: actor.userId,
        limit: 10,
        locationId: manager.locationId,
      })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
    const incident = (await listOpenIncidents(context.runtimePool, {
      authenticatedUserId: manager.userId,
      limit: 10,
      locationId: manager.locationId,
    })).items[0];
    expect(incidentOverviewEntrySchema.safeParse({
      ...incident,
      membershipId: unauthorized.membershipId,
    }).success).toBe(false);

    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id=$1 AND location_id=$2`,
      [manager.membershipId, manager.locationId],
    );
    await expect(listOpenIncidents(context.runtimePool, {
      authenticatedUserId: manager.userId,
      limit: 10,
      locationId: manager.locationId,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("keeps LIMIT+1 cursor cardinality and reporter attribution stable", async () => {
    const manager = await context.managerFixture();
    await context.grantAccess(manager, manager.membershipId);
    const sessionId = await context.seedSession({ state: "PARKED" });
    await context.seedIncident({ sessionId, status: "OPEN" });
    const first = await listOpenIncidents(context.runtimePool, {
      authenticatedUserId: manager.userId,
      limit: 1,
      locationId: manager.locationId,
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await listOpenIncidents(context.runtimePool, {
      authenticatedUserId: manager.userId,
      ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
      limit: 1,
      locationId: manager.locationId,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.items[0]?.incidentId).not.toBe(first.items[0]?.incidentId);
  });
});
