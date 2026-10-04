import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";

const db = new PresenceServerTestContext("presence-exceptions");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("exact request, point-in-time MFA review and atomic consumption", () => {
  it.each(["START", "END"] as const)(
    "approved %s exception is single-use and same exact result recovers",
    async (action) => {
      const attempt = await pendingPresenceException(db, action);
      expect(
        await db.presence.requestException(
          attempt.requester.context,
          attempt.challenge.operationId,
          {
            challengeId: attempt.challenge.challengeId,
            reason: "GPS_UNAVAILABLE",
          },
        ),
      ).toEqual(attempt.exception);
      await expect(
        db.presence.requestException(
          attempt.requester.context,
          attempt.challenge.operationId,
          {
            challengeId: attempt.challenge.challengeId,
            reason: "OUTSIDE_ZONE",
          },
        ),
      ).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
      expect(
        (
          await db.management.exceptions(
            attempt.manager.context,
            attempt.manager.target,
            { view: "PENDING", limit: 25 },
          )
        ).items[0],
      ).toMatchObject({
        canReview: true,
        requester: { userId: attempt.fixture.userId },
      });
      await attempt.approve();
      const first = await attempt.consume();
      expect(await attempt.consume()).toEqual(first);
      expect(
        (
          await db.presence.exception(
            attempt.requester.context,
            String(attempt.exception.exceptionId),
          )
        ).status,
      ).toBe("CONSUMED");
      expect(await db.facts(attempt.fixture)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: action === "END" ? 1 : 0,
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM audit_events WHERE event_type='SHIFT_PRESENCE_EXCEPTION_APPROVED' AND organization_id=$1`,
            [attempt.fixture.organizationId],
          )
        ).rows[0].count,
      ).toBe(1);
      await expect(attempt.approve()).rejects.toMatchObject({
        code: "PRESENCE_REVIEW_CONFLICT",
      });
    },
  );
  it("same User cannot review own request after acquiring another authority", async () => {
    const a = await pendingPresenceException(db);
    await db.adminPool.query(
      `UPDATE organization_memberships SET role='ORG_ADMIN' WHERE id=$1`,
      [a.fixture.membershipId],
    );
    const actor = await db.session(a.fixture.userId, true);
    await expect(
      db.management.review(
        actor.context,
        a.manager.target,
        String(a.exception.exceptionId),
        { expectedRevision: 1, mutationId: randomUUID() },
        "APPROVED",
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(
      (
        await db.management.exception(
          a.manager.context,
          a.manager.target,
          String(a.exception.exceptionId),
        )
      ).canReview,
    ).toBe(false);
    expect(
      (
        await db.adminPool.query(
          `SELECT status,revision FROM shift_presence_exceptions WHERE id=$1`,
          [a.exception.exceptionId],
        )
      ).rows[0],
    ).toEqual({ status: "PENDING", revision: 1 });
  });
  it("rejecting is terminal, revisioned and audited but cannot create a Shift", async () => {
    const a = await pendingPresenceException(db);
    const mutationId = randomUUID();
    const rejected = await db.management.review(
      a.manager.context,
      a.manager.target,
      String(a.exception.exceptionId),
      { expectedRevision: 1, mutationId },
      "REJECTED",
    );
    expect(rejected).toMatchObject({
      status: "REJECTED",
      revision: 2,
      canReview: false,
    });
    expect(rejected.terminalAt).toBe(rejected.reviewedAt);
    expect(
      await db.management.result(
        a.manager.context,
        a.manager.target,
        mutationId,
        { kind: "EXCEPTION", entityId: String(a.exception.exceptionId) },
      ),
    ).toMatchObject({ attribution: "COMMITTED", revision: 2 });
    await expect(a.consume()).rejects.toMatchObject({
      code: "PRESENCE_REJECTED",
    });
    expect(await db.facts(a.fixture)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
  });
  it("review audit failure rolls back approval with no attribution", async () => {
    const a = await pendingPresenceException(db);
    const mutationId = randomUUID();
    await db.adminPool.query(
      `INSERT INTO audit_events(id,organization_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
      VALUES($1,$2,'SYSTEM','TEST_FAILURE','Organization',$2,'{}',clock_timestamp())`,
      [mutationId, a.fixture.organizationId],
    );
    await expect(
      db.management.review(
        a.manager.context,
        a.manager.target,
        String(a.exception.exceptionId),
        { expectedRevision: 1, mutationId },
        "APPROVED",
      ),
    ).rejects.toMatchObject({ code: "PRESENCE_MUTATION_CONFLICT" });
    expect(
      (
        await db.presence.exception(
          a.requester.context,
          String(a.exception.exceptionId),
        )
      ).status,
    ).toBe("PENDING");
    expect(
      await db.management.result(
        a.manager.context,
        a.manager.target,
        mutationId,
        { kind: "EXCEPTION", entityId: String(a.exception.exceptionId) },
      ),
    ).toMatchObject({ attribution: "UNKNOWN" });
  });
});
