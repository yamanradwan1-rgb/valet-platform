import { randomUUID } from "node:crypto";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

export function incidentResolutionFixture() {
  const fixture = new ManagementAuditTestFixture();
  async function actor(role = "ORG_ADMIN", assured = true) {
    const user = await fixture.createUser();
    const member = await fixture.createMembership(user.id);
    await fixture.query(
      `UPDATE organization_memberships SET role=$2,first_name='Synthetic',last_name='Resolver' WHERE id=$1`,
      [member.membershipId, role],
    );
    const location = await fixture.addLocation(member.organizationId);
    await fixture.grantLocationAccess(
      member.organizationId,
      member.membershipId,
      location.locationId,
    );
    const auth = await fixture.nativeLogin(user);
    if (role === "ORG_ADMIN" && assured) await fixture.enrollAndAssure(auth);
    return { user, member, location, auth };
  }
  async function seed(
    owner: Awaited<ReturnType<typeof actor>>,
    status = "OPEN",
  ) {
    const [incident, session, vehicle] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const { organizationId, membershipId } = owner.member;
    const location = owner.location.locationId;
    await fixture.query(
      `INSERT INTO vehicles(id,organization_id,plate_country,plate_number_raw,plate_number_normalized,updated_at)
    VALUES($1,$2,'JO',$3,$3,clock_timestamp())`,
      [vehicle, organizationId, vehicle.slice(0, 8)],
    );
    await fixture.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,state,
    checked_in_by_membership_id,customer_access_token_hash,customer_access_expires_at,updated_at)
    VALUES($1,$2,$3,$4,'PARKED',$5,$6,clock_timestamp()+interval '1 day',clock_timestamp())`,
      [session, organizationId, location, vehicle, membershipId, randomUUID()],
    );
    await fixture.query(
      `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,status,severity,type,
    description,reported_by_membership_id) VALUES($1,$2,$3,$4,$5,'CRITICAL','KEY_MISSING','Synthetic incident',$6)`,
      [incident, organizationId, location, session, status, membershipId],
    );
    return {
      incident,
      session,
      base: `/v1/staff/dashboard/locations/${location}/overview/incidents`,
    };
  }
  const command = (expectedStatus = "OPEN") => ({
    operationId: randomUUID(),
    expectedStatus,
    resolutionNotes: "  Synthetic issue addressed  ",
  });

  return { fixture, actor, seed, command };
}
