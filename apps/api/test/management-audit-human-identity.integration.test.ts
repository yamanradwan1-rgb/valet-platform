import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { queryManagementAuditPage } from "../src/modules/management/management-audit-query";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Issue #277 authorized human identity PostgreSQL integration", () => {
  it("joins one bounded audit page without cross-location vehicle or unknown-event leakage", async () => {
    const user = await fixture.createUser();
    const admin = await fixture.createMembership(user.id);
    const firstLocation = await fixture.addLocation(admin.organizationId);
    const otherLocation = await fixture.addLocation(admin.organizationId);
    const actorUser = await fixture.createUser();
    const actorId = await fixture.addMembership(
      admin.organizationId, actorUser.id, "VALET_EMPLOYEE",
    );
    await fixture.query(
      "UPDATE organization_memberships SET first_name='Test', last_name='Employee' WHERE id=$1",
      [actorId],
    );
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    await fixture.query(
      `INSERT INTO vehicles
         (id, organization_id, plate_country, plate_number_raw,
          plate_number_normalized, make, model, updated_at)
       VALUES ($1, $2, 'JO', '19-52000', '1952000', 'BMW', 'X5',
               transaction_timestamp())`,
      [vehicleId, admin.organizationId],
    );
    await fixture.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, completed_at, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 day',
               $3, $4, $5, 'COMPLETED', $6, transaction_timestamp(),
               transaction_timestamp())`,
      [sessionId, randomUUID(), admin.organizationId, firstLocation.locationId,
        vehicleId, actorId],
    );
    const eventId = await fixture.insertAuditEvent({
      actorMembershipId: actorId,
      entityId: sessionId,
      entityType: "ValetSession",
      eventType: "VALET_SESSION_COMPLETED",
      locationId: firstLocation.locationId,
      organizationId: admin.organizationId,
    });
    const wrongLocation = await fixture.insertAuditEvent({
      actorMembershipId: actorId,
      entityId: sessionId,
      entityType: "ValetSession",
      eventType: "VALET_SESSION_COMPLETED",
      locationId: otherLocation.locationId,
      organizationId: admin.organizationId,
    });
    const unknownId = await fixture.insertAuditEvent({
      actorMembershipId: actorId,
      entityId: sessionId,
      entityType: "ValetSession",
      eventType: "FUTURE_PRIVATE_EVENT",
      locationId: firstLocation.locationId,
      organizationId: admin.organizationId,
    });

    const snap = await fixture.query<{ snapshot: string }>(
      "SELECT pg_current_snapshot()::text AS snapshot",
    );
    let auditQueries = 0;
    const transaction = {
      query: <T extends object>(sql: string, parameters: readonly unknown[]) => {
        auditQueries++;
        return fixture.query<T>(sql, [...parameters]);
      },
    } as unknown as PostgresTransaction;
    const rows = await queryManagementAuditPage(transaction, {
      cursor: null,
      eventType: null,
      exactLocationId: null,
      limit: 20,
      organizationId: admin.organizationId,
      organizationLocationFilter: null,
      snapshot: snap.rows[0]!.snapshot,
      snapshotCreatedAt: new Date(),
      supervisorEventTypes: null,
    });
    expect(auditQueries).toBe(1);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    expect(rows.find((row) => row.id === eventId)).toMatchObject({
      actorCurrentDisplayName: "Test Employee",
      vehicleConfirmedPlate: "19-52000",
      vehicleMake: "BMW",
      vehicleModel: "X5",
    });
    expect(rows.find((row) => row.id === wrongLocation)).toMatchObject({
      actorCurrentDisplayName: "Test Employee",
      vehicleConfirmedPlate: null,
      vehicleMake: null,
      vehicleModel: null,
    });
    expect(rows.find((row) => row.id === unknownId)).toMatchObject({
      actorCurrentDisplayName: null,
      vehicleConfirmedPlate: null,
      vehicleMake: null,
      vehicleModel: null,
    });

    const login = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(login);
    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${admin.organizationId}/audit-events?limit=20`,
      login.accessToken,
    );
    expect(response.status).toBe(200);
    const items = response.body?.items as Array<Record<string, unknown>>;
    const item = items.find((candidate) => candidate.eventId === eventId);
    expect(item).toMatchObject({
      actor: { membershipId: actorId, currentDisplayName: "Test Employee" },
      vehicle: { confirmedPlate: "19-52000", make: "BMW", model: "X5" },
    });
    expect(items.find((candidate) => candidate.eventId === wrongLocation))
      .not.toHaveProperty("vehicle");
    const redacted = items.find((candidate) => candidate.eventId === unknownId);
    expect(redacted).toMatchObject({ eventType: "UNKNOWN" });
    expect(redacted).not.toHaveProperty("actor");
    expect(redacted).not.toHaveProperty("vehicle");

    // Representative full page: query cost and cardinality remain bounded
    // while authorized identity references repeat across many audit rows.
    await fixture.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, actor_membership_id,
          actor_type, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       SELECT gen_random_uuid(), $1, $2, $3, 'MEMBERSHIP',
              'VALET_SESSION_CREATED', 'ValetSession', $4,
              '{}'::jsonb, '2025-01-01T12:00:00Z'::timestamptz
       FROM generate_series(1, 60)`,
      [admin.organizationId, firstLocation.locationId, actorId, sessionId],
    );
    const fresh = await fixture.query<{ snapshot: string }>(
      "SELECT pg_current_snapshot()::text AS snapshot",
    );
    auditQueries = 0;
    const queryStartedAt = performance.now();
    const fullPage = await queryManagementAuditPage(transaction, {
      cursor: null,
      eventType: null,
      exactLocationId: null,
      limit: 50,
      organizationId: admin.organizationId,
      organizationLocationFilter: null,
      snapshot: fresh.rows[0]!.snapshot,
      snapshotCreatedAt: new Date(),
      supervisorEventTypes: null,
    });
    const queryElapsedMs = performance.now() - queryStartedAt;
    expect(auditQueries).toBe(1);
    expect(fullPage).toHaveLength(51); // limit + next-page sentinel
    expect(new Set(fullPage.map((event) => event.id)).size).toBe(51);
    console.info(
      `[issue277-pg] pageLimit=50 rows=${fullPage.length} queries=${auditQueries} queryLatencyMs=${queryElapsedMs.toFixed(2)}`,
    );
  });
});
