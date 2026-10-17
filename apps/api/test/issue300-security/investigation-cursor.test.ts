import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuditInvestigationCursorPayload } from "@valet/contracts";
import type { StaffSessionContext } from "../../src/modules/auth/staff-session-context";
import {
  bindInvestigationCursor,
  decodeInvestigationCursor,
  encodeInvestigationCursor,
} from "../../src/modules/management/audit-investigation/audit-investigation-cursor";

const originalSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
beforeAll(() => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 37).toString("base64url");
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = originalSecret;
});

const scope = {
  organizationId: "01000000-0000-4000-a000-000000000001",
  locationId: "01000000-0000-4000-a000-000000000002",
  membershipId: "01000000-0000-4000-a000-000000000003",
  role: "ORG_ADMIN" as const,
};
const context: StaffSessionContext = {
  staffAuthSessionId: "01000000-0000-4000-a000-000000000004",
  userId: "01000000-0000-4000-a000-000000000005",
  accessTokenHash: "private-test-hash",
  createdAt: new Date("2026-10-17T10:00:00.000Z"),
};
const now = new Date("2026-10-17T12:00:00.000Z");
const windowFilters = {
  from: "2026-10-16T00:00:00.000Z",
  to: "2026-10-17T00:00:00.000Z",
  keySlotId: "01000000-0000-4000-a000-000000000006",
};

function binding(overrides: Partial<typeof context> = {}, filters: unknown = windowFilters) {
  return bindInvestigationCursor({
    context: { ...context, ...overrides },
    scope,
    purpose: "SEARCH_SESSIONS",
    normalizedFilters: filters,
  });
}

function page(lastAt = "2026-10-16T15:42:00.000Z"): AuditInvestigationCursorPayload {
  const b = binding();
  return {
    version: 1,
    purpose: "SEARCH_SESSIONS",
    organizationId: b.organizationId,
    locationId: b.locationId,
    viewerSessionDigest: b.viewerSessionDigest,
    filterDigest: b.filterDigest,
    snapshotAt: now.toISOString(),
    databaseSnapshot: "100:101:",
    issuedAt: now.toISOString(),
    expiresAt: "2026-10-17T12:15:00.000Z",
    last: {
      lastMatchedAt: lastAt,
      sessionId: "01000000-0000-4000-a000-000000000007",
    },
  };
}

describe("Issue 300 purpose/session/scope-bound investigation cursors", () => {
  it("signs and restores a search cursor without raw filter text", () => {
    const token = encodeInvestigationCursor(binding(), page(), now);
    expect(decodeInvestigationCursor(token, binding(), now)).toEqual(page());
    expect(token).not.toContain(windowFilters.keySlotId);
  });

  it("canonicalizes normalized validated filter property order", () => {
    const a = binding({}, { plate: "X-12", from: windowFilters.from });
    const b = binding({}, { from: windowFilters.from, plate: "X-12" });
    expect(a.filterDigest).toBe(b.filterDigest);
  });

  it("invalidates a prior staff session and changed filter", () => {
    const token = encodeInvestigationCursor(binding(), page(), now);
    expect(() => decodeInvestigationCursor(token, binding({
      staffAuthSessionId: "01000000-0000-4000-a000-000000000008",
    }), now)).toThrow();
    expect(() => decodeInvestigationCursor(token, binding({}, {
      ...windowFilters,
      plate: "OTHER",
    }), now)).toThrow();
  });

  it("rejects wrong role/Location and cursor byte tampering", () => {
    const token = encodeInvestigationCursor(binding(), page(), now);
    const other = bindInvestigationCursor({
      scope: { ...scope, locationId: "01000000-0000-4000-a000-000000000009" },
      context,
      purpose: "SEARCH_SESSIONS",
      normalizedFilters: windowFilters,
    });
    expect(() => decodeInvestigationCursor(token, other, now)).toThrow();
    const changed = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(() => decodeInvestigationCursor(changed, binding(), now)).toThrow();
  });

  it("rejects expired, future-issued, and overlong-lifetime cursors", () => {
    const token = encodeInvestigationCursor(binding(), page(), now);
    expect(() => decodeInvestigationCursor(token, binding(),
      new Date("2026-10-17T12:15:00.000Z"))).toThrow();
    expect(() => encodeInvestigationCursor(binding(), {
      ...page(),
      expiresAt: "2026-10-17T12:16:00.000Z",
    }, now)).toThrow();
    expect(() => encodeInvestigationCursor(binding(), {
      ...page(),
      issuedAt: "2026-10-17T13:00:00.000Z",
      expiresAt: "2026-10-17T13:15:00.000Z",
    }, now)).toThrow();
  });

  it("requires session ID for timeline and cannot cross cursor purposes", () => {
    const token = encodeInvestigationCursor(binding(), page(), now);
    const timeline = bindInvestigationCursor({
      scope,
      context,
      purpose: "SESSION_TIMELINE",
      sessionId: "01000000-0000-4000-a000-000000000007",
      normalizedFilters: { limit: 50 },
    });
    expect(() => decodeInvestigationCursor(token, timeline, now)).toThrow();
    expect(() => bindInvestigationCursor({
      scope, context, purpose: "SESSION_TIMELINE", normalizedFilters: {},
    })).toThrow();
    expect(decodeInvestigationCursor(undefined, binding(), now)).toBeNull();
  });

  it("refuses non-canonical, circular, or cursor-containing filters", () => {
    expect(() => binding({}, { cursor: "prior" })).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => binding({}, cycle)).toThrow();
    expect(() => binding({}, { count: Number.POSITIVE_INFINITY })).toThrow();
  });
});
