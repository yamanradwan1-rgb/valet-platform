import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

async function nativeLogin(email: string, password: string) {
  return fixture.request("/v1/staff/auth/native/login", {
    body: { email, password },
  });
}

describe("Option C BEFORE / onboarding SQL-origin forgery evidence on isolated PG17", () => {
  it("attempts SQL actor-UUID create then mounted activation/login without CA bearer", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const token = forgedInvitationToken();
    const direct = await fixture.runtimeSql(
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
        invitationVerifier(token),
      ],
    );
    const activated = await fixture.activateViaHttp(token);
    const login = await nativeLogin(command.email, activationPassword);
    console.info(
      `W37 BEFORE onboarding CREATE sql=${direct.allowed} activation=${activated.status} login=${login.status}`,
    );
    expect(direct.allowed).toBe(false);
    expect(activated.status).not.toBe(200);
    expect(login.status).toBe(401);
  });

  it("attempts SQL actor-UUID resend after actual logout, then mounted activation/login", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const first = await fixture.createViaHttp(
      actor.membership.organizationId,
      actor.auth.accessToken,
      command,
    );
    expect(first.body?.outcome).toBe("INVITE_ISSUED");
    const member = String(first.body?.membershipId);
    const fakeToken = forgedInvitationToken();
    expect((await fixture.logout(actor.auth.refreshToken)).status).toBe(204);
    const direct = await fixture.runtimeSql(
      `SELECT * FROM public.staff_onboarding_resend(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text)`,
      [
        actor.membership.membershipId,
        actor.membership.organizationId,
        member,
        randomUUID(),
        fingerprint(),
        invitationVerifier(fakeToken),
      ],
    );
    const activated = await fixture.activateViaHttp(fakeToken);
    const login = await nativeLogin(command.email, activationPassword);
    console.info(
      `W37 BEFORE onboarding RESEND sql=${direct.allowed} activation=${activated.status} login=${login.status}`,
    );
    expect(direct.allowed).toBe(false);
    expect(activated.status).not.toBe(200);
    expect(login.status).toBe(401);
  });

  it("attempts SQL activation from stored invitation verifier and unrelated PHC", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const first = await fixture.createViaHttp(
      actor.membership.organizationId,
      actor.auth.accessToken,
      command,
    );
    expect(first.body?.outcome).toBe("INVITE_ISSUED");
    const token = invitationToken(String(first.body?.activationLink));
    const donor = await fixture.createUser();
    const donorHash = await fixture.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1`,
      [donor.id],
    );
    const direct = await fixture.runtimeSql(
      `SELECT public.staff_onboarding_activate(
        $1::text,NULL::text,$2::text) AS outcome`,
      [invitationVerifier(token), donorHash.rows[0]!.password_hash],
    );
    const login = await nativeLogin(command.email, donor.password);
    const member = await fixture.pendingSnapshot(
      String(first.body?.membershipId),
    );
    console.info(
      `W37 BEFORE onboarding ACTIVATE sql=${direct.allowed} login=${login.status} user=${member?.user_status}`,
    );
    expect(direct.allowed).toBe(false);
    expect(login.status).toBe(401);
    expect(member).toMatchObject({
      user_status: "PENDING",
      member_status: "PENDING",
    });
  });
});
