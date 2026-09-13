import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect } from "vitest";

export interface IncidentRecoveryRuntimeFixture {
  readonly incidentId: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
}

export async function seedIncidentRecoveryRuntimeFixture(
  admin: Pool,
): Promise<IncidentRecoveryRuntimeFixture> {
  const fixture = {
    incidentId: "018f1234-5678-8abc-9234-56789abcdef0",
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    sessionId: randomUUID(),
  };
  const userId = randomUUID();
  const vehicleId = randomUUID();
  await admin.query(
    `INSERT INTO organizations (id,name,timezone,updated_at)
     VALUES ($1,'Recovery DB','UTC',clock_timestamp())`,
    [fixture.organizationId],
  );
  await admin.query(
    `INSERT INTO locations
       (id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES ($1,$2,'Recovery','RECOVERY','Address','UTC','USD',clock_timestamp())`,
    [fixture.locationId, fixture.organizationId],
  );
  await admin.query(
    `INSERT INTO users (id,email,password_hash,status,updated_at)
     VALUES ($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@recovery.test`],
  );
  await admin.query(
    `INSERT INTO organization_memberships
       (id,organization_id,user_id,role,status,updated_at)
     VALUES ($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [fixture.membershipId, fixture.organizationId, userId],
  );
  await admin.query(
    `INSERT INTO vehicles
       (id,organization_id,temporary_descriptor,updated_at)
     VALUES ($1,$2,'Recovery vehicle',clock_timestamp())`,
    [vehicleId, fixture.organizationId],
  );
  await admin.query(
    `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,
        checked_in_by_membership_id,updated_at)
     VALUES ($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,
             'CHECKING_IN',$6,clock_timestamp())`,
    [
      fixture.sessionId,
      randomUUID(),
      fixture.organizationId,
      fixture.locationId,
      vehicleId,
      fixture.membershipId,
    ],
  );
  return fixture;
}

export async function expectIncidentRecoveryGuardRejectsPrivilegedWrites(
  admin: Pool,
  fixture: IncidentRecoveryRuntimeFixture,
): Promise<void> {
  const guardedIncidentId = "018f1234-5678-8abc-9234-56789abcdef5";
  const values = [
    "018f1234-5678-8abc-9234-56789abcdef4",
    fixture.organizationId,
    fixture.locationId,
    fixture.sessionId,
    fixture.membershipId,
  ];
  await expect(
    admin.query(
      `INSERT INTO incident_recovery_intents
         (incident_id,organization_id,location_id,valet_session_id,
          reporting_membership_id,state,created_at,expires_at,retired_at)
       VALUES ($1,$2,$3,$4,$5,'RETIRED',clock_timestamp(),
               clock_timestamp(),clock_timestamp())`,
      values,
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await admin.query(
    `INSERT INTO incident_recovery_intents
       (incident_id,organization_id,location_id,valet_session_id,
        reporting_membership_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      guardedIncidentId,
      fixture.organizationId,
      fixture.locationId,
      fixture.sessionId,
      fixture.membershipId,
    ],
  );
  const guardedChanges = [
    ["incident_id", "018f1234-5678-8abc-9234-56789abcdef6"],
    ["organization_id", randomUUID()],
    ["location_id", randomUUID()],
    ["valet_session_id", randomUUID()],
    ["reporting_membership_id", randomUUID()],
    ["created_at", new Date("2026-09-12T12:00:00.000Z")],
    ["expires_at", new Date("2026-09-12T12:15:00.000Z")],
    ["retired_at", new Date("2026-09-12T12:01:00.000Z")],
  ] as const;
  for (const [column, value] of guardedChanges) {
    await expect(
      admin.query(
        `UPDATE incident_recovery_intents
         SET state='RETIRED', ${column}=$3
         WHERE organization_id=$1 AND incident_id=$2`,
        [fixture.organizationId, guardedIncidentId, value],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  }
  await expect(
    admin.query(
      `UPDATE incident_recovery_intents
       SET state='RETIRED', expires_at=expires_at+interval '1 minute'
       WHERE organization_id=$1 AND incident_id=$2`,
      [fixture.organizationId, "018f1234-5678-8abc-9234-56789abcdef3"],
    ),
  ).rejects.toMatchObject({ code: "23514" });
}
