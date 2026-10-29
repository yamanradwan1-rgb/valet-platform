import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStaffValetSessionHarness } from "./staff-valet-session-harness";

/**
 * Real Nest HTTP + PostgreSQL proof separate from the mocked Employee Web
 * browser transition. Staff token/user stay identical; only the persisted
 * authoritative Shift moves from Location A to Location B.
 */
describe("#358 stale Location A session denial after same-user Shift move", () => {
  const harness = createStaffValetSessionHarness();

  beforeAll(async () => harness.start(), 120_000);
  afterAll(async () => harness.close(), 60_000);

  it("allows A before the move, denies stale A after B starts, and allows valid B", async () => {
    const { fixture: a, token } = await harness.fixtureWithToken();
    const { sessionId: sessionA } = await harness.createSession(a, {
      state: "CHECKING_IN",
    });
    const pathA = `/v1/staff/valet-sessions/${sessionA}`;
    const before = await harness.request("GET", pathA, { token });
    expect(before.status).toBe(200);

    const locationB = await harness.context.addLocation(a);
    await harness.context.adminPool.query(
      `UPDATE shifts SET status='ENDED', ended_at=transaction_timestamp()
       WHERE membership_id=$1 AND location_id=$2 AND status='ACTIVE'`,
      [a.membershipId, a.locationId],
    );
    await harness.context.adminPool.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1,$2,$3,$4,'ACTIVE',transaction_timestamp())`,
      [randomUUID(), a.organizationId, locationB, a.membershipId],
    );

    const staleA = await harness.request("GET", pathA, { token });
    expect(staleA.status).toBe(404);
    expect(staleA.body).toMatchObject({ code: "LOCATION_ACCESS_DENIED" });

    const b = { ...a, locationId: locationB };
    const { sessionId: sessionB } = await harness.createSession(b, {
      state: "CHECKING_IN",
    });
    const validB = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionB}`,
      { token },
    );
    expect(validB.status).toBe(200);
  });
});
