import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";
import { StaffVehicleDirectoryService } from "../src/modules/staff/staff-vehicle-directory.service";

describe("Incomplete Check-In bounded directory coverage", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  it("includes an old self-owned draft ahead of 101 unrelated newer candidates", async () => {
    const { fixture } = await harness.fixtureWithToken();
    const own = await harness.createSession(fixture);
    await harness.context.adminPool.query(
      "UPDATE valet_sessions SET created_at = '2026-01-01' WHERE id = $1",
      [own.sessionId],
    );
    const other = await harness.addMember(fixture);
    for (let index = 0; index < 101; index += 1) {
      const session = await harness.createSession({ ...fixture, ...other });
      expect(session.sessionId).not.toBe(own.sessionId);
    }
    const page = await new StaffVehicleDirectoryService(
      harness.context.runtimePool,
    ).getVehicleDirectory(fixture.userId, fixture.locationId);
    expect(page.rows.map((row) => row.sessionId)).toContain(own.sessionId);
    expect(page.rows.length).toBeLessThanOrEqual(100);
    expect(page.truncated).toBe(true);
  });
  it("signals overflow explicitly when more than 100 drafts belong to the current actor", async () => {
    const { fixture } = await harness.fixtureWithToken();
    for (let index = 0; index < 101; index += 1)
      await harness.createSession(fixture);
    const page = await new StaffVehicleDirectoryService(
      harness.context.runtimePool,
    ).getVehicleDirectory(fixture.userId, fixture.locationId, true);
    expect(page.rows).toHaveLength(100);
    expect(page.truncated).toBe(true);
    expect(
      page.rows.every(
        (row) => "canContinueCheckIn" in row && row.canContinueCheckIn === true,
      ),
    ).toBe(true);
    const times = page.rows.map((row) => row.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });
});
