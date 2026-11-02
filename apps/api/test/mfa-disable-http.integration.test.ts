import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  disable,
  enrolled,
  disableEvents,
  totp,
  badTotp,
  StaffMfaTestFixture,
  mfaRoutes as r,
} from "./mfa-disable-test-fixture";

const f = new StaffMfaTestFixture();
beforeAll(() => f.start(), 120000);
afterEach(() => f.resetLimits());
afterAll(() => f.stop(), 60000);

describe("Issue 408 real HTTP ownership, proof, sessions and audit", () => {
  it("normalizes pre-controller malformed JSON without reflecting proof material", async () => {
    const response = await fetch(
      `${await f.application().getUrl()}${r.disable}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "issue408-parser",
        },
        body: '{"code":"SYNTHETIC_PROOF_408",',
      },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      code: "REQUEST_INVALID",
      message: "The request is invalid.",
      requestId: "issue408-parser",
    });
  });
  it.each(["LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE", "NONE"])(
    "allows own-account enrollment/disable for %s without business grants",
    async (role) => {
      const o = await enrolled(f, role);
      const before = (await f.sessionSnapshot(o.auth.sessionId)).rows;
      const other = await f.nativeLogin(o.user);
      const available = await f.getMfa(r.disable, o.auth.accessToken);
      expect(available.body).toEqual({
        availability: "AVAILABLE",
        expectedFactorId: o.setup.factorId,
      });
      expect(available.headers.get("cache-control")).toBe("private, no-store");
      expect((await disable(f, o)).body).toEqual({
        state: "ENROLLMENT_REQUIRED",
      });
      expect((await f.factors(o.user.userId)).rows[0]?.state).toBe("RETIRED");
      expect((await f.sessionSnapshot(o.auth.sessionId)).rows).toEqual(before);
      expect(
        (await f.sessionSnapshot(other.sessionId)).rows[0]?.revoked_at,
      ).toBeNull();
      expect((await f.getMfa(r.state, o.auth.accessToken)).body).toEqual({
        state: "ENROLLMENT_REQUIRED",
      });
      expect((await f.getMfa(r.disable, o.auth.accessToken)).body).toEqual({
        availability: "MFA_NOT_ENABLED",
      });
      const retry = await disable(f, o);
      expect(retry.status).toBe(409);
      expect(retry.body?.code).toBe("MFA_STATE_CHANGED");
      const events = await disableEvents(f, o.user.userId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor_type: "USER",
        actor_user_id: o.user.userId,
        subject_user_id: o.user.userId,
        controlled_operator_ref: null,
      });
      expect(events[0]).not.toHaveProperty("metadata_json");
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(o.setup.provisioning.secretBase32);
      expect(serialized).not.toContain(o.auth.accessToken);
      for (const code of o.codes) expect(serialized).not.toContain(code);
      expect(
        (
          await f.query(
            "SELECT id FROM audit_events WHERE organization_id=$1",
            [o.user.organizationId],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await f.postMfa(r.recover, o.auth.accessToken, {
            recoveryCode: o.codes[0],
          })
        ).status,
      ).toBe(403);
      expect((await f.refresh(other.refreshToken)).status).toBe(200);
      expect((await f.postMfa(r.begin, o.auth.accessToken)).status).toBe(200);
    },
  );
  it("rejects invalid/consumed proof and enforces the existing failure quota", async () => {
    const o = await enrolled(f);
    await f.resetLimits();
    const proof = await totp(f, o.setup.provisioning.secretBase32);
    expect(
      (await f.postMfa(r.stepUp, o.auth.accessToken, { code: proof })).status,
    ).toBe(200);
    expect((await disable(f, o, { code: proof })).body?.code).toBe(
      "MFA_VERIFICATION_FAILED",
    );
    const invalid = await badTotp(f, o.setup.provisioning.secretBase32);
    for (let i = 0; i < 4; i++)
      expect((await disable(f, o, { code: invalid })).status).toBe(403);
    const limited = await disable(f, o, { code: invalid });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
  });
  it("does not use factor UUID as authority for two authenticated principals", async () => {
    const a = await enrolled(f),
      b = await enrolled(f);
    const foreign = await disable(f, b, { factorId: a.setup.factorId });
    const missing = await disable(f, b, { factorId: randomUUID() });
    expect(foreign.status).toBe(409);
    expect(foreign.body?.code).toBe("MFA_STATE_CHANGED");
    expect(missing.body?.message).toBe(foreign.body?.message);
    expect((await f.getMfa(r.disable, b.auth.accessToken)).body).toEqual({
      availability: "AVAILABLE",
      expectedFactorId: b.setup.factorId,
    });
    expect((await f.factors(a.user.userId)).rows[0]?.state).toBe("ACTIVE");
    expect(await disableEvents(f, b.user.userId)).toHaveLength(0);
  });
  it("rejects missing authentication, extra authority fields, queries and stale identifiers", async () => {
    expect((await f.request(r.disable, { method: "GET" })).status).toBe(401);
    const o = await enrolled(f);
    expect(
      (
        await f.postMfa(r.disable, o.auth.accessToken, {
          expectedFactorId: o.setup.factorId,
          code: "123456",
          userId: o.user.userId,
        })
      ).status,
    ).toBe(400);
    const query = await f.getMfa(
      r.disable + "?userId=" + o.user.userId,
      o.auth.accessToken,
    );
    expect(query.status).toBe(400);
    expect(query.headers.get("cache-control")).toBe("private, no-store");
    expect(
      (await disable(f, o, { factorId: randomUUID() })).body?.message,
    ).toBe("Account security changed. Refresh and try again.");
  });
  it.each(["revoke", "disable-user", "expire", "logout", "refresh"])(
    "denies old credentials after %s including reconciliation",
    async (mode) => {
      const o = await enrolled(f);
      if (mode === "revoke")
        await f.query(
          "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
          [o.auth.sessionId],
        );
      if (mode === "disable-user")
        await f.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
          o.user.userId,
        ]);
      if (mode === "expire")
        await f.query(
          "UPDATE staff_auth_sessions SET access_expires_at=created_at+interval '1 millisecond' WHERE id=$1",
          [o.auth.sessionId],
        );
      if (mode === "logout") await f.logout(o.auth.refreshToken);
      if (mode === "refresh") await f.refresh(o.auth.refreshToken);
      const denied = await disable(f, o);
      expect(denied.status).toBe(401);
      expect(denied.body?.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
      expect((await f.getMfa(r.disable, o.auth.accessToken)).status).toBe(401);
      expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    },
  );
});
