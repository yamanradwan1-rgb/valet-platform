import { expect } from "vitest";
import { guestRatingSubmissionResponseSchema } from "@valet/contracts";
import type { acquireIssue463BrowserTarget } from "./issue463-browser-target";
import { seedIssue463Browser } from "./issue463-browser-seed";

type Target = Awaited<ReturnType<typeof acquireIssue463BrowserTarget>>;

/** Exact retry and mismatch through real scoped mounted HTTP, separate synthetic org. */
export async function verifyIssue463GuestRetries(target: Target, apiOrigin: string) {
  const fixture = await seedIssue463Browser(target);
  const visit = await fixture.completedVisit();
  const other = await fixture.completedVisit();
  const comment = "Synthetic retry proof.\nExact bytes.";
  const body = { rating: 4, expectedValetSessionId: visit.id, comment };
  const post = (input: object | Buffer) => fetch(apiOrigin + "/v1/guest/session/rating", {
    method: "POST",
    headers: { authorization: "Bearer " + visit.token, "content-type": "application/json" },
    body: Buffer.isBuffer(input) ? new Uint8Array(input) : JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  });
  expect((await post({ ...body, expectedValetSessionId: other.id })).status).toBe(401);
  const malformed = Buffer.concat([
    Buffer.from(JSON.stringify({ ...body, comment: "" }).slice(0, -2)),
    Buffer.from([0xc0, 0xaf]), Buffer.from('"}'),
  ]);
  expect((await post(malformed)).status).toBe(400);
  const before = await target.client.query(
    "SELECT count(*)::integer AS total FROM guest_ratings WHERE organization_id=$1",
    [fixture.organizationId],
  );
  expect(before.rows).toEqual([{ total: 0 }]);
  const initial = await post(body);
  expect(initial.status).toBe(200);
  const response = guestRatingSubmissionResponseSchema.parse(await initial.json());
  expect(response).toMatchObject({ rating: 4, valetSessionId: visit.id });
  const retry = await post(body);
  expect(retry.status).toBe(200);
  expect(guestRatingSubmissionResponseSchema.parse(await retry.json())).toEqual(response);
  expect((await post({ ...body, comment: "Different comment." })).status).toBe(409);
  expect((await post({ ...body, rating: 5 })).status).toBe(409);
  expect((await post({ rating: 4 })).status).toBe(409);
  const persisted = await target.client.query(
    `SELECT r.rating,c.comment_text,c.state
       FROM guest_ratings r JOIN guest_rating_comments c ON
       c.organization_id=r.organization_id AND c.location_id=r.location_id
       AND c.valet_session_id=r.valet_session_id
       WHERE r.organization_id=$1 AND r.valet_session_id=$2`,
    [fixture.organizationId, visit.id],
  );
  expect(persisted.rows).toEqual([{ rating: 4, comment_text: comment, state: "PRESENT" }]);
}
