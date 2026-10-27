import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createStaffOperationalContextQuery } from "../src/modules/staff/staff-operational-context-query";
import {
  createOperationalContextHarness,
  insertActiveShift,
} from "./staff-operational-context-harness";

const harness = createOperationalContextHarness();
describe("operational context batches membership scopes", () => {
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);

  it("uses five queries for three independent organizations and excludes other users", async () => {
    const first = await harness.context.createFixture();
    const second = await harness.context.createFixture(
      { role: "VALET_SUPERVISOR" },
      first.userId,
    );
    const third = await harness.context.createFixture({}, first.userId);
    const outsider = await harness.context.createFixture();
    for (const fixture of [first, second, third, outsider])
      await insertActiveShift(harness, fixture);
    const spy = vi.spyOn(harness.context.runtimePool, "query");
    try {
      const result = await createStaffOperationalContextQuery(
        harness.context.runtimePool,
      )(first.userId);
      // Count source-level pool acquisitions, excluding the existing lease setup/reset SQL.
      expect(spy).toHaveBeenCalledTimes(5);
      expect(result.contexts).toHaveLength(3);
      for (const fixture of [first, second, third]) {
        const context = result.contexts.find(
          (item) => item.membershipId === fixture.membershipId,
        )!;
        expect(context.organization.organizationId).toBe(
          fixture.organizationId,
        );
        expect(
          context.eligibleLocations.map((item) => item.locationId),
        ).toEqual([fixture.locationId]);
        expect(context.activeShift?.locationId).toBe(fixture.locationId);
      }
      expect(JSON.stringify(result)).not.toContain(outsider.locationId);
    } finally {
      spy.mockRestore();
    }
    await harness.context.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id = $1",
      [second.membershipId],
    );
    await expect(
      createStaffOperationalContextQuery(harness.context.runtimePool)(
        first.userId,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
