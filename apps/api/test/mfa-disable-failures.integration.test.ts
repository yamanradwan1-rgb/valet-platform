import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MfaAssurancePolicy } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { MfaDisableFailureFixture } from "./mfa-disable-failure-fixture";
import {
  disable,
  enrolled,
  disableEvents,
  mfaRoutes as r,
} from "./mfa-disable-test-fixture";

const f = new MfaDisableFailureFixture(),
  lockMs = process.env.DATABASE_GENERAL_LOCK_MS;
beforeAll(async () => {
  process.env.DATABASE_GENERAL_LOCK_MS = "100";
  await f.start();
}, 120000);
afterEach(() => f.resetLimits());
afterAll(async () => {
  await f.stop();
  if (lockMs === undefined) delete process.env.DATABASE_GENERAL_LOCK_MS;
  else process.env.DATABASE_GENERAL_LOCK_MS = lockMs;
}, 60000);

describe("Issue 408 real HTTP transaction failure and uncertain COMMIT", () => {
  it("does not report busy when the rollback response is unavailable", async () => {
    const o = await enrolled(f),
      blocker = await f.databasePool().connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["staff-user-security:" + o.user.userId],
      );
      f.drop = "rollback-response";
      const result = await disable(f, o);
      expect([500, 503]).toContain(result.status);
      expect(result.body?.code).toBe("INTERNAL_ERROR");
      expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });
  it("audit rejection rolls back retirement, proof step and admission success", async () => {
    const o = await enrolled(f),
      before = (await f.factors(o.user.userId)).rows;
    await f.query(`CREATE FUNCTION issue408_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='MFA_TOTP_DISABLED' THEN RAISE EXCEPTION 'Injected audit rejection' USING ERRCODE='23514'; END IF;RETURN NEW;END $$;
      CREATE TRIGGER issue408_reject_audit_trigger BEFORE INSERT ON account_security_audit_events FOR EACH ROW EXECUTE FUNCTION issue408_reject_audit()`);
    try {
      const result = await disable(f, o);
      expect(result.status).toBe(500);
      expect((await f.factors(o.user.userId)).rows).toEqual(before);
      expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    } finally {
      await f.query(
        "DROP TRIGGER issue408_reject_audit_trigger ON account_security_audit_events; DROP FUNCTION issue408_reject_audit()",
      );
    }
    expect((await disable(f, o)).status).toBe(200);
  });
  it.each(["user_mfa_totp_factors", "account_security_audit_events"])(
    "bounds table-level waits on %s and confirms rollback before busy",
    async (table) => {
      const o = await enrolled(f),
        blocker = await f.databasePool().connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(`LOCK TABLE ${table} IN SHARE MODE`);
        const result = await disable(f, o);
        expect(result.status).toBe(409);
        expect(result.body?.code).toBe("MFA_OPERATION_BUSY");
        expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
        expect((await f.factors(o.user.userId)).rows[0]?.state).toBe("ACTIVE");
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
      expect((await disable(f, o)).status).toBe(200);
    },
  );
  it("connection cancellation before COMMIT leaves no retirement/event; explicit retry reauthorizes", async () => {
    const o = await enrolled(f);
    f.drop = "before-commit";
    const result = await disable(f, o);
    expect([500, 503]).toContain(result.status);
    expect(result.body?.code).toBe("INTERNAL_ERROR");
    expect((await f.factors(o.user.userId)).rows[0]?.state).toBe("ACTIVE");
    expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    expect(
      (await f.getMfa(r.disable, o.auth.accessToken)).body?.availability,
    ).toBe("AVAILABLE");
    expect((await disable(f, o)).status).toBe(200);
  });
  it("dropped COMMIT response is unknown, reconciles committed truth and cannot replay success", async () => {
    const o = await enrolled(f),
      other = await f.nativeLogin(o.user);
    const assurance = f.application().get(MfaAssurancePolicy);
    expect(await assurance.assess(`Bearer ${o.auth.accessToken}`)).toBe(
      "ASSURANCE_VALID",
    );
    f.committed = async () => {
      for (let i = 0; i < 150; i++) {
        if ((await disableEvents(f, o.user.userId)).length === 1) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("No committed event witnessed.");
    };
    f.drop = "commit-response";
    const result = await disable(f, o);
    expect([500, 503]).toContain(result.status);
    expect(result.body?.code).toBe("INTERNAL_ERROR");
    expect((await f.getMfa(r.disable, o.auth.accessToken)).body).toEqual({
      availability: "MFA_NOT_ENABLED",
    });
    expect(await disableEvents(f, o.user.userId)).toHaveLength(1);
    expect(f.faults).toEqual([]);
    expect((await disable(f, o)).body?.code).toBe("MFA_STATE_CHANGED");
    expect(await disableEvents(f, o.user.userId)).toHaveLength(1);
    expect(await assurance.assess(`Bearer ${o.auth.accessToken}`)).toBe(
      "NO_MFA_ASSURANCE",
    );
    expect(
      (await f.sessionSnapshot(other.sessionId)).rows[0]?.revoked_at,
    ).toBeNull();
    expect((await f.refresh(other.refreshToken)).status).toBe(200);
  });
});
