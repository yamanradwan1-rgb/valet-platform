import { expect, vi } from "vitest";
import { staffRolePath } from "../issue416-option-c-t5/probe-fixture";
import type { OptionCAfterProtectedFixture } from "./after-protected-fixture";

export async function assertManagementWaitRevalidatesExpiry(
  fixture: OptionCAfterProtectedFixture,
) {
  const actor = await fixture.onboardingAdmin();
  const { organizationId } = actor.membership;
  const target = await fixture.employee(organizationId);
  const blocker = await fixture.databasePool().connect();
  let request: ReturnType<typeof fixture.managementPost> | undefined;
  try {
    await blocker.query("BEGIN");
    const lock = await blocker.query<{ pid: number }>(
      `SELECT pg_backend_pid() AS pid,
              pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text, 0))`,
      [organizationId],
    );
    const deadline = await fixture.query<{ at: Date }>(
      `UPDATE staff_auth_sessions
          SET created_at=created_at-interval '6 minutes',
              mfa_authenticated_at=clock_timestamp()-interval '298.6 seconds'
        WHERE id=$1
        RETURNING mfa_authenticated_at+interval '5 minutes' AS at`,
      [actor.auth.sessionId],
    );
    const expiresAt = deadline.rows[0]!.at;
    request = fixture.managementPost(
      staffRolePath(organizationId, target.membershipId),
      actor.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    );
    await vi.waitFor(async () => {
      const waiting = await fixture.query<{ blocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database()
              AND usename='vaylet_management_writer'
              AND $1::int = ANY(pg_blocking_pids(pid))
              AND clock_timestamp() < $2
         ) AS blocked`,
        [lock.rows[0]!.pid, expiresAt],
      );
      expect(waiting.rows[0]?.blocked).toBe(true);
    }, { timeout: 1200, interval: 20 });
    await blocker.query(
      `SELECT pg_sleep(greatest(EXTRACT(epoch FROM $1::timestamptz - clock_timestamp()), 0) + 0.025)`,
      [expiresAt],
    );
  } finally {
    try {
      await blocker.query("ROLLBACK");
    } finally {
      blocker.release();
    }
  }

  expect(await request).toMatchObject({
    status: 403,
    body: { code: "MFA_STEP_UP_REQUIRED" },
  });
  const state = await fixture.query(
    `SELECT role::text, version,
            (SELECT count(*)::int FROM audit_events WHERE entity_id=$1) AS audits
       FROM organization_memberships WHERE id=$1`,
    [target.membershipId],
  );
  expect(state.rows).toEqual([{ role: "VALET_EMPLOYEE", version: 1, audits: 0 }]);
}
