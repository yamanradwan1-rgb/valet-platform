import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  OptionCAfterOnboardingFixture,
  activationPassword,
  invitationToken,
} from "./after-onboarding-fixture";

const fixture = new OptionCAfterOnboardingFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C AFTER / real mounted Staff, MFA and onboarding positive controls", () => {
  it("creates, resends, activates and logs in with actual authorized credentials", async () => {
    const actor = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(actor.locationId);
    const issued = await fixture.createViaHttp(
      actor.membership.organizationId, actor.auth.accessToken, command,
    );
    expect(issued.status).toBe(201);
    expect(issued.body?.outcome).toBe("INVITE_ISSUED");
    const memberId = String(issued.body?.membershipId);
    expect(await fixture.pendingSnapshot(memberId)).toMatchObject({
      member_status: "PENDING", user_status: "PENDING", password_hash: null,
      count: "1", consumed: "0",
    });

    const resent = await fixture.resendViaHttp(
      actor.membership.organizationId, memberId, actor.auth.accessToken,
    );
    expect(resent.status).toBe(201);
    expect(resent.body?.outcome).toBe("INVITE_ISSUED");
    expect((await fixture.activateViaHttp(
      invitationToken(String(issued.body?.activationLink)),
    )).status).not.toBe(200);
    const activation = await fixture.activateViaHttp(
      invitationToken(String(resent.body?.activationLink)),
    );
    expect(activation).toMatchObject({ status: 200, body: { outcome: "ACTIVATED" } });
    expect(await fixture.pendingSnapshot(memberId)).toMatchObject({
      member_status: "ACTIVE", user_status: "ACTIVE", count: "2", consumed: "1",
    });
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: command.email, password: activationPassword },
    });
    expect(login.status).toBe(200);
  });

  it("denies unauthenticated, unassured, expired-session and cross-tenant issuers", async () => {
    const userA = await fixture.createUser();
    const memberA = await fixture.createMembership(userA.id);
    const location = await fixture.addLocation(memberA.organizationId);
    const authA = await fixture.nativeLogin(userA);
    const command = fixture.newInvitation(location.locationId);
    const orgB = await fixture.onboardingAdmin();
    const path = `/v1/staff/management/organizations/${memberA.organizationId}/staff`;

    expect((await fixture.request(path, { body: command })).status).toBe(401);
    expect((await fixture.managementPost(path, authA.accessToken, command)).status).toBe(403);
    expect((await fixture.managementPost(path, orgB.auth.accessToken, command)).status).toBe(404);
    await fixture.enrollAndAssure(authA);
    expect((await fixture.managementPost(path, authA.accessToken, command)).status).toBe(201);
    expect((await fixture.logout(authA.refreshToken)).status).toBe(204);
    expect((await fixture.managementPost(path, authA.accessToken,
      fixture.newInvitation(location.locationId),
    )).status).toBe(401);
  });
});
