import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { ratingAnalyticsReadQuery } from "../src/modules/management/rating-analytics-http";
import {
  boundProtectedRatingFeedbackLockWait,
  mapProtectedRatingFeedbackContention,
  queryProtectedRatingFeedbackProjection,
  queryRatingAnalyticsProjection,
} from "../src/modules/management/rating-analytics-projection-query";

const organizationId = "e02f741b-a215-4cb7-bd5b-a51a2e2c4fa0";
const membershipId = "e02f741b-a215-4cb7-bd5b-a51a2e2c4fa1";
const locationId = "e02f741b-a215-4cb7-bd5b-a51a2e2c4fa2";
const period = { from: "2026-11-01", to: "2026-11-26" };
const context: StaffSessionContext = {
  staffAuthSessionId: randomUUID(),
  userId: "e02f741b-a215-4cb7-bd5b-a51a2e2c4fa4",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  rawAccessToken: "vsa1." + "X".repeat(43),
};

function stubDb(payload: unknown = { recentRatings: [{ comment: null }] }) {
  const calls: { text: string; values?: readonly unknown[] }[] = [];
  const db = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push(values === undefined ? { text } : { text, values });
      if (text.includes("AS payload")) return { rows: [{ payload }] };
      return { rows: [{ set_config: "2000ms" }] };
    },
  } as unknown as PostgresTransaction;
  return { db, calls };
}

describe("Issue #463 P5 protected Management rating reader", () => {
  it("accepts only explicit string true, retaining exact period-only requests", () => {
    expect(ratingAnalyticsReadQuery(period)).toEqual({ period, includeComments: false });
    expect(ratingAnalyticsReadQuery({ ...period, includeComments: "true" }))
      .toEqual({ period, includeComments: true });
    for (const invalid of ["false", "TRUE", true, ["true"]]) {
      expect(() => ratingAnalyticsReadQuery({ ...period, includeComments: invalid }))
        .toThrow();
    }
    expect(() => ratingAnalyticsReadQuery({ ...period, admin: "true" })).toThrow();
  });

  it("uses all nine typed args, one transaction, and no plaintext in default path", async () => {
    const { db, calls } = stubDb();
    await boundProtectedRatingFeedbackLockWait(db);
    await queryProtectedRatingFeedbackProjection(
      db, context, membershipId, organizationId, locationId, period,
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain("lock_timeout");
    expect(calls[1]?.text).toContain("management_rating_feedback_projection");
    expect(calls[1]?.values).toEqual([
      context.staffAuthSessionId, context.userId, context.rawAccessToken,
      context.createdAt, membershipId, organizationId, locationId,
      period.from, period.to,
    ]);
    calls.length = 0;
    await queryRatingAnalyticsProjection(db, organizationId, null, period);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("management_rating_analytics_projection");
    expect(calls[0]?.values).toEqual([
      organizationId, null, period.from, period.to,
    ]);
    expect(calls[0]?.text).not.toContain("feedback");
  });

  it("maps SQL contention without changing an existing domain authorization error", () => {
    expect(mapProtectedRatingFeedbackContention({ code: "55P03" }))
      .toMatchObject({ code: "RATING_FEEDBACK_UNAVAILABLE" });
    const domainError = { code: "MFA_STEP_UP_REQUIRED" };
    expect(mapProtectedRatingFeedbackContention(domainError)).toBe(domainError);
  });

  it("refuses a context lacking its exact raw bearer before issuing SQL", async () => {
    const { db, calls } = stubDb();
    await expect(queryProtectedRatingFeedbackProjection(
      db, {
        createdAt: context.createdAt,
        staffAuthSessionId: context.staffAuthSessionId,
        userId: context.userId,
      },
      membershipId, organizationId, null, period,
    )).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
  });

  it("maps SQL authorization failure to scoped denial and contention to safe unavailable", async () => {
    for (const [state, expected] of [
      ["42501", "AUTHORIZATION_DENIED"],
      ["55P03", "RATING_FEEDBACK_UNAVAILABLE"],
      ["40P01", "RATING_FEEDBACK_UNAVAILABLE"],
      ["57014", "RATING_FEEDBACK_UNAVAILABLE"],
      ["42883", "RATING_FEEDBACK_UNAVAILABLE"],
    ]) {
      const db = {
        async query(text: string) {
          if (text.includes("AS payload")) {
            throw Object.assign(new Error("PRIVATE SQL DETAIL"), { code: state });
          }
          return { rows: [] };
        },
      } as unknown as PostgresTransaction;
      await expect(queryProtectedRatingFeedbackProjection(
        db, context, membershipId, organizationId, null, period,
      )).rejects.toMatchObject({ code: expected });
    }
  });

  it("fails closed on null or invalid protected projection objects", async () => {
    for (const payload of [null, [], 123, "plaintext"]) {
      const { db } = stubDb(payload);
      await expect(queryProtectedRatingFeedbackProjection(
        db, context, membershipId, organizationId, locationId, period,
      )).rejects.toMatchObject({ code: "RATING_FEEDBACK_UNAVAILABLE" });
    }
  });
});
