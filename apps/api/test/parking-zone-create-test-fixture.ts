import { randomUUID } from "node:crypto";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import type { ManagementTestRole } from "./management-control-plane-test-fixture";

export class ParkingZoneCreateTestFixture extends ManagementAuditTestFixture {
  async actor(role: ManagementTestRole = "ORG_ADMIN", assure = true) {
    const user = await this.createUser();
    const membership = await this.createMembership(user.id, { role });
    const location = await this.addLocation(membership.organizationId);
    await this.grantLocationAccess(
      membership.organizationId,
      membership.membershipId,
      location.locationId,
    );
    const auth = await this.nativeLogin(user);
    if (role === "ORG_ADMIN" && assure) await this.enrollAndAssure(auth);
    return {
      ...membership,
      ...auth,
      userId: user.id,
      locationId: location.locationId,
    };
  }
  createZone(
    actor: { locationId: string; accessToken: string },
    body: unknown = { operationId: randomUUID(), code: "ZA", label: "Zone A" },
  ) {
    return this.managementPost(
      zonePath(actor.locationId),
      actor.accessToken,
      body,
    );
  }
}
export const zonePath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources/parking-zones`;
