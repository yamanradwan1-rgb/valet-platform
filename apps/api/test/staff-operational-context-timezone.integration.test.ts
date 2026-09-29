import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createOperationalContextHarness,
  fetchContext,
  insertActiveShift,
  registerToken,
} from "./staff-operational-context-harness";

const harness = createOperationalContextHarness();

describe("Issue #231 operational Location timezone", () => {
  beforeAll(async () => harness.start(), 60_000);
  afterAll(async () => harness.close(), 60_000);
  beforeEach(() => harness.principals.clear());

  it("projects the authoritative timezone only for granted active Locations", async () => {
    const fixture = await harness.context.createFixture({
      role: "VALET_SUPERVISOR",
    });
    await harness.context.adminPool.query(
      `UPDATE locations SET timezone = 'Asia/Tokyo' WHERE id = $1`,
      [fixture.locationId],
    );
    const ungrantedId = randomUUID();
    await harness.context.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Ungranted timezone', $3, 'Addr', 'Pacific/Auckland',
               'NZD', 'ACTIVE', TRUE, NOW())`,
      [ungrantedId, fixture.organizationId, randomUUID()],
    );
    await insertActiveShift(harness, fixture);
    const token = registerToken(harness.principals, fixture.userId);
    const response = await fetchContext(harness.baseUrl(), token);
    expect(response.status).toBe(200);
    const context = (response.body.contexts as Array<Record<string, unknown>>)[0]!;
    expect(context.currentLocation).toMatchObject({
      locationId: fixture.locationId,
      timezone: "Asia/Tokyo",
    });
    expect(context.eligibleLocations).toEqual([
      expect.objectContaining({
        locationId: fixture.locationId,
        timezone: "Asia/Tokyo",
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain("Pacific/Auckland");
  });

  it("preserves fail-closed active Shift semantics after access loss", async () => {
    const fixture = await harness.context.createFixture({
      role: "VALET_SUPERVISOR",
    });
    await insertActiveShift(harness, fixture);
    await harness.context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE organization_id = $1 AND membership_id = $2 AND location_id = $3`,
      [fixture.organizationId, fixture.membershipId, fixture.locationId],
    );
    const token = registerToken(harness.principals, fixture.userId);
    const response = await fetchContext(harness.baseUrl(), token);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
