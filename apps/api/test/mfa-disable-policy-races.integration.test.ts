import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  disable,
  enrolled,
  disableEvents,
  totp,
  StaffMfaTestFixture,
  mfaRoutes as r,
} from "./mfa-disable-test-fixture";

const f = new StaffMfaTestFixture();
beforeAll(() => f.start(), 120000);
afterEach(() => f.resetLimits());
afterAll(() => f.stop(), 60000);

describe("Issue 408 complete policy boundary with real PostgreSQL", () => {
  it("denies any active Company Admin scope regardless of selected/lower membership", async () => {
    const o = await enrolled(f, "ORG_ADMIN");
    expect((await f.getMfa(r.disable, o.auth.accessToken)).body).toEqual({
      availability: "MFA_REQUIRED_BY_POLICY",
    });
    const result = await disable(f, o, { code: "000000" });
    expect(result.status).toBe(403);
    expect(result.body?.code).toBe("MFA_DISABLE_NOT_ALLOWED");
    expect(result.body?.message).toBe(
      "MFA disabling is not available for this account.",
    );
    expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    await f.query(
      "UPDATE organization_memberships SET role='VALET_EMPLOYEE' WHERE user_id=$1",
      [o.user.userId],
    );
    const org = randomUUID();
    await f.query(
      "INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'other','UTC',clock_timestamp())",
      [org],
    );
    await f.query(
      "INSERT INTO organization_memberships(id,user_id,organization_id,role,updated_at) VALUES($1,$2,$3,'ORG_ADMIN',clock_timestamp())",
      [randomUUID(), o.user.userId, org],
    );
    expect((await disable(f, o)).body?.code).toBe("MFA_DISABLE_NOT_ALLOWED");
    await f.query("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [
      org,
    ]);
    expect((await disable(f, o)).status).toBe(200);
  });
  it.each(["COMMIT", "ROLLBACK"])(
    "promotion first: NOWAIT busy, re-proves after %s",
    async (finish) => {
      const o = await enrolled(f),
        blocker = await f.databasePool().connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          "UPDATE organization_memberships SET role='ORG_ADMIN' WHERE user_id=$1",
          [o.user.userId],
        );
        const result = await disable(f, o);
        expect(result.status).toBe(409);
        expect(result.body?.code).toBe("MFA_OPERATION_BUSY");
        await blocker.query(finish);
        expect((await disable(f, o)).body?.code).toBe(
          finish === "COMMIT" ? "MFA_DISABLE_NOT_ALLOWED" : undefined,
        );
        expect(await disableEvents(f, o.user.userId)).toHaveLength(
          finish === "COMMIT" ? 0 : 1,
        );
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    },
  );
  it.each(["COMMIT", "ROLLBACK"])(
    "Organization activation first: busy then %s",
    async (finish) => {
      const o = await enrolled(f, "ORG_ADMIN");
      await f.query("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [
        o.user.organizationId,
      ]);
      const blocker = await f.databasePool().connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          "UPDATE organizations SET status='ACTIVE' WHERE id=$1",
          [o.user.organizationId],
        );
        expect((await disable(f, o)).body?.code).toBe("MFA_OPERATION_BUSY");
        await blocker.query(finish);
        const result = await disable(f, o);
        expect(result.status).toBe(finish === "COMMIT" ? 403 : 200);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    },
  );
  it.each([
    "membership",
    "organization",
    "user",
    "session",
    "factor",
    "account-key",
    "mfa-key",
  ])("fails safely for %s contention", async (resource) => {
    const o = await enrolled(f),
      blocker = await f.databasePool().connect();
    const statements: Record<string, [string, unknown[]]> = {
      membership: [
        "SELECT id FROM organization_memberships WHERE user_id=$1 FOR UPDATE",
        [o.user.userId],
      ],
      organization: [
        "SELECT id FROM organizations WHERE id=$1 FOR UPDATE",
        [o.user.organizationId],
      ],
      user: ["SELECT id FROM users WHERE id=$1 FOR UPDATE", [o.user.userId]],
      session: [
        "SELECT id FROM staff_auth_sessions WHERE id=$1 FOR UPDATE",
        [o.auth.sessionId],
      ],
      factor: [
        "SELECT id FROM user_mfa_totp_factors WHERE id=$1 FOR UPDATE",
        [o.setup.factorId],
      ],
      "account-key": [
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["staff-user-security:" + o.user.userId],
      ],
      "mfa-key": [
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["mfa-user:" + o.user.userId],
      ],
    };
    try {
      await blocker.query("BEGIN");
      await blocker.query(...statements[resource]!);
      const result = await disable(f, o);
      expect(result.body?.code).toBe("MFA_OPERATION_BUSY");
      expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    expect((await disable(f, o)).status).toBe(200);
  });
  it("insert-first FK lock fences a newly created Company Admin membership", async () => {
    const o = await enrolled(f),
      org = randomUUID(),
      member = randomUUID(),
      blocker = await f.databasePool().connect();
    await f.query(
      "INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'new','UTC',clock_timestamp())",
      [org],
    );
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "INSERT INTO organization_memberships(id,user_id,organization_id,role,updated_at) VALUES($1,$2,$3,'ORG_ADMIN',clock_timestamp())",
        [member, o.user.userId, org],
      );
      expect((await disable(f, o)).body?.code).toBe("MFA_OPERATION_BUSY");
      await blocker.query("COMMIT");
      expect((await disable(f, o)).body?.code).toBe("MFA_DISABLE_NOT_ALLOWED");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });
  it("concurrent identical HTTP commands produce one retirement and one audit", async () => {
    const o = await enrolled(f),
      code = await totp(f, o.setup.provisioning.secretBase32);
    const results = await Promise.all([
      disable(f, o, { code }),
      disable(f, o, { code }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(["MFA_STATE_CHANGED", "MFA_OPERATION_BUSY"]).toContain(
      results.find((x) => x.status === 409)?.body?.code,
    );
    expect(await disableEvents(f, o.user.userId)).toHaveLength(1);
  });
});
