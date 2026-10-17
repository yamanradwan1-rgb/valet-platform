import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

function path(organizationId: string, limit: number, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/v1/staff/management/organizations/${organizationId}/staff?${query}`;
}

describe("MGT-BE-04 Staff directory pagination", () => {
  it("traverses a stable bounded keyset without duplicate memberships", async () => {
    const actor = await assuredAdmin();
    for (let index = 0; index < 4; index += 1) {
      const user = await fixture.createUser();
      await fixture.addMembership(
        actor.membership.organizationId,
        user.id,
        index % 2 === 0 ? "VALET_EMPLOYEE" : "VALET_SUPERVISOR",
      );
    }
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await fixture.managementGet(
        path(actor.membership.organizationId, 2, cursor),
        actor.auth.accessToken,
      );
      expect(page.status).toBe(200);
      const items = (page.body?.items ?? []) as Array<{ membershipId: string }>;
      expect(items.length).toBeLessThanOrEqual(2);
      for (const item of items) {
        expect(seen.has(item.membershipId)).toBe(false);
        seen.add(item.membershipId);
      }
      cursor = typeof page.body?.nextCursor === "string" ? page.body.nextCursor : undefined;
    } while (cursor !== undefined);
    expect(seen.size).toBe(5);
  });

  it("binds cursors to the Organization and rejects an oversized page", async () => {
    const actor = await assuredAdmin();
    const user = await fixture.createUser();
    await fixture.addMembership(actor.membership.organizationId, user.id, "VALET_EMPLOYEE");
    const first = await fixture.managementGet(
      path(actor.membership.organizationId, 1),
      actor.auth.accessToken,
    );
    expect(first.status).toBe(200);
    const cursor = String(first.body?.nextCursor);
    const foreignOrganization = await fixture.createOrganization();
    const foreign = await fixture.managementGet(
      path(foreignOrganization, 1, cursor),
      actor.auth.accessToken,
    );
    // Cross-organization reads are masked as Not Found, not an input-error
    // response that could reveal existence or authorization scope.
    expect(foreign.status).toBe(404);
    const oversized = await fixture.managementGet(
      path(actor.membership.organizationId, 101),
      actor.auth.accessToken,
    );
    expect(oversized.status).toBe(400);
  });
});
