import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompleteHandoffTestContext } from "./complete-handoff-test-context";
import {
  holdRatingReservation,
  holdRetrievalTask,
  prepareRatingSubmission,
  releaseBarrier,
  rollbackBarrier,
  settled,
  waitForLockWaiters,
} from "./guest-rating-race-test-helpers";

const context = new CompleteHandoffTestContext("guest_rating_concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function persistedRating(sessionId: string) {
  const result = await context.adminPool.query<{
    rated_at: Date;
    rating: number;
  }>(
    `SELECT rating, rated_at FROM guest_ratings WHERE valet_session_id = $1`,
    [sessionId],
  );
  return result.rows;
}

describe("MGT-BE-09 Guest Rating concurrency", () => {
  it("converges concurrent same-value submissions on one immutable rating", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.complete(fixture);
    const firstSubmission = await prepareRatingSubmission(context, fixture, "same-1");
    const secondSubmission = await prepareRatingSubmission(context, fixture, "same-2");
    const blocker = await holdRatingReservation(
      context,
      firstSubmission.reservationId,
    );
    let released = false;
    try {
      const first = settled(firstSubmission.submit(5));
      await waitForLockWaiters(context, "UPDATE anti_abuse_events");
      const second = settled(secondSubmission.submit(5));
      await waitForLockWaiters(context, "FROM valet_sessions AS session");
      await releaseBarrier(blocker);
      released = true;
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toMatchObject({
        kind: "FULFILLED",
        value: { rating: 5, valetSessionId: fixture.sessionId },
      });
      expect(secondResult).toEqual(firstResult);
      expect(await persistedRating(fixture.sessionId)).toEqual([
        {
          rated_at: new Date(firstResult.kind === "FULFILLED" ? firstResult.value.ratedAt : 0),
          rating: 5,
        },
      ]);
    } finally {
      if (!released) await rollbackBarrier(blocker);
    }
  });

  it("gives the first committed different value one winner and a safe conflict", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.complete(fixture);
    const firstSubmission = await prepareRatingSubmission(context, fixture, "different-1");
    const secondSubmission = await prepareRatingSubmission(context, fixture, "different-2");
    const blocker = await holdRatingReservation(
      context,
      firstSubmission.reservationId,
    );
    let released = false;
    try {
      const first = settled(firstSubmission.submit(4));
      await waitForLockWaiters(context, "UPDATE anti_abuse_events");
      const second = settled(secondSubmission.submit(2));
      await waitForLockWaiters(context, "FROM valet_sessions AS session");
      await releaseBarrier(blocker);
      released = true;
      await expect(first).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { rating: 4, valetSessionId: fixture.sessionId },
      });
      await expect(second).resolves.toMatchObject({
        error: { code: "GUEST_RATING_CONFLICT" },
        kind: "REJECTED",
      });
      expect(await persistedRating(fixture.sessionId)).toMatchObject([{ rating: 4 }]);
    } finally {
      if (!released) await rollbackBarrier(blocker);
    }
  });

  it("lets completion commit first, then rating re-checks and succeeds", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const ratingSubmission = await prepareRatingSubmission(
      context,
      fixture,
      "completion-first",
    );
    const blocker = await holdRetrievalTask(context, fixture.retrievalTaskId);
    let released = false;
    try {
      const completion = settled(context.complete(fixture));
      await waitForLockWaiters(context, "FROM tasks");
      const rating = settled(ratingSubmission.submit(5));
      await waitForLockWaiters(context, "FROM valet_sessions AS session");
      await releaseBarrier(blocker);
      released = true;
      await expect(completion).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { state: "COMPLETED" },
      });
      await expect(rating).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { rating: 5, valetSessionId: fixture.sessionId },
      });
      const completedAt = (await context.releaseEffects(fixture)).projection.completed_at;
      const rows = await persistedRating(fixture.sessionId);
      expect(rows).toMatchObject([{ rating: 5 }]);
      expect(completedAt).not.toBeNull();
      expect(rows[0]!.rated_at.getTime()).toBeGreaterThanOrEqual(completedAt!.getTime());
    } finally {
      if (!released) await rollbackBarrier(blocker);
    }
  });

  it("lets rating reject first, then completion proceeds after the session lock releases", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const ratingSubmission = await prepareRatingSubmission(
      context,
      fixture,
      "rating-first",
    );
    const blocker = await holdRatingReservation(
      context,
      ratingSubmission.reservationId,
    );
    let released = false;
    try {
      const rating = settled(ratingSubmission.submit(3));
      await waitForLockWaiters(context, "UPDATE anti_abuse_events");
      const completion = settled(context.complete(fixture));
      await waitForLockWaiters(context, "FROM valet_sessions WHERE id");
      await releaseBarrier(blocker);
      released = true;
      await expect(rating).resolves.toMatchObject({
        error: { code: "GUEST_RATING_NOT_AVAILABLE" },
        kind: "REJECTED",
      });
      await expect(completion).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { state: "COMPLETED" },
      });
      expect(await persistedRating(fixture.sessionId)).toEqual([]);
    } finally {
      if (!released) await rollbackBarrier(blocker);
    }
  });
});
