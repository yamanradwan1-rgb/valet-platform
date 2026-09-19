import { randomUUID } from "node:crypto";

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

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership };
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

describe("MGT-BE-06 audit pagination and filters", () => {
  it("enforces default/min/max limits and strict query keys", async () => {
    const state = await assuredAdmin();
    const occurredAt = new Date("2026-09-01T10:00:00.000Z");
    await fixture.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, actor_type, event_type,
          entity_type, entity_id, metadata_json, occurred_at)
       SELECT gen_random_uuid(), $1, $2, 'SYSTEM', 'VALET_SESSION_CREATED',
              'Location', $2, '{}'::jsonb, $3
       FROM generate_series(1, 100)`,
      [state.membership.organizationId, state.location.locationId, occurredAt],
    );

    const defaultPage = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body?.items).toHaveLength(50);
    expect(defaultPage.body?.nextCursor).toEqual(expect.any(String));

    const minimum = await fixture.managementGet(
      organizationPath(state.membership.organizationId, { limit: "1" }),
      state.auth.accessToken,
    );
    expect(minimum.status).toBe(200);
    expect(minimum.body?.items).toHaveLength(1);

    const maximum = await fixture.managementGet(
      organizationPath(state.membership.organizationId, { limit: "100" }),
      state.auth.accessToken,
    );
    expect(maximum.status).toBe(200);
    expect(maximum.body?.items).toHaveLength(100);

    const unknownKey = await fixture.managementGet(
      organizationPath(state.membership.organizationId, { surprise: "1" }),
      state.auth.accessToken,
    );
    expect(unknownKey.status).toBe(400);
    expect(unknownKey.body).toMatchObject({ code: "REQUEST_INVALID" });
  });

  it("uses occurredAt plus id deterministically without duplicates or skips", async () => {
    const state = await assuredAdmin();
    const occurredAt = new Date("2026-09-02T12:00:00.000Z");
    const inserted = await Promise.all(
      Array.from({ length: 5 }, () =>
        insertKnown(
          state.membership.organizationId,
          state.location.locationId,
          occurredAt,
        ),
      ),
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await fixture.managementGet(
        organizationPath(state.membership.organizationId, {
          ...(cursor === undefined ? {} : { cursor }),
          limit: "2",
        }),
        state.auth.accessToken,
      );
      expect(page.status).toBe(200);
      seen.push(...eventIds(page.body));
      cursor =
        typeof page.body?.nextCursor === "string"
          ? page.body.nextCursor
          : undefined;
    } while (cursor !== undefined);

    expect(seen).toEqual([...inserted].sort().reverse());
    expect(new Set(seen).size).toBe(inserted.length);
  });

  it("freezes page membership at page-one snapshot time", async () => {
    const state = await assuredAdmin();
    const newer = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-03T12:00:00.000Z"),
    );
    const older = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-03T10:00:00.000Z"),
    );

    const first = await fixture.managementGet(
      organizationPath(state.membership.organizationId, { limit: "1" }),
      state.auth.accessToken,
    );
    expect(first.status).toBe(200);
    expect(eventIds(first.body)).toEqual([newer]);
    const cursor = String(first.body?.nextCursor);

    const appended = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-03T11:00:00.000Z"),
    );
    const second = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        cursor,
        limit: "10",
      }),
      state.auth.accessToken,
    );
    expect(second.status).toBe(200);
    expect(eventIds(second.body)).toEqual([older]);
    expect(eventIds(second.body)).not.toContain(appended);
  });

  it("excludes a writer that was uncommitted at page one and admits it to a fresh traversal", async () => {
    const state = await assuredAdmin();
    const newer = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-03T12:00:00.000Z"),
    );
    const older = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-03T10:00:00.000Z"),
    );
    const lateId = randomUUID();
    const writer = await fixture.databasePool().connect();
    try {
      await writer.query("BEGIN");
      await writer.query(
        `INSERT INTO audit_events
           (id, organization_id, location_id, actor_type, event_type,
            entity_type, entity_id, metadata_json, occurred_at)
         VALUES ($1, $2, $3, 'SYSTEM', 'VALET_SESSION_CREATED',
                 'Location', $3, '{}'::jsonb, $4)`,
        [
          lateId,
          state.membership.organizationId,
          state.location.locationId,
          new Date("2026-09-03T11:00:00.000Z"),
        ],
      );

      const first = await fixture.managementGet(
        organizationPath(state.membership.organizationId, { limit: "1" }),
        state.auth.accessToken,
      );
      expect(first.status).toBe(200);
      expect(eventIds(first.body)).toEqual([newer]);
      const cursor = String(first.body?.nextCursor);

      await writer.query("COMMIT");
      const second = await fixture.managementGet(
        organizationPath(state.membership.organizationId, { cursor, limit: "10" }),
        state.auth.accessToken,
      );
      expect(second.status).toBe(200);
      expect(eventIds(second.body)).toEqual([older]);
      expect(eventIds(second.body)).not.toContain(lateId);

      const fresh = await fixture.managementGet(
        organizationPath(state.membership.organizationId, { limit: "10" }),
        state.auth.accessToken,
      );
      expect(fresh.status).toBe(200);
      expect(eventIds(fresh.body)).toEqual([newer, lateId, older]);
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined);
      writer.release();
    }
  });

  it("accepts known event filters and rejects unknown filter values", async () => {
    const state = await assuredAdmin();
    await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-04T10:00:00.000Z"),
    );
    const requested = await insertKnown(
      state.membership.organizationId,
      state.location.locationId,
      new Date("2026-09-04T11:00:00.000Z"),
      "RETRIEVAL_REQUESTED",
    );

    const filtered = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        eventType: "RETRIEVAL_REQUESTED",
      }),
      state.auth.accessToken,
    );
    expect(filtered.status).toBe(200);
    expect(eventIds(filtered.body)).toEqual([requested]);

    const rejected = await fixture.managementGet(
      organizationPath(state.membership.organizationId, {
        eventType: "FUTURE_EVENT_TYPE",
      }),
      state.auth.accessToken,
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({ code: "REQUEST_INVALID" });
  });
});
