import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import type { IntakeSessionCommandTestHarness } from "./intake-session-command-test-harness";
import { differentCustomer } from "./returning-check-in-test-context";

export function registerIntakeSessionResilienceTests(
  harness: IntakeSessionCommandTestHarness,
): void {
  const {
    completeSession,
    confirmedRequest,
    createFixture,
    expectCommandError,
    readCounts,
    temporaryRequest,
  } = harness;

  describe("VAL-004E intake retry and atomicity", () => {
    it("returns an exact durable retry result without duplicate rows or AuditEvent", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const request = temporaryRequest(fixture, {
        customer: differentCustomer("+962791234567", "Guest"),
      });
      const first = await execute(request);
      const counts = await readCounts(fixture.organizationId);
      await completeSession(fixture, first.valetSessionId);
      const retry = await execute(request);
      expect(retry).toEqual(first);
      expect(await readCounts(fixture.organizationId)).toEqual(counts);
      expect(counts).toEqual({
        audits: 1,
        customers: 1,
        intakeOperations: 1,
        sessions: 1,
        vehicles: 1,
      });
    });

    it("serializes concurrent identical retries to one exact result", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const request = temporaryRequest(fixture);
      const [first, second] = await Promise.all([
        execute(request),
        execute(request),
      ]);
      expect(second).toEqual(first);
      expect(await readCounts(fixture.organizationId)).toEqual({
        audits: 1,
        customers: 0,
        intakeOperations: 1,
        sessions: 1,
        vehicles: 1,
      });
    });

    it("rejects reuse of an operation identifier with different normalized input", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const operationId = `intake:${randomUUID()}`;
      await execute(
        temporaryRequest(fixture, { intakeOperationId: operationId }),
      );
      const before = await readCounts(fixture.organizationId);
      await expectCommandError(
        execute(
          temporaryRequest(fixture, {
            intakeOperationId: operationId,
            vehicleIdentity: {
              mode: "TEMPORARY_DESCRIPTOR",
              temporaryDescriptor: "Different vehicle",
            },
          }),
        ),
        "IDEMPOTENCY_CONFLICT",
      );
      expect(await readCounts(fixture.organizationId)).toEqual(before);
    });

    it("scopes the same operation identifier independently by Organization", async () => {
      const firstFixture = await createFixture();
      const secondFixture = await createFixture();
      const operationId = `intake:${randomUUID()}`;
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      await expect(
        Promise.all([
          execute(
            temporaryRequest(firstFixture, { intakeOperationId: operationId }),
          ),
          execute(
            temporaryRequest(secondFixture, { intakeOperationId: operationId }),
          ),
        ]),
      ).resolves.toHaveLength(2);
    });

    it("maps only the active same-location Vehicle constraint to the domain conflict", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      await execute(confirmedRequest(fixture));
      const before = await readCounts(fixture.organizationId);
      await expectCommandError(
        execute(confirmedRequest(fixture)),
        "ACTIVE_VALET_SESSION_CONFLICT",
      );
      expect(await readCounts(fixture.organizationId)).toEqual(before);
    });

    it("allows one concurrent active session winner and rolls the loser back", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const settled = await Promise.allSettled([
        execute(confirmedRequest(fixture)),
        execute(confirmedRequest(fixture)),
      ]);
      expect(
        settled.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = settled.find((result) => result.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        code: "ACTIVE_VALET_SESSION_CONFLICT",
      });
      expect(await readCounts(fixture.organizationId)).toEqual({
        audits: 1,
        customers: 0,
        intakeOperations: 1,
        sessions: 1,
        vehicles: 1,
      });
    });

    it("rolls back Customer, Vehicle, ValetSession, and idempotency when AuditEvent insertion fails", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const existing = await execute(temporaryRequest(fixture));
      const audit = await harness.adminPool.query<{ id: string }>(
        `SELECT id::text FROM audit_events WHERE valet_session_id = $1`,
        [existing.valetSessionId],
      );
      const duplicateAuditId = audit.rows[0]!.id;
      const before = await readCounts(fixture.organizationId);
      await expect(
        createIntakeSessionCommandExecutor(harness.runtimePool, {
          auditEventIdFactory: () => duplicateAuditId,
        })(
          temporaryRequest(fixture, {
            customer: differentCustomer("+962791234567"),
          }),
        ),
      ).rejects.toMatchObject({ code: "23505" });
      expect(await readCounts(fixture.organizationId)).toEqual(before);
    });
  });
}
