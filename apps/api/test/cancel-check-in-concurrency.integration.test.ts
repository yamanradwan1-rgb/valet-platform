import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { createCancelCheckInCommandExecutor } from "../src/modules/valet-sessions/cancel-check-in-command";
import { createCompleteCheckInCommandExecutor } from "../src/modules/valet-sessions/complete-check-in-command";
import { createRecordCheckInConditionNoteCommandExecutor } from "../src/modules/valet-sessions/check-in-condition-command";
import { createVehicleIdentityCommandExecutor } from "../src/modules/vehicles/vehicle-identity-command";

describe("Check-In cancellation deterministic PostgreSQL interleavings", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  async function target() {
    const { fixture } = await harness.fixtureWithToken();
    const { sessionId, vehicleId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
    });
    const shift = await harness.context.adminPool.query(
      "SELECT id FROM shifts WHERE membership_id = $1",
      [fixture.membershipId],
    );
    return {
      fixture,
      vehicleId,
      input: {
        authenticatedUserId: fixture.userId,
        sessionId,
        expectedVersion: 1,
        expectedShiftId: shift.rows[0].id as string,
      },
    };
  }
  const cancelUpdate = (sql: string) =>
    sql.includes("UPDATE valet_sessions SET state = 'CANCELLED'");
  it.each([false, true])(
    "Cancel first, Complete waits; audit rollback=%s",
    async (rollback) => {
      const { input } = await target();
      const barrier = cancellationSqlBarrier(
        harness.context.runtimePool,
        cancelUpdate,
      );
      const first = createCancelCheckInCommandExecutor(
        barrier.pool,
        rollback ? { auditEventIdFactory: () => "invalid" } : {},
      )(input).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await barrier.entered;
      const second = createCompleteCheckInCommandExecutor(
        harness.context.runtimePool,
      )({
        authenticatedUserId: input.authenticatedUserId,
        expectedVersion: 1,
        valetSessionId: input.sessionId,
      }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        await barrier.proveBlocked(harness.context.adminPool);
      } finally {
        barrier.release();
      }
      const a = await first;
      const b = await second;
      if (rollback) {
        expect(a).toHaveProperty("error");
        expect(b).toHaveProperty("value.state", "AWAITING_PARKING");
      } else {
        expect(a).toHaveProperty("value.state", "CANCELLED");
        expect(b).toHaveProperty("error.code", "VERSION_CONFLICT");
      }
    },
  );
  it("Complete first, Cancel waits and rejects the progressed truth", async () => {
    const { input } = await target();
    const barrier = cancellationSqlBarrier(harness.context.runtimePool, (sql) =>
      sql.includes("UPDATE valet_sessions"),
    );
    const first = createCompleteCheckInCommandExecutor(barrier.pool)({
      authenticatedUserId: input.authenticatedUserId,
      expectedVersion: 1,
      valetSessionId: input.sessionId,
    });
    await barrier.entered;
    const second = createCancelCheckInCommandExecutor(
      harness.context.runtimePool,
    )(input).catch((error) => error);
    try {
      await barrier.proveBlocked(harness.context.adminPool);
    } finally {
      barrier.release();
    }
    expect((await first).state).toBe("AWAITING_PARKING");
    expect(await second).toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("duplicate Cancel serializes and appends exactly one event", async () => {
    const { input } = await target();
    const barrier = cancellationSqlBarrier(
      harness.context.runtimePool,
      cancelUpdate,
    );
    const first = createCancelCheckInCommandExecutor(barrier.pool)(input);
    await barrier.entered;
    const second = createCancelCheckInCommandExecutor(
      harness.context.runtimePool,
    )(input);
    try {
      await barrier.proveBlocked(harness.context.adminPool);
    } finally {
      barrier.release();
    }
    expect(await second).toEqual(await first);
    const count = await harness.context.adminPool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE valet_session_id = $1 AND event_type = 'VALET_SESSION_CHECK_IN_CANCELLED'",
      [input.sessionId],
    );
    expect(count.rows[0].count).toBe(1);
  });
  it.each(["NOTE", "IDENTITY"] as const)(
    "child %s commits first and is retained; Cancel first blocks later child",
    async (kind) => {
      for (const cancelFirst of [false, true]) {
        const { input, vehicleId } = await target();
        const vehicle = await harness.context.adminPool.query(
          "SELECT updated_at FROM vehicles WHERE id = $1",
          [vehicleId],
        );
        const child = (pool: typeof harness.context.runtimePool) =>
          kind === "NOTE"
            ? createRecordCheckInConditionNoteCommandExecutor(pool)({
                authenticatedUserId: input.authenticatedUserId,
                valetSessionId: input.sessionId,
                content: "Retained intake evidence",
              })
            : createVehicleIdentityCommandExecutor(pool)({
                authenticatedUserId: input.authenticatedUserId,
                valetSessionId: input.sessionId,
                expectedVehicleUpdatedAt: vehicle.rows[0].updated_at as Date,
                identity: {
                  mode: "TEMPORARY_DESCRIPTOR",
                  temporaryDescriptor: "Updated intake descriptor",
                },
              });
        const barrier = cancellationSqlBarrier(
          harness.context.runtimePool,
          cancelFirst
            ? cancelUpdate
            : (sql) =>
                kind === "NOTE"
                  ? sql.includes("INSERT INTO condition_notes")
                  : sql.includes("UPDATE vehicles"),
        );
        const first = cancelFirst
          ? createCancelCheckInCommandExecutor(barrier.pool)(input)
          : child(barrier.pool);
        await barrier.entered;
        const second = (
          cancelFirst
            ? child(harness.context.runtimePool)
            : createCancelCheckInCommandExecutor(harness.context.runtimePool)(
                input,
              )
        ).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        try {
          await barrier.proveBlocked(harness.context.adminPool);
        } finally {
          barrier.release();
        }
        await first;
        if (cancelFirst)
          expect(await second).toHaveProperty(
            "error.code",
            kind === "IDENTITY"
              ? "VEHICLE_IDENTITY_SESSION_NOT_MUTABLE"
              : "INVALID_STATE_TRANSITION",
          );
        else {
          expect(await second).toHaveProperty("value.state", "CANCELLED");
          const evidence = await harness.context.adminPool.query(
            kind === "NOTE"
              ? "SELECT content AS value FROM condition_notes WHERE valet_session_id = $1"
              : "SELECT temporary_descriptor AS value FROM vehicles WHERE id = $1",
            [kind === "NOTE" ? input.sessionId : vehicleId],
          );
          expect(evidence.rows[0].value).toBe(
            kind === "NOTE"
              ? "Retained intake evidence"
              : "Updated intake descriptor",
          );
        }
      }
    },
  );
});
