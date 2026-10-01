import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  staffOnboardingAuditEventSchema,
  staffOnboardingAuditMetadataSchema,
} from "@valet/contracts";
import {
  staffInvitationHash,
  staffInvitationTokenPattern,
} from "../src/modules/management/staff-invitation-credential";
import {
  StaffOnboardingTestFixture,
  issued,
} from "./staff-onboarding-test-fixture";
const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
describe("T05-C invitation issuance and durable reconciliation", () => {
  it("creates pending passwordless identity, grants, hash and one redacted audit atomically", async () => {
    const actor = await fixture.actor();
    const command = fixture.command(actor.locationId);
    const response = await fixture.create(actor, command);
    const fresh = issued(response);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Object.keys(fresh).sort()).toEqual(
      [
        "activationLink",
        "expiresAt",
        "generation",
        "invitationId",
        "membershipId",
        "outcome",
      ].sort(),
    );
    const url = new URL(fresh.activationLink);
    expect(url.origin).toBe("https://onboarding.example.test");
    expect(url.pathname).toBe("/staff/activate");
    expect(url.search).toBe("");
    const token = new URLSearchParams(url.hash.slice(1)).get("invite")!;
    expect(staffInvitationTokenPattern.test(token)).toBe(true);
    const rows = await fixture.query<{
      status: string;
      password_hash: string | null;
      member_status: string;
      first_name: string;
      last_name: string;
      token_hash: string;
      stored: string;
      ttl: number;
    }>(
      `SELECT account.status, account.password_hash, member.status AS member_status,
      member.first_name,member.last_name,invitation.token_hash,
      row_to_json(invitation)::text AS stored,
      EXTRACT(EPOCH FROM invitation.expires_at-invitation.created_at)::int AS ttl
      FROM staff_onboarding_invitations AS invitation
      JOIN organization_memberships AS member ON member.id=invitation.membership_id
      JOIN users AS account ON account.id=member.user_id WHERE invitation.id=$1`,
      [fresh.invitationId],
    );
    const row = rows.rows[0]!;
    expect(row.status).toBe("PENDING");
    expect(row.member_status).toBe("PENDING");
    expect(row.password_hash).toBeNull();
    expect(row.first_name).toBe("أحمد");
    expect(row.last_name).toBe("Smith");
    expect(row.ttl).toBe(86_400);
    expect(row.token_hash === staffInvitationHash(token)).toBe(true);
    expect(
      row.stored.includes(token) || row.stored.includes(fresh.activationLink),
    ).toBe(false);
    const audit = await fixture.query<{
      metadata_json: object;
      event_type: string;
    }>("SELECT metadata_json,event_type FROM audit_events WHERE entity_id=$1", [
      fresh.membershipId,
    ]);
    expect(audit.rowCount).toBe(1);
    expect(
      staffOnboardingAuditEventSchema.safeParse(audit.rows[0]?.event_type)
        .success,
    ).toBe(true);
    expect(
      staffOnboardingAuditMetadataSchema.safeParse(audit.rows[0]?.metadata_json)
        .success,
    ).toBe(true);
    expect(audit.rows[0]?.event_type).toBe(
      "STAFF_ONBOARDING_INVITATION_ISSUED",
    );
    expect(Object.keys(audit.rows[0]!.metadata_json).sort()).toEqual(
      [
        "generation",
        "invitationId",
        "locationCount",
        "operationId",
        "outcome",
        "role",
      ].sort(),
    );
    expect(JSON.stringify(audit.rows).includes(token)).toBe(false);
    const grants = await fixture.query(
      "SELECT 1 FROM membership_location_access WHERE membership_id=$1",
      [fresh.membershipId],
    );
    expect(grants.rowCount).toBe(1);

    // A lost first response reconciles durable facts, never recovers/replaces the link.
    const retry = await fixture.create(actor, command);
    expect(retry.status).toBe(201);
    expect(retry.body?.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
    expect("activationLink" in retry.body!).toBe(false);
    expect(retry.body?.invitationId).toBe(fresh.invitationId);
    const changed = await fixture.create(actor, {
      ...command,
      firstName: "Changed",
    });
    expect(changed.status).toBe(409);
    expect(changed.body?.code).toBe("IDEMPOTENCY_CONFLICT");
    const counts = await fixture.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM staff_onboarding_invitations WHERE membership_id=$1",
      [fresh.membershipId],
    );
    expect(counts.rows[0]?.n).toBe("1");
  });
  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "LOCATION_MANAGER"] as const)(
    "CA issues direct %s",
    async (role) => {
      const actor = await fixture.actor();
      const inactive = await fixture.addLocation(actor.organizationId, {
        status: "INACTIVE",
      });
      issued(
        await fixture.create(
          actor,
          fixture.command(inactive.locationId, { role }),
        ),
      );
    },
  );
  it("reuses ACTIVE and PENDING global Users without leaking other memberships or touching credentials", async () => {
    const actor = await fixture.actor();
    const existing = await fixture.createUser();
    const other = await fixture.createMembership(existing.id);
    const before = await fixture.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1",
      [existing.id],
    );
    const fresh = issued(
      await fixture.create(
        actor,
        fixture.command(actor.locationId, { email: existing.email }),
      ),
    );
    const account = await fixture.query<{
      user_id: string;
      status: string;
      password_hash: string;
    }>(
      "SELECT member.user_id,account.status,account.password_hash FROM organization_memberships member JOIN users account ON account.id=member.user_id WHERE member.id=$1",
      [fresh.membershipId],
    );
    expect(account.rows[0]?.user_id).toBe(existing.id);
    expect(account.rows[0]?.status).toBe("ACTIVE");
    expect(
      account.rows[0]?.password_hash === before.rows[0]?.password_hash,
    ).toBe(true);
    expect(JSON.stringify(fresh).includes(other.organizationId)).toBe(false);
    const first = fixture.command(actor.locationId);
    const pending = issued(await fixture.create(actor, first));
    const secondActor = await fixture.actor();
    const second = issued(
      await fixture.create(
        secondActor,
        fixture.command(secondActor.locationId, { email: first.email }),
      ),
    );
    const reused = await fixture.query<{ n: string }>(
      "SELECT count(DISTINCT user_id)::text AS n FROM organization_memberships WHERE id=ANY($1::uuid[])",
      [[pending.membershipId, second.membershipId]],
    );
    expect(reused.rows[0]?.n).toBe("1");
  });
  it("same-org ACTIVE/INACTIVE/PENDING and global DISABLED all yield neutral unavailable", async () => {
    const actor = await fixture.actor();
    for (const status of ["ACTIVE", "INACTIVE"] as const) {
      const user = await fixture.createUser();
      await fixture.addMembership(
        actor.organizationId,
        user.id,
        "VALET_EMPLOYEE",
        status,
      );
      const response = await fixture.create(
        actor,
        fixture.command(actor.locationId, { email: user.email }),
      );
      expect(response.status).toBe(409);
      expect(response.body?.code).toBe("STAFF_ONBOARDING_UNAVAILABLE");
    }
    const command = fixture.command(actor.locationId);
    issued(await fixture.create(actor, command));
    const pending = await fixture.create(actor, {
      ...command,
      operationId: randomUUID(),
    });
    expect(pending.body?.code).toBe("STAFF_ONBOARDING_UNAVAILABLE");
    const disabled = await fixture.createUser({ status: "DISABLED" });
    const denied = await fixture.create(
      actor,
      fixture.command(actor.locationId, { email: disabled.email }),
    );
    expect(denied.body?.code).toBe("STAFF_ONBOARDING_UNAVAILABLE");
    const state = await fixture.query<{ status: string }>(
      "SELECT status FROM users WHERE id=$1",
      [disabled.id],
    );
    expect(state.rows[0]?.status).toBe("DISABLED");
    expect(JSON.stringify(denied.body).includes("DISABLED")).toBe(false);
  });
  it("audit insertion failure rolls back every initial onboarding write", async () => {
    const actor = await fixture.actor();
    const command = fixture.command(actor.locationId);
    await fixture.query(
      "ALTER TABLE audit_events ADD CONSTRAINT t05c_fail_create CHECK(event_type <> 'STAFF_ONBOARDING_INVITATION_ISSUED') NOT VALID",
    );
    try {
      expect(
        (await fixture.create(actor, command)).status,
      ).toBeGreaterThanOrEqual(400);
      const partial = await fixture.query(
        "SELECT 1 FROM users WHERE email=$1",
        [command.email],
      );
      expect(partial.rowCount).toBe(0);
      const invite = await fixture.query(
        "SELECT 1 FROM staff_onboarding_invitations WHERE operation_id=$1",
        [command.operationId],
      );
      expect(invite.rowCount).toBe(0);
    } finally {
      await fixture.query(
        "ALTER TABLE audit_events DROP CONSTRAINT t05c_fail_create",
      );
    }
  });
});
