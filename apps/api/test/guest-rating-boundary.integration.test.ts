import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GuestRatingTestContext } from "./guest-rating-test-context";

const context = new GuestRatingTestContext("boundary");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function bearer(token: string): string {
  return `Bearer ${token}`;
}

function expectNoStore(result: { headers: Headers }): void {
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("pragma")).toBe("no-cache");
}

describe("MGT-BE-09 Guest Rating HTTP boundary", () => {
  it.each([1, 3, 5])("accepts strict integer rating %i after real completion", async (rating) => {
    const fixture = await context.completedFixture();
    const response = await context.post(
      { rating },
      { authorization: bearer(fixture.guestToken) },
    );
    expect(response).toMatchObject({
      body: { rating, valetSessionId: fixture.sessionId },
      status: 200,
    });
    expect(response.body.ratedAt).toEqual(expect.any(String));
    expectNoStore(response);
    expect(await context.ratingRows(fixture.sessionId)).toHaveLength(1);
  });

  it.each([
    [{ rating: 0 }],
    [{ rating: 6 }],
    [{ rating: -1 }],
    [{ rating: 1.5 }],
    [{ rating: "5" }],
    [{ rating: null }],
    [{}],
    [{ comment: "great", rating: 5 }],
    [[5]],
  ])("rejects invalid request body %#", async (body) => {
    const fixture = await context.completedFixture();
    const response = await context.post(body, {
      authorization: bearer(fixture.guestToken),
    });
    expect(response).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
    expect(await context.ratingRows(fixture.sessionId)).toHaveLength(0);
    expectNoStore(response);
  });

  it("rejects unknown query parameters", async () => {
    const fixture = await context.completedFixture();
    const response = await context.post(
      { rating: 4 },
      { authorization: bearer(fixture.guestToken), query: "?sessionId=other" },
    );
    expect(response).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
    expect(await context.ratingRows(fixture.sessionId)).toHaveLength(0);
  });

  it("requires exactly one shape-valid Guest Authorization header", async () => {
    const fixture = await context.completedFixture();
    const randomToken = randomBytes(32).toString("base64url");
    const cases = [
      await context.post({ rating: 4 }),
      await context.post({ rating: 4 }, { authorization: "Bearer malformed" }),
      await context.post({ rating: 4 }, { authorization: bearer(randomToken) }),
      await context.post(
        { rating: 4 },
        {
          authorization: bearer(fixture.guestToken),
          duplicateAuthorization: bearer(fixture.guestToken),
        },
      ),
      await context.post(
        { rating: 4 },
        { authorization: `Bearer vsa1.${"x".repeat(43)}` },
      ),
    ];
    for (const response of cases) {
      expect(response).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      expectNoStore(response);
    }
    expect(await context.ratingRows(fixture.sessionId)).toHaveLength(0);
  });

  it("rejects expired and revoked current Guest Access without disclosure", async () => {
    const expired = await context.completedFixture();
    await context.expire(expired.sessionId);
    const expiredResponse = await context.post(
      { rating: 5 },
      { authorization: bearer(expired.guestToken) },
    );
    const revoked = await context.completedFixture();
    await context.revoke(revoked.sessionId);
    const revokedResponse = await context.post(
      { rating: 5 },
      { authorization: bearer(revoked.guestToken) },
    );
    for (const response of [expiredResponse, revokedResponse]) {
      expect(response).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
    }
    expect(await context.ratingRows(expired.sessionId)).toHaveLength(0);
    expect(await context.ratingRows(revoked.sessionId)).toHaveLength(0);
  });

  it.each(["PARKED", "REQUESTED", "READY", "HANDOFF_PENDING"] as const)(
    "rejects valid Guest rating while session is %s",
    async (state) => {
      let fixture: { guestToken: string; sessionId: string };
      if (state === "PARKED") {
        const parked = await context.createConfirmParkedFixture();
        await context.confirm(parked);
        fixture = {
          guestToken: await context.attachGuestAccess(parked.sessionId),
          sessionId: parked.sessionId,
        };
      } else if (state === "REQUESTED") {
        const requested = await context.createStartRetrievalFixture();
        fixture = {
          guestToken: await context.attachGuestAccess(requested.sessionId),
          sessionId: requested.sessionId,
        };
      } else if (state === "READY") {
        fixture = await context.createHandoffFixture();
      } else {
        fixture = await context.prepareStandard("PICKUP_CODE");
      }
      const response = await context.post(
        { rating: 4 },
        { authorization: bearer(fixture.guestToken) },
      );
      expect(response).toMatchObject({
        body: { code: "GUEST_RATING_NOT_AVAILABLE" },
        status: 409,
      });
      expect(await context.ratingRows(fixture.sessionId)).toHaveLength(0);
    },
  );

  it("does not let a token select another session", async () => {
    const first = await context.completedFixture();
    const second = await context.completedFixture();
    const response = await context.post(
      { rating: 5, valetSessionId: second.sessionId },
      { authorization: bearer(first.guestToken) },
    );
    expect(response).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
    expect(await context.ratingRows(first.sessionId)).toHaveLength(0);
    expect(await context.ratingRows(second.sessionId)).toHaveLength(0);
  });
});
