import { expect } from "vitest";
import { customerFeedbackAnalyticsResponseSchema, customerFeedbackAnalyticsWithCommentsResponseSchema } from "@valet/contracts";
import type { acquireIssue463BrowserTarget } from "./issue463-browser-target";
import type { seedIssue463Browser } from "./issue463-browser-seed";

type Target = Awaited<ReturnType<typeof acquireIssue463BrowserTarget>>;
type Fixture = Awaited<ReturnType<typeof seedIssue463Browser>>;

/** Real mounted HTTP, separately authenticated manager; no injected bearer. */
export async function verifyIssue463RatingReads(
  target: Target, apiOrigin: string, dashboardOrigin: string,
  fixture: Fixture, deniedFixture: Fixture, comment: string,
) {
  const login = await fetch(apiOrigin + "/v1/staff/auth/login", {
    method: "POST",
    headers: { origin: dashboardOrigin, "content-type": "application/json" },
    body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    signal: AbortSignal.timeout(10_000),
  });
  expect(login.status).toBe(200);
  const body = await login.json() as { accessToken?: unknown };
  if (typeof body.accessToken !== "string" || body.accessToken.length === 0) {
    throw new Error("Issue463 actual manager login did not issue a bearer.");
  }
  const authorization = "Bearer " + body.accessToken;
  const result = await target.client.query<{ from_day: string; to_day: string }>(
    `SELECT to_char((clock_timestamp() AT TIME ZONE 'Asia/Amman')::date-1,'YYYY-MM-DD') AS from_day,
      to_char((clock_timestamp() AT TIME ZONE 'Asia/Amman')::date,'YYYY-MM-DD') AS to_day`);
  const dates = result.rows[0]!;
  const period = new URLSearchParams({ from: dates.from_day, to: dates.to_day });
  const path = (location: string) => apiOrigin +
    "/v1/staff/dashboard/locations/" + location + "/analytics/ratings?" + period.toString();
  const read = (url: string, bearer?: string) => fetch(url, {
    headers: bearer ? { authorization: bearer } : {},
    signal: AbortSignal.timeout(10_000),
  });
  const numeric = await read(path(fixture.locationId), authorization);
  expect(numeric.status).toBe(200);
  expect(numeric.headers.get("cache-control")).toContain("no-store");
  const legacy = customerFeedbackAnalyticsResponseSchema.parse(await numeric.json());
  const expanded = await read(path(fixture.locationId) + "&includeComments=true", authorization);
  expect(expanded.status).toBe(200);
  expect(expanded.headers.get("cache-control")).toContain("no-store");
  const feedback = customerFeedbackAnalyticsWithCommentsResponseSchema.parse(await expanded.json());
  expect(feedback.recentRatings).toHaveLength(4);
  expect(feedback.eligibleCompletedVisits).toBe(4);
  expect(feedback.ratedVisits).toBe(4);
  expect(feedback.recentRatings.filter(row => row.comment !== null)).toHaveLength(2);
  expect(feedback.recentRatings.some(row => row.comment === comment)).toBe(true);
  expect({ ...feedback, recentRatings: feedback.recentRatings.map(({ comment: ignored, ...row }) => {
    void ignored;
    return row;
  }) }).toEqual(legacy);
  const forbidden = await read(path(deniedFixture.locationId) + "&includeComments=true", authorization);
  expect(forbidden.status).toBe(404);
  expect(forbidden.headers.get("cache-control")).toContain("no-store");
  expect(await forbidden.json()).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const anonymous = await read(path(fixture.locationId) + "&includeComments=true");
  expect(anonymous.status).toBe(401);
}
