import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  sessionOverviewListResponseSchema,
  retrievalQueueOverviewResponseSchema,
  taskOverviewListResponseSchema,
} from "@valet/contracts";
import { seedIssue241Overview } from "./issue241-overview-fixture";
import { DashboardApiTestContext } from "./dashboard-api-test-context";

const context = new DashboardApiTestContext("issue241");
beforeAll(() => context.setupApi(), 120_000);
afterAll(() => context.teardownApi(), 60_000);

describe("#241 authorized operational projection", () => {
  it("filters before limit, binds cursors, and projects active Task identity and physical facts", async () => {
    const {
      fixture,
      staff,
      sessionId,
      secondId,
      checkingId,
      keySlotId,
      zoneId,
      spotId,
      taskId,
      terminalRetrieval,
    } = await seedIssue241Overview(context);
    const manager = await context.createStaff(fixture, "LOCATION_MANAGER");
    const login = await context.login(manager);
    const authorization = `Bearer ${String(login.body?.accessToken)}`;
    expect(login.status).toBe(200);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}/overview`;
    const read = (query: string) =>
      context.request("GET", `${base}/sessions?${query}`, { authorization });
    const first = await read("filter=PARKED&limit=1");
    expect(first.status).toBe(200);
    const page1 = sessionOverviewListResponseSchema.parse(first.body);
    expect(page1.items.map((item) => item.sessionId)).toEqual([secondId]);
    expect(page1.items[0]!.activeTask).toBeNull();
    expect(page1.nextCursor).not.toBeNull();
    const second = await read(
      `filter=PARKED&limit=1&cursor=${page1.nextCursor}`,
    );
    expect(second.status).toBe(200);
    const page2 = sessionOverviewListResponseSchema.parse(second.body);
    expect(page2.items.map((item) => item.sessionId)).toEqual([sessionId]);
    expect(page2.nextCursor).toBeNull();
    const projected = page2.items[0]!;
    expect(projected.activeTask).toEqual({
      taskId,
      assignee: {
        membershipId: staff.membershipId,
        identity: { firstName: "Lina", lastName: "Haddad", email: staff.email },
      },
    });
    expect(projected.currentAssigneeMembershipId).toBe(fixture.membershipId);
    expect(projected.vehicle).toMatchObject({
      make: "Toyota",
      model: "Camry",
      color: "Black",
      plateCountry: "JO",
      temporaryDescriptor: null,
    });
    expect(projected.vehicle.plateNumberNormalized).not.toBeNull();
    expect(projected.keySlot).toEqual({
      resourceId: keySlotId,
      code: "K-12",
      label: null,
    });
    expect(projected.parkingSpot).toEqual({
      resourceId: spotId,
      code: "P-4",
      label: "North",
    });
    expect(projected.parkingZone).toEqual({
      resourceId: zoneId,
      code: "Z-1",
      label: "Garage",
    });
    const checkIn = await read("filter=CHECK_IN&limit=1");
    expect(
      sessionOverviewListResponseSchema
        .parse(checkIn.body)
        .items.map((item) => item.sessionId),
    ).toEqual([checkingId]);
    const all = await read("filter=ALL");
    expect(
      sessionOverviewListResponseSchema.parse(all.body).items,
    ).toHaveLength(3);
    expect((await read(`filter=ALL&cursor=${page1.nextCursor}`)).status).toBe(
      400,
    );
    const otherLocation = await context.addLocation(fixture, { access: false });
    await context.grantAccess(fixture, manager.membershipId, otherLocation);
    expect(
      (
        await context.request(
          "GET",
          `/v1/staff/dashboard/locations/${otherLocation}/overview/sessions?filter=PARKED&cursor=${page1.nextCursor}`,
          { authorization },
        )
      ).status,
    ).toBe(400);
    const decoded = JSON.parse(
      Buffer.from(page1.nextCursor!, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    for (const patch of [
      { v: 1 },
      { d: "tasks" },
      { organizationId: randomUUID() },
      { locationId: otherLocation },
    ]) {
      const cursor = Buffer.from(
        JSON.stringify({ ...decoded, ...patch }),
      ).toString("base64url");
      expect((await read(`filter=PARKED&cursor=${cursor}`)).status).toBe(400);
    }
    const queue = await context.request("GET", `${base}/retrieval-queue`, {
      authorization,
    });
    expect(queue.status).toBe(200);
    const queueItems = retrievalQueueOverviewResponseSchema.parse(
      queue.body,
    ).items;
    expect(
      queueItems.find((item) => item.valetSessionId === sessionId)!.task!
        .assignee,
    ).toEqual(projected.activeTask!.assignee);
    expect(
      queueItems.find((item) => item.valetSessionId === secondId)!.task,
    ).toBeNull();
    const tasks = taskOverviewListResponseSchema.parse(
      (await context.request("GET", `${base}/tasks`, { authorization })).body,
    ).items;
    expect(
      tasks.find((item) => item.taskId === terminalRetrieval)!.assignee,
    ).toBeNull();
    expect(tasks.find((item) => item.taskId === taskId)!.assignee).toEqual(
      projected.activeTask!.assignee,
    );
    await context.adminPool.query(
      "UPDATE tasks SET status='QUEUED', current_assignee_membership_id=NULL WHERE id=$1",
      [taskId],
    );
    const queued = sessionOverviewListResponseSchema
      .parse((await read("filter=PARKED")).body)
      .items.find((item) => item.sessionId === sessionId)!;
    expect(queued.activeTask).toEqual({ taskId, assignee: null });
    await context.adminPool.query(
      "UPDATE tasks SET status='CANCELLED' WHERE id=$1",
      [taskId],
    );
    expect(
      sessionOverviewListResponseSchema
        .parse((await read("filter=PARKED")).body)
        .items.find((item) => item.sessionId === sessionId)!.activeTask,
    ).toBeNull();
  });

  it("keeps employee/supervisor, ungranted, inactive and foreign tenant reads denied", async () => {
    await context.clearAntiAbuse();
    const fixture = await context.managerFixture();
    for (const role of ["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const) {
      const { authorization } = await context.authenticated(fixture, role);
      const result = await context.request(
        "GET",
        `/v1/staff/dashboard/locations/${fixture.locationId}/overview/sessions`,
        { authorization },
      );
      expect(result.status).toBe(404);
    }
    const manager = await context.createStaff(fixture, "LOCATION_MANAGER");
    const login = await context.login(manager);
    const authorization = `Bearer ${String(login.body?.accessToken)}`;
    const ungranted = await context.addLocation(fixture, { access: false });
    const inactive = await context.addLocation(fixture, {
      access: false,
      status: "INACTIVE",
    });
    await context.grantAccess(fixture, manager.membershipId, inactive);
    const foreign = await context.createFixture();
    for (const locationId of [ungranted, inactive, foreign.locationId]) {
      expect(
        (
          await context.request(
            "GET",
            `/v1/staff/dashboard/locations/${locationId}/overview/sessions`,
            { authorization },
          )
        ).status,
      ).toBe(404);
    }
    await context.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [manager.membershipId],
    );
    expect(
      (
        await context.request(
          "GET",
          `/v1/staff/dashboard/locations/${fixture.locationId}/overview/sessions`,
          { authorization },
        )
      ).status,
    ).toBe(404);
    await context.grantAccess(fixture, manager.membershipId);
    await context.adminPool.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
      [fixture.organizationId],
    );
    expect(
      (
        await context.request(
          "GET",
          `/v1/staff/dashboard/locations/${fixture.locationId}/overview/sessions`,
          { authorization },
        )
      ).status,
    ).toBe(404);
  });
});
