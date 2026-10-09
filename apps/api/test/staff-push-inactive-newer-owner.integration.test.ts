import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StaffPushApiFixture } from "./staff-push-api-fixture";

const fixture = new StaffPushApiFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Issue 273 PostgreSQL inactive newer-owner chronology fence", () => {
  it.each(["revoked", "absolute-expired"] as const)(
    "rejects an older same-User session when its newer registration owner is %s",
    async (condition) => {
      const user = await fixture.createUser();
      const older = await fixture.login(user);
      const newer = await fixture.login(user);
      // Make chronology deterministic even after an expired newer session is
      // moved to the past by the constraint-valid fixture below.
      await fixture.query(
        `UPDATE staff_auth_sessions
         SET created_at = transaction_timestamp() - interval '32 days'
         WHERE id = $1`,
        [older.sessionId],
      );

      const request = fixture.requestBody();
      const created = await fixture.put(newer, request);
      expect(created.status).toBe(200);

      // Simulate a noncurrent owner whose row is still ACTIVE, not an
      // ordinary logout (which would atomically DISABLE that registration).
      if (condition === "revoked") {
        await fixture.query(
          `UPDATE staff_auth_sessions
           SET revoked_at = transaction_timestamp()
           WHERE id = $1`,
          [newer.sessionId],
        );
      } else {
        await fixture.query(
          `UPDATE staff_auth_sessions
           SET created_at = clock.t,
               last_rotated_at = clock.t,
               access_expires_at = clock.t + interval '1 minute',
               absolute_expires_at = clock.t + interval '720 hours'
           FROM (SELECT transaction_timestamp() - interval '31 days' AS t) clock
           WHERE id = $1`,
          [newer.sessionId],
        );
      }

      const before = (await fixture.registrations()).rows.filter(
        (row) => row.installation_id === request.installationId,
      );
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({
        staff_auth_session_id: newer.sessionId,
        state: "ACTIVE",
      });

      const attemptedReclaim = await fixture.put(older, request);
      expect(attemptedReclaim.status).toBe(409);
      expect(attemptedReclaim.body?.code).toBe(
        "STAFF_PUSH_REGISTRATION_CONFLICT",
      );
      expect(JSON.stringify(attemptedReclaim.body)).not.toContain(
        newer.sessionId,
      );
      expect(JSON.stringify(attemptedReclaim.body)).not.toContain(
        request.providerToken,
      );
      expect(
        (await fixture.registrations()).rows.filter(
          (row) => row.installation_id === request.installationId,
        ),
      ).toEqual(before);
    },
  );
});
