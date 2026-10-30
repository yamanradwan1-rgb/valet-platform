import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeControlledMfaRecovery } from "../tools/mfa-recovery/execution";
import type { MfaRecoveryArguments } from "../tools/mfa-recovery/types";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

const context = new ShiftTestContext("mfa_controlled_recovery_tool");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function environment(): NodeJS.ProcessEnv {
  return {
    MIGRATION_DATABASE_URL: context.migrationUrl,
    NODE_ENV: "test",
  };
}

function input(
  fixture: ShiftFixture,
  overrides: Partial<MfaRecoveryArguments> = {},
): MfaRecoveryArguments {
  return {
    operation: "recover-totp",
    operationId: randomUUID(),
    operatorRef: "CHANGE-MFA-RECOVERY-42",
    userId: fixture.userId,
    ...overrides,
  };
}

async function seedActiveFactor(fixture: ShiftFixture): Promise<string> {
  const factorId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO user_mfa_totp_factors
       (id, user_id, state, protected_secret, last_accepted_step,
        recovery_set_generation, created_at, activated_at)
     VALUES ($1, $2, 'ACTIVE', $3, 100, 1,
             transaction_timestamp(), transaction_timestamp())`,
    [
      factorId,
      fixture.userId,
      `mte1.${"A".repeat(16)}.${"B".repeat(32)}.${"C".repeat(22)}`,
    ],
  );
  return factorId;
}

async function snapshot(factorId: string, operationId: string) {
  const factor = await context.adminPool.query<{
    retired_at: Date | null;
    state: string;
  }>(
    `SELECT state::text, retired_at
     FROM user_mfa_totp_factors WHERE id = $1`,
    [factorId],
  );
  const audit = await context.adminPool.query<{
    actor_type: string;
    controlled_operator_ref: string | null;
    event_type: string;
    subject_user_id: string | null;
  }>(
    `SELECT event_type, subject_user_id::text, actor_type::text,
            controlled_operator_ref
     FROM account_security_audit_events WHERE id = $1`,
    [operationId],
  );
  return { audit: audit.rows, factor: factor.rows[0] };
}

describe("controlled MFA recovery persistence", () => {
  it("retires the factor with CONTROLLED_OPERATOR audit and makes exact retry safe", async () => {
    const fixture = await context.createFixture({ role: "ORG_ADMIN" });
    const factorId = await seedActiveFactor(fixture);
    const recovery = input(fixture);

    await expect(
      executeControlledMfaRecovery(recovery, environment()),
    ).resolves.toEqual({
      operationId: recovery.operationId,
      userId: fixture.userId,
    });

    const first = await snapshot(factorId, recovery.operationId);
    expect(first.factor?.state).toBe("RETIRED");
    expect(first.factor?.retired_at).toBeInstanceOf(Date);
    expect(first.audit).toEqual([
      {
        actor_type: "CONTROLLED_OPERATOR",
        controlled_operator_ref: recovery.operatorRef,
        event_type: "MFA_OPERATOR_RECOVERY",
        subject_user_id: fixture.userId,
      },
    ]);

    await expect(
      executeControlledMfaRecovery(recovery, environment()),
    ).resolves.toEqual({
      operationId: recovery.operationId,
      userId: fixture.userId,
    });
    expect((await snapshot(factorId, recovery.operationId)).audit).toHaveLength(
      1,
    );

    await expect(
      executeControlledMfaRecovery(
        { ...recovery, operatorRef: "CHANGE-MFA-CONFLICT" },
        environment(),
      ),
    ).rejects.toThrow("Recovery operation identity conflict");
  }, 30_000);

  it("retires an orphaned pending factor after session-only local reset with audited operator recovery", async () => {
    const fixture = await context.createFixture({ role: "ORG_ADMIN" });
    const sessionId = randomUUID();
    const factorId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO staff_auth_sessions
         (id,user_id,current_access_token_hash,access_expires_at,
          absolute_expires_at,created_at,last_rotated_at)
       VALUES ($1,$2,$3,transaction_timestamp()+interval '15 minutes',
               transaction_timestamp()+interval '30 days',
               transaction_timestamp(),transaction_timestamp())`,
      [sessionId, fixture.userId, `staff-access-sha256:v1:${"d".repeat(64)}`],
    );
    await context.adminPool.query(
      `INSERT INTO user_mfa_totp_factors
         (id,user_id,state,protected_secret,pending_enrollment_session_id)
       VALUES ($1,$2,'PENDING',$3,$4)`,
      [
        factorId,
        fixture.userId,
        `mte1.${"A".repeat(16)}.${"B".repeat(32)}.${"C".repeat(22)}`,
        sessionId,
      ],
    );
    const deleted = await context.adminPool.query(
      "DELETE FROM staff_auth_sessions WHERE id=$1",
      [sessionId],
    );
    expect(deleted.rowCount).toBe(1);

    const recovery = input(fixture);
    await expect(
      executeControlledMfaRecovery(recovery, environment()),
    ).resolves.toMatchObject({ operationId: recovery.operationId });
    const stored = await snapshot(factorId, recovery.operationId);
    expect(stored.factor?.state).toBe("RETIRED");
    expect(stored.audit).toMatchObject([{ actor_type: "CONTROLLED_OPERATOR" }]);
    const owner = await context.adminPool.query<{ owner: string }>(
      `SELECT pending_enrollment_session_id::text AS owner
       FROM user_mfa_totp_factors WHERE id=$1`,
      [factorId],
    );
    expect(owner.rows[0]?.owner).toBe(sessionId);
  }, 30_000);

  it("rolls back factor retirement when controlled audit validation fails", async () => {
    const fixture = await context.createFixture({ role: "ORG_ADMIN" });
    const factorId = await seedActiveFactor(fixture);
    const recovery = input(fixture, { operatorRef: "bad\noperator" });

    await expect(
      executeControlledMfaRecovery(recovery, environment()),
    ).rejects.toThrow("Controlled MFA recovery failed");

    const stored = await snapshot(factorId, recovery.operationId);
    expect(stored.factor).toMatchObject({ retired_at: null, state: "ACTIVE" });
    expect(stored.audit).toHaveLength(0);
  }, 30_000);

  it("converges concurrent exact operation-id retries", async () => {
    const fixture = await context.createFixture({ role: "ORG_ADMIN" });
    const factorId = await seedActiveFactor(fixture);
    const recovery = input(fixture);

    await expect(
      Promise.all([
        executeControlledMfaRecovery(recovery, environment()),
        executeControlledMfaRecovery(recovery, environment()),
      ]),
    ).resolves.toEqual([
      { operationId: recovery.operationId, userId: fixture.userId },
      { operationId: recovery.operationId, userId: fixture.userId },
    ]);
    expect((await snapshot(factorId, recovery.operationId)).audit).toHaveLength(
      1,
    );
  }, 30_000);
});
