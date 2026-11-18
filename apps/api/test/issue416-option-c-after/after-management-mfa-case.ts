import { expect } from "vitest";

import { staffRolePath } from "../issue416-option-c-t5/probe-fixture";
import type { OptionCAfterProtectedFixture } from "./after-protected-fixture";

export async function assertManagementMfaStepUp(
  fixture: OptionCAfterProtectedFixture,
) {
  const actor = await fixture.admin();
  const { organizationId } = actor.membership;
  const target = await fixture.employee(organizationId);
  const changeRole = (expectedVersion: number, role: string) =>
    fixture.managementPost(
      staffRolePath(organizationId, target.membershipId),
      actor.auth.accessToken,
      { expectedVersion, role },
    );
  const state = () =>
    fixture.query<{ role: string; version: number; audits: number }>(
      `SELECT membership.role::text, membership.version,
              (SELECT count(*)::int FROM audit_events
                WHERE organization_id=$1 AND entity_id=$2
                  AND event_type='STAFF_ROLE_CHANGED') AS audits
         FROM organization_memberships AS membership
        WHERE membership.organization_id=$1 AND membership.id=$2`,
      [organizationId, target.membershipId],
    );

  expect(await changeRole(1, "VALET_SUPERVISOR")).toMatchObject({
    status: 403,
    body: { code: "MFA_STEP_UP_REQUIRED" },
  });
  expect((await state()).rows).toEqual([
    { role: "VALET_EMPLOYEE", version: 1, audits: 0 },
  ]);

  await fixture.enrollAndAssure(actor.auth);
  expect((await changeRole(1, "VALET_SUPERVISOR")).status).toBe(201);
  await fixture.query(
    `UPDATE staff_auth_sessions
        SET created_at=created_at-interval '7 minutes',
            mfa_authenticated_at=created_at-interval '6 minutes'
      WHERE id=$1`,
    [actor.auth.sessionId],
  );
  expect(await changeRole(2, "VALET_EMPLOYEE")).toMatchObject({
    status: 403,
    body: { code: "MFA_STEP_UP_REQUIRED" },
  });
  expect((await state()).rows).toEqual([
    { role: "VALET_SUPERVISOR", version: 2, audits: 1 },
  ]);

  const location = await fixture.addLocation(organizationId);
  const command = fixture.newInvitation(location.locationId);
  expect(
    await fixture.createViaHttp(organizationId, actor.auth.accessToken, command),
  ).toMatchObject({ status: 403, body: { code: "MFA_STEP_UP_REQUIRED" } });
  const users = await fixture.query("SELECT 1 FROM users WHERE email=$1", [
    command.email,
  ]);
  expect(users.rows).toHaveLength(0);
}
