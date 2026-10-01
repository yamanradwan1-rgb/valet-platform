import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { rankEligibleTaskAssignees } from "../src/modules/dispatch/assignment-ranking";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  StaffOnboardingTestFixture,
  hidden,
  issued,
  staffPath,
} from "./staff-onboarding-test-fixture";
const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
describe("T05-C pending quarantine", () => {
  it("pending is manager-readable but remains quarantined by all normal mutations", async () => {
    const actor = await fixture.actor();
    const command = fixture.command(actor.locationId);
    const fresh = issued(await fixture.create(actor, command));
    const base = staffPath(actor.organizationId, fresh.membershipId);
    const directory = await fixture.managementGet(
      `${staffPath(actor.organizationId)}?status=PENDING&limit=1`,
      actor.auth.accessToken,
    );
    expect(directory.status).toBe(200);
    expect(JSON.stringify(directory.body).includes(fresh.membershipId)).toBe(
      true,
    );
    expect(
      (await fixture.managementGet(base, actor.auth.accessToken)).status,
    ).toBe(200);
    for (const [suffix, body] of [
      ["/activate", { expectedVersion: 1 }],
      ["/deactivate", { expectedVersion: 1 }],
      ["/role", { expectedVersion: 1, role: "VALET_SUPERVISOR" }],
      [
        "/location-access/grant",
        { expectedVersion: 1, locationIds: [actor.locationId] },
      ],
      [
        "/location-access/revoke",
        { expectedVersion: 1, locationIds: [actor.locationId] },
      ],
    ] as const)
      hidden(
        await fixture.managementPost(
          base + suffix,
          actor.auth.accessToken,
          body,
        ),
      );
    const state = await fixture.query<{ status: string; version: number }>(
      "SELECT status,version FROM organization_memberships WHERE id=$1",
      [fresh.membershipId],
    );
    expect(state.rows[0]?.status).toBe("PENDING");
    expect(state.rows[0]?.version).toBe(1);
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: command.email, password: "candidate" },
    });
    expect(login.status).toBe(401);
    expect(login.body?.code).toBe("STAFF_AUTHENTICATION_FAILED");
    const sessions = await fixture.query(
      "SELECT 1 FROM staff_auth_sessions session JOIN users account ON account.id=session.user_id WHERE account.email=$1",
      [command.email],
    );
    expect(sessions.rowCount).toBe(0);
  });
  it("an ACTIVE User with only pending membership gains no management authority", async () => {
    const admin = await fixture.actor();
    const existing = await fixture.createUser();
    const pending = issued(
      await fixture.create(
        admin,
        fixture.command(admin.locationId, { email: existing.email }),
      ),
    );
    const auth = await fixture.nativeLogin(existing);
    hidden(
      await fixture.managementGet(
        staffPath(admin.organizationId),
        auth.accessToken,
      ),
    );
    hidden(
      await fixture.managementPost(
        staffPath(admin.organizationId),
        auth.accessToken,
        fixture.command(admin.locationId),
      ),
    );

    const pool = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
    try {
      await expect(
        createStartShiftCommandExecutor(pool)({
          authenticatedUserId: existing.id,
          targetLocationId: admin.locationId,
        }),
      ).rejects.toMatchObject({ code: "TENANT_ACCESS_DENIED" });
      expect(
        (
          await fixture.query("SELECT 1 FROM shifts WHERE membership_id=$1", [
            pending.membershipId,
          ])
        ).rowCount,
      ).toBe(0);

      // Even a malformed pre-existing Shift must not make PENDING assignable.
      await fixture.query(
        `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
         VALUES(gen_random_uuid(),$1,$2,$3,'ACTIVE',clock_timestamp())`,
        [admin.organizationId, admin.locationId, pending.membershipId],
      );
      const transaction = await pool.connect();
      try {
        await transaction.query("BEGIN");
        expect(
          await rankEligibleTaskAssignees(transaction, {
            organizationId: admin.organizationId,
            locationId: admin.locationId,
          }),
        ).toEqual([]);
      } finally {
        await transaction.query("ROLLBACK");
        transaction.release();
      }
    } finally {
      await pool.end();
    }
  });
});
