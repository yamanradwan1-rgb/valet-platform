import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  StaffOnboardingTestFixture,
  hidden,
  issued,
} from "./staff-onboarding-test-fixture";

const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function rateEvents(scope: string) {
  const result = await fixture.query<{
    key_hash: string;
    state: string;
  }>(
    "SELECT key_hash,state FROM anti_abuse_events WHERE scope=$1 ORDER BY occurred_at,id",
    [scope],
  );
  return result.rows;
}

function limited(response: Awaited<ReturnType<typeof fixture.create>>) {
  expect(response.status).toBe(429);
  expect(response.body?.code).toBe("STAFF_ONBOARDING_RATE_LIMITED");
  expect(response.body?.message).toBe("Too many requests. Try again later.");
  const retryAfter = Number(response.headers.get("retry-after"));
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(900);
  expect("activationLink" in response.body!).toBe(false);
}

describe("T05-C bounded invitation issuance", () => {
  it("bounds fresh creates per Organization while preserving committed-operation reconciliation", async () => {
    const actor = await fixture.actor();
    const firstCommand = fixture.command(actor.locationId);
    const first = issued(await fixture.create(actor, firstCommand));
    for (let index = 1; index < 20; index += 1) {
      issued(await fixture.create(actor));
    }

    const denied = fixture.command(actor.locationId);
    limited(await fixture.create(actor, denied));
    const existing = await fixture.createUser();
    limited(
      await fixture.create(
        actor,
        fixture.command(actor.locationId, { email: existing.email }),
      ),
    );
    const replay = await fixture.create(actor, firstCommand);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({
      generation: 1,
      invitationId: first.invitationId,
      membershipId: first.membershipId,
      outcome: "INVITE_PENDING_LINK_UNAVAILABLE",
    });
    expect("activationLink" in replay.body!).toBe(false);

    const key = new AntiAbuseKeyDeriver().derive(
      "v1:staff-onboarding-create-organization",
      actor.organizationId,
    );
    const events = await rateEvents(key.scope);
    expect(events).toHaveLength(20);
    expect(events.every((event) => event.state === "COUNTED")).toBe(true);
    expect(events.every((event) => event.key_hash === key.keyHash)).toBe(true);
    expect(key.keyHash).toMatch(/^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/);
    expect(JSON.stringify(events)).not.toContain(firstCommand.email);
    expect(JSON.stringify(events)).not.toContain(first.activationLink);
    expect(JSON.stringify(events)).not.toContain(actor.organizationId);

    const state = await fixture.query<{
      members: string;
      invites: string;
      audits: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM organization_memberships WHERE organization_id=$1 AND status='PENDING') AS members,
         (SELECT count(*)::text FROM staff_onboarding_invitations WHERE organization_id=$1) AS invites,
         (SELECT count(*)::text FROM audit_events WHERE organization_id=$1 AND event_type='STAFF_ONBOARDING_INVITATION_ISSUED') AS audits`,
      [actor.organizationId],
    );
    expect(state.rows[0]).toEqual({
      members: "20",
      invites: "20",
      audits: "20",
    });
    expect(
      (
        await fixture.query("SELECT 1 FROM users WHERE email=$1", [
          denied.email,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("bounds explicit resend per membership without rotating on a limited request or replay", async () => {
    const actor = await fixture.actor();
    const first = issued(await fixture.create(actor));
    let lastOperation = randomUUID();
    let latest = first;
    for (let index = 0; index < 5; index += 1) {
      lastOperation = randomUUID();
      latest = issued(
        await fixture.resend(actor, first.membershipId, lastOperation),
      );
    }
    expect(latest.generation).toBe(6);
    limited(await fixture.resend(actor, first.membershipId));
    const replay = await fixture.resend(
      actor,
      first.membershipId,
      lastOperation,
    );
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({
      generation: 6,
      invitationId: latest.invitationId,
      outcome: "INVITE_PENDING_LINK_UNAVAILABLE",
    });
    expect("activationLink" in replay.body!).toBe(false);

    const key = new AntiAbuseKeyDeriver().derive(
      "v1:staff-onboarding-resend-membership",
      first.membershipId,
    );
    const events = await rateEvents(key.scope);
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.state === "COUNTED")).toBe(true);
    expect(events.every((event) => event.key_hash === key.keyHash)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(first.membershipId);
    expect(JSON.stringify(events)).not.toContain(latest.activationLink);
    const state = await fixture.query<{ invites: string; audits: string }>(
      `SELECT
         (SELECT count(*)::text FROM staff_onboarding_invitations WHERE membership_id=$1) AS invites,
         (SELECT count(*)::text FROM audit_events WHERE entity_id=$1 AND event_type IN ('STAFF_ONBOARDING_INVITATION_ISSUED','STAFF_ONBOARDING_INVITATION_RESENT')) AS audits`,
      [first.membershipId],
    );
    expect(state.rows[0]).toEqual({ invites: "6", audits: "6" });
  });

  it("requires current CA and LM MFA/authority before quota is considered", async () => {
    const admin = await fixture.actor("ORG_ADMIN", false);
    const manager = await fixture.actor("LOCATION_MANAGER", false);
    for (const actor of [admin, manager]) {
      const noAssurance = await fixture.create(actor);
      expect(noAssurance.status).toBe(403);
      expect(noAssurance.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    }
    await fixture.enrollAndAssure(manager.auth);
    const outside = await fixture.addLocation(manager.organizationId);
    hidden(
      await fixture.create(
        manager,
        fixture.command(manager.locationId, {
          locationIds: [outside.locationId],
        }),
      ),
    );
    issued(await fixture.create(manager));
    const events = await rateEvents("v1:staff-onboarding-create-organization");
    expect(events.map((event) => event.state).sort()).toEqual([
      "COUNTED",
      "IGNORED",
    ]);
  });

  it("ignores a failed issuance reservation and keeps the scope constraint closed", async () => {
    const actor = await fixture.actor();
    const origin = process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
    delete process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
    try {
      const failed = await fixture.create(actor);
      expect(failed.body?.code).toBe("STAFF_ONBOARDING_UNAVAILABLE");
    } finally {
      process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN = origin;
    }
    const events = await rateEvents("v1:staff-onboarding-create-organization");
    expect(events).toHaveLength(1);
    expect(events[0]?.state).toBe("IGNORED");
    issued(await fixture.create(actor));
    expect(
      await rateEvents("v1:staff-onboarding-create-organization"),
    ).toHaveLength(2);
    await expect(
      fixture.query(
        `INSERT INTO anti_abuse_events(scope,key_hash,state)
         VALUES('v1:unapproved-scope',$1,'COUNTED')`,
        [events[0]?.key_hash],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "anti_abuse_events_scope_check",
    });
  });
});
