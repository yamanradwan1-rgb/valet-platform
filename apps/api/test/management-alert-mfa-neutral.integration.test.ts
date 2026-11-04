import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";

const fixture = new ManagementAlertMfaFixture();

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 60_000);

const base = (organizationId: string) =>
  `/v1/staff/management/organizations/${organizationId}`;

describe("Issue #414 selected Management reads remain MFA-activity neutral (PG17, bypass OFF)", () => {
  it("keeps manual context/subscription reads neutral across access and refresh rotation", async () => {
    const { auth, location, membership } = await fixture.createAssuredAdmin();
    const path = base(membership.organizationId);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '1 hour',
           mfa_authenticated_at=clock_timestamp()-interval '40 minutes',
           last_admin_activity_at=clock_timestamp()-interval '29 minutes'
       WHERE id=$1`,
      [auth.sessionId],
    );
    const original = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    const selected = `${path}/context?scopeKind=LOCATION&locationId=${location.locationId}`;
    const subscription = `${path}/subscription`;

    for (let i = 0; i < 3; i++) {
      const context = await fixture.managementGet(selected, auth.accessToken);
      expect(context.status).toBe(200);
      expect(context.body?.selectedLocation).toMatchObject({
        locationId: location.locationId,
      });
      expect(
        (await fixture.managementGet(subscription, auth.accessToken)).status,
      ).toBe(200);
    }

    const renewed = await fixture.refresh(auth.refreshToken);
    expect(renewed.status).toBe(200);
    const rotatedToken = String(renewed.body?.accessToken);
    for (let i = 0; i < 3; i++) {
      expect((await fixture.managementGet(selected, rotatedToken)).status).toBe(
        200,
      );
      expect(
        (await fixture.managementGet(subscription, rotatedToken)).status,
      ).toBe(200);
    }
    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(after.last_admin_activity_at).toEqual(
      original.last_admin_activity_at,
    );
    expect(after.mfa_authenticated_at).toEqual(original.mfa_authenticated_at);
    expect(after.absolute_expires_at).toEqual(original.absolute_expires_at);

    await fixture.query(
      `UPDATE staff_auth_sessions
       SET last_admin_activity_at=clock_timestamp()-interval '30 minutes 1 second'
       WHERE id=$1`,
      [auth.sessionId],
    );
    expect((await fixture.managementGet(selected, rotatedToken)).status).toBe(
      403,
    );
    expect(
      (await fixture.managementGet(subscription, rotatedToken)).status,
    ).toBe(403);
    const inactive = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(inactive.last_admin_activity_at!.getTime()).toBeLessThan(
      after.last_admin_activity_at!.getTime(),
    );
  });

  it("never turns subscription/context reads into an eight-hour MFA extension", async () => {
    const { auth, membership } = await fixture.createAssuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '9 hours',
           mfa_authenticated_at=clock_timestamp()-interval '8 hours 1 second',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [auth.sessionId],
    );
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    const refresh = await fixture.refresh(auth.refreshToken);
    expect(refresh.status).toBe(200);
    const token = String(refresh.body?.accessToken);
    for (const suffix of [
      "/subscription",
      "/context?scopeKind=ALL_LOCATIONS",
    ]) {
      const response = await fixture.managementGet(
        base(membership.organizationId) + suffix,
        token,
      );
      expect(response).toMatchObject({
        status: 403,
        body: { code: "MFA_STEP_UP_REQUIRED" },
      });
    }
    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
  });

  it("keeps five-minute sensitive writes gated and interactive Management activity working", async () => {
    const { auth, factor, membership } = await fixture.createAssuredAdmin();
    const path = base(membership.organizationId);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '1 hour',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '2 minutes'
       WHERE id=$1`,
      [auth.sessionId],
    );
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(
      (await fixture.managementGet(path + "/subscription", auth.accessToken))
        .status,
    ).toBe(200);
    expect(
      (
        await fixture.managementGet(
          path + "/context?scopeKind=ALL_LOCATIONS",
          auth.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]
        ?.last_admin_activity_at,
    ).toEqual(before.last_admin_activity_at);

    const settings = await fixture.managementGet(
      path + "/settings",
      auth.accessToken,
    );
    expect(settings.status).toBe(200);
    const active = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(active.last_admin_activity_at!.getTime()).toBeGreaterThan(
      before.last_admin_activity_at!.getTime(),
    );
    const command = {
      expectedUpdatedAt: settings.body?.updatedAt,
      setting: "languageDefault",
      value: "AR",
    };
    const stale = await fixture.managementPut(
      path + "/settings/default",
      auth.accessToken,
      command,
    );
    expect(stale).toMatchObject({
      status: 403,
      body: { code: "MFA_STEP_UP_REQUIRED" },
    });

    expect((await fixture.stepUp(auth, factor.secret)).status).toBe(200);
    const assured = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    const changed = await fixture.managementPut(
      path + "/settings/default",
      auth.accessToken,
      command,
    );
    expect(changed.status).toBe(200);
    expect(changed.body?.defaults).toMatchObject({ languageDefault: "AR" });
    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(after.last_admin_activity_at!.getTime()).toBeGreaterThanOrEqual(
      assured.last_admin_activity_at!.getTime(),
    );
  });
});
