import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockStaffUserSecurityBoundary } from "../src/modules/auth/staff-user-security-lock";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import {
  observePresenceCommandWait,
  mutationAuditCount,
  finishPresenceBoundary,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-session-races");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

describe("R10 exact-session result fencing", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "token identity replacement before pending policy command, invalidator %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const owner = await db.adminPool.connect();
      try {
        await owner.query("BEGIN");
        await lockStaffUserSecurityBoundary(owner, m.userId);
        await owner.query(
          `UPDATE staff_auth_sessions SET current_access_token_hash=$2,last_rotated_at=clock_timestamp() WHERE id=$1`,
          [
            m.context.staffAuthSessionId,
            staffCredentialHash("access", generateStaffCredential("vsa1.")),
          ],
        );
        const pending = db.management
          .setCompany(m.context, m.companyTarget, {
            mutationId: randomUUID(),
            expectedRevision: 1,
            field: "shiftStartPresenceMode",
            value: "WARN_ONLY",
          })
          .catch((error) => error);
        await observePresenceCommandWait(db);
        const acknowledgement = await finishPresenceBoundary(
          owner,
          outcome,
        ).catch((error) => error);
        if (outcome === "UNKNOWN")
          expect(acknowledgement).toMatchObject({
            message: "TEST_COMMIT_OUTCOME_UNKNOWN",
          });
        else expect(acknowledgement).toBeUndefined();
        const result = await pending;
        if (outcome === "ROLLBACK")
          expect(result.policy).toMatchObject({
            startMode: "WARN_ONLY",
            revision: 2,
          });
        else expect(result).toMatchObject({ status: 401 });
        expect(
          await mutationAuditCount(
            db,
            f.organizationId,
            "SHIFT_PRESENCE_COMPANY_POLICY_CHANGED",
          ),
        ).toBe(outcome === "ROLLBACK" ? 1 : 0);
        expect(
          (
            await db.adminPool.query(
              `SELECT shift_presence_revision AS revision FROM organizations WHERE id=$1`,
              [f.organizationId],
            )
          ).rows[0].revision,
        ).toBe(outcome === "ROLLBACK" ? 2 : 1);
      } finally {
        await owner.query("ROLLBACK");
        owner.release();
      }
    },
  );
});
