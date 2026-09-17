import { Buffer } from "node:buffer";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function organizationPath(
  organizationId: string,
  query: Record<string, string> = {},
): string {
  const suffix = new URLSearchParams(query).toString();
  return `/v1/staff/management/organizations/${organizationId}/audit-events${
    suffix === "" ? "" : `?${suffix}`
  }`;
}

function locationPath(
  organizationId: string,
  locationId: string,
  query: Record<string, string> = {},
): string {
  const suffix = new URLSearchParams(query).toString();
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/audit-events${
    suffix === "" ? "" : `?${suffix}`
  }`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

async function insertKnown(
  organizationId: string,
  locationId: string,
  occurredAt: Date,
  eventType = "VALET_SESSION_CREATED",
) {
  return fixture.insertAuditEvent({
    eventType,
    locationId,
    metadata: {},
    occurredAt,
    organizationId,
  });
}

function eventIds(body: unknown): string[] {
  const items = (body as { items?: Array<{ eventId?: unknown }> } | undefined)
    ?.items;
  return (items ?? []).map((item) => String(item.eventId));
}

function mutateCursor(
  cursor: string,
  mutate: (value: Record<string, unknown>) => void,
) {
  const value = JSON.parse(
    Buffer.from(cursor, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  mutate(value);
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("MGT-BE-06 audit cursor and filter binding", () => {
  it("binds cursors to Organization, route, Location filter, and event filter", async () => {
    const state = await assuredAdmin();
    const secondLocation = await fixture.addLocation(
      state.membership.organizationId,
    );
    const secondOrg = await fixture.createMembership(state.user.id);
    const secondOrgLocation = await fixture.addLocation(
      secondOrg.organizationId,
    );
    for (const [organizationId, locationId, eventType] of [
      [
        state.membership.organizationId,
        state.location.locationId,
        "VALET_SESSION_CREATED",
      ],
      [
        state.membership.organizationId,
        state.location.locationId,
        "RETRIEVAL_REQUESTED",
      ],
      [
        state.membership.organizationId,
        secondLocation.locationId,
        "VALET_SESSION_CREATED",
      ],
      [
        secondOrg.organizationId,
        secondOrgLocation.locationId,
        "VALET_SESSION_CREATED",
      ],
    ] as const) {
      await insertKnown(
        organizationId,
        locationId,
        new Date("2026-09-05T12:00:00.000Z"),
        eventType,
      );
      await insertKnown(
        organizationId,
        locationId,
        new Date("2026-09-05T11:00:00.000Z"),
        eventType,
      );
    }

    const orgPage = await fixture.managementGet(
      organizationPath(state.membership.organizationId, { limit: "1" }),
      state.auth.accessToken,
    );
    const orgCursor = String(orgPage.body?.nextCursor);
    expect(
      (
        await fixture.managementGet(
          organizationPath(secondOrg.organizationId, {
            cursor: orgCursor,
            limit: "1",
          }),
          state.auth.accessToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.managementGet(
          locationPath(
            state.membership.organizationId,
            state.location.locationId,
            { cursor: orgCursor, limit: "1" },
          ),
          state.auth.accessToken,
        )
      ).status,
    ).toBe(400);

    const locationFiltered = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        limit: "1",
        locationId: state.location.locationId,
      }),
      state.auth.accessToken,
    );
    expect(
      (
        await fixture.managementGet(
          organizationPath(state.membership.organizationId, {
            cursor: String(locationFiltered.body?.nextCursor),
            limit: "1",
            locationId: secondLocation.locationId,
          }),
          state.auth.accessToken,
        )
      ).status,
    ).toBe(400);

    const eventFiltered = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        eventType: "VALET_SESSION_CREATED",
        limit: "1",
      }),
      state.auth.accessToken,
    );
    expect(
      (
        await fixture.managementGet(
          organizationPath(state.membership.organizationId, {
            cursor: String(eventFiltered.body?.nextCursor),
            eventType: "RETRIEVAL_REQUESTED",
            limit: "1",
          }),
          state.auth.accessToken,
        )
      ).status,
    ).toBe(400);
  });

  it("rejects malformed, extra-field, and future-version cursors", async () => {
    const state = await assuredAdmin();
    await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-06T12:00:00.000Z"),
    );
    await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-06T11:00:00.000Z"),
    );
    const first = await fixture.managementGet(
      organizationPath(state.membership.organizationId, { limit: "1" }),
      state.auth.accessToken,
    );
    const valid = String(first.body?.nextCursor);
    const candidates = [
      "not*base64url",
      mutateCursor(valid, (value) => {
        value.extra = true;
      }),
      mutateCursor(valid, (value) => {
        value.v = 2;
      }),
    ];
    for (const cursor of candidates) {
      const result = await fixture.managementGet(
        organizationPath(state.membership.organizationId, {
          cursor,
          limit: "1",
        }),
        state.auth.accessToken,
      );
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ code: "REQUEST_INVALID" });
    }
  });

  it("keeps Organization Location filters tenant-bound", async () => {
    const state = await assuredAdmin();
    const foreign = await fixture.createOrganization({
      name: "Foreign audit tenant",
    });
    const foreignLocation = await fixture.addLocation(foreign);
    const ownEvent = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-07T12:00:00.000Z"),
    );

    const own = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        locationId: state.location.locationId,
      }),
      state.auth.accessToken,
    );
    expect(own.status).toBe(200);
    expect(eventIds(own.body)).toEqual([ownEvent]);

    const denied = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        locationId: foreignLocation.locationId,
      }),
      state.auth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
