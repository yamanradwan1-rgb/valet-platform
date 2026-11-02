import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { staffMfaEnrollmentBeginResponseSchema } from "@valet/contracts";
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
describe("Issue 408 existing MFA command composition", () => {
  it.each([r.stepUp, r.reissue])(
    "committed %s consumes proof before a later disable",
    async (path) => {
      const o = await enrolled(f),
        code = await totp(f, o.setup.provisioning.secretBase32);
      expect((await f.postMfa(path, o.auth.accessToken, { code })).status).toBe(
        200,
      );
      const result = await disable(f, o, { code });
      expect(result.status).toBe(403);
      expect(result.body?.code).toBe("MFA_VERIFICATION_FAILED");
      expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
    },
  );
  it("an original precondition cannot retire a replacement ACTIVE factor", async () => {
    const o = await enrolled(f);
    const recovery = await f.postMfa(r.recover, o.auth.accessToken, {
      recoveryCode: o.codes[0],
    });
    expect(recovery.status).toBe(200);
    const replacement = staffMfaEnrollmentBeginResponseSchema.parse(
      recovery.body,
    );
    expect(
      (
        await f.postMfa(r.confirm, o.auth.accessToken, {
          factorId: replacement.factorId,
          code: await totp(f, replacement.provisioning.secretBase32, -1),
        })
      ).status,
    ).toBe(200);
    expect((await disable(f, o)).body?.code).toBe("MFA_STATE_CHANGED");
    expect(
      (await f.factors(o.user.userId)).rows.find(
        (x) => x.id === replacement.factorId,
      )?.state,
    ).toBe("ACTIVE");
    expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
  });
  it.each(["enroll", "recovery", "step-up", "reissue", "refresh", "logout"])(
    "real simultaneous HTTP disable versus %s preserves current factor and one-event semantics",
    async (command) => {
      const o = await enrolled(f),
        code = await totp(f, o.setup.provisioning.secretBase32);
      const competitor = () => {
        if (command === "refresh") return f.refresh(o.auth.refreshToken);
        if (command === "logout") return f.logout(o.auth.refreshToken);
        if (command === "enroll") return f.postMfa(r.begin, o.auth.accessToken);
        if (command === "recovery")
          return f.postMfa(r.recover, o.auth.accessToken, {
            recoveryCode: o.codes[0],
          });
        return f.postMfa(
          command === "step-up" ? r.stepUp : r.reissue,
          o.auth.accessToken,
          { code },
        );
      };
      const [result] = await Promise.all([
        disable(f, o, { code }),
        competitor(),
      ]);
      const events = await disableEvents(f, o.user.userId);
      expect(events).toHaveLength(result.status === 200 ? 1 : 0);
      if (result.status !== 200)
        expect([
          "MFA_OPERATION_BUSY",
          "MFA_STATE_CHANGED",
          "MFA_VERIFICATION_FAILED",
          "STAFF_AUTHENTICATION_REQUIRED",
        ]).toContain(result.body?.code);
      const factors = (await f.factors(o.user.userId)).rows;
      expect(
        factors.filter((x) => x.state !== "RETIRED").length,
      ).toBeLessThanOrEqual(1);
      if (result.status === 200)
        expect(factors.find((x) => x.id === o.setup.factorId)?.state).toBe(
          "RETIRED",
        );
    },
  );
});
