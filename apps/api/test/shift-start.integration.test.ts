import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  expectShiftError,
  ShiftTestContext,
  type ShiftFixtureOptions,
} from "./shift-test-context";

const context = new ShiftTestContext("start");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005B Shift start", () => {
  it("creates one active Shift with a matching database-time audit", async () => {
    const fixture = await context.createFixture();
    const result = await createStartShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
    });

    expect(result).toMatchObject({
      endedAt: null,
      locationId: fixture.locationId,
      status: "ACTIVE",
    });
    const persisted = await context.adminPool.query<{
      actor_membership_id: string;
      entity_type: string;
      location_id: string;
      metadata_json: Record<string, unknown>;
      occurred_at: Date;
      organization_id: string;
      started_at: Date;
      valet_session_id: string | null;
    }>(
      `SELECT shift_row.started_at, audit.occurred_at,
              audit.organization_id::text, audit.location_id::text,
              audit.actor_membership_id::text, audit.valet_session_id::text,
              audit.entity_type, audit.metadata_json
       FROM shifts AS shift_row
       INNER JOIN audit_events AS audit
         ON audit.entity_type = 'Shift'
        AND audit.entity_id = shift_row.id
        AND audit.event_type = 'SHIFT_STARTED'
       WHERE shift_row.id = $1`,
      [result.shiftId],
    );
    expect(persisted.rows[0]?.started_at).toEqual(result.startedAt);
    expect(persisted.rows[0]?.occurred_at).toEqual(result.startedAt);
    expect(persisted.rows[0]?.organization_id).toBe(fixture.organizationId);
    expect(persisted.rows[0]?.location_id).toBe(fixture.locationId);
    expect(persisted.rows[0]?.actor_membership_id).toBe(fixture.membershipId);
    expect(persisted.rows[0]?.valet_session_id).toBeNull();
    expect(persisted.rows[0]?.entity_type).toBe("Shift");
    expect(persisted.rows[0]?.metadata_json).toEqual({ status: "ACTIVE" });
  });

  it("returns the same Shift on sequential same-Location retry", async () => {
    const fixture = await context.createFixture();
    const execute = createStartShiftCommandExecutor(context.runtimePool);
    const request = {
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
    };
    const first = await execute(request);
    const retry = await execute(request);

    expect(retry).toEqual(first);
    expect(await context.countAudit(first.shiftId, "SHIFT_STARTED")).toBe(1);
  });

  it("converges concurrent same-Location starts", async () => {
    const fixture = await context.createFixture();
    const execute = createStartShiftCommandExecutor(context.runtimePool);
    const request = {
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
    };
    const results = await Promise.all([execute(request), execute(request)]);

    expect([...new Set(results.map((result) => result.shiftId))]).toHaveLength(
      1,
    );
    expect(await context.countAudit(results[0]!.shiftId, "SHIFT_STARTED")).toBe(
      1,
    );
  });

  it("classifies concurrent different-Location starts without two active rows", async () => {
    const fixture = await context.createFixture();
    const secondLocationId = await context.addLocation(fixture);
    const execute = createStartShiftCommandExecutor(context.runtimePool);
    const settled = await Promise.allSettled([
      execute({
        authenticatedUserId: fixture.userId,
        targetLocationId: fixture.locationId,
      }),
      execute({
        authenticatedUserId: fixture.userId,
        targetLocationId: secondLocationId,
      }),
    ]);

    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = settled.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason.code).toBe(
      "ACTIVE_SHIFT_CONFLICT",
    );
    const active = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM shifts
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    expect(active.rows[0]?.count).toBe("1");
  });

  it("allows one User to start independently through two Organization memberships", async () => {
    const first = await context.createFixture();
    const second = await context.createFixture({}, first.userId);
    const execute = createStartShiftCommandExecutor(context.runtimePool);
    const [one, two] = await Promise.all([
      execute({
        authenticatedUserId: first.userId,
        targetLocationId: first.locationId,
      }),
      execute({
        authenticatedUserId: second.userId,
        targetLocationId: second.locationId,
      }),
    ]);

    expect(one.shiftId).not.toBe(two.shiftId);
    expect(one.locationId).toBe(first.locationId);
    expect(two.locationId).toBe(second.locationId);
  });

  it.each([
    ["inactive User", { userStatus: "DISABLED" }, "AUTHORIZATION_DENIED"],
    [
      "inactive membership",
      { membershipStatus: "INACTIVE" },
      "TENANT_ACCESS_DENIED",
    ],
    [
      "inactive Organization",
      { organizationStatus: "INACTIVE" },
      "AUTHORIZATION_DENIED",
    ],
    [
      "inactive Location",
      { locationStatus: "INACTIVE" },
      "AUTHORIZATION_DENIED",
    ],
    [
      "missing Location access",
      { locationAccess: false },
      "LOCATION_ACCESS_DENIED",
    ],
    ["manager role", { role: "LOCATION_MANAGER" }, "AUTHORIZATION_DENIED"],
    ["admin role", { role: "ORG_ADMIN" }, "AUTHORIZATION_DENIED"],
  ] as const)("denies %s before mutation", async (_name, options, code) => {
    const fixture = await context.createFixture(options as ShiftFixtureOptions);
    await expectShiftError(
      createStartShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        targetLocationId: fixture.locationId,
      }),
      code,
    );
    const rows = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM shifts WHERE membership_id = $1`,
      [fixture.membershipId],
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("rolls back Shift creation when audit insertion fails", async () => {
    const first = await context.createFixture();
    const duplicateAuditId = randomUUID();
    await createStartShiftCommandExecutor(context.runtimePool, {
      auditEventIdFactory: () => duplicateAuditId,
    })({
      authenticatedUserId: first.userId,
      targetLocationId: first.locationId,
    });
    const second = await context.createFixture();

    await expect(
      createStartShiftCommandExecutor(context.runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })({
        authenticatedUserId: second.userId,
        targetLocationId: second.locationId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    const rows = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM shifts WHERE membership_id = $1`,
      [second.membershipId],
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("does not append audit when Shift insertion fails", async () => {
    const first = await context.createFixture();
    const existing = await createStartShiftCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: first.userId,
        targetLocationId: first.locationId,
      },
    );
    const second = await context.createFixture();
    await expect(
      createStartShiftCommandExecutor(context.runtimePool, {
        shiftIdFactory: () => existing.shiftId,
      })({
        authenticatedUserId: second.userId,
        targetLocationId: second.locationId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await context.countAudit(existing.shiftId, "SHIFT_STARTED")).toBe(1);
  });
});
