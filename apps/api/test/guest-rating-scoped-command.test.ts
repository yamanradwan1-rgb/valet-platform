import { describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { submitGuestRating } from "../src/modules/guest-access/guest-rating-command";
import { GuestAccessError } from "../src/modules/valet-sessions/guest-access-command";
import type { LockedGuestAccessSessionScope } from "../src/modules/valet-sessions/guest-access-session-resolution";

const visit = "00000000-0000-4000-8000-000000000003";
const session: LockedGuestAccessSessionScope = {
  completedAt: new Date("2026-11-27T08:00:00.000Z"),
  customerId: null,
  guestVehicleReadyNotificationEnabled: true,
  locationId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  readyAt: "2026-11-27T07:00:00.000Z",
  retrievalRequestedAt: new Date("2026-11-27T06:00:00.000Z"),
  state: "COMPLETED",
  valetSessionId: visit,
  vehicle: { make: null, model: null, color: null },
  version: 10,
};
const ratedAt = new Date("2026-11-27T10:00:00.000Z");
const success = {
  rows: [{ result_code: "OK", valet_session_id: visit, rating: 4, rated_at: ratedAt }],
};
const createTx = (row: unknown = success.rows[0]) => {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  return { query, transaction: { query } as unknown as PostgresTransaction };
};
const bearer = "A".repeat(43);
const browser = { kind: "BROWSER_SESSION" as const, secret: "vgb1." + bearer };
const scoped = { expectedValetSessionId: visit, comment: "مرحبا\nThanks" };

describe("Issue #463 exact guest rating write ABI and safe outcomes", () => {
  it.each([
    [bearer, "guest_rating_submit"],
    [browser, "guest_browser_rating_submit"],
  ])("preserves old 2arg signature for legacy %s", async (credential, writer) => {
    const { query, transaction } = createTx();
    const result = await submitGuestRating(transaction, credential, session, 4);
    expect(result).toEqual({ ratedAt, rating: 4, valetSessionId: visit });
    expect(query).toHaveBeenCalledOnce();
    const [sql, args] = query.mock.calls[0]!;
    expect(sql).toContain("public." + writer + "($1, $2)");
    expect(args).toEqual([typeof credential === "string" ? bearer : browser.secret, 4]);
  });

  it.each([
    [bearer, "guest_rating_submit"],
    [browser, "guest_browser_rating_submit"],
  ])("routes new feedback to exact 4arg credential-bound writer %s", async (
    credential, writer,
  ) => {
    const { query, transaction } = createTx();
    expect(await submitGuestRating(transaction, credential, session, 4, scoped)).toEqual({
      ratedAt, rating: 4, valetSessionId: visit,
    });
    const [sql, args] = query.mock.calls[0]!;
    expect(sql).toContain("public." + writer + "($1, $2, $3, $4)");
    expect(args).toEqual([
      typeof credential === "string" ? bearer : browser.secret,
      4, scoped.comment, visit,
    ]);
  });

  it("sends SQL NULL when scoped comment was omitted, empty or explicit null", async () => {
    for (const comment of [undefined, null]) {
      const { query, transaction } = createTx();
      await submitGuestRating(transaction, bearer, session, 4, {
        expectedValetSessionId: visit, comment,
      });
      expect(query.mock.calls[0]![1]).toEqual([bearer, 4, null, visit]);
    }
  });

  it("rejects a mismatched asserted visit before any SQL lookup", async () => {
    const { query, transaction } = createTx();
    await expect(submitGuestRating(transaction, browser, session, 4, {
      ...scoped, expectedValetSessionId: "00000000-0000-4000-8000-000000000009",
    })).rejects.toBeInstanceOf(GuestAccessError);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["INVALID_ACCESS", "CONFLICT", "NOT_COMPLETED", "REQUEST_INVALID",
    "FEEDBACK_UNAVAILABLE"])("maps SQL result %s safely", async (resultCode) => {
    const { transaction } = createTx({
      result_code: resultCode, rated_at: null, rating: null, valet_session_id: null,
    });
    const promise = submitGuestRating(transaction, browser, session, 4, scoped);
    const errors: Record<string, string> = {
      INVALID_ACCESS: "GUEST_ACCESS_INVALID",
      CONFLICT: "GUEST_RATING_CONFLICT",
      NOT_COMPLETED: "GUEST_RATING_NOT_AVAILABLE",
      REQUEST_INVALID: "REQUEST_INVALID",
      FEEDBACK_UNAVAILABLE: "REQUEST_INVALID",
    };
    await expect(promise).rejects.toMatchObject({
      ...(["REQUEST_INVALID", "FEEDBACK_UNAVAILABLE"].includes(resultCode)
        ? { name: "ApiTransportValidationError" } :
        { code: errors[resultCode] }),
    });
  });

  it.each([
    { ...success.rows[0], rating: 5 },
    { ...success.rows[0], valet_session_id: "00000000-0000-4000-8000-000000000009" },
    { ...success.rows[0], rated_at: null },
    { ...success.rows[0], rated_at: "bad" },
    { ...success.rows[0], rating: null },
    { result_code: "UNKNOWN", rated_at: null, rating: null, valet_session_id: null },
  ])("fails closed on malformed SQL success or unknown status %#", async (row) => {
    const { transaction } = createTx(row);
    await expect(submitGuestRating(transaction, bearer, session, 4, scoped))
      .rejects.toThrow();
  });
});
