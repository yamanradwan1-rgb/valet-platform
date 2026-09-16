import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  staffVehicleDirectoryVisibilityCapability,
  staffVehicleDirectoryVisibilityCapabilityHeader,
  type StaffVehicleDirectoryLegacyResponse,
  type StaffVehicleDirectoryResponse,
} from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

const DIRECTORY = "/v1/staff/valet-sessions/directory";

describe("Staff Vehicle Directory Employee Visibility Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  function issueToken(userId: string): string {
    const token = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${token}`, userId);
    return token;
  }

  function directory<T = StaffVehicleDirectoryResponse>(
    token: string,
    locationId: string,
  ) {
    return harness.request<T>("GET", `${DIRECTORY}?locationId=${locationId}`, {
      headers: {
        [staffVehicleDirectoryVisibilityCapabilityHeader]:
          staffVehicleDirectoryVisibilityCapability,
      },
      token,
    });
  }

  it("derives employee rows from accepted state/task ownership semantics", async () => {
    const { fixture, token: ownerToken } = await harness.fixtureWithToken();
    const peer = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const peerToken = issueToken(peer.userId);
    const supervisor = await harness.addMember(
      fixture,
      "VALET_SUPERVISOR",
      true,
    );
    const supervisorToken = issueToken(supervisor.userId);
    const zoneId = await harness.createParkingZone(fixture, "ZONE-E");
    const slotId = await harness.createKeySlot(fixture, "K-Q");

    async function pinCreatedAt(sessionId: string, iso: string) {
      await harness.context.adminPool.query(
        `UPDATE valet_sessions SET created_at = $2 WHERE id = $1`,
        [sessionId, iso],
      );
    }

    const ownDraft = await harness.createSession(fixture, {
      state: "CHECKING_IN",
    });
    const peerDraft = await harness.createSession(fixture, {
      state: "CHECKING_IN",
    });
    await harness.context.adminPool.query(
      `UPDATE valet_sessions SET checked_in_by_membership_id = $2 WHERE id = $1`,
      [peerDraft.sessionId, peer.membershipId],
    );
    const queued = await harness.createSession(fixture, {
      keySlotId: slotId,
      state: "AWAITING_PARKING",
    });
    await harness.createTask(fixture, queued.sessionId, { status: "QUEUED" });
    const peerParking = await harness.createSession(fixture, {
      parkingStartedAt: new Date(),
      state: "PARKING",
    });
    await harness.createTask(fixture, peerParking.sessionId, {
      assigneeMembershipId: peer.membershipId,
      status: "IN_PROGRESS",
    });
    const peerParked = await harness.createSession(fixture, {
      parkedAt: new Date(),
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "PARKED",
    });
    await harness.createTask(fixture, peerParked.sessionId, {
      assigneeMembershipId: peer.membershipId,
      status: "COMPLETED",
    });
    // COMPLETED custody is never part of the active directory.
    const finished = await harness.createSession(fixture);
    await harness.context.adminPool.query(
      `UPDATE valet_sessions
       SET state = 'COMPLETED', completed_at = transaction_timestamp()
       WHERE id = $1`,
      [finished.sessionId],
    );
    // Deterministic newest-first presentation order.
    await pinCreatedAt(queued.sessionId, "2026-08-25T10:05:00Z");
    await pinCreatedAt(peerParking.sessionId, "2026-08-25T10:04:00Z");
    await pinCreatedAt(peerParked.sessionId, "2026-08-25T10:03:00Z");
    await pinCreatedAt(peerDraft.sessionId, "2026-08-25T10:02:00Z");
    await pinCreatedAt(ownDraft.sessionId, "2026-08-25T10:01:00Z");
    await pinCreatedAt(finished.sessionId, "2026-08-25T10:00:00Z");

    const ownerView = await directory(ownerToken, fixture.locationId);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.rows.map((r) => r.sessionId)).toEqual([
      queued.sessionId,
      ownDraft.sessionId,
    ]);

    const peerView = await directory(peerToken, fixture.locationId);
    expect(peerView.status).toBe(200);
    expect(peerView.body.rows.map((r) => r.sessionId)).toEqual([
      queued.sessionId,
      peerParking.sessionId,
      peerParked.sessionId,
      peerDraft.sessionId,
    ]);
    const peerParkedRow = peerView.body.rows.find(
      (row) => row.sessionId === peerParked.sessionId,
    );
    expect(peerParkedRow?.parkingSpotCode).toBeNull();
    expect(peerParkedRow?.parkingZoneCode).toBe("ZONE-E");

    const supervisorView = await directory(supervisorToken, fixture.locationId);
    expect(supervisorView.status).toBe(200);
    const supervisorIds = supervisorView.body.rows.map((r) => r.sessionId);
    expect(supervisorIds).not.toContain(finished.sessionId);
    expect(supervisorIds).toEqual(
      expect.arrayContaining([
        ownDraft.sessionId,
        peerDraft.sessionId,
        queued.sessionId,
        peerParking.sessionId,
        peerParked.sessionId,
      ]),
    );

    // QUEUED visibility alone never discloses Key Slot detail; only the
    // supervisor receives staff-only Key Slot codes in this Location.
    const queuedId = queued.sessionId;
    expect(
      supervisorView.body.rows.find((r) => r.sessionId === queuedId)
        ?.keySlotCode,
    ).toBe("K-Q");
    expect(
      supervisorView.body.rows.find((r) => r.sessionId === queuedId)
        ?.keySlotVisibility,
    ).toBe("VISIBLE");
    expect(
      ownerView.body.rows.find((r) => r.sessionId === queuedId)?.keySlotCode,
    ).toBeNull();
    expect(
      ownerView.body.rows.find((r) => r.sessionId === queuedId)
        ?.keySlotVisibility,
    ).toBe("RESTRICTED");
    expect(
      peerView.body.rows.find((r) => r.sessionId === queuedId)?.keySlotCode,
    ).toBeNull();
    expect(
      peerView.body.rows.find((r) => r.sessionId === queuedId)
        ?.keySlotVisibility,
    ).toBe("RESTRICTED");
    expect(JSON.stringify(ownerView.body)).not.toContain("K-Q");

    const genuinelyUnassigned = peerView.body.rows.find(
      (r) => r.sessionId === peerParking.sessionId,
    );
    expect(genuinelyUnassigned?.keySlotCode).toBeNull();
    expect(genuinelyUnassigned?.keySlotVisibility).toBe("UNASSIGNED");

    const legacyEmployeeView =
      await harness.request<StaffVehicleDirectoryLegacyResponse>(
        "GET",
        `${DIRECTORY}?locationId=${fixture.locationId}`,
        { token: ownerToken },
      );
    expect(legacyEmployeeView.status).toBe(200);
    expect(JSON.stringify(legacyEmployeeView.body)).not.toContain(
      "keySlotVisibility",
    );
    expect(JSON.stringify(legacyEmployeeView.body)).not.toContain("K-Q");
    expect(
      legacyEmployeeView.body.rows.find((r) => r.sessionId === queuedId)
        ?.keySlotCode,
    ).toBeNull();
  });

  it("caps a >100-candidate Location and reports truncation per role", async () => {
    const { fixture, token: supervisorToken } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const employee = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const employeeToken = issueToken(employee.userId);

    // Exactly 100 overflow candidates at deterministic, fixed past times;
    // each live row needs its own vehicle (active location+vehicle unique).
    for (let index = 0; index < 100; index += 1) {
      const bulkVehicle = await harness.createVehicle(fixture, {
        temporaryDescriptor: `Bulk vehicle ${index}`,
      });
      await harness.context.adminPool.query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            organization_id, location_id, vehicle_id, state,
            checked_in_by_membership_id, check_in_condition_completed_at,
            check_in_condition_completed_by_membership_id,
            key_slot_id, parking_spot_id, parking_zone_id,
            parking_started_at, parked_at, version, updated_at, created_at)
         VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
                 $3, $4, $5, 'AWAITING_PARKING', $6,
                 transaction_timestamp(), $6,
                 NULL, NULL, NULL, NULL, NULL, 1, transaction_timestamp(),
                 timestamp '2026-08-25 08:00:00' + ($7 * interval '1 minute'))`,
        [
          randomUUID(),
          `bulk-${index}`,
          fixture.organizationId,
          fixture.locationId,
          bulkVehicle,
          fixture.membershipId,
          index,
        ],
      );
    }
    // Two queue-visible sessions pinned newest so they survive the candidate
    // page trim deterministically.
    const visibleA = await harness.createSession(fixture, {
      state: "AWAITING_PARKING",
    });
    const visibleB = await harness.createSession(fixture, {
      state: "AWAITING_PARKING",
    });
    await harness.createTask(fixture, visibleA.sessionId, { status: "QUEUED" });
    await harness.createTask(fixture, visibleB.sessionId, { status: "QUEUED" });
    for (const [sessionId, iso] of [
      [visibleA.sessionId, "2026-08-25T11:00:00Z"],
      [visibleB.sessionId, "2026-08-25T10:59:00Z"],
    ] as const) {
      await harness.context.adminPool.query(
        `UPDATE valet_sessions SET created_at = $2 WHERE id = $1`,
        [sessionId, iso],
      );
    }

    const supervisorView = await directory(supervisorToken, fixture.locationId);
    expect(supervisorView.status).toBe(200);
    expect(supervisorView.body.truncated).toBe(true);
    expect(supervisorView.body.rows).toHaveLength(100);

    // Truncation describes the Location candidate page; the employee still
    // receives only their operationally related subset of that loaded page.
    const employeeView = await directory(employeeToken, fixture.locationId);
    expect(employeeView.status).toBe(200);
    expect(employeeView.body.truncated).toBe(true);
    expect(employeeView.body.rows.map((r) => r.sessionId)).toEqual([
      visibleA.sessionId,
      visibleB.sessionId,
    ]);
    expect(employeeView.body.rows.every((r) => r.keySlotCode === null)).toBe(
      true,
    );
  });
});
