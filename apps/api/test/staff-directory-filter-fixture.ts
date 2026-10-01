import { randomUUID } from "node:crypto";
import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

export async function seedStaffDirectoryFilters(
  fixture: ManagementControlPlaneTestFixture,
) {
  const actor = await fixture.createUser();
  const actorUserId = actor.id;
  const membership = await fixture.createMembership(actor.id);
  const actorMembershipId = membership.membershipId;
  const organizationId = membership.organizationId;
  const auth = await fixture.nativeLogin(actor);
  await fixture.enrollAndAssure(auth);
  const token = auth.accessToken;
  const locationId = (await fixture.addLocation(organizationId)).locationId;
  const otherLocationId = (await fixture.addLocation(organizationId))
    .locationId;
  const foreignOrganizationId = await fixture.createOrganization();
  const foreignLocationId = (await fixture.addLocation(foreignOrganizationId))
    .locationId;
  await fixture.query(
    `WITH accounts AS (
    INSERT INTO users(id,email,password_hash,updated_at)
    SELECT gen_random_uuid(), 'filler-' || n || '-' || $1 || '@example.com', 'fixture', now()
    FROM generate_series(1,60) n RETURNING id
  ) INSERT INTO organization_memberships(id,organization_id,user_id,role,status,created_at,updated_at)
    SELECT gen_random_uuid(),$1::uuid,id,'VALET_EMPLOYEE','ACTIVE','2020-01-01',now() FROM accounts`,
    [organizationId],
  );
  const targetUserId = randomUUID();
  const targetId = randomUUID();
  await fixture.query(
    `INSERT INTO users(id,email,password_hash,updated_at)
    VALUES($1,'needle_email@example.com','fixture',now())`,
    [targetUserId],
  );
  await fixture.query(
    `INSERT INTO organization_memberships
    (id,organization_id,user_id,role,status,first_name,last_name,created_at,updated_at)
    VALUES($1,$2,$3,'VALET_SUPERVISOR','INACTIVE','مُحَمَّد Needle','O’Connor_%','2030-01-01',now()),
          ($4,$5,$3,'VALET_EMPLOYEE','ACTIVE','Other tenant','Hidden','2030-01-01',now())`,
    [
      targetId,
      organizationId,
      targetUserId,
      randomUUID(),
      foreignOrganizationId,
    ],
  );
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
    VALUES($1,$2,$3)`,
    [organizationId, targetId, locationId],
  );

  return {
    token,
    organizationId,
    actorUserId,
    actorMembershipId,
    targetId,
    locationId,
    otherLocationId,
    foreignLocationId,
    foreignOrganizationId,
  };
}
