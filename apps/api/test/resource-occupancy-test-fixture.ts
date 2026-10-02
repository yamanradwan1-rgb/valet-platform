import { randomUUID } from "node:crypto";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

export const resourcePaths = (locationId: string) => ({
  keys: `/v1/staff/dashboard/locations/${locationId}/overview/keys`,
  spots: `/v1/staff/dashboard/locations/${locationId}/physical-resources/parking-spots`,
});

export class ResourceOccupancyTestFixture extends ManagementVisitContactTestFixture {
  private checkerId: string | undefined;
  private readonly checkers = new Map<string, string>();

  async admin() {
    const user = await this.createUser();
    const membership = await this.createMembership(user.id);
    const auth = await this.nativeLogin(user);
    await this.enrollAndAssure(auth);
    return { user, ...membership, auth };
  }

  async seedResources(
    organizationId: string,
    locationId: string,
    marker = "12345",
  ) {
    this.checkerId ??= (await this.createUser()).id;
    let membershipId = this.checkers.get(organizationId);
    if (membershipId === undefined) {
      membershipId = await this.addMembership(
        organizationId,
        this.checkerId,
        "VALET_EMPLOYEE",
      );
      this.checkers.set(organizationId, membershipId);
    }
    const zoneId = randomUUID();
    await this.query(
      `INSERT INTO parking_zones(id,organization_id,location_id,code,label,updated_at)
       VALUES($1,$2,$3,'ZA','Zone A',clock_timestamp())`,
      [zoneId, organizationId, locationId],
    );
    const entries = [];
    for (const [index, descriptor] of [null, null, "سيارة زرقاء"].entries()) {
      const keySlotId = randomUUID();
      const spotId = randomUUID();
      await this.query(
        `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
         VALUES($1,$2,$3,$4,clock_timestamp())`,
        [keySlotId, organizationId, locationId, `K-${index}`],
      );
      await this.query(
        `INSERT INTO parking_spots(id,organization_id,location_id,parking_zone_id,code,label,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())`,
        [
          spotId,
          organizationId,
          locationId,
          zoneId,
          `P-${index}`,
          `Front ${index}`,
        ],
      );
      let sessionId: string | null = null;
      if (index > 0) {
        const vehicleId = await this.createVehicle(
          organizationId,
          descriptor === null
            ? { plateNumber: marker }
            : { temporaryDescriptor: descriptor },
        );
        sessionId = await this.createVisit({
          organizationId,
          locationId,
          membershipId,
          vehicleId,
          state: "PARKED",
        });
        await this.query(
          `UPDATE valet_sessions SET key_slot_id=$2,parking_spot_id=$3,parking_zone_id=$4,
             parked_at=clock_timestamp() WHERE id=$1`,
          [sessionId, keySlotId, spotId, zoneId],
        );
      }
      entries.push({ keySlotId, spotId, sessionId });
    }
    return { entries, zoneId };
  }
}
