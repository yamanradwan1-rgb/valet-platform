import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";
import { createTaskQueueQuery } from "../src/modules/dispatch/task-queue-query";
import { StaffVehicleDirectoryService } from "../src/modules/staff/staff-vehicle-directory.service";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { createReportIncidentCommandExecutor } from "../src/modules/incidents/incident-reporting-command";
import {
  createIssueGuestAccessCommandExecutor,
  resolveGuestAccessWithDatabase,
} from "../src/modules/valet-sessions/guest-access-command";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";
import { RetrievalService } from "../src/modules/retrieval/retrieval.service";
import { PaymentProjectionService } from "../src/modules/payments/payment-projection.service";
import { PaymentMutationService } from "../src/modules/payments/payment-mutation.service";
import { HandoffService } from "../src/modules/retrieval/handoff.service";
import { projectManagementAuditEvent } from "../src/modules/management/management-audit-projection";

describe("completed-intake CANCELLED terminal consumers", () => {
  const ctx = new ParkingCancellationTestContext("261_consumers");
  beforeAll(() => ctx.setup(), 120_000);
  afterAll(() => ctx.teardown(), 60_000);
  it("denies every Guest consumer and issuance while retaining credentials/history", async () => {
    const { fixture, input } = await ctx.target();
    const { rawToken } = await createIssueGuestAccessCommandExecutor(
      ctx.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      valetSessionId: input.sessionId,
      intent: "ISSUE_OR_ROTATE",
    });
    const prior = await ctx.cancellationFacts(fixture);
    await ctx.cancel(input);
    const before = await ctx.cancellationFacts(fixture);
    for (const key of [
      "customer_access_token_hash",
      "customer_access_expires_at",
      "customer_access_revoked_at",
    ])
      expect(before.session[key]).toEqual(prior.session[key]);
    await expect(
      resolveGuestAccessWithDatabase(ctx.runtimePool, rawToken),
    ).rejects.toMatchObject({ code: "GUEST_ACCESS_INVALID" });
    const access = new GuestAccessService(ctx.runtimePool);
    const antiAbuse = { finalizeInTransaction: vi.fn() } as never;
    const retrieval = new RetrievalService(ctx.runtimePool, antiAbuse, access, {
      creationEnabled: false,
      employeeRetrievalRequested: false,
    } as never);
    const projection = new PaymentProjectionService(
      ctx.runtimePool,
      antiAbuse,
      access,
    );
    const payment = new PaymentMutationService(
      ctx.runtimePool,
      antiAbuse,
      access,
    );
    const handoff = new HandoffService(ctx.runtimePool, antiAbuse, access);
    const rating = new GuestRatingService(ctx.runtimePool, antiAbuse, access);
    for (const operation of [
      () => retrieval.requestGuestRetrieval({} as never, rawToken),
      () => retrieval.cancelGuestRetrieval({} as never, rawToken),
      () => projection.guest({} as never, rawToken, input.sessionId),
      () => payment.guestTip({} as never, rawToken, "1.000"),
      () =>
        handoff.issueGuestMaterial({} as never, rawToken, "PICKUP_CODE", false),
      () => rating.submit({} as never, rawToken, 5),
    ])
      await expect(operation()).rejects.toMatchObject({
        code: "GUEST_ACCESS_INVALID",
      });
    const generate = vi.fn(() => {
      throw new Error("must not generate");
    });
    await expect(
      createIssueGuestAccessCommandExecutor(ctx.runtimePool, {
        tokenBytesFactory: generate,
      })({
        authenticatedUserId: fixture.userId,
        valetSessionId: input.sessionId,
        intent: "ISSUE_OR_ROTATE",
      }),
    ).rejects.toMatchObject({ code: "GUEST_ACCESS_INTENT_CONFLICT" });
    expect(generate).not.toHaveBeenCalled();
    expect(await ctx.cancellationFacts(fixture)).toEqual(before);
  });
  it("removes active directory/queue rows, retains exact history, rejects operational Incident", async () => {
    const { fixture, input } = await ctx.target();
    const directory = new StaffVehicleDirectoryService(ctx.runtimePool);
    expect(
      (await directory.getVehicleDirectory(fixture.userId, fixture.locationId))
        .rows,
    ).toHaveLength(1);
    await ctx.cancel(input);
    expect(
      (await directory.getVehicleDirectory(fixture.userId, fixture.locationId))
        .rows,
    ).toHaveLength(0);
    expect(
      await createTaskQueueQuery(ctx.runtimePool)({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
      }),
    ).toEqual([]);
    await expect(
      createReportIncidentCommandExecutor(ctx.runtimePool)({
        authenticatedUserId: fixture.userId,
        sessionId: input.sessionId,
        incidentId: randomUUID(),
        description: "operational issue",
        severity: "LOW",
        type: "OTHER",
      }),
    ).rejects.toHaveProperty("code");
    expect((await ctx.cancellationFacts(fixture)).history).toHaveLength(1);
    const row = (
      await ctx.adminPool.query(
        `SELECT id,organization_id,location_id,valet_session_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at,created_at
      FROM audit_events WHERE valet_session_id=$1 AND event_type='VALET_SESSION_PRE_CUSTODY_CANCELLED'`,
        [input.sessionId],
      )
    ).rows[0];
    const projected = projectManagementAuditEvent(
      {
        id: row.id,
        organizationId: row.organization_id,
        locationId: row.location_id,
        valetSessionId: row.valet_session_id,
        actorMembershipId: row.actor_membership_id,
        actorType: row.actor_type,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadataJson: row.metadata_json,
        occurredAt: row.occurred_at,
        createdAt: row.created_at,
      },
      {
        locationId: fixture.locationId,
        membershipId: fixture.membershipId,
        organizationId: fixture.organizationId,
        role: "VALET_SUPERVISOR",
        scope: "LOCATION",
      },
    );
    expect(projected).toMatchObject({
      eventType: "VALET_SESSION_PRE_CUSTODY_CANCELLED",
      details: {
        kind: "SESSION",
        fromState: "AWAITING_PARKING",
        toState: "CANCELLED",
        fromVersion: 1,
        toVersion: 2,
      },
    });
    expect(JSON.stringify(projected)).not.toContain("metadataJson");
    expect(JSON.stringify(projected)).not.toContain("shiftId");
  });
  it("removes only its Task Shift blocker and keeps active Shift as an independent Location blocker", async () => {
    const { fixture, input } = await ctx.target();
    const blocked = async () =>
      (
        await ctx.adminPool.query(
          "SELECT public.management_location_has_blockers($1,$2) AS blocked",
          [fixture.organizationId, fixture.locationId],
        )
      ).rows[0].blocked;
    const end = () =>
      createEndShiftCommandExecutor(ctx.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0.000",
        shiftId: input.expectedShiftId,
      });
    await expect(end()).rejects.toMatchObject({
      code: "OPEN_TASK_HANDOFF_REQUIRED",
    });
    await ctx.cancel(input);
    expect(await blocked()).toBe(true);
    const otherSession = await ctx.addSession(fixture);
    const otherTask = await ctx.queue({ ...fixture, sessionId: otherSession });
    await ctx.adminPool.query(
      "UPDATE tasks SET status='ACCEPTED',current_assignee_membership_id=$2 WHERE id=$1",
      [otherTask.taskId, fixture.membershipId],
    );
    await expect(end()).rejects.toMatchObject({
      code: "OPEN_TASK_HANDOFF_REQUIRED",
    });
    await ctx.adminPool.query(
      "UPDATE tasks SET status='COMPLETED' WHERE id=$1",
      [otherTask.taskId],
    );
    expect((await end()).status).toBe("ENDED");
    expect(await blocked()).toBe(true); // Other AWAITING_PARKING session still independently blocks.
    await ctx.adminPool.query(
      "UPDATE valet_sessions SET state='CANCELLED' WHERE id=$1",
      [otherSession],
    );
    expect(await blocked()).toBe(false);
  });
});
