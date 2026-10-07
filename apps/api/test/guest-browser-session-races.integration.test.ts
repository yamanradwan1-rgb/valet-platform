import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import { requestGuestRetrieval } from "../src/modules/retrieval/guest-retrieval-request-command";
import { GuestAccessError } from "../src/modules/valet-sessions/guest-access-command";
import { GuestBrowserSessionTestContext } from "./guest-browser-session-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

describe("Guest Browser Session T1 PostgreSQL races", () => {
  const context = new GuestBrowserSessionTestContext("races");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  it("serializes concurrent exchange of the same enrollment as authorize plus recovery", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    const outcomes = await Promise.all([
      context.exchangeDirect(visit.token, credentials),
      context.exchangeDirect(visit.token, credentials),
    ]);
    expect(outcomes.sort()).toEqual(["AUTHORIZED", "RECOVERED"]);
    expect(await context.resolveDirect(credentials.browser)).toBe("OK:ACTIVE");
  });

  it("allows only one foreign enrollment to claim one credential generation", async () => {
    const visit = await context.createVisit();
    const first = await context.enrollDirect();
    const second = await context.enrollDirect();
    const outcomes = await Promise.all([
      context.exchangeDirect(visit.token, first),
      context.exchangeDirect(visit.token, second),
    ]);
    expect(outcomes.filter((value) => value === "AUTHORIZED")).toHaveLength(1);
    expect(outcomes.filter((value) => value === "INVALID_ACCESS")).toHaveLength(
      1,
    );
    const resolves = await Promise.all([
      context.resolveDirect(first.browser),
      context.resolveDirect(second.browser),
    ]);
    expect(resolves.filter((value) => value === "OK:ACTIVE")).toHaveLength(1);
  });

  it("converges safely when exchange races a staff rotation", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    const [exchange, rotate] = await Promise.all([
      context.exchangeDirect(visit.token, credentials),
      context.rotate(visit),
    ]);
    expect(["AUTHORIZED", "INVALID_ACCESS"]).toContain(exchange);
    expect(rotate).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
  });

  it("converges safely when exchange races staff revoke", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    const [exchange, revokedAt] = await Promise.all([
      context.exchangeDirect(visit.token, credentials),
      context.revoke(visit),
    ]);
    expect(["AUTHORIZED", "INVALID_ACCESS"]).toContain(exchange);
    expect(revokedAt).toBeInstanceOf(Date);
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
  });

  it("keeps a revoked generation invalid when exchange races explicit reissue", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    const revokedAt = await context.revoke(visit);
    const [exchange, reissued] = await Promise.all([
      context.exchangeDirect(visit.token, credentials),
      context.reissue(visit, revokedAt),
    ]);
    expect(exchange).toBe("INVALID_ACCESS");
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
    const current = await context.enrollDirect();
    expect(await context.exchangeDirect(reissued, current)).toBe("AUTHORIZED");
  });

  it("never resurrects an old generation after explicit reissue", async () => {
    const visit = await context.createVisit();
    const oldBrowser = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, oldBrowser)).toBe(
      "AUTHORIZED",
    );
    const revokedAt = await context.revoke(visit);
    const reissued = await context.reissue(visit, revokedAt);

    expect(await context.resolveDirect(oldBrowser.browser)).toBe(
      "INVALID_ACCESS",
    );
    const oldRetry = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, oldRetry)).toBe(
      "INVALID_ACCESS",
    );
    const current = await context.enrollDirect();
    expect(await context.exchangeDirect(reissued, current)).toBe("AUTHORIZED");
    expect(await context.resolveDirect(current.browser)).toBe("OK:ACTIVE");
  });

  it("logout versus restore may observe pre-logout state but always ends revoked", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );

    const [restore] = await Promise.all([
      context.resolveDirect(credentials.browser),
      context.endDirect(credentials.browser),
    ]);
    expect(["OK:ACTIVE", "INVALID_ACCESS"]).toContain(restore);
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
  });

  it("restore versus revoke may observe pre-revoke state but revoke wins final authority", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    const [restore, revokedAt] = await Promise.all([
      context.resolveDirect(credentials.browser),
      context.revoke(visit),
    ]);
    expect(["OK:ACTIVE", "INVALID_ACCESS"]).toContain(restore);
    expect(revokedAt).toBeInstanceOf(Date);
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
  });

  it("allows concurrent tabs to share one Browser Session authority", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    await expect(
      Promise.all([
        context.resolveDirect(credentials.browser),
        context.resolveDirect(credentials.browser),
        context.resolveDirect(credentials.browser),
      ]),
    ).resolves.toEqual(["OK:ACTIVE", "OK:ACTIVE", "OK:ACTIVE"]);
  });

  it("rolls back attempted consume so an authoritative retry can still authorize", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    const transaction = await context.runtimePool.connect();
    try {
      await transaction.query("BEGIN");
      const attempted = await transaction.query<{ result_code: string }>(
        "SELECT result_code FROM public.guest_browser_exchange($1,$2,$3)",
        [visit.token, credentials.enrollment, credentials.browser],
      );
      expect(attempted.rows[0]?.result_code).toBe("AUTHORIZED");
      await transaction.query("ROLLBACK");
    } finally {
      transaction.release();
    }
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
  });

  it("serializes an active request against completion and leaves only post-visit scope", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    const [requestResult] = await Promise.all([
      context.resolveDirect(credentials.browser, false),
      context.complete(visit.sessionId),
    ]);
    expect(["OK:ACTIVE", "INVALID_ACCESS"]).toContain(requestResult);
    expect(await context.resolveDirect(credentials.browser, false)).toBe(
      "INVALID_ACCESS",
    );
    expect(await context.resolveDirect(credentials.browser, true)).toBe(
      "OK:POST_VISIT",
    );
  });

  it("serializes a post-visit request against the 24-hour expiry boundary", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    await context.complete(visit.sessionId, 23);
    const [requestResult] = await Promise.all([
      context.resolveDirect(credentials.browser, true),
      context.adminPool.query(
        `UPDATE valet_sessions
         SET completed_at=clock_timestamp()-interval '25 hours'
         WHERE id=$1`,
        [visit.sessionId],
      ),
    ]);
    expect(["OK:POST_VISIT", "INVALID_ACCESS"]).toContain(requestResult);
    expect(await context.resolveDirect(credentials.browser, true)).toBe(
      "INVALID_ACCESS",
    );
  });

  it("rechecks completion under lock before an in-flight Browser Retrieval mutation", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    const completion = await context.adminPool.connect();
    await completion.query("BEGIN");
    try {
      await completion.query(
        `UPDATE valet_sessions
         SET state='COMPLETED',completed_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE id=$1`,
        [visit.sessionId],
      );
      const mutation = (async () => {
        const transaction = await context.runtimePool.connect();
        const browserSessions = new GuestBrowserSessionService();
        try {
          await transaction.query("BEGIN");
          const resolved = await browserSessions.resolveLockedInTransaction(
            transaction,
            credentials.browser,
            false,
          );
          await requestGuestRetrieval(
            transaction,
            resolved.session,
            syntheticStaffPushPolicy.employeeRetrievalRequested,
            false,
          );
          await transaction.query("COMMIT");
          return "MUTATED";
        } catch (error) {
          await transaction.query("ROLLBACK");
          if (error instanceof GuestAccessError) return "INVALID_ACCESS";
          throw error;
        } finally {
          transaction.release();
        }
      })();
      await completion.query("SELECT pg_sleep(0.05)");
      await completion.query("COMMIT");
      expect(await mutation).toBe("INVALID_ACCESS");
    } catch (error) {
      await completion.query("ROLLBACK");
      throw error;
    } finally {
      completion.release();
    }
    const effects = await context.adminPool.query<{ count: number }>(
      `SELECT
         (SELECT count(*)::int FROM retrieval_requests WHERE valet_session_id=$1) +
         (SELECT count(*)::int FROM tasks WHERE valet_session_id=$1 AND task_type='RETRIEVAL') +
         (SELECT count(*)::int FROM audit_events WHERE valet_session_id=$1 AND event_type='RETRIEVAL_REQUESTED')
         AS count`,
      [visit.sessionId],
    );
    expect(effects.rows[0]?.count).toBe(0);
  });
});
