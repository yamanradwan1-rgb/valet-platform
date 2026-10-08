import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { withDatabaseOperationDeadline } from "../src/common/database/runtime-database-deadline";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { requestGuestRetrieval } from "../src/modules/retrieval/guest-retrieval-request-command";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";
import { loadGuestRetrievalEffects } from "./guest-retrieval-effects";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

describe("T3 authoritative precommit failure rolls back the physical domain", () => {
  const context = new ConfirmParkedTestContext("t3_native_domain_rollback");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);
  it("cancels a stalled audit append and commits no session, request, task or history changes", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture);
    const token = randomBytes(32).toString("base64url");
    await context.adminPool.query(
      "UPDATE valet_sessions SET customer_access_token_hash=$2, customer_access_expires_at=clock_timestamp()+interval '1 hour',customer_access_revoked_at=NULL WHERE id=$1",
      [fixture.sessionId, hashGuestAccessToken(token)],
    );
    const before = await loadGuestRetrievalEffects(
      context.adminPool,
      fixture.sessionId,
    );
    await context.adminPool.query(
      "CREATE FUNCTION t3_stalled_retrieval_audit() RETURNS trigger LANGUAGE plpgsql AS $$ " +
        "BEGIN IF NEW.event_type::text='RETRIEVAL_REQUESTED' THEN PERFORM pg_sleep(10); END IF; RETURN NEW; END $$; " +
        "CREATE TRIGGER t3_stalled_retrieval_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION t3_stalled_retrieval_audit()",
    );
    try {
      const start = performance.now();
      const access = new GuestAccessService(context.runtimePool);
      await expect(
        withDatabaseOperationDeadline(() =>
          inPostgresTransaction(context.runtimePool, async (transaction) => {
            const resolved = await access.resolveAndLockCredentialInTransaction(
              transaction,
              { kind: "LEGACY_BEARER", secret: token },
              true,
            );
            if (!resolved)
              throw new Error("Fixture credential must be authorized.");
            await requestGuestRetrieval(
              transaction,
              resolved.session,
              syntheticStaffPushPolicy.employeeRetrievalRequested,
              false,
            );
          }),
        ),
      ).rejects.toMatchObject({ code: "57014" });
      expect(performance.now() - start).toBeLessThan(4500);
      expect(
        await loadGuestRetrievalEffects(context.adminPool, fixture.sessionId),
      ).toEqual(before);
      expect(
        (
          await context.adminPool.query(
            "SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename=$1 AND (state='active' OR state LIKE '%transaction%')",
            [context.runtimeRole],
          )
        ).rows[0].count,
      ).toBe(0);
      expect(
        (await context.runtimePool.query("SELECT 1 AS healthy")).rows[0]
          .healthy,
      ).toBe(1);
    } finally {
      await context.adminPool.query(
        "DROP TRIGGER t3_stalled_retrieval_audit ON audit_events; DROP FUNCTION t3_stalled_retrieval_audit()",
      );
    }
  }, 10_000);
});
