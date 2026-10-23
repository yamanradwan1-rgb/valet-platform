import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  actor, fixture, grantWriter, physicalPath, startLab,
} from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);

describe('Issue319 all seven Physical Resources GET routes', () => {
  it('allows current exact grant then denies every fresh path after canonical removal', async () => {
    const a = await actor();
    const zoneId = randomUUID();
    const spotId = randomUUID();
    await fixture.query(`INSERT INTO parking_zones
      (id,organization_id,location_id,code,label,status,updated_at)
      VALUES ($1,$2,$3,'ISSUE319-Z','Synthetic Zone','ACTIVE',clock_timestamp())`,
    [zoneId, a.organizationId, a.locationId]);
    await fixture.query(`INSERT INTO parking_spots
      (id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
      VALUES ($1,$2,$3,$4,'ISSUE319-P','Synthetic Spot','ACTIVE',clock_timestamp())`,
    [spotId, a.organizationId, a.locationId, zoneId]);
    const paths = [
      physicalPath(a, 'overview'),
      physicalPath(a, 'key-slots'),
      physicalPath(a, 'parking-spots'),
      physicalPath(a, 'parking-zones'),
      physicalPath(a, `key-slots/${a.keySlotId}/label`),
      physicalPath(a, `parking-spots/${spotId}/label`),
      physicalPath(a, `key-slots/${a.keySlotId}/custody`),
    ];
    for (const path of paths) {
      const allowed = await fixture.managementGet(path, a.auth.accessToken);
      expect(allowed.status, path).toBe(200);
    }
    await grantWriter(a);
    for (const path of paths) {
      const denied = await fixture.managementGet(path, a.auth.accessToken);
      expect(denied.status, path).toBe(404);
      expect(denied.body, path).not.toHaveProperty('items');
    }
  }, 25_000);
});
