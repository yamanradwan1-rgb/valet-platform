import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Issue #304 Key Slot label replay integrity", () => {
  it("replays identical labels and rejects changed labels with the same operationId", async () => {
    const user = await fixture.createUser();
    const admin = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(admin.organizationId);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const url = `/v1/staff/dashboard/locations/${location.locationId}/physical-resources/key-slots`;

    const operationId = randomUUID();
    const first = await fixture.managementPost(url, auth.accessToken, {
      operationId,
      code: "K-01",
      label: "  Front desk  ",
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ code: "K-01", label: "Front desk" });

    const retry = await fixture.managementPost(url, auth.accessToken, {
      operationId,
      code: "K-01",
      label: "Front desk",
    });
    expect(retry.status).toBe(201);
    expect(retry.body?.keySlotId).toBe(first.body?.keySlotId);

    const conflict = await fixture.managementPost(url, auth.accessToken, {
      operationId,
      code: "K-01",
      label: "Back desk",
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const legacyId = randomUUID();
    const legacy = await fixture.managementPost(url, auth.accessToken, {
      operationId: legacyId,
      code: "K-02",
    });
    expect(legacy.status).toBe(201);
    expect(legacy.body?.label).toBeNull();
    const legacyRetry = await fixture.managementPost(url, auth.accessToken, {
      operationId: legacyId,
      code: "K-02",
    });
    expect(legacyRetry.status).toBe(201);
    expect(legacyRetry.body?.keySlotId).toBe(legacy.body?.keySlotId);
    const legacyConflict = await fixture.managementPost(url, auth.accessToken, {
      operationId: legacyId,
      code: "K-02",
      label: "Added later",
    });
    expect(legacyConflict.status).toBe(409);
    expect(legacyConflict.body).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const count = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM key_slots
       WHERE organization_id = $1 AND location_id = $2`,
      [admin.organizationId, location.locationId],
    );
    expect(count.rows[0]?.count).toBe("2");
  });
});
