import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  generateStaffCredential,
  staffCredentialHash,
} from "../../src/modules/auth/staff-auth-credential";
import { OptionCAfterFixture, assertRuntimeDeny } from "./after-fixture";
import {
  staffRolePath,
  staffDirectoryPath,
} from "../issue416-option-c-t5/probe-fixture";

const fixture = new OptionCAfterFixture();
const mfaState = "/v1/staff/auth/mfa/state";
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C AFTER / mounted bearer, MFA and Management acceptance", () => {
  it("denies SQL-forged access verifier followed by mounted Staff bearer", async () => {
    const actor = await fixture.admin();
    const forged = generateStaffCredential("vsa1.");
    await assertRuntimeDeny(
      fixture,
      `INSERT INTO staff_auth_sessions
         (id,user_id,current_access_token_hash,access_expires_at,
          absolute_expires_at,created_at,last_rotated_at)
       VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes',
          clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp())`,
      [randomUUID(), actor.user.id, staffCredentialHash("access", forged)],
    );
    expect((await fixture.getMfa(mfaState, forged)).status).toBe(401);
    expect(
      (await fixture.getMfa(mfaState, actor.auth.accessToken)).status,
    ).toBe(200);
  });

  it("rejects SQL-only resurrection after logout and preserved refresh credentials", async () => {
    const actor = await fixture.admin(true);
    expect((await fixture.logout(actor.auth.refreshToken)).status).toBe(204);
    await assertRuntimeDeny(
      fixture,
      `UPDATE staff_auth_sessions SET revoked_at=NULL,
         mfa_authenticated_at=clock_timestamp(),
         last_admin_activity_at=clock_timestamp() WHERE id=$1 RETURNING id`,
      [actor.auth.sessionId],
    );
    expect(
      (await fixture.getMfa(mfaState, actor.auth.accessToken)).status,
    ).toBe(401);
    expect((await fixture.refresh(actor.auth.refreshToken)).status).toBe(401);
  });

  it("denies SQL-only MFA assurance while genuine TOTP still unlocks sensitive action", async () => {
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
    expect(
      (
        await fixture.managementPost(path, actor.auth.accessToken, {
          expectedVersion: 1,
          role: "VALET_SUPERVISOR",
        })
      ).status,
    ).toBe(403);
    await assertRuntimeDeny(
      fixture,
      `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
          mfa_authenticated_at=clock_timestamp(),
          last_admin_activity_at=clock_timestamp() WHERE id=$1 RETURNING id`,
      [actor.auth.sessionId, actor.assured!.factorId],
    );
    const denied = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(denied.status).toBe(403);
    expect(
      (await fixture.stepUp(actor.auth, actor.assured!.secret)).status,
    ).toBe(200);
    const allowed = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body).toMatchObject({
      role: "VALET_SUPERVISOR",
      version: 2,
    });
  });

  it("denies legacy actor-UUID role mutation after logout and preserves tenant separation", async () => {
    const adminA = await fixture.admin(true);
    const adminB = await fixture.admin(true);
    const targetA = await fixture.employee(adminA.membership.organizationId);
    const own = staffDirectoryPath(adminA.membership.organizationId);
    const foreign = staffDirectoryPath(adminB.membership.organizationId);
    expect(
      (await fixture.managementGet(foreign, adminA.auth.accessToken)).status,
    ).toBe(404);
    expect((await fixture.logout(adminA.auth.refreshToken)).status).toBe(204);
    await assertRuntimeDeny(
      fixture,
      `SELECT changed FROM public.staff_management_set_role(
        $1::uuid,$2::uuid,$3::uuid,1,'LOCATION_MANAGER')`,
      [
        adminA.membership.membershipId,
        adminA.membership.organizationId,
        targetA.membershipId,
      ],
      "public.staff_management_set_role(uuid,uuid,uuid,integer,membership_role)",
    );
    expect(
      (await fixture.managementGet(own, adminA.auth.accessToken)).status,
    ).toBe(401);
    expect(
      (await fixture.managementGet(own, targetA.auth.accessToken)).status,
    ).toBe(404);
    const membership = await fixture.query<{ role: string; version: number }>(
      `SELECT role::text,version FROM organization_memberships WHERE id=$1`,
      [targetA.membershipId],
    );
    expect(membership.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
  });

  it("preserves legitimate Staff login, refresh, tenant Management and final logout", async () => {
    const actor = await fixture.admin(true);
    const target = await fixture.employee(actor.membership.organizationId);
    const path = staffRolePath(
      actor.membership.organizationId,
      target.membershipId,
    );
    expect(
      (
        await fixture.managementPost(path, actor.auth.accessToken, {
          expectedVersion: 1,
          role: "VALET_SUPERVISOR",
        })
      ).status,
    ).toBe(201);
    const refreshed = await fixture.refresh(actor.auth.refreshToken);
    expect(refreshed.status).toBe(200);
    const nextBearer = String(refreshed.body?.accessToken);
    const nextRefresh = String(refreshed.body?.refreshToken);
    expect(
      (await fixture.getMfa(mfaState, actor.auth.accessToken)).status,
    ).toBe(401);
    expect((await fixture.getMfa(mfaState, nextBearer)).status).toBe(200);
    expect(
      (
        await fixture.managementGet(
          staffDirectoryPath(actor.membership.organizationId),
          nextBearer,
        )
      ).status,
    ).toBe(200);
    expect((await fixture.logout(nextRefresh)).status).toBe(204);
    expect((await fixture.getMfa(mfaState, nextBearer)).status).toBe(401);
  });

  it("keeps an expired access credential terminal across refresh and logout", async () => {
    const actor = await fixture.admin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at=created_at+interval '1 millisecond'
       WHERE id=$1`,
      [actor.auth.sessionId],
    );
    expect(
      (await fixture.getMfa(mfaState, actor.auth.accessToken)).status,
    ).toBe(401);

    const refreshed = await fixture.refresh(actor.auth.refreshToken);
    expect(refreshed.status).toBe(200);
    const nextBearer = String(refreshed.body?.accessToken);
    const nextRefresh = String(refreshed.body?.refreshToken);
    expect((await fixture.getMfa(mfaState, nextBearer)).status).toBe(200);
    expect(
      (await fixture.getMfa(mfaState, actor.auth.accessToken)).status,
    ).toBe(401);

    expect((await fixture.logout(nextRefresh)).status).toBe(204);
    expect((await fixture.getMfa(mfaState, nextBearer)).status).toBe(401);
  });
});
