import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GuestRatingTestContext } from "./guest-rating-test-context";

const context = new GuestRatingTestContext("idempotency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const bearer = (token: string) => `Bearer ${token}`;

describe("MGT-BE-09 Guest Rating retry semantics", () => {
  it("converges a lost-response same-value retry and conflicts on a different value", async () => {
    const fixture = await context.completedFixture();
    const first = await context.post(
      { rating: 4 },
      { authorization: bearer(fixture.guestToken) },
    );
    const retry = await context.post(
      { rating: 4 },
      { authorization: bearer(fixture.guestToken) },
    );
    expect(first).toMatchObject({
      body: { rating: 4, valetSessionId: fixture.sessionId },
      status: 200,
    });
    expect(retry).toMatchObject({
      body: { rating: 4, ratedAt: first.body.ratedAt, valetSessionId: fixture.sessionId },
      status: 200,
    });
    const rowsAfterRetry = await context.ratingRows(fixture.sessionId);
    expect(rowsAfterRetry).toHaveLength(1);
    expect(rowsAfterRetry[0]).toMatchObject({ rating: 4 });
    expect(rowsAfterRetry[0]!.rated_at.toISOString()).toBe(first.body.ratedAt);

    const conflict = await context.post(
      { rating: 5 },
      { authorization: bearer(fixture.guestToken) },
    );
    expect(conflict).toMatchObject({
      body: { code: "GUEST_RATING_CONFLICT" },
      status: 409,
    });
    const finalRows = await context.ratingRows(fixture.sessionId);
    expect(finalRows).toHaveLength(1);
    expect(finalRows[0]?.rating).toBe(4);
  });

  it.each(["EXPIRED", "REVOKED"] as const)(
    "revalidates Guest Access before disclosing an existing rating when %s",
    async (mode) => {
      const fixture = await context.completedFixture();
      const first = await context.post(
        { rating: 5 },
        { authorization: bearer(fixture.guestToken) },
      );
      expect(first.status).toBe(200);
      if (mode === "EXPIRED") await context.expire(fixture.sessionId);
      else await context.revoke(fixture.sessionId);
      const retry = await context.post(
        { rating: 5 },
        { authorization: bearer(fixture.guestToken) },
      );
      expect(retry).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      expect(retry.body).not.toHaveProperty("rating");
      expect(retry.body).not.toHaveProperty("ratedAt");
      expect(await context.ratingRows(fixture.sessionId)).toHaveLength(1);
    },
  );

  it("gives invalid Guest Access the same non-disclosing result whether any rating exists", async () => {
    const rated = await context.completedFixture();
    expect(
      (
        await context.post(
          { rating: 3 },
          { authorization: bearer(rated.guestToken) },
        )
      ).status,
    ).toBe(200);
    const unrated = await context.completedFixture();
    const wrong = randomBytes(32).toString("base64url");
    const againstRated = await context.post(
      { rating: 3 },
      { authorization: bearer(wrong) },
    );
    const anotherWrong = randomBytes(32).toString("base64url");
    const againstUnrated = await context.post(
      { rating: 3 },
      { authorization: bearer(anotherWrong) },
    );
    expect(againstRated).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID", message: "Guest access is invalid." },
      status: 401,
    });
    expect(againstUnrated).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID", message: "Guest access is invalid." },
      status: 401,
    });
    expect(await context.ratingRows(unrated.sessionId)).toHaveLength(0);
  });
});
