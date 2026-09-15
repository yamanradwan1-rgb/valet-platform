import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  expectMarkReadyError,
  MarkReadyTestContext,
} from "./mark-ready-test-context";

const context = new MarkReadyTestContext("atomicity");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006E Mark Ready atomicity and concurrency", () => {
  it("rolls back the Session mutation when Ready Audit insertion fails", async () => {
    const fixture = await context.createMarkReadyFixture();
    const duplicateId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id, actor_type,
          event_type, entity_type, entity_id, metadata_json, occurred_at)
       VALUES ($1, $2, $3, $4, 'SYSTEM', 'TEST', 'VALET_SESSION', $4,
               '{}'::jsonb, transaction_timestamp())`,
      [
        duplicateId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
      ],
    );
    await expect(
      context.markReady(fixture, 6, { auditEventIdFactory: () => duplicateId }),
    ).rejects.toMatchObject({ code: "23505" });
    const effects = await context.readyEffects(fixture);
    expect(effects.projection).toMatchObject({
      ready_at: null,
      request_status: "ACCEPTED",
      session_state: "RETRIEVING",
      session_version: 6,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.counts.ready_audit_count).toBe(0);
  });

  it("allows one concurrent winner and a replay cannot append a second Audit", async () => {
    const fixture = await context.createMarkReadyFixture();
    const results = await Promise.allSettled([
      context.markReady(fixture),
      context.markReady(fixture),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await context.readyEffects(fixture)).counts.ready_audit_count).toBe(
      1,
    );
    await expectMarkReadyError(context.markReady(fixture), "VERSION_CONFLICT");
    expect((await context.readyEffects(fixture)).counts.ready_audit_count).toBe(
      1,
    );
  });

  it("serializes safely against Shift end", async () => {
    const fixture = await context.createMarkReadyFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const end = () =>
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: shift.rows[0]!.id,
      });
    const results = await Promise.allSettled([
      context.markReady(fixture),
      end(),
    ]);
    const effects = await context.readyEffects(fixture);
    const shiftState = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id = $1`,
      [shift.rows[0]!.id],
    );
    expect({
      session: effects.projection.session_state,
      shift: shiftState.rows[0]?.status,
    }).not.toEqual({
      session: "READY",
      shift: "ENDED",
    });
    if (results[0]?.status === "fulfilled") {
      await expect(end()).rejects.toMatchObject({
        code: "OPEN_TASK_HANDOFF_REQUIRED",
      });
    }
  });
});
