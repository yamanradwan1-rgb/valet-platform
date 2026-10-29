import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  listDashboardTasks,
  listRetrievalQueue,
} from "../src/modules/dashboard/overview-retrieval-tasks-query";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("supervisor_tasks");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue #352 real PostgreSQL Supervisor Tasks read boundary", () => {
  it("lists only the exact Location's active Parking Task for an eligible Supervisor", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: initiator.userId,
      staffSessionContext: await context.credential(initiator.userId),
      locationId: source.locationId,
      limit: 50,
    });
    expect(result.items.map((item) => item.taskId)).toContain(source.taskId);
    expect(
      result.items.every(
        (item) =>
          item.status === "IN_PROGRESS" &&
          (item.taskType === "PARKING" || item.taskType === "RETRIEVAL"),
      ),
    ).toBe(true);
  });

  it("lists an active Retrieval Task using the same narrow read authority", async () => {
    const source = await context.retrieving();
    const { initiator } = await context.actors(source);
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: initiator.userId,
      staffSessionContext: await context.credential(initiator.userId),
      locationId: source.locationId,
      limit: 50,
    });
    expect(result.items.map((item) => item.taskId)).toContain(
      source.retrievalTaskId,
    );
  });

  it("keeps the pre-existing Retrieval Queue management read denied", async () => {
    const source = await context.retrieving();
    const { initiator } = await context.actors(source);
    await expect(
      listRetrievalQueue(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: await context.credential(initiator.userId),
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("hides a foreign Organization's Tasks from an eligible Supervisor", async () => {
    const source = await context.parking();
    const other = await context.createDispatchFixture({
      role: "VALET_SUPERVISOR",
    });
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: other.userId,
        staffSessionContext: await context.credential(other.userId),
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies a different Location even with the same Organization membership", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const otherLocationId = await context.addLocation(source);
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: await context.credential(initiator.userId),
        locationId: otherLocationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("does not grant the Tasks read to VALET_EMPLOYEE or LOCATION_MANAGER", async () => {
    const source = await context.parking();
    for (const role of ["VALET_EMPLOYEE", "LOCATION_MANAGER"] as const) {
      const actor = await context.addMember(
        source,
        role,
        role === "VALET_EMPLOYEE",
      );
      await expect(
        listDashboardTasks(context.runtimePool, {
          authenticatedUserId: actor.userId,
          staffSessionContext: await context.credential(actor.userId),
          locationId: source.locationId,
          limit: 50,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  });

  it("preserves the existing entitled Location Manager Tasks read", async () => {
    const source = await context.parking();
    const manager = await context.addMember(source, "LOCATION_MANAGER", false);
    await context.adminPool.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled = TRUE WHERE organization_id = $1`,
      [source.organizationId],
    );
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: manager.userId,
      locationId: source.locationId,
      limit: 50,
    });
    expect(result.items.map((item) => item.taskId)).toContain(source.taskId);
  });

  it("preserves the entitled Company Admin Tasks read with fresh MFA", async () => {
    const source = await context.parking();
    const { admin } = await context.actors(source);
    await context.adminPool.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled = TRUE WHERE organization_id = $1`,
      [source.organizationId],
    );
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: admin.userId,
      staffSessionContext: await context.credential(admin.userId, true),
      locationId: source.locationId,
      limit: 50,
    });
    expect(result.items.map((item) => item.taskId)).toContain(source.taskId);
  });

  it("denies a revoked explicit Location grant", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [initiator.membershipId, source.locationId],
    );
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: await context.credential(initiator.userId),
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies a Supervisor after its Shift ends", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp()
       WHERE membership_id = $1 AND location_id = $2`,
      [initiator.membershipId, source.locationId],
    );
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: await context.credential(initiator.userId),
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies a disabled User or inactive Location", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const credential = await context.credential(initiator.userId);
    await context.adminPool.query(
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      [initiator.userId],
    );
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: credential,
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await context.adminPool.query(
      `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
      [initiator.userId],
    );
    await context.adminPool.query(
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      [source.locationId],
    );
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: credential,
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies absent or revoked Staff session proof", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const credential = await context.credential(initiator.userId);
    await context.adminPool.query(
      `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp()
       WHERE id = $1`,
      [credential.staffAuthSessionId],
    );
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: credential,
        locationId: source.locationId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("omits lifecycle-ineligible Task rows without changing other reads", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    await context.adminPool.query(
      `UPDATE tasks SET status = 'COMPLETED' WHERE id = $1`,
      [source.taskId],
    );
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: initiator.userId,
      staffSessionContext: await context.credential(initiator.userId),
      locationId: source.locationId,
      limit: 50,
    });
    expect(result.items.map((item) => item.taskId)).not.toContain(
      source.taskId,
    );
  });
});
