import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { StaffAuthService } from "../src/modules/auth/staff-auth.service";
import { logoutStaffSession } from "../src/modules/auth/staff-auth-logout";
import { createCancelCheckInCommandExecutor } from "../src/modules/valet-sessions/cancel-check-in-command";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";

describe("#293 exact cancellation credential with real PostgreSQL", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);

  async function target() {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    const shift = await harness.context.adminPool.query<{ id: string }>(
      "SELECT id FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'",
      [fixture.membershipId],
    );
    const credential = await new DatabaseStaffSessionContextResolver(
      harness.context.runtimePool,
    ).resolve(`Bearer ${token}`);
    return {
      input: {
        authenticatedUserId: fixture.userId,
        sessionId,
        expectedVersion: 1,
        expectedShiftId: shift.rows[0]!.id,
      },
      token,
      credential,
    };
  }

  async function attachRefresh(credential: StaffSessionContext) {
    const refresh = generateStaffCredential("vsr1.");
    await harness.context.adminPool.query(
      `INSERT INTO staff_refresh_credentials
        (id, session_id, token_hash, generation, created_at, expires_at)
       SELECT gen_random_uuid(), id, $2, 1, created_at, absolute_expires_at
       FROM staff_auth_sessions WHERE id = $1`,
      [credential.staffAuthSessionId, staffCredentialHash("refresh", refresh)],
    );
    return refresh;
  }

  async function facts(sessionId: string) {
    const result = await harness.context.adminPool.query<{
      state: string;
      version: number;
      audits: number;
    }>(
      `SELECT state::text, version,
          (SELECT count(*)::int FROM audit_events WHERE valet_session_id = $1
            AND event_type = 'VALET_SESSION_CHECK_IN_CANCELLED') AS audits
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    return result.rows[0];
  }

  async function invalidate(
    kind: "LOGOUT" | "REFRESH" | "EXPIRE",
    credential: StaffSessionContext,
  ) {
    if (kind === "EXPIRE") {
      await harness.context.adminPool.query(
        `UPDATE staff_auth_sessions
         SET access_expires_at = created_at + INTERVAL '1 millisecond'
         WHERE id = $1`,
        [credential.staffAuthSessionId],
      );
      return undefined;
    }
    const refresh = await attachRefresh(credential);
    if (kind === "LOGOUT") {
      await logoutStaffSession(harness.context.adminPool, refresh);
      return undefined;
    }
    const auth = new StaffAuthService(harness.context.adminPool, {
      verify: async () => false,
    });
    return auth.refresh(refresh);
  }

  it.each(["LOGOUT", "REFRESH", "EXPIRE"] as const)(
    "%s before Stage-C denies stale cancellation without an audit",
    async (kind) => {
      const { input, credential, token } = await target();
      const barrier = cancellationSqlBarrier(
        harness.context.runtimePool,
        (sql) => sql.includes("FROM valet_sessions WHERE id = $1"),
      );
      const cancel = createCancelCheckInCommandExecutor(barrier.pool)(
        input, credential,
      ).catch((error) => error);
      await barrier.entered;
      const newer = await invalidate(kind, credential);
      barrier.release();
      await expect(cancel).resolves.toMatchObject({ status: 401 });
      expect(await facts(input.sessionId)).toEqual({
        state: "CHECKING_IN", version: 1, audits: 0,
      });
      const oldStatus = await harness.request(
        "GET",
        `/v1/staff/check-in/sessions/${input.sessionId}/cancel-status?expectedShiftId=${input.expectedShiftId}`,
        { token },
      );
      expect(oldStatus.status).toBe(401);
      const oldCancel = await harness.request(
        "POST",
        `/v1/staff/check-in/sessions/${input.sessionId}/cancel`,
        { token, body: {
          expectedVersion: input.expectedVersion,
          expectedShiftId: input.expectedShiftId,
        } },
      );
      expect(oldCancel.status).toBe(401);
      expect(await facts(input.sessionId)).toEqual({
        state: "CHECKING_IN", version: 1, audits: 0,
      });
      if (newer) {
        const freshContext = await new DatabaseStaffSessionContextResolver(
          harness.context.runtimePool,
        ).resolve(`Bearer ${newer.accessToken}`);
        expect(freshContext.staffAuthSessionId).toBe(credential.staffAuthSessionId);
        expect(
          (await createCancelCheckInCommandExecutor(harness.context.runtimePool)(
            input, freshContext,
          )).state,
        ).toBe("CANCELLED");
      }
    },
  );

  it.each(["LOGOUT", "REFRESH"] as const)(
    "Cancellation first holds exact credential until commit ahead of %s",
    async (kind) => {
      const { input, credential } = await target();
      const refresh = await attachRefresh(credential);
      const barrier = cancellationSqlBarrier(
        harness.context.runtimePool,
        (sql) => sql.includes("UPDATE valet_sessions SET state = 'CANCELLED'"),
      );
      const cancel = createCancelCheckInCommandExecutor(barrier.pool)(input, credential);
      await barrier.entered;
      const writer = kind === "LOGOUT"
        ? logoutStaffSession(harness.context.adminPool, refresh)
        : new StaffAuthService(harness.context.adminPool, {
            verify: async () => false,
          }).refresh(refresh);
      try {
        await barrier.proveBlocked(harness.context.adminPool);
      } finally {
        barrier.release();
      }
      expect((await cancel).state).toBe("CANCELLED");
      await writer;
      expect(await facts(input.sessionId)).toEqual({
        state: "CANCELLED", version: 2, audits: 1,
      });
    },
  );

  it("credential context cannot impersonate another User on direct command", async () => {
    const actor = await target();
    const other = await target();
    await expect(createCancelCheckInCommandExecutor(harness.context.runtimePool)(
      actor.input, other.credential,
    )).rejects.toMatchObject({ status: 401 });
    expect(await facts(actor.input.sessionId)).toEqual({
      state: "CHECKING_IN", version: 1, audits: 0,
    });
  });
});
