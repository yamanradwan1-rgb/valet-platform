import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import {
  findForcedShiftEndOccurrence,
  queryForcedShiftEndOccurrences,
} from "../src/modules/dashboard/management-alert-sources/force-ended-shift-occurrence-reader";
import {
  findStaffSecurityOccurrence,
  queryStaffSecurityOccurrences,
} from "../src/modules/dashboard/management-alert-sources/staff-security-occurrence-reader";
import {
  StaffShiftForceEndTestFixture,
  type ForceEndScenario,
} from "./staff-shift-force-end-test-fixture";

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

async function currentContext(
  s: ForceEndScenario,
): Promise<StaffSessionContext> {
  // Source session creation timestamp, not the fixture's approximate local clock.
  const row = await fixture.query<{ createdAt: Date }>(
    `SELECT created_at AS "createdAt" FROM staff_auth_sessions WHERE id=$1`,
    [s.auth.sessionId],
  );
  return { ...s.context, createdAt: row.rows[0]!.createdAt };
}

const readShift = (
  s: ForceEndScenario,
  context: StaffSessionContext,
  locationId = s.locationId,
) =>
  inPostgresTransaction(runtime, (tx) =>
    queryForcedShiftEndOccurrences(tx, {
      context,
      organizationId: s.organizationId,
      locationId,
      limit: 21,
    }),
  );

const readSecurity = (s: ForceEndScenario, context: StaffSessionContext) =>
  inPostgresTransaction(runtime, (tx) =>
    queryStaffSecurityOccurrences(tx, {
      context,
      organizationId: s.organizationId,
      limit: 21,
    }),
  );

describe("Issue 414 P3 source-backed administrative OCCURRENCES", () => {
  it("ALT13 reads only committed force end, hides reason and reuses identity on retry", async () => {
    const s = await fixture.scenario("ORG_ADMIN");
    const context = await currentContext(s);
    // One ACTIVE Shift per membership is enforced by a partial unique index.
    // First close the source Shift, then create an ordinary ended Shift on
    // that membership so both histories are genuinely representable.
    expect((await fixture.force(s)).status).toBe(201);
    const ordinaryShift = randomUUID();
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp()-INTERVAL '1 hour')`,
      [ordinaryShift, s.organizationId, s.locationId, s.membershipId],
    );
    await fixture.query(
      `UPDATE shifts SET status='ENDED',ended_at=clock_timestamp() WHERE id=$1`,
      [ordinaryShift],
    );
    const first = await readShift(s, context);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      category: "ALT-13",
      targetId: s.shiftId,
      locationId: s.locationId,
      severity: "IMPORTANT",
    });
    expect(JSON.stringify(first)).not.toContain(s.command.reason);
    expect(JSON.stringify(first)).not.toContain("PENDING");
    expect(await readShift(s, context, s.outsideId)).toEqual([]);
    expect((await fixture.force(s)).status).toBe(201);
    expect(await readShift(s, context)).toEqual(first);
    expect(
      await inPostgresTransaction(runtime, (tx) =>
        findForcedShiftEndOccurrence(tx, {
          context,
          organizationId: s.organizationId,
          locationId: s.locationId,
          eventId: first[0]!.eventId,
        }),
      ),
    ).toEqual(first[0]);
    await expect(
      runtime.query("SELECT shift_id FROM shift_force_end_closures LIMIT 1"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("ALT13 LM source grant revocation and role downgrade deny before reading event", async () => {
    const s = await fixture.scenario("LOCATION_MANAGER");
    const context = await currentContext(s);
    expect((await fixture.force(s)).status).toBe(201);
    expect(await readShift(s, context)).toHaveLength(1);
    await expect(readShift(s, context, s.outsideId)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [s.organizationId, s.actorMembershipId, s.locationId],
    );
    await expect(readShift(s, context)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
    await fixture.query(
      `UPDATE organization_memberships SET role='VALET_SUPERVISOR'
       WHERE id=$1 AND organization_id=$2`,
      [s.actorMembershipId, s.organizationId],
    );
    await expect(readShift(s, context)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
  });

  it("ALT15 reads only changed-role and revoked-grant audit; denied to LM", async () => {
    const s = await fixture.scenario("ORG_ADMIN");
    const context = await currentContext(s);
    const base = `/v1/staff/management/organizations/${s.organizationId}/staff/${s.membershipId}`;
    expect(
      (
        await fixture.managementPost(`${base}/role`, s.auth.accessToken, {
          expectedVersion: 1,
          role: "VALET_SUPERVISOR",
        })
      ).status,
    ).toBe(201);
    // Idempotent desired-state retry must not create another audit event.
    expect(
      (
        await fixture.managementPost(`${base}/role`, s.auth.accessToken, {
          expectedVersion: 1,
          role: "VALET_SUPERVISOR",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.managementPost(
          `${base}/location-access/revoke`,
          s.auth.accessToken,
          {
            expectedVersion: 2,
            locationIds: [s.outsideId],
          },
        )
      ).status,
    ).toBe(201);
    const events = await readSecurity(s, context);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.title).sort()).toEqual([
      "Staff location access revoked",
      "Staff role changed",
    ]);
    expect(
      events.every(
        (event) =>
          event.category === "ALT-15" &&
          event.targetId === s.membershipId &&
          event.locationId === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(
      /metadataJson|previousRole|locationCount|email|reason/i,
    );
    expect(
      await inPostgresTransaction(runtime, (tx) =>
        findStaffSecurityOccurrence(tx, {
          context,
          organizationId: s.organizationId,
          eventId: events[0]!.eventId,
        }),
      ),
    ).toEqual(events[0]);

    const lmUser = await fixture.createUser();
    const lmId = await fixture.addMembership(
      s.organizationId,
      lmUser.id,
      "LOCATION_MANAGER",
    );
    await fixture.grant(s.organizationId, lmId, s.locationId);
    const lmAuth = await fixture.nativeLogin(lmUser);
    await fixture.enrollAndAssure(lmAuth);
    const lmSession = await fixture.query<{ createdAt: Date }>(
      `SELECT created_at AS "createdAt" FROM staff_auth_sessions WHERE id=$1`,
      [lmAuth.sessionId],
    );
    // Real LM token: current MFA and exact grant still confer NO security alert.
    const lmContext: StaffSessionContext = {
      userId: lmUser.id,
      staffAuthSessionId: lmAuth.sessionId,
      accessTokenHash: `staff-access-sha256:v1:${createHash("sha256").update(lmAuth.accessToken).digest("hex")}`,
      createdAt: lmSession.rows[0]!.createdAt,
    };
    await expect(readSecurity(s, lmContext)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
    await fixture.query(
      `UPDATE organization_memberships SET role='LOCATION_MANAGER'
       WHERE id=$1 AND organization_id=$2`,
      [s.actorMembershipId, s.organizationId],
    );
    await expect(readSecurity(s, context)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
  });
});
