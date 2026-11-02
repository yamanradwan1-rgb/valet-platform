import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  disable,
  enrolled,
  disableEvents,
  StaffMfaTestFixture,
} from "./mfa-disable-test-fixture";
const f = new StaffMfaTestFixture();
beforeAll(() => f.start(), 120000);
afterEach(() => f.resetLimits());
afterAll(() => f.stop(), 60000);
describe("Issue 408 membership activation and revocation through commit", () => {
  for (const change of [
    "activate-membership",
    "revoke-membership",
    "revoke-role",
    "revoke-organization",
  ]) {
    it.each(["COMMIT", "ROLLBACK"])(
      `${change}: contended first, policy re-proved after %s`,
      async (finish) => {
        const o = await enrolled(f, "ORG_ADMIN");
        if (change === "activate-membership")
          await f.query(
            "UPDATE organization_memberships SET status='INACTIVE' WHERE user_id=$1",
            [o.user.userId],
          );
        const blocker = await f.databasePool().connect();
        try {
          await blocker.query("BEGIN");
          if (change === "revoke-organization")
            await blocker.query(
              "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
              [o.user.organizationId],
            );
          else if (change === "revoke-role")
            await blocker.query(
              "UPDATE organization_memberships SET role='LOCATION_MANAGER' WHERE user_id=$1",
              [o.user.userId],
            );
          else
            await blocker.query(
              "UPDATE organization_memberships SET status=$2::membership_status WHERE user_id=$1",
              [
                o.user.userId,
                change === "activate-membership" ? "ACTIVE" : "INACTIVE",
              ],
            );
          expect((await disable(f, o)).body?.code).toBe("MFA_OPERATION_BUSY");
          expect(await disableEvents(f, o.user.userId)).toHaveLength(0);
          await blocker.query(finish);
          const prohibited =
            change === "activate-membership"
              ? finish === "COMMIT"
              : finish === "ROLLBACK";
          const result = await disable(f, o);
          expect(result.status).toBe(prohibited ? 403 : 200);
          expect(await disableEvents(f, o.user.userId)).toHaveLength(
            prohibited ? 0 : 1,
          );
        } finally {
          await blocker.query("ROLLBACK");
          blocker.release();
        }
      },
    );
  }
});
