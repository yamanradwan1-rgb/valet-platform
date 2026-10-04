import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("presence-management-authority");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

describe("presence management current authority", () => {
  it("CA can configure inactive setup; LM cannot use inactive, revoked or foreign targets", async () => {
    const f = await db.createFixture({ locationStatus: "INACTIVE" });
    const ca = await db.manager(f);
    const lm = await db.manager(f, "LOCATION_MANAGER");
    expect(
      (await db.management.location(ca.context, ca.target)).locationId,
    ).toBe(f.locationId);
    await expect(
      db.management.location(lm.context, lm.target),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await db.adminPool.query(
      `UPDATE locations SET status='ACTIVE',accepting_intake=TRUE WHERE id=$1`,
      [f.locationId],
    );
    await db.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [lm.membershipId],
    );
    await expect(
      db.management.location(lm.context, lm.target),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const foreign = await db.createFixture();
    await expect(
      db.management.location(ca.context, {
        ...ca.target,
        locationId: foreign.locationId,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      db.management.location(ca.context, {
        ...ca.target,
        organizationId: foreign.organizationId,
        locationId: foreign.locationId,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "%s has no management authority",
    async (role) => {
      const f = await db.createFixture();
      const m = await db.manager(f, role);
      await expect(
        db.management.location(m.context, m.target),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        db.management.setCompany(m.context, m.companyTarget, {
          mutationId: randomUUID(),
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );
  it("stale session and stale sensitive MFA never mutate", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const command = {
      mutationId: randomUUID(),
      expectedRevision: 1,
      field: "shiftStartPresenceMode" as const,
      value: "WARN_ONLY" as const,
    };
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '7 minutes',mfa_authenticated_at=clock_timestamp()-interval '6 minutes' WHERE id=$1`,
      [m.context.staffAuthSessionId],
    );
    const current = await db.adminPool.query<{ created_at: Date }>(
      `SELECT created_at FROM staff_auth_sessions WHERE id=$1`,
      [m.context.staffAuthSessionId],
    );
    const stale = { ...m.context, createdAt: current.rows[0]!.created_at };
    await expect(
      db.management.setCompany(stale, m.companyTarget, command),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
      [m.context.staffAuthSessionId],
    );
    await expect(
      db.management.setCompany(stale, m.companyTarget, command),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await db.adminPool.query(
          `SELECT shift_presence_revision AS revision FROM organizations WHERE id=$1`,
          [f.organizationId],
        )
      ).rows[0].revision,
    ).toBe(1);
  });
});
