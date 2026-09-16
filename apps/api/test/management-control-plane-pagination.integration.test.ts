import { Buffer } from "node:buffer";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function organizationsPath(limit: number, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/v1/staff/management/organizations?${query.toString()}`;
}

function locationsPath(
  organizationId: string,
  limit: number,
  cursor?: string,
): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/v1/staff/management/organizations/${organizationId}/locations?${query.toString()}`;
}

async function assuredUser() {
  const user = await fixture.createUser();
  const auth = await fixture.nativeLogin(user);
  return { auth, user };
}

describe("MGT-BE-03 selector pagination", () => {
  it("keeps Organization keyset order stable across an insertion", async () => {
    const user = await fixture.createUser();
    const first = await fixture.createMembership(user.id, {
      name: "A Company",
    });
    const last = await fixture.createMembership(user.id, { name: "C Company" });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const pageOne = await fixture.managementGet(
      organizationsPath(1),
      auth.accessToken,
    );
    expect(pageOne.status).toBe(200);
    expect(pageOne.body?.items).toEqual([
      expect.objectContaining({ organizationId: first.organizationId }),
    ]);
    const cursorOne = String(pageOne.body?.nextCursor);

    const inserted = await fixture.createMembership(user.id, {
      name: "B Company",
    });
    const pageTwo = await fixture.managementGet(
      organizationsPath(1, cursorOne),
      auth.accessToken,
    );
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body?.items).toEqual([
      expect.objectContaining({ organizationId: inserted.organizationId }),
    ]);
    const cursorTwo = String(pageTwo.body?.nextCursor);

    const pageThree = await fixture.managementGet(
      organizationsPath(1, cursorTwo),
      auth.accessToken,
    );
    expect(pageThree.body?.items).toEqual([
      expect.objectContaining({ organizationId: last.organizationId }),
    ]);
  });

  it("uses id as the stable Organization tiebreaker", async () => {
    const user = await fixture.createUser();
    const a = await fixture.createMembership(user.id, { name: "Same Name" });
    const b = await fixture.createMembership(user.id, { name: "Same Name" });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const result = await fixture.managementGet(
      organizationsPath(10),
      auth.accessToken,
    );
    expect(result.status).toBe(200);
    const ids = (result.body?.items as Array<{ organizationId: string }>).map(
      (entry) => entry.organizationId,
    );
    expect(ids).toEqual([a.organizationId, b.organizationId].sort());
  });

  it("rejects a structurally forged Organization cursor", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id, {
      name: "Cursor org",
    });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        k: "locations",
        o: null,
        s: "Cursor org",
        i: membership.organizationId,
      }),
    ).toString("base64url");
    const result = await fixture.managementGet(
      organizationsPath(10, forged),
      auth.accessToken,
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: "REQUEST_INVALID" });
  });

  it("keeps Location keyset pages tenant-bound across insertion", async () => {
    const user = await fixture.createUser();
    const org = await fixture.createMembership(user.id, {
      name: "Location paging",
    });
    const other = await fixture.createMembership(user.id, {
      name: "Other company",
    });
    const first = await fixture.addLocation(org.organizationId, {
      name: "A Location",
    });
    const last = await fixture.addLocation(org.organizationId, {
      name: "C Location",
    });
    await fixture.addLocation(other.organizationId, { name: "B Foreign" });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const pageOne = await fixture.managementGet(
      locationsPath(org.organizationId, 1),
      auth.accessToken,
    );
    expect(pageOne.body?.items).toEqual([
      expect.objectContaining({ locationId: first.locationId }),
    ]);
    const cursorOne = String(pageOne.body?.nextCursor);
    const inserted = await fixture.addLocation(org.organizationId, {
      name: "B Location",
    });

    const pageTwo = await fixture.managementGet(
      locationsPath(org.organizationId, 1, cursorOne),
      auth.accessToken,
    );
    expect(pageTwo.body?.items).toEqual([
      expect.objectContaining({ locationId: inserted.locationId }),
    ]);
    const pageThree = await fixture.managementGet(
      locationsPath(org.organizationId, 1, String(pageTwo.body?.nextCursor)),
      auth.accessToken,
    );
    expect(pageThree.body?.items).toEqual([
      expect.objectContaining({ locationId: last.locationId }),
    ]);
  });

  it("rejects invalid HTTP list limits", async () => {
    const state = await assuredUser();
    await fixture.createMembership(state.user.id, { name: "Limits" });
    for (const limit of [0, 101]) {
      const result = await fixture.managementGet(
        organizationsPath(limit),
        state.auth.accessToken,
      );
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ code: "REQUEST_INVALID" });
    }
  });
});
