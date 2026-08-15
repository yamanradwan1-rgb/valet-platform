import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  expectShiftError,
  ShiftTestContext,
  type ShiftFixture,
} from "./shift-test-context";

const context = new ShiftTestContext("end");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function start(fixture: ShiftFixture) {
  return createStartShiftCommandExecutor(context.runtimePool)({
    authenticatedUserId: fixture.userId,
    targetLocationId: fixture.locationId,
  });
}

describe("VAL-005B Shift self-end", () => {
  it("ends the exact own Shift with one same-time audit", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    const ended = await createEndShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      cashReported: "0",
      shiftId: active.shiftId,
    });

    expect(ended.status).toBe("ENDED");
    expect(ended.endedAt).toBeInstanceOf(Date);
    const audit = await context.adminPool.query<{
      actor_membership_id: string;
      metadata_json: Record<string, unknown>;
      occurred_at: Date;
      valet_session_id: string | null;
    }>(
      `SELECT occurred_at, actor_membership_id::text,
              valet_session_id::text, metadata_json
       FROM audit_events
       WHERE entity_type = 'Shift' AND entity_id = $1
         AND event_type = 'SHIFT_ENDED'`,
      [active.shiftId],
    );
    expect(audit.rows[0]?.occurred_at).toEqual(ended.endedAt);
    expect(audit.rows[0]?.actor_membership_id).toBe(fixture.membershipId);
    expect(audit.rows[0]?.valet_session_id).toBeNull();
    expect(audit.rows[0]?.metadata_json).toEqual({
      cash_expected: "0.000",
      cash_reported: "0.000",
      cash_variance: "0.000",
      currency: "JOD",
      fromStatus: "ACTIVE",
      toStatus: "ENDED",
    });
  });

  it("returns the persisted result on repeated self-end", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    const execute = createEndShiftCommandExecutor(context.runtimePool);
    const request = {
      authenticatedUserId: fixture.userId,
      cashReported: "0",
      shiftId: active.shiftId,
    };
    const first = await execute(request);
    const retry = await execute(request);

    expect(retry).toEqual(first);
    expect(await context.countAudit(active.shiftId, "SHIFT_ENDED")).toBe(1);
  });

  it("converges concurrent self-end attempts to one event", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    const execute = createEndShiftCommandExecutor(context.runtimePool);
    const results = await Promise.all([
      execute({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: active.shiftId,
      }),
      execute({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: active.shiftId,
      }),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(await context.countAudit(active.shiftId, "SHIFT_ENDED")).toBe(1);
  });

  it("conceals a foreign Shift and performs no mutation or audit", async () => {
    const owner = await context.createFixture();
    const other = await context.createFixture();
    const active = await start(owner);

    await expectShiftError(
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: other.userId,
        cashReported: "0",
        shiftId: active.shiftId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    const persisted = await context.adminPool.query<{
      ended_at: Date | null;
      status: string;
    }>(`SELECT status::text, ended_at FROM shifts WHERE id = $1`, [
      active.shiftId,
    ]);
    expect(persisted.rows[0]).toEqual({ ended_at: null, status: "ACTIVE" });
    expect(await context.countAudit(active.shiftId, "SHIFT_ENDED")).toBe(0);
  });

  it.each([
    [
      "inactive membership",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
    ],
    [
      "removed access",
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
    ],
    [
      "inactive Location",
      `UPDATE locations SET status = 'INACTIVE' WHERE id = $1`,
    ],
    [
      "inactive Organization",
      `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
    ],
  ])("allows stale own-Shift cleanup after %s", async (_name, sql) => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    const parameter =
      _name === "inactive Location"
        ? fixture.locationId
        : _name === "inactive Organization"
          ? fixture.organizationId
          : fixture.membershipId;
    await context.adminPool.query(sql, [parameter]);

    const ended = await createEndShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      cashReported: "0",
      shiftId: active.shiftId,
    });
    expect(ended.status).toBe("ENDED");
  });

  it("denies cash close after the owner is no longer an operational role", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    await context.adminPool.query(
      `UPDATE organization_memberships SET role = 'ORG_ADMIN' WHERE id = $1`,
      [fixture.membershipId],
    );
    await expectShiftError(
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: active.shiftId,
      }),
      "TENANT_ACCESS_DENIED",
    );
  });

  it("denies a disabled User without mutation or end audit", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    await context.adminPool.query(
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      [fixture.userId],
    );

    await expectShiftError(
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: active.shiftId,
      }),
      "AUTHORIZATION_DENIED",
    );
    expect(await context.countAudit(active.shiftId, "SHIFT_ENDED")).toBe(0);
  });

  it("rolls back end when audit insertion fails", async () => {
    const first = await context.createFixture();
    const firstShift = await start(first);
    const duplicateAuditId = randomUUID();
    await createEndShiftCommandExecutor(context.runtimePool, {
      auditEventIdFactory: () => duplicateAuditId,
    })({
      authenticatedUserId: first.userId,
      cashReported: "0",
      shiftId: firstShift.shiftId,
    });

    const second = await context.createFixture();
    const secondShift = await start(second);
    await expect(
      createEndShiftCommandExecutor(context.runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })({
        authenticatedUserId: second.userId,
        cashReported: "0",
        shiftId: secondShift.shiftId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    const persisted = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id = $1`,
      [secondShift.shiftId],
    );
    expect(persisted.rows[0]?.status).toBe("ACTIVE");
    expect(await context.countAudit(secondShift.shiftId, "SHIFT_ENDED")).toBe(
      0,
    );
  });
});
