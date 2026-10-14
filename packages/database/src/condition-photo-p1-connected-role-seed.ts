import { randomUUID } from "node:crypto";

import type { Client } from "pg";

export interface ConnectedPhotoScope {
  userId: string;
  memberId: string;
  orgId: string;
  locationId: string;
  sessionId: string;
}

export async function seedConnectedPhotoScope(admin: Client): Promise<ConnectedPhotoScope> {
  const userId = randomUUID();
  const orgId = randomUUID();
  const locationId = randomUUID();
  const memberId = randomUUID();
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await admin.query(
    "INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'P1 restricted role proof','ACTIVE','Asia/Amman',clock_timestamp())",
    [orgId],
  );
  await admin.query(
    "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())",
    [userId, `${userId}@issue215.test.invalid`],
  );
  await admin.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [memberId, orgId, userId],
  );
  await admin.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
     VALUES($1,$2,'P1 role proof',$3,'Test','Asia/Amman','JOD','ACTIVE',clock_timestamp())`,
    [locationId, orgId, randomUUID()],
  );
  await admin.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [orgId, memberId, locationId],
  );
  await admin.query(
    "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Test',clock_timestamp())",
    [vehicleId, orgId],
  );
  await admin.query(
    `INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,
      organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'CHECKING_IN',$6,clock_timestamp())`,
    [sessionId, `issue215:${randomUUID()}`, orgId, locationId, vehicleId, memberId],
  );
  return { userId, memberId, orgId, locationId, sessionId };
}
