import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  staffDirectoryResponseSchema,
  staffMembershipDetailSchema,
} from "@valet/contracts";
import {
  StaffActivationTestFixture,
  invitationToken,
} from "./staff-activation-test-fixture";
import { issued, staffPath, hidden } from "./staff-onboarding-test-fixture";

const fixture = new StaffActivationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-D pending management read boundary", () => {
  it("PENDING cursor pages remain bound to the original status predicate", async () => {
    const actor = await fixture.actor();
    const one = issued(await fixture.create(actor)),
      two = issued(await fixture.create(actor));
    const base = staffPath(actor.organizationId);
    const first = staffDirectoryResponseSchema.parse(
      (
        await fixture.managementGet(
          `${base}?status=PENDING&limit=1`,
          actor.auth.accessToken,
        )
      ).body,
    );
    expect(first.items.length).toBe(1);
    expect(first.nextCursor !== null).toBe(true);
    const second = staffDirectoryResponseSchema.parse(
      (
        await fixture.managementGet(
          `${base}?status=PENDING&limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`,
          actor.auth.accessToken,
        )
      ).body,
    );
    expect(
      new Set(
        [...first.items, ...second.items].map((item) => item.membershipId),
      ),
    ).toEqual(new Set([one.membershipId, two.membershipId]));
    expect(
      (
        await fixture.managementGet(
          `${base}?status=ACTIVE&limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`,
          actor.auth.accessToken,
        )
      ).status,
    ).toBe(400);
  });
  it("CA sees safe pending details/filter pages, then authoritative ACTIVE after activation", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const path = staffPath(actor.organizationId, invite.membershipId);
    const response = await fixture.managementGet(path, actor.auth.accessToken);
    const parsed = staffMembershipDetailSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Invalid safe detail projection");
    expect(parsed.data.status).toBe("PENDING");
    expect(parsed.data.pendingInvitation?.state).toBe("CURRENT");
    expect(parsed.data.pendingInvitation?.generation).toBe(1);
    expect(
      JSON.stringify(response.body).includes(
        invitationToken(invite.activationLink),
      ),
    ).toBe(false);
    expect(JSON.stringify(response.body).includes("password_hash")).toBe(false);
    const list = staffDirectoryResponseSchema.parse(
      (
        await fixture.managementGet(
          `${staffPath(actor.organizationId)}?status=PENDING&limit=1&search=Smith`,
          actor.auth.accessToken,
        )
      ).body,
    );
    expect(list.items.map((item) => item.membershipId)).toEqual([
      invite.membershipId,
    ]);
    await fixture.activate(invitationToken(invite.activationLink));
    expect(
      (await fixture.managementGet(path, actor.auth.accessToken)).body?.status,
    ).toBe("ACTIVE");
    expect(
      (await fixture.managementGet(path, actor.auth.accessToken)).body
        ?.pendingInvitation,
    ).toBeUndefined();
  });

  it("LM complete coverage hides mixed/outside/zero/elevated targets before LIMIT and denies their detail/resend", async () => {
    const ca = await fixture.actor();
    const managerUser = await fixture.createUser();
    const managerId = await fixture.addMembership(
      ca.organizationId,
      managerUser.id,
      "LOCATION_MANAGER",
    );
    await fixture.grant(ca.organizationId, managerId, ca.locationId);
    const managerAuth = await fixture.nativeLogin(managerUser);
    await fixture.enrollAndAssure(managerAuth);
    const outside = await fixture.addLocation(ca.organizationId);
    const targets = [];
    for (const kind of [
      "mixed",
      "outside",
      "zero",
      "elevated",
      "covered",
    ] as const) {
      const target = issued(
        await fixture.create(
          ca,
          fixture.command(ca.locationId, {
            role: kind === "elevated" ? "LOCATION_MANAGER" : "VALET_EMPLOYEE",
            locationIds:
              kind === "mixed"
                ? [ca.locationId, outside.locationId]
                : kind === "outside"
                  ? [outside.locationId]
                  : [ca.locationId],
          }),
        ),
      );
      if (kind === "zero")
        await fixture.query(
          "DELETE FROM membership_location_access WHERE membership_id=$1",
          [target.membershipId],
        );
      targets.push({ kind, ...target });
    }
    const result = staffDirectoryResponseSchema.parse(
      (
        await fixture.managementGet(
          `${staffPath(ca.organizationId)}?status=PENDING&limit=1`,
          managerAuth.accessToken,
        )
      ).body,
    );
    expect(result.items.map((item) => item.membershipId)).toEqual([
      targets[4]!.membershipId,
    ]);
    expect(result.nextCursor).toBeNull();
    for (const target of targets.slice(0, 4)) {
      hidden(
        await fixture.managementGet(
          staffPath(ca.organizationId, target.membershipId),
          managerAuth.accessToken,
        ),
      );
      hidden(
        await fixture.managementPost(
          `${staffPath(ca.organizationId, target.membershipId)}/invitations`,
          managerAuth.accessToken,
          { operationId: crypto.randomUUID() },
        ),
      );
    }
    expect(
      (
        await fixture.managementGet(
          staffPath(ca.organizationId, targets[4]!.membershipId),
          managerAuth.accessToken,
        )
      ).status,
    ).toBe(200);
    await fixture.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [managerId],
    );
    hidden(
      await fixture.managementGet(
        staffPath(ca.organizationId, targets[4]!.membershipId),
        managerAuth.accessToken,
      ),
    );
  });
});
