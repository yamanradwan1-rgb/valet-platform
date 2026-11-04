import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findForcedShiftEndOccurrence,
  queryForcedShiftEndOccurrences,
} from "../src/modules/dashboard/management-alert-sources/force-ended-shift-occurrence-reader";
import {
  findStaffSecurityOccurrence,
  queryStaffSecurityOccurrences,
} from "../src/modules/dashboard/management-alert-sources/staff-security-occurrence-reader";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";

const fixture = new StaffShiftForceEndTestFixture();
let runtime: Pool;
beforeAll(async () => {
  await fixture.start();
  runtime = fixture.runtimePool();
}, 120_000);
afterAll(async () => {
  if (runtime) await runtime.end();
  await fixture.stop();
}, 60_000);

describe("Issue #414 F Seen filtering with W18's typed receipts", () => {
  it("hides only current User's matching list occurrences; exact ignores Seen", async () => {
    const s = await fixture.scenario("ORG_ADMIN");
    const session = await fixture.query<{ createdAt: Date }>(
      `SELECT created_at AS "createdAt" FROM staff_auth_sessions WHERE id=$1`,
      [s.auth.sessionId],
    );
    const context: StaffSessionContext = {
      ...s.context,
      createdAt: session.rows[0]!.createdAt,
    };
    expect((await fixture.force(s)).status).toBe(201);
    const rolePath = `/v1/staff/management/organizations/${s.organizationId}/staff/${s.membershipId}/role`;
    expect(
      (
        await fixture.managementPost(rolePath, s.auth.accessToken, {
          expectedVersion: 1,
          role: "VALET_SUPERVISOR",
        })
      ).status,
    ).toBe(201);
    const read = (viewer: StaffSessionContext) =>
      inPostgresTransaction(runtime, async (tx) => ({
        shift: await queryForcedShiftEndOccurrences(tx, {
          context: viewer,
          organizationId: s.organizationId,
          locationId: s.locationId,
          limit: 21,
        }),
        staff: await queryStaffSecurityOccurrences(tx, {
          context: viewer,
          organizationId: s.organizationId,
          limit: 21,
        }),
      }));
    const first = await read(context);
    expect(first.shift).toHaveLength(1);
    expect(first.staff).toHaveLength(1);
    for (const [category, sourceId] of [
      ["ALT-13", first.shift[0]!.eventId],
      ["ALT-15", first.staff[0]!.eventId],
    ] as const) {
      await fixture.query(
        `INSERT INTO management_alert_seen_receipts
          (organization_id,user_id,category,source_id,occurrence_audit_event_id)
         VALUES($1,$2,$3,$4,$4)`,
        [s.organizationId, context.userId, category, sourceId],
      );
    }
    const unseen = await read(context);
    expect(unseen.shift).toEqual([]);
    expect(unseen.staff).toEqual([]);
    expect(
      await inPostgresTransaction(runtime, (tx) =>
        findForcedShiftEndOccurrence(tx, {
          context,
          organizationId: s.organizationId,
          locationId: s.locationId,
          eventId: first.shift[0]!.eventId,
        }),
      ),
    ).toEqual(first.shift[0]);
    expect(
      await inPostgresTransaction(runtime, (tx) =>
        findStaffSecurityOccurrence(tx, {
          context,
          organizationId: s.organizationId,
          eventId: first.staff[0]!.eventId,
        }),
      ),
    ).toEqual(first.staff[0]);

    const otherUser = await fixture.createUser();
    await fixture.addMembership(s.organizationId, otherUser.id, "ORG_ADMIN");
    const auth = await fixture.nativeLogin(otherUser);
    await fixture.enrollAndAssure(auth);
    const otherSession = await fixture.query<{ createdAt: Date }>(
      `SELECT created_at AS "createdAt" FROM staff_auth_sessions WHERE id=$1`,
      [auth.sessionId],
    );
    const otherContext: StaffSessionContext = {
      userId: otherUser.id,
      staffAuthSessionId: auth.sessionId,
      accessTokenHash: `staff-access-sha256:v1:${createHash("sha256")
        .update(auth.accessToken)
        .digest("hex")}`,
      createdAt: otherSession.rows[0]!.createdAt,
    };
    expect(await read(otherContext)).toEqual(first);
  });
});
