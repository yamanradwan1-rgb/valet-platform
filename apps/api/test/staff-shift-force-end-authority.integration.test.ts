import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-F fresh authority before closure and replay", () => {
  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies %s even with borrowed active account MFA",
    async (role) => {
      const s = await fixture.scenario(role);
      // Enroll via a separate management membership, then remove that authority.
      const other = await fixture.createMembership(s.actorUser.id);
      await fixture.enrollAndAssure(s.auth);
      await fixture.query(
        "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
        [other.membershipId],
      );
      expect((await fixture.force(s)).status).toBe(404);
      expect(await fixture.snapshot(s.shiftId)).toMatchObject({
        status: "ACTIVE",
        closures: 0,
        audits: 0,
      });
    },
  );

  it("conceals missing, foreign and outside-LM targets without target facts", async () => {
    const s = await fixture.scenario("LOCATION_MANAGER");
    const foreign = await fixture.scenario();
    for (const id of [randomUUID(), foreign.shiftId]) {
      const response = await fixture.managementPost(
        s.path.replace(s.shiftId, id),
        s.auth.accessToken,
        s.command,
      );
      expect(response.status).toBe(404);
      expect(response.body?.code).toBe("AUTHORIZATION_DENIED");
      expect(JSON.stringify(response.body).includes(foreign.locationId)).toBe(
        false,
      );
    }
    await fixture.query("UPDATE shifts SET location_id=$2 WHERE id=$1", [
      s.shiftId,
      s.outsideId,
    ]);
    expect((await fixture.force(s)).status).toBe(404);
    expect(await fixture.snapshot(s.shiftId)).toMatchObject({
      status: "ACTIVE",
      closures: 0,
    });
  });

  it.each([
    "grant",
    "location",
    "role",
    "membership",
    "organization",
    "entitlement",
    "user",
    "revoke",
    "factor",
    "freshness",
  ])("denies replay after %s loss", async (loss) => {
    const s = await fixture.scenario("LOCATION_MANAGER");
    expect((await fixture.force(s)).status).toBe(201);
    const before = await fixture.snapshot(s.shiftId);
    const changes: Record<string, [string, unknown[]]> = {
      grant: [
        "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [s.actorMembershipId, s.locationId],
      ],
      location: [
        "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1",
        [s.locationId],
      ],
      role: [
        "UPDATE organization_memberships SET role='VALET_SUPERVISOR' WHERE id=$1",
        [s.actorMembershipId],
      ],
      membership: [
        "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
        [s.actorMembershipId],
      ],
      organization: [
        "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
        [s.organizationId],
      ],
      entitlement: [
        "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
        [s.organizationId],
      ],
      user: [
        "UPDATE users SET status='DISABLED' WHERE id=$1",
        [s.actorUser.id],
      ],
      revoke: [
        "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
        [s.auth.sessionId],
      ],
      factor: [
        "UPDATE user_mfa_totp_factors SET state='RETIRED',retired_at=clock_timestamp() WHERE id=$1",
        [s.factor!.factorId],
      ],
      freshness: [
        "UPDATE staff_auth_sessions SET created_at=now()-interval '10 hours',mfa_authenticated_at=now()-interval '6 minutes' WHERE id=$1",
        [s.auth.sessionId],
      ],
    };
    const [sql, values] = changes[loss]!;
    await fixture.query(sql, values);
    const response = await fixture.force(s);
    expect(response.status).toBe(
      ["user", "revoke"].includes(loss)
        ? 401
        : ["factor", "freshness"].includes(loss)
          ? 403
          : 404,
    );
    expect(JSON.stringify(response.body).includes(s.command.reason)).toBe(
      false,
    );
    expect(response.body).not.toHaveProperty("endedAt");
    expect(await fixture.snapshot(s.shiftId)).toEqual(before);
  });

  it.each(["sensitive", "maximum", "idle", "expired", "other-session"])(
    "uses sensitive/exact assurance (%s)",
    async (failure) => {
      const s = await fixture.scenario();
      if (failure === "other-session") {
        const other = await fixture.nativeLogin(s.actorUser);
        expect(
          (await fixture.managementPost(s.path, other.accessToken, s.command))
            .status,
        ).toBe(403);
      } else {
        const condition: Record<string, string> = {
          sensitive: "mfa_authenticated_at=now()-interval '6 minutes'",
          maximum: "mfa_authenticated_at=now()-interval '8 hours'",
          idle: "mfa_authenticated_at=now()-interval '31 minutes',last_admin_activity_at=now()-interval '30 minutes'",
          expired: "access_expires_at=now()-interval '1 second'",
        };
        await fixture.query(
          `UPDATE staff_auth_sessions SET created_at=now()-interval '10 hours',${condition[failure]} WHERE id=$1`,
          [s.auth.sessionId],
        );
        expect((await fixture.force(s)).status).toBe(
          failure === "expired" ? 401 : 403,
        );
      }
      expect(await fixture.snapshot(s.shiftId)).toMatchObject({
        status: "ACTIVE",
        closures: 0,
      });
    },
  );

  it("rejects malformed strict bodies, query commands and UUIDs without writing", async () => {
    const s = await fixture.scenario();
    for (const change of [
      { confirmation: false },
      { reason: "  " },
      { reason: "x".repeat(501) },
      { operationId: "invalid" },
      { confirmed: true },
    ])
      expect((await fixture.force(s, { ...s.command, ...change })).status).toBe(
        400,
      );
    expect(
      (
        await fixture.managementPost(
          `${s.path}?reason=anything`,
          s.auth.accessToken,
          s.command,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.managementPost(
          s.path.replace(s.shiftId, "invalid"),
          s.auth.accessToken,
          s.command,
        )
      ).status,
    ).toBe(400);
    expect(await fixture.snapshot(s.shiftId)).toMatchObject({
      status: "ACTIVE",
      closures: 0,
      audits: 0,
    });
  });
});
