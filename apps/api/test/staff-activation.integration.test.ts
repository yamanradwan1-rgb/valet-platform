import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { isAcceptedStaffPasswordHash } from "../src/modules/auth/staff-password-verification";
import { staffActivationAuditMetadataSchema } from "@valet/contracts";
import {
  StaffActivationTestFixture,
  ACTIVATION_PASSWORD,
  invitationToken,
} from "./staff-activation-test-fixture";
import { issued } from "./staff-onboarding-test-fixture";

const fixture = new StaffActivationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-D real public activation", () => {
  it("existing legacy short password proves ownership without applying new-password policy", async () => {
    const actor = await fixture.actor();
    const user = await fixture.createUser();
    const { hashStaffPassword } =
      await import("../src/modules/auth/staff-password-hashing");
    const hash = await hashStaffPassword("short");
    await fixture.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
      user.id,
      hash,
    ]);
    const invite = issued(
      await fixture.create(
        actor,
        fixture.command(actor.locationId, { email: user.email }),
      ),
    );
    expect(
      (await fixture.activate(invitationToken(invite.activationLink), "short"))
        .status,
    ).toBe(200);
    expect(
      (await fixture.snapshot(invite.membershipId)).password_hash === hash,
    ).toBe(true);
  });
  it("initializes pending once, reconciles lost response, issues no session, then permits normal login", async () => {
    const actor = await fixture.actor();
    const command = fixture.command(actor.locationId);
    const invite = issued(await fixture.create(actor, command));
    const token = invitationToken(invite.activationLink);
    const response = await fixture.activate(token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: "ACTIVATED" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    const state = await fixture.snapshot(invite.membershipId);
    expect(state.status).toBe("ACTIVE");
    expect(state.user_status).toBe("ACTIVE");
    expect(state.version).toBe(2);
    expect(state.consumed).toBe(1);
    expect(state.audits).toBe(1);
    expect(state.sessions).toBe(0);
    expect(isAcceptedStaffPasswordHash(state.password_hash!)).toBe(true);
    const retry = await fixture.activate(token);
    expect(retry.body).toEqual({ outcome: "ALREADY_ACTIVATED" });
    expect(
      (await fixture.snapshot(invite.membershipId)).password_hash ===
        state.password_hash,
    ).toBe(true);
    expect((await fixture.snapshot(invite.membershipId)).audits).toBe(1);
    const audit = await fixture.query<{ metadata_json: unknown }>(
      "SELECT metadata_json FROM audit_events WHERE entity_id=$1 AND event_type='STAFF_ONBOARDING_ACTIVATED'",
      [invite.membershipId],
    );
    expect(
      staffActivationAuditMetadataSchema.safeParse(audit.rows[0]?.metadata_json)
        .success,
    ).toBe(true);
    const scope = await fixture.query(
      "SELECT organization_id,actor_type,actor_membership_id,entity_type FROM audit_events WHERE entity_id=$1 AND event_type='STAFF_ONBOARDING_ACTIVATED'",
      [invite.membershipId],
    );
    expect(scope.rows[0]).toEqual({
      organization_id: actor.organizationId,
      actor_type: "MEMBERSHIP",
      actor_membership_id: invite.membershipId,
      entity_type: "OrganizationMembership",
    });
    const login = await fixture.request("/v1/staff/auth/login", {
      origin: fixture.allowedOrigin,
      body: { email: command.email, password: ACTIVATION_PASSWORD },
    });
    expect(login.status).toBe(200);
  });

  it("requires existing password, preserves hash and unrelated sessions/memberships", async () => {
    const actor = await fixture.actor();
    const existing = await fixture.createUser();
    const other = await fixture.createMembership(existing.id, {
      role: "VALET_EMPLOYEE",
    });
    const auth = await fixture.nativeLogin(existing);
    const invite = issued(
      await fixture.create(
        actor,
        fixture.command(actor.locationId, { email: existing.email }),
      ),
    );
    const token = invitationToken(invite.activationLink);
    const before = await fixture.snapshot(invite.membershipId);
    const wrong = await fixture.activate(token);
    expect(wrong.status).toBe(401);
    expect(wrong.body?.code).toBe("STAFF_ACTIVATION_FAILED");
    expect((await fixture.snapshot(invite.membershipId)).consumed).toBe(0);
    const result = await fixture.activate(token, existing.password);
    expect(result.body).toEqual({ outcome: "ACTIVATED" });
    const after = await fixture.snapshot(invite.membershipId);
    expect(after.password_hash === before.password_hash).toBe(true);
    expect(after.sessions).toBe(before.sessions);
    expect(
      (
        await fixture.managementGet(
          `/v1/staff/management/organizations/${other.organizationId}/staff`,
          auth.accessToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.request("/v1/staff/auth/native/refresh", {
          body: { refreshToken: auth.refreshToken },
        })
      ).status,
    ).toBe(200);
  });

  it.each([
    "expired",
    "revoked",
    "disabled",
    "inactive-org",
    "inactive-member",
    "old-generation",
  ])("conceals %s without consumption", async (kind) => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    if (kind === "expired")
      await fixture.query(
        "UPDATE staff_onboarding_invitations SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",
        [invite.invitationId],
      );
    if (kind === "revoked")
      await fixture.query(
        "UPDATE staff_onboarding_invitations SET revoked_at=clock_timestamp() WHERE id=$1",
        [invite.invitationId],
      );
    if (kind === "disabled")
      await fixture.query(
        "UPDATE users SET status='DISABLED',password_hash=$2 WHERE id=(SELECT user_id FROM organization_memberships WHERE id=$1)",
        [
          invite.membershipId,
          (await fixture.snapshot(actor.membershipId)).password_hash,
        ],
      );
    if (kind === "inactive-org")
      await fixture.query(
        "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
        [actor.organizationId],
      );
    if (kind === "inactive-member")
      await fixture.query(
        "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
        [invite.membershipId],
      );
    if (kind === "old-generation")
      issued(await fixture.resend(actor, invite.membershipId));
    const result = await fixture.activate(
      invitationToken(invite.activationLink),
    );
    expect(result.status).toBe(401);
    expect(result.body?.code).toBe("STAFF_ACTIVATION_FAILED");
    expect((await fixture.snapshot(invite.membershipId)).consumed).toBe(0);
    expect((await fixture.snapshot(invite.membershipId)).audits).toBe(0);
  });

  it("rolls back credential/member/consume if audit insertion fails", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    await fixture.query(
      "ALTER TABLE audit_events ADD CONSTRAINT test_240d_audit_failure CHECK(event_type <> 'STAFF_ONBOARDING_ACTIVATED') NOT VALID",
    );
    try {
      expect(
        (await fixture.activate(invitationToken(invite.activationLink))).status,
      ).toBe(500);
      const state = await fixture.snapshot(invite.membershipId);
      expect(state.password_hash === null).toBe(true);
      expect(state.status).toBe("PENDING");
      expect(state.version).toBe(1);
      expect(state.consumed).toBe(0);
    } finally {
      await fixture.query(
        "ALTER TABLE audit_events DROP CONSTRAINT test_240d_audit_failure",
      );
    }
  });

  it("enforces origin, strict body/query/JSON and generic unknown credential/policy failures", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const body = {
      inviteToken: invitationToken(invite.activationLink),
      password: ACTIVATION_PASSWORD,
    };
    expect((await fixture.activate("malformed")).status).toBe(400);
    expect(
      (
        await fixture.request("/v1/staff/auth/activate", {
          origin: fixture.allowedOrigin,
          contentType: "text/plain",
          body,
        })
      ).status,
    ).toBe(400);
    expect(
      (await fixture.request("/v1/staff/auth/activate", { body })).status,
    ).toBe(403);
    expect(
      (
        await fixture.request("/v1/staff/auth/activate?invite=x", {
          origin: fixture.allowedOrigin,
          body,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.request("/v1/staff/auth/activate", {
          origin: fixture.allowedOrigin,
          body: { ...body, email: "x" },
        })
      ).status,
    ).toBe(400);
    expect((await fixture.activate(`vsi1.${"z".repeat(43)}`)).body?.code).toBe(
      "STAFF_ACTIVATION_FAILED",
    );
    expect((await fixture.activate(body.inviteToken, "short")).body?.code).toBe(
      "STAFF_ACTIVATION_FAILED",
    );
    expect((await fixture.snapshot(invite.membershipId)).status).toBe(
      "PENDING",
    );
  });
});
