import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";

const db = new PresenceServerTestContext("presence-negative");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("exact actor and resource negative controls", () => {
  it("same requester User's Company Admin membership in another Organization supplies no review authority", async () => {
    const a = await pendingPresenceException(db);
    const otherOrganization = await db.createFixture();
    const otherMembership = await db.manager(
      otherOrganization,
      "ORG_ADMIN",
      a.fixture.userId,
    );
    for (const target of [
      otherMembership.target,
      {
        authority: "COMPANY_ADMIN" as const,
        organizationId: a.fixture.organizationId,
        locationId: a.fixture.locationId,
      },
    ]) {
      await expect(
        db.management.review(
          otherMembership.context,
          target,
          String(a.exception.exceptionId),
          {
            mutationId: randomUUID(),
            expectedRevision: 1,
          },
          "APPROVED",
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
    expect(
      (
        await db.presence.exception(
          a.requester.context,
          String(a.exception.exceptionId),
        )
      ).status,
    ).toBe("PENDING");
    expect(await db.facts(a.fixture)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
  });
  it.each(["USER", "MEMBERSHIP"] as const)(
    "disabled %s cannot configure or issue a START challenge",
    async (kind) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      if (kind === "USER")
        await db.adminPool.query(
          `UPDATE users SET status='DISABLED' WHERE id IN ($1,$2)`,
          [m.userId, f.userId],
        );
      else
        await db.adminPool.query(
          `UPDATE organization_memberships SET status='INACTIVE' WHERE id IN ($1,$2)`,
          [m.membershipId, f.membershipId],
        );
      await expect(
        db.management.setCompany(m.context, m.companyTarget, {
          mutationId: randomUUID(),
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        }),
      ).rejects.toThrow();
      const requester = await db.session(f.userId);
      await expect(db.challenge(f, requester.context)).rejects.toThrow();
      expect(
        (
          await db.adminPool.query(
            `SELECT shift_presence_revision FROM organizations WHERE id=$1`,
            [f.organizationId],
          )
        ).rows[0].shift_presence_revision,
      ).toBe(1);
      expect(
        (
          await db.adminPool.query(
            `SELECT id FROM shift_presence_operations WHERE organization_id=$1`,
            [f.organizationId],
          )
        ).rowCount,
      ).toBe(0);
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
    },
  );
  it.each(["TENANT", "LOCATION"] as const)(
    "foreign %s zone/exception cannot be read or mutated",
    async (scope) => {
      const own = await db.createFixture();
      const manager = await db.manager(own);
      const foreign = await pendingPresenceException(db);
      // Same-Organization CA authority cannot substitute resources across Locations.
      const target =
        scope === "TENANT"
          ? manager.target
          : {
              ...foreign.manager.target,
              locationId: await db.addLocation(foreign.fixture),
            };
      const context =
        scope === "TENANT" ? manager.context : foreign.manager.context;
      const zone = await db.zone(foreign.fixture);
      await expect(
        db.management.zone(context, target, zone),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        db.management.saveZone(
          context,
          target,
          {
            mutationId: randomUUID(),
            expectedRevision: 1,
            code: "FOREIGN",
            label: "Synthetic",
            latitude: 31.95,
            longitude: 35.91,
            radiusMeters: 100,
            state: "DISABLED",
          },
          zone,
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        db.management.exception(
          context,
          target,
          String(foreign.exception.exceptionId),
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        db.management.review(
          context,
          target,
          String(foreign.exception.exceptionId),
          { mutationId: randomUUID(), expectedRevision: 1 },
          "APPROVED",
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      expect(
        (
          await db.adminPool.query(
            `SELECT state,revision FROM shift_presence_zones WHERE id=$1`,
            [zone],
          )
        ).rows[0],
      ).toEqual({ state: "ACTIVE", revision: 1 });
      expect(
        (
          await db.presence.exception(
            foreign.requester.context,
            String(foreign.exception.exceptionId),
          )
        ).status,
      ).toBe("PENDING");
      expect(await db.facts(foreign.fixture)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
    },
  );
  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "original approver currently %s remains eligible after a role change",
    async (role) => {
      const a = await pendingPresenceException(
        db,
        "START",
        role === "ORG_ADMIN" ? "LOCATION_MANAGER" : "ORG_ADMIN",
      );
      await a.approve();
      await db.adminPool.query(
        `UPDATE organization_memberships SET role=$2 WHERE id=$1`,
        [a.manager.membershipId, role],
      );
      if (role === "ORG_ADMIN")
        await db.adminPool.query(
          `DELETE FROM membership_location_access WHERE membership_id=$1`,
          [a.manager.membershipId],
        );
      expect((await a.consume()).status).toBe("ACTIVE");
      expect(await db.facts(a.fixture)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: 0,
      });
    },
  );
  it("original approver disabled User produces real early expiry", async () => {
    const a = await pendingPresenceException(db);
    await a.approve();
    await db.adminPool.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [
      a.manager.userId,
    ]);
    await expect(a.consume()).rejects.toMatchObject({
      code: "APPROVER_AUTHORITY_REVOKED",
    });
    expect(
      (
        await db.presence.exception(
          a.requester.context,
          String(a.exception.exceptionId),
        )
      ).status,
    ).toBe("EXPIRED");
    expect(await db.facts(a.fixture)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
  });
  it.each(["MEMBERSHIP", "ACCESS"] as const)(
    "END exception cannot replace active requester %s with ordinary safe-own-End",
    async (kind) => {
      const a = await pendingPresenceException(db, "END");
      await a.approve();
      if (kind === "MEMBERSHIP")
        await db.adminPool.query(
          `UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
          [a.fixture.membershipId],
        );
      else
        await db.adminPool.query(
          `DELETE FROM membership_location_access WHERE membership_id=$1`,
          [a.fixture.membershipId],
        );
      await expect(a.consume()).rejects.toMatchObject({
        code: "PRESENCE_SCOPE_MISMATCH",
      });
      expect(
        (
          await db.presence.exception(
            a.requester.context,
            String(a.exception.exceptionId),
          )
        ).status,
      ).toBe("APPROVED");
      expect(await db.facts(a.fixture)).toEqual({
        shifts: 1,
        decisions: 0,
        starts: 1,
        ends: 0,
      });
    },
  );
});
