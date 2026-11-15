import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertRuntimeDeny } from "./after-fixture";
import {
  OptionCAfterOnboardingFixture,
  activationPassword,
  forgedInvitationToken,
  invitationToken,
  invitationVerifier,
} from "./after-onboarding-fixture";

const fixture = new OptionCAfterOnboardingFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

const fingerprint = () => randomBytes(32).toString("hex");

describe("Option C AFTER / onboarding issuer and activation trust boundaries", () => {
  it("denies SQL-only create using an assured Admin UUID without bearer proof", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const fakeToken = forgedInvitationToken();
    await assertRuntimeDeny(
      fixture,
      `SELECT * FROM public.staff_onboarding_create(
        $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,
        $8::membership_role,$9::uuid[],$10::text)`,
      [
        actor.membership.membershipId,
        actor.membership.organizationId,
        randomUUID(),
        fingerprint(),
        command.email,
        command.firstName,
        command.lastName,
        command.role,
        command.locationIds,
        invitationVerifier(fakeToken),
      ],
      "public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)",
    );
    const affected = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE email=$1`,
      [command.email],
    );
    expect(affected.rows[0]?.count).toBe("0");
    expect((await fixture.activateViaHttp(fakeToken)).status).not.toBe(200);

    const legitimate = await fixture.createViaHttp(
      actor.membership.organizationId,
      actor.auth.accessToken,
      command,
    );
    expect(legitimate.status).toBe(201);
    expect(legitimate.body?.outcome).toBe("INVITE_ISSUED");
  });

  it("denies SQL-only resend after the Admin logged out; preserves valid HTTP rotation", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const created = await fixture.createViaHttp(
      actor.membership.organizationId,
      actor.auth.accessToken,
      command,
    );
    expect(created.body?.outcome).toBe("INVITE_ISSUED");
    const membershipId = String(created.body?.membershipId);
    const fakeToken = forgedInvitationToken();
    const before = await fixture.pendingSnapshot(membershipId);

    expect((await fixture.logout(actor.auth.refreshToken)).status).toBe(204);
    await assertRuntimeDeny(
      fixture,
      `SELECT * FROM public.staff_onboarding_resend(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text)`,
      [
        actor.membership.membershipId,
        actor.membership.organizationId,
        membershipId,
        randomUUID(),
        fingerprint(),
        invitationVerifier(fakeToken),
      ],
      "public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)",
    );
    expect(await fixture.pendingSnapshot(membershipId)).toEqual(before);
    expect((await fixture.activateViaHttp(fakeToken)).status).not.toBe(200);

    const replacementAuth = await fixture.nativeLogin(actor.user);
    await fixture.stepUp(replacementAuth, actor.assured!.secret);
    const legitimate = await fixture.resendViaHttp(
      actor.membership.organizationId,
      membershipId,
      replacementAuth.accessToken,
    );
    expect(legitimate.status).toBe(201);
    expect(legitimate.body?.outcome).toBe("INVITE_ISSUED");
    expect((await fixture.pendingSnapshot(membershipId))?.count).toBe("2");
  });

  it("denies SQL-only activation from stored token verifier and unrelated PHC", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const issued = await fixture.createViaHttp(
      actor.membership.organizationId,
      actor.auth.accessToken,
      command,
    );
    expect(issued.body?.outcome).toBe("INVITE_ISSUED");
    const member = String(issued.body?.membershipId);
    const realToken = invitationToken(String(issued.body?.activationLink));
    const donor = await fixture.createUser();
    const donorHash = await fixture.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1`,
      [donor.id],
    );
    expect(donorHash.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);

    // No genuine invitation bearer is presented to the direct SQL function;
    // its hash is SQL-readable. The donor's PHC is independently valid but
    // proves neither possession of this invite nor the desired new password.
    await assertRuntimeDeny(
      fixture,
      `SELECT public.staff_onboarding_activate(
        $1::text,NULL::text,$2::text) AS outcome`,
      [invitationVerifier(realToken), donorHash.rows[0]!.password_hash],
      "public.staff_onboarding_activate(text,text,text)",
    );
    expect(await fixture.pendingSnapshot(member)).toMatchObject({
      user_status: "PENDING",
      member_status: "PENDING",
      password_hash: null,
      consumed: "0",
    });
    const real = await fixture.activateViaHttp(realToken);
    expect(real.status).toBe(200);
    expect(real.body?.outcome).toBe("ACTIVATED");
    const loggedIn = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: command.email, password: activationPassword },
    });
    expect(loggedIn.status).toBe(200);
  });
});
