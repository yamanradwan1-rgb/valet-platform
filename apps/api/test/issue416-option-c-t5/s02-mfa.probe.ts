import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCT5Fixture, staffRolePath } from "./probe-fixture";

const fixture = new OptionCT5Fixture();

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C S02 T5 SQL-only MFA assurance → real mounted sensitive management", () => {
  it("accepts real TOTP step-up on the same live Staff session", async () => {
    const actor = await fixture.admin(true);
    const target = await fixture.employee(actor.membership.organizationId);
    const path = staffRolePath(
      actor.membership.organizationId,
      target.membershipId,
    );
    await fixture.query(
      `UPDATE staff_auth_sessions SET mfa_authenticated_at=NULL,
         mfa_factor_id=NULL,last_admin_activity_at=NULL WHERE id=$1`,
      [actor.auth.sessionId],
    );
    const denied = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(denied.status).toBe(403);
    const realTotp = await fixture.stepUp(actor.auth, actor.assured!.secret);
    expect(realTotp.status).toBe(200);
    const allowed = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body).toMatchObject({
      version: 2,
      role: "VALET_SUPERVISOR",
    });
  });

  it("requires a genuine fresh same-session TOTP ceremony after assurance was cleared", async () => {
    const actor = await fixture.admin(true);
    const target = await fixture.employee(actor.membership.organizationId);
    const path = staffRolePath(
      actor.membership.organizationId,
      target.membershipId,
    );

    // The real enrollment/confirmation used a fresh TOTP. Clearing assurance
    // simulates a new sensitive action without a current accepted proof.
    await fixture.query(
      `UPDATE staff_auth_sessions SET mfa_authenticated_at=NULL,
         mfa_factor_id=NULL,last_admin_activity_at=NULL WHERE id=$1`,
      [actor.auth.sessionId],
    );
    const command = { expectedVersion: 1, role: "VALET_SUPERVISOR" };
    const before = await fixture.managementPost(
      path,
      actor.auth.accessToken,
      command,
    );
    expect(before).toMatchObject({
      status: 403,
      body: { code: "MFA_STEP_UP_REQUIRED" },
    });

    const fabricated = await fixture.runtimeSql(
      `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
         mfa_authenticated_at=clock_timestamp(),
         last_admin_activity_at=clock_timestamp()
       WHERE id=$1 RETURNING id`,
      [actor.auth.sessionId, actor.assured!.factorId],
    );
    const after = await fixture.managementPost(
      path,
      actor.auth.accessToken,
      command,
    );
    const member = await fixture.query<{ role: string; version: number }>(
      `SELECT role::text,version FROM organization_memberships WHERE id=$1`,
      [target.membershipId],
    );
    expect(after).toMatchObject({
      status: 403,
      body: { code: "MFA_STEP_UP_REQUIRED" },
    });
    expect(member.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
    expect(fabricated.allowed).toBe(false);
  });

  it("cannot turn a revoked session into sensitive authority through timestamp forgery", async () => {
    const actor = await fixture.admin(true);
    const target = await fixture.employee(actor.membership.organizationId);
    const path = staffRolePath(
      actor.membership.organizationId,
      target.membershipId,
    );
    expect((await fixture.logout(actor.auth.refreshToken)).status).toBe(204);

    const attempted = await fixture.runtimeSql(
      `UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp(),
         last_admin_activity_at=clock_timestamp(),revoked_at=NULL
       WHERE id=$1 RETURNING id`,
      [actor.auth.sessionId],
    );
    const command = { expectedVersion: 1, role: "VALET_SUPERVISOR" };
    const response = await fixture.managementPost(
      path,
      actor.auth.accessToken,
      command,
    );
    expect(response.status).toBe(401);
    expect(attempted.allowed).toBe(false);
  });
});
